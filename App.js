import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { askGemini, buildChain, DAILY_PROMPT, DEFAULT_MODEL, DEFAULT_VOICE, listModels } from './src/gemini';
import { getSetting, loadChat, saveChat, setSetting } from './src/storage';
import { cancelDailyReminder, scheduleDailyReminder } from './src/notifications';
import Bubble, { TypingBubble } from './src/Bubble';
import Welcome from './src/Welcome';
import SettingsModal from './src/SettingsModal';
import VoiceMode from './src/VoiceMode';
import { colors, gradient, radius, space, type } from './src/theme';

const avatar = require('./assets/avatar.png');

const API_KEY_URL = 'https://aistudio.google.com/apikey';
const SHORTCUTS = [
  { icon: 'logo-instagram', label: 'Instagram', url: 'https://www.instagram.com/shraddhakapoor/' },
  { icon: 'newspaper-outline', label: 'News', url: 'https://news.google.com/search?q=Shraddha%20Kapoor' },
  { icon: 'images-outline', label: 'Gallery', url: 'https://www.google.com/search?tbm=isch&q=Shraddha+Kapoor' },
  { icon: 'logo-youtube', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=Shraddha+Kapoor' },
];
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  return (
    <SafeAreaProvider>
      <Chat />
    </SafeAreaProvider>
  );
}

function Chat() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(null); // image waiting to be sent
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [fallbacks, setFallbacks] = useState([]);
  const [models, setModels] = useState([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsErr, setModelsErr] = useState('');
  const [dailyOn, setDailyOn] = useState(false);
  const [hour, setHour] = useState('9');
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [liveModel, setLiveModel] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const listRef = useRef(null);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  // Edge-to-edge: the app draws behind the system bars, so pad by the real insets.
  // StatusBar.currentHeight is a floor for devices where the first inset report is late.
  const top = Math.max(insets.top, Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0);
  const bubbleMax = Math.min(width * 0.8, 560);

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => {
      setKbOpen(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });
    const b = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  const push = useCallback((msg) => {
    setMessages((prev) => {
      const next = [...prev, { id: uid(), ts: Date.now(), ...msg }];
      saveChat(next);
      return next;
    });
  }, []);

  const runGemini = useCallback(async (history, chain, kind) => {
    setBusy(true);
    try {
      const { text, sources, model: used, tried } = await askGemini({ apiKey: chain.key, models: chain.models, history });
      push({ role: 'model', text, sources, kind, model: used, fellBack: tried.length > 0 });
    } catch (e) {
      push({ role: 'model', text: `⚠️ ${e.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }, [push]);

  useEffect(() => {
    (async () => {
      const [key, mdl, fb, daily, h, chat, last, vc, lm] = await Promise.all([
        getSetting('apiKey'), getSetting('model', DEFAULT_MODEL), getSetting('fallbacks', '[]'),
        getSetting('dailyOn'), getSetting('hour', '9'), loadChat(), getSetting('lastUpdate'),
        getSetting('voice', DEFAULT_VOICE), getSetting('liveModel'),
      ]);
      let fbList = [];
      try { fbList = JSON.parse(fb); } catch {}
      setApiKey(key); setModel(mdl); setFallbacks(fbList); setDailyOn(daily === '1'); setHour(h);
      setVoice(vc); setLiveModel(lm);
      setMessages(chat); messagesRef.current = chat;
      setReady(true);
      if (!key) return; // the welcome screen offers "Add API key"
      if (last !== today()) {
        await setSetting('lastUpdate', today());
        runGemini([{ role: 'user', text: DAILY_PROMPT }], { key, models: buildChain(mdl, fbList) }, 'daily');
      }
    })();
  }, [runGemini]);

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const a = r.assets[0];
    setPending({ uri: a.uri, b64: a.base64, mime: a.mimeType || 'image/jpeg' });
  };

  const sendMessage = (text, image) => {
    if ((!text && !image) || busy) return;
    if (!apiKey) { setShowSettings(true); return; }
    const userMsg = { role: 'user', text, uri: image?.uri, b64: image?.b64, mime: image?.mime };
    // Only the newest turn carries image bytes, which keeps requests small.
    const prior = messagesRef.current.filter((m) => !m.error).map((m) => ({ ...m, b64: undefined }));
    const history = [...prior, userMsg].slice(-30);
    push(userMsg);
    runGemini(history, { key: apiKey, models: buildChain(model, fallbacks) });
  };

  const send = () => {
    const text = input.trim();
    if (!text && !pending) return;
    sendMessage(text, pending);
    if (apiKey && !busy) { setInput(''); setPending(null); }
  };

  const openVoice = () => {
    Keyboard.dismiss();
    if (!apiKey) { setShowSettings(true); return; }
    setVoiceOpen(true);
  };

  // The call's transcript is kept in the chat so it can be read later.
  const closeVoice = useCallback((turns) => {
    setVoiceOpen(false);
    (turns || []).forEach((t) => push({ role: t.role === 'user' ? 'user' : 'model', text: t.text, kind: 'voice' }));
  }, [push]);

  const retry = () => {
    if (busy) return;
    const clean = messagesRef.current.filter((m) => !m.error);
    setMessages(clean);
    saveChat(clean);
    const chain = { key: apiKey, models: buildChain(model, fallbacks) };
    const lastMsg = clean[clean.length - 1];
    if (lastMsg?.role === 'user') runGemini(clean.slice(-30), chain);
    else runGemini([{ role: 'user', text: DAILY_PROMPT }], chain, 'daily');
  };

  const loadModels = useCallback(async (key) => {
    if (!key?.trim()) { setModelsErr('Enter your API key first.'); return; }
    setModelsBusy(true); setModelsErr('');
    try {
      setModels(await listModels(key.trim()));
    } catch (e) {
      setModelsErr(e.message);
    } finally {
      setModelsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (showSettings && apiKey && models.length === 0 && !modelsBusy) loadModels(apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  const toggleFallback = (id) =>
    setFallbacks((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const saveSettings = async () => {
    await setSetting('apiKey', apiKey.trim());
    await setSetting('model', model.trim() || DEFAULT_MODEL);
    await setSetting('fallbacks', JSON.stringify(fallbacks));
    await setSetting('voice', voice);
    await setSetting('liveModel', liveModel.trim());
    await setSetting('dailyOn', dailyOn ? '1' : '');
    const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 9));
    await setSetting('hour', String(h));
    setHour(String(h));
    if (dailyOn) {
      const ok = await scheduleDailyReminder(h, 0);
      if (!ok) setDailyOn(false);
    } else {
      await cancelDailyReminder();
    }
    setShowSettings(false);
  };

  if (!ready) {
    return <View style={styles.center}><ActivityIndicator color={colors.pink} /></View>;
  }

  const hasContent = !!(input.trim() || pending);
  const canSend = hasContent && !busy;

  return (
    <View style={[styles.root, { paddingTop: top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <LinearGradient colors={gradient} style={styles.headRing}>
          <Image source={avatar} style={styles.headAvatar} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={type.title} numberOfLines={1}>Shraddha Fan Chat</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText} numberOfLines={1}>Unofficial fan assistant</Text>
          </View>
        </View>
        <Pressable onPress={() => setShowSettings(true)} style={styles.iconBtn} hitSlop={8}
          accessibilityRole="button" accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={21} color={colors.textDim} />
        </Pressable>
      </View>

      <View style={styles.shortcutsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
          {SHORTCUTS.map((s) => (
            <Pressable key={s.url} onPress={() => Linking.openURL(s.url)} accessibilityRole="link"
              style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surface2 }]}>
              <Ionicons name={s.icon} size={16} color={colors.pink} />
              <Text style={styles.chipText}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {messages.length === 0 ? (
          <Welcome width={width} height={height} hasKey={!!apiKey} loadingUpdate={busy}
            keyUrl={API_KEY_URL} onOpenSettings={() => setShowSettings(true)}
            onSuggest={(q) => sendMessage(q)} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <Bubble item={item} maxWidth={bubbleMax} onRetry={item.error ? retry : undefined} />}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={busy ? <TypingBubble /> : null}
          />
        )}

        {pending && (
          <View style={styles.preview}>
            <Image source={{ uri: pending.uri }} style={styles.previewImg} />
            <Pressable onPress={() => setPending(null)} style={styles.previewX} hitSlop={8} accessibilityLabel="Remove photo">
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* With the keyboard open it already sits above the system bar, so the inset is dropped. */}
        <View style={[styles.composer, { paddingBottom: space.sm + (kbOpen ? 0 : insets.bottom) }]}>
          <View style={styles.inputPill}>
            <Pressable onPress={pickImage} style={styles.attach} hitSlop={6}
              accessibilityRole="button" accessibilityLabel="Attach a photo">
              <Ionicons name="image-outline" size={22} color={colors.textDim} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask me anything…"
              placeholderTextColor={colors.muted}
              multiline
              selectionColor={colors.pink}
            />
            <Pressable onPress={hasContent ? send : openVoice} disabled={hasContent ? !canSend : busy}
              accessibilityRole="button" accessibilityLabel={hasContent ? 'Send' : 'Start voice mode'}>
              <LinearGradient colors={hasContent && !canSend ? [colors.border, colors.border] : gradient} style={styles.send}>
                <Ionicons name={hasContent ? 'arrow-up' : 'mic'} size={20} color={hasContent && !canSend ? colors.muted : '#fff'} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <VoiceMode visible={voiceOpen} apiKey={apiKey} voice={voice} preferredModel={liveModel} onClose={closeVoice} />

      <SettingsModal
        visible={showSettings} onClose={() => setShowSettings(false)} onSave={saveSettings} kbOpen={kbOpen}
        keyUrl={API_KEY_URL}
        apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel}
        fallbacks={fallbacks} toggleFallback={toggleFallback}
        models={models} modelsBusy={modelsBusy} modelsErr={modelsErr} onRefresh={() => loadModels(apiKey)}
        voice={voice} setVoice={setVoice} liveModel={liveModel} setLiveModel={setLiveModel}
        dailyOn={dailyOn} setDailyOn={setDailyOn} hour={hour} setHour={setHour}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  headRing: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.bg },
  pill: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.pinkGlow },
  pillText: { color: colors.pinkSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  shortcutsWrap: { flexGrow: 0 },
  shortcuts: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textDim, fontSize: 13.5, fontWeight: '600' },
  list: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, flexGrow: 1 },
  preview: { paddingHorizontal: space.lg, paddingTop: space.sm },
  previewImg: { width: 72, height: 72, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  previewX: { position: 'absolute', left: 66, top: 2, backgroundColor: 'rgba(0,0,0,0.75)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  composer: { paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  inputPill: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: colors.surface, borderRadius: 26, borderWidth: 1, borderColor: colors.border, paddingLeft: 4, paddingRight: 5, paddingVertical: 5 },
  attach: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: colors.text, fontSize: 15.5, minHeight: 40, maxHeight: 120, paddingHorizontal: 6, paddingTop: Platform.OS === 'android' ? 9 : 10, paddingBottom: Platform.OS === 'android' ? 9 : 10, textAlignVertical: 'center' },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
