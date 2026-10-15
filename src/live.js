import { b64ToBytes, bytesToB64, concatBytes, MIC_RATE, PcmPlayer, Resampler24to16 } from './pcm';
import { VOICE_PROMPT, DEFAULT_VOICE } from './gemini';

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MIC_FLUSH_BYTES = (MIC_RATE * 2 * 60) / 1000; // ~60 ms of 16 kHz PCM16 per message

const decodeFrame = (data) => {
  if (typeof data === 'string') return data;
  // Gemini Live sends JSON inside binary frames.
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
  return new TextDecoder('utf-8').decode(bytes);
};

/**
 * One live voice conversation. Tries each model in `models` until one completes setup.
 * `audio` is the platform audio layer: { onMic(cb)->off, setRecording(bool), play(u8), tearDown() }.
 * Everything platform-specific is injected, so the protocol logic can be tested without a phone.
 */
export class LiveSession {
  constructor({ apiKey, models, voice = DEFAULT_VOICE, audio, WebSocketImpl, setupTimeoutMs = 8000, now = () => Date.now(),
    setIntervalImpl, clearIntervalImpl, onState = () => {}, onTurns = () => {}, onNotice = () => {} }) {
    Object.assign(this, { apiKey, models, voice, audio, setupTimeoutMs, now, onState, onTurns, onNotice });
    this.WS = WebSocketImpl || WebSocket;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.state = 'idle';
    this.model = null;
    this.turns = [];
    this.muted = false;
    this.ready = false;
    this.ended = false;
    this.micBuf = new Uint8Array(0);
  }

  _set(state) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }

  async start() {
    this._set('connecting');
    const errors = [];
    for (const model of this.models) {
      if (this.ended) return false;
      try {
        await this._connect(model);
        if (this.ended) { try { this.ws.close(); } catch {} return false; } // stopped while connecting
        this.model = model;
        this._startAudio();
        this._set('listening');
        return true;
      } catch (e) {
        errors.push(`${model}: ${e.message}`);
      }
    }
    this.ended = true;
    this._set('error');
    throw new Error(`Could not start voice mode.\n${errors.join('\n')}`);
  }

  _connect(model) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(msg)); } };
      const ws = new this.WS(`${WS_URL}?key=${encodeURIComponent(this.apiKey)}`);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timer = setTimeout(() => { fail('timed out'); try { ws.close(); } catch {} }, this.setupTimeoutMs);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
            },
            systemInstruction: { parts: [{ text: VOICE_PROMPT }] },
            tools: [{ googleSearch: {} }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: { slidingWindow: {} },
          },
        }));
      };
      ws.onmessage = (ev) => {
        if (ws !== this.ws) return; // stale socket from an earlier model attempt
        let msg;
        try { msg = JSON.parse(decodeFrame(ev.data)); } catch { return; }
        if (msg.setupComplete && !settled) {
          settled = true;
          clearTimeout(timer);
          this.ready = true;
          resolve();
          return;
        }
        if (this.ready) this._onServer(msg);
      };
      ws.onerror = () => fail('connection error');
      ws.onclose = (ev) => {
        if (ws !== this.ws) return;
        const why = `closed${ev?.code ? ` (${ev.code})` : ''}${ev?.reason ? `: ${ev.reason}` : ''}`;
        if (!this.ready) return fail(why);
        if (!this.ended) this._lost(why);
      };
    });
  }

  _startAudio() {
    this.player = new PcmPlayer((u8) => this.audio.play(u8), {
      now: this.now, setIntervalImpl: this.setIntervalImpl, clearIntervalImpl: this.clearIntervalImpl,
    });
    this.resampler = new Resampler24to16();
    this.offMic = this.audio.onMic((u8) => this._onMic(u8));
    this.audio.setRecording(true);
    // Speaking -> listening once the last queued audio has been played.
    this.watch = (this.setIntervalImpl || setInterval)(() => {
      if (this.ended) return;
      if (this.state === 'speaking' && !this.player.isBusy() && this.turnDone) this._set('listening');
    }, 80);
  }

  _onMic(u8) {
    if (!this.ready || this.muted || this.ended || this.ws.readyState !== 1) return;
    this.micBuf = concatBytes(this.micBuf, u8);
    if (this.micBuf.length < MIC_FLUSH_BYTES) return;
    const data = bytesToB64(this.micBuf);
    this.micBuf = new Uint8Array(0);
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: `audio/pcm;rate=${MIC_RATE}` } } }));
  }

  setMuted(muted) {
    this.muted = muted;
    this.audio.setRecording(!muted);
    if (muted && this.ready && this.ws.readyState === 1) {
      this.micBuf = new Uint8Array(0);
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); // flush cached audio
    }
  }

  _turn(role, text) {
    const last = this.turns[this.turns.length - 1];
    if (role === 'model' && last && last.role === 'user') last.closed = true;
    if (last && last.role === role && !last.closed) last.text += text;
    else this.turns.push({ role, text, closed: false });
    this.onTurns(this.turns.map((t) => ({ role: t.role, text: t.text })));
  }

  _closeModelTurn() {
    const last = this.turns[this.turns.length - 1];
    if (last && last.role === 'model') last.closed = true;
  }

  _onServer(msg) {
    if (msg.goAway) this.onNotice('The session is about to hit its time limit.');
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      this.player.clear();   // stop feeding speech the user just talked over
      this.turnDone = true;
      this._closeModelTurn();
      this._set(this.player.isBusy() ? 'speaking' : 'listening');
    }
    if (sc.inputTranscription?.text) this._turn('user', sc.inputTranscription.text);
    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data && /audio\/pcm/.test(part.inlineData.mimeType || 'audio/pcm')) {
        this.turnDone = false;
        this.player.enqueue(this.resampler.process(b64ToBytes(part.inlineData.data)));
        this._set('speaking');
      }
    }
    if (sc.outputTranscription?.text) this._turn('model', sc.outputTranscription.text);
    if (sc.turnComplete || sc.generationComplete) {
      this.turnDone = true;
      this.player.flush();
      if (sc.turnComplete) this._closeModelTurn();
    }
  }

  _lost(reason) {
    this._cleanup();
    this._set('error');
    this.onNotice(`Connection lost — ${reason}`);
  }

  _cleanup() {
    this.ended = true;
    this.ready = false;
    try { this.offMic?.(); } catch {}
    try { this.audio.setRecording(false); } catch {}
    if (this.watch) (this.clearIntervalImpl || clearInterval)(this.watch);
    this.player?.stop();
    try { this.audio.tearDown(); } catch {}
  }

  // Ends the call. Returns the transcript turns for saving into the chat.
  stop() {
    if (!this.ended) {
      try { this.ws?.close(1000, 'bye'); } catch {}
      this._cleanup();
    }
    if (this.state !== 'error') this._set('ended'); // keep the error visible after cleanup
    return this.turns.map((t) => ({ role: t.role, text: t.text.trim() })).filter((t) => t.text);
  }
}
