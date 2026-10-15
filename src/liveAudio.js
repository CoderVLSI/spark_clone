import {
  addExpoTwoWayAudioEventListener, getMicrophonePermissionsAsync, initialize, playPCMData,
  requestMicrophonePermissionsAsync, tearDown, toggleRecording,
} from '@speechmatics/expo-two-way-audio';

export async function ensureMicPermission() {
  let p = await getMicrophonePermissionsAsync();
  if (!p.granted) p = await requestMicrophonePermissionsAsync();
  return !!p.granted;
}

// Platform audio layer for LiveSession: echo-cancelled 16 kHz mic in, 16 kHz PCM out.
export async function createAudio() {
  const ok = await initialize();
  if (!ok) throw new Error('Could not start the audio engine.');
  const subs = [];
  const listen = (name, cb) => {
    const sub = addExpoTwoWayAudioEventListener(name, cb);
    subs.push(sub);
    return () => sub?.remove?.();
  };
  return {
    onMic: (cb) => listen('onMicrophoneData', (e) => cb(e.data instanceof Uint8Array ? e.data : Uint8Array.from(e.data))),
    onVolume: (cb) => {
      const a = listen('onInputVolumeLevelData', (e) => cb('in', e.data));
      const b = listen('onOutputVolumeLevelData', (e) => cb('out', e.data));
      return () => { a(); b(); };
    },
    setRecording: (on) => { try { toggleRecording(on); } catch {} },
    play: (u8) => playPCMData(u8),
    tearDown: () => {
      subs.forEach((s) => { try { s?.remove?.(); } catch {} });
      try { tearDown(); } catch {}
    },
  };
}
