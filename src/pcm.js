import { Buffer } from 'buffer';

// Gemini Live sends 24 kHz PCM16 mono; the two-way-audio module plays 16 kHz PCM16 mono.
export const MIC_RATE = 16000;
export const PLAY_RATE = 16000;

export const b64ToBytes = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
export const bytesToB64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');

export const concatBytes = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const toInt16 = (u8) => new Int16Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + (u8.byteLength & ~1)));

// Streaming 24k -> 16k linear resampler. Keeps phase and the last sample between chunks,
// so chunk boundaries don't click.
export class Resampler24to16 {
  constructor() {
    this.tail = new Int16Array(0);
    this.pos = 0;
  }

  process(u8) {
    const chunk = toInt16(u8);
    const x = new Int16Array(this.tail.length + chunk.length);
    x.set(this.tail, 0);
    x.set(chunk, this.tail.length);
    const out = [];
    let pos = this.pos;
    while (pos + 1 < x.length) {
      const i = Math.floor(pos);
      const f = pos - i;
      out.push(Math.round(x[i] * (1 - f) + x[i + 1] * f));
      pos += 1.5;
    }
    const used = Math.floor(pos);
    this.tail = x.slice(Math.min(used, x.length));
    this.pos = pos - used;
    const res = new Int16Array(out);
    return new Uint8Array(res.buffer);
  }
}

// Feeds the native player a little at a time. The native queue can't be flushed, so keeping it
// short is what makes "interrupt" (barge-in) stop speech quickly.
export class PcmPlayer {
  constructor(play, opts = {}) {
    this.play = play;
    this.now = opts.now || (() => Date.now());
    this.aheadMs = opts.aheadMs ?? 250; // max audio handed to native but not yet played
    this.startMs = opts.startMs ?? 120; // buffer this much before starting from idle
    this.pieceBytes = (opts.pieceMs ?? 100) * (PLAY_RATE / 1000) * 2;
    this.queue = [];
    this.queuedBytes = 0;
    this.aheadUntil = 0;
    this.flushing = false;
    const setTimer = opts.setIntervalImpl || ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = opts.clearIntervalImpl || ((id) => clearInterval(id));
    this.timer = setTimer(() => this.pump(), opts.tickMs ?? 40);
  }

  enqueue(u8) {
    for (let o = 0; o < u8.length; o += this.pieceBytes) {
      const piece = u8.subarray(o, Math.min(o + this.pieceBytes, u8.length));
      this.queue.push(piece);
      this.queuedBytes += piece.length;
    }
    this.pump();
  }

  // The model finished its turn: play whatever is left even if it is shorter than startMs.
  flush() {
    this.flushing = true;
    this.pump();
  }

  clear() {
    this.queue = [];
    this.queuedBytes = 0;
    this.flushing = false;
  }

  isBusy() {
    return this.queue.length > 0 || this.aheadUntil > this.now();
  }

  pump() {
    const t = this.now();
    const idle = this.aheadUntil <= t;
    const queuedMs = (this.queuedBytes / 2 / PLAY_RATE) * 1000;
    if (idle && !this.flushing && queuedMs < this.startMs) return;
    while (this.queue.length && this.aheadUntil - this.now() < this.aheadMs) {
      const piece = this.queue.shift();
      this.queuedBytes -= piece.length;
      this.play(piece);
      this.aheadUntil = Math.max(this.aheadUntil, this.now()) + (piece.length / 2 / PLAY_RATE) * 1000;
    }
    if (!this.queue.length) this.flushing = false;
  }

  stop() {
    this.clear();
    this.clearTimer(this.timer);
  }
}
