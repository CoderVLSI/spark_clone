import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildLiveChain, listLiveModels } from './gemini';
import { LiveSession } from './live';
import { createAudio, ensureMicPermission } from './liveAudio';
import { colors, gradient, radius, space, type } from './theme';

const STATUS_TEXT = {
  connecting: 'Connecting…',
  listening: 'Listening… go ahead and talk',
  speaking: 'Speaking… talk over me to interrupt',
  error: 'Something went wrong',
};

export default function VoiceMode({ visible, apiKey, voice, preferredModel, onClose }) {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState('connecting');
  const [turns, setTurns] = useState([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modelName, setModelName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const session = useRef(null);
  const audioRef = useRef(null);
  const statusRef = useRef('connecting');
  const scroller = useRef(null);
  const level = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  statusRef.current = status;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ]));
    if (visible) loop.start();
    return () => loop.stop();
  }, [visible, breath]);

  const teardown = useCallback(() => {
    const t = session.current ? session.current.stop() : [];
    session.current = null;
    try { audioRef.current?.tearDown(); } catch {}
    audioRef.current = null;
    return t;
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setStatus('connecting'); setError(''); setNotice(''); setTurns([]); setMuted(false); setModelName('');
    (async () => {
      try {
        if (!(await ensureMicPermission())) throw new Error('Microphone permission is needed for voice mode.');
        let discovered = [];
        try { discovered = await listLiveModels(apiKey); } catch {}
        if (cancelled) return;
        const audio = await createAudio();
        audioRef.current = audio;
        if (cancelled) { audio.tearDown(); return; }
        audio.onVolume((kind, v) => {
          const s = statusRef.current;
          if ((kind === 'out' && s === 'speaking') || (kind === 'in' && s !== 'speaking')) {
            Animated.timing(level, { toValue: Math.min(1, v * 1.6), duration: 90, useNativeDriver: true }).start();
          }
        });
        const s = new LiveSession({
          apiKey, voice, audio, models: buildLiveChain(preferredModel, discovered),
          onState: (st) => { if (!cancelled && st !== 'ended') setStatus(st); },
          onTurns: (t) => { if (!cancelled) setTurns(t.slice(-8)); },
          onNotice: (n) => { if (!cancelled) setNotice(n); },
        });
        session.current = s;
        await s.start();
        if (!cancelled) setModelName(s.model);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e.message);
        teardown();
      }
    })();
    return () => { cancelled = true; teardown(); };
  }, [visible, attempt, apiKey, voice, preferredModel, level, teardown]);

  // A live call shouldn't keep the mic open once the app leaves the foreground.
  const end = useCallback(() => onClose(teardown()), [onClose, teardown]);
  useEffect(() => {
    if (!visible) return undefined;
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') end(); });
    return () => sub.remove();
  }, [visible, end]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    session.current?.setMuted(next);
  };

  const orbScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const speaking = status === 'speaking';
  const orbColors = status === 'error' ? ['#5a2a33', '#2d1a1f'] : speaking ? ['#ff8ab0', '#c2185b'] : gradient;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={end}>
      <LinearGradient colors={['#1d0f18', colors.bg, colors.bg]} style={[styles.root, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={type.title}>Voice mode</Text>
            <Text style={type.caption} numberOfLines={1}>{modelName ? `${modelName} · ${voice}` : 'Gemini Live'}</Text>
          </View>
          <Pressable onPress={end} hitSlop={10} style={styles.close} accessibilityLabel="Close voice mode">
            <Ionicons name="chevron-down" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          <Animated.View style={{ transform: [{ scale: breathScale }] }}>
            <Animated.View style={[styles.glow, { transform: [{ scale: orbScale }], opacity: status === 'connecting' ? 0.25 : 0.55 }]} />
            <Animated.View style={{ transform: [{ scale: orbScale.interpolate({ inputRange: [1, 1.28], outputRange: [1, 1.1] }) }] }}>
              <LinearGradient colors={orbColors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.orb}>
                <Ionicons name={status === 'error' ? 'alert' : muted ? 'mic-off' : speaking ? 'volume-high' : 'mic'} size={44} color="#fff" />
              </LinearGradient>
            </Animated.View>
          </Animated.View>
          <Text style={[type.body, styles.status, status === 'error' && { color: colors.danger }]}>
            {muted && status === 'listening' ? 'Mic is muted' : STATUS_TEXT[status] || ''}
          </Text>
          {!!notice && status !== 'error' && <Text style={[type.small, styles.center]}>{notice}</Text>}
        </View>

        {status === 'error' ? (
          <View style={styles.errBox}>
            <ScrollView style={{ maxHeight: 150 }}>
              <Text style={[type.small, { color: colors.danger }]} selectable>{error || notice}</Text>
            </ScrollView>
            <Pressable onPress={() => setAttempt((a) => a + 1)} style={styles.retry} accessibilityRole="button">
              <Ionicons name="refresh" size={15} color={colors.pinkSoft} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView ref={scroller} style={styles.transcript} contentContainerStyle={{ gap: space.sm, paddingVertical: space.sm }}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
            {turns.length === 0 && status === 'listening' && (
              <Text style={[type.small, styles.center]}>Try: “What's the latest on Shraddha Kapoor's films?”</Text>
            )}
            {turns.map((t, i) => (
              <View key={i} style={[styles.line, t.role === 'user' && styles.lineMine]}>
                <Text style={styles.who}>{t.role === 'user' ? 'You' : 'Assistant'}</Text>
                <Text style={[type.body, t.role === 'user' && { color: colors.textDim }]}>{t.text}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.controls}>
          <View style={styles.ctl}>
            <Pressable onPress={toggleMute} disabled={status === 'error' || status === 'connecting'}
              style={[styles.round, muted && styles.roundOn, (status === 'error' || status === 'connecting') && { opacity: 0.4 }]}
              accessibilityRole="button" accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}>
              <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
            </Pressable>
            <Text style={type.caption}>{muted ? 'Unmute' : 'Mute'}</Text>
          </View>
          <View style={styles.ctl}>
            <Pressable onPress={end} style={[styles.round, styles.endBtn]} accessibilityRole="button" accessibilityLabel="End voice chat">
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
            <Text style={type.caption}>End</Text>
          </View>
        </View>

        <Text style={[type.caption, styles.center, { marginTop: space.md }]}>
          AI voice, not Shraddha Kapoor. Unofficial fan assistant. Headphones give the best results.
        </Text>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  stage: { alignItems: 'center', justifyContent: 'center', paddingTop: 44, paddingBottom: space.lg, minHeight: 310 },
  glow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -15, top: -15, backgroundColor: colors.pinkDeep },
  orb: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' },
  status: { marginTop: 44, textAlign: 'center', color: colors.textDim },
  center: { textAlign: 'center' },
  transcript: { flex: 1, minHeight: 60 },
  line: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', maxWidth: '92%' },
  lineMine: { alignSelf: 'flex-end', backgroundColor: 'transparent' },
  who: { ...type.label, marginBottom: 3, fontSize: 10.5 },
  errBox: { flex: 1, minHeight: 60, padding: space.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: space.md, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(240,98,146,0.16)' },
  retryText: { color: colors.pinkSoft, fontWeight: '700', fontSize: 13 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 48, marginTop: space.lg },
  ctl: { alignItems: 'center', gap: 6 },
  round: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  roundOn: { backgroundColor: colors.pinkDeep, borderColor: colors.pink },
  endBtn: { backgroundColor: '#d32f2f', borderColor: '#ef5350' },
});
