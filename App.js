import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Linking, Modal,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { askGemini, buildChain, DAILY_PROMPT, DEFAULT_MODEL, listModels } from './src/gemini';
import { getSetting, loadChat, saveChat, setSetting } from './src/storage';
import { cancelDailyReminder, scheduleDailyReminder } from './src/notifications';

const OFFICIAL_INSTAGRAM = 'https://www.instagram.com/shraddhakapoor/';
const API_KEY_URL = 'https://aistudio.google.com/apikey';
const LINKS = [
  { label: '📷 Instagram (official)', url: OFFICIAL_INSTAGRAM },
  { label: '📰 Latest news', url: 'https://news.google.com/search?q=Shraddha%20Kapoor' },
  { label: '🖼️ Photos', url: 'https://www.google.com/search?tbm=isch&q=Shraddha+Kapoor' },
  { label: '🎬 YouTube', url: 'https://www.youtube.com/results?search_query=Shraddha+Kapoor' },
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
  const listRef = useRef(null);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  const push = useCallback((msg) => {
    setMessages((prev) => {
      const next = [...prev, { id: uid(), ...msg }];
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
      const [key, mdl, fb, daily, h, chat, last] = await Promise.all([
        getSetting('apiKey'), getSetting('model', DEFAULT_MODEL), getSetting('fallbacks', '[]'),
        getSetting('dailyOn'), getSetting('hour', '9'), loadChat(), getSetting('lastUpdate'),
      ]);
      let fbList = [];
      try { fbList = JSON.parse(fb); } catch {}
      setApiKey(key); setModel(mdl); setFallbacks(fbList); setDailyOn(daily === '1'); setHour(h);
      setMessages(chat); messagesRef.current = chat;
      setReady(true);
      if (!key) { setShowSettings(true); return; }
      if (last !== today()) {
        await setSetting('lastUpdate', today());
        runGemini([{ role: 'user', text: DAILY_PROMPT }], { key, models: buildChain(mdl, fbList) }, 'daily');
      }
    })();
  }, [runGemini]);

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.6,
    });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const a = r.assets[0];
    setPending({ uri: a.uri, b64: a.base64, mime: a.mimeType || 'image/jpeg' });
  };

  const send = () => {
    const text = input.trim();
    if ((!text && !pending) || busy) return;
    if (!apiKey) { setShowSettings(true); return; }
    const userMsg = { role: 'user', text, uri: pending?.uri, b64: pending?.b64, mime: pending?.mime };
    setInput(''); setPending(null);
    // Only the newest turn carries image bytes, which keeps requests small.
    const prior = messagesRef.current.filter((m) => !m.error).map((m) => ({ ...m, b64: undefined }));
    const history = [...prior, userMsg].slice(-30);
    push(userMsg);
    runGemini(history, { key: apiKey, models: buildChain(model, fallbacks) });
  };

  const loadModels = useCallback(async (key) => {
    if (!key) { setModelsErr('Enter your API key first.'); return; }
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

  const renderItem = ({ item }) => {
    const mine = item.role === 'user';
    return (
      <View style={[styles.row, mine && styles.rowMine]}>
        <View style={[styles.bubble, mine ? styles.mine : styles.theirs, item.error && styles.err]}>
          {item.kind === 'daily' && <Text style={styles.tag}>📰 Daily update</Text>}
          {!!item.uri && <Image source={{ uri: item.uri }} style={styles.pic} resizeMode="cover" />}
          {!!item.text && <Text style={styles.text} selectable>{item.text}</Text>}
          {item.fellBack && <Text style={styles.via}>↪ answered by {item.model} (fallback)</Text>}
          {item.sources?.length > 0 && (
            <View style={styles.sources}>
              <Text style={styles.tag}>Sources</Text>
              {item.sources.slice(0, 5).map((s) => (
                <Text key={s.uri} style={styles.link} numberOfLines={1} onPress={() => Linking.openURL(s.uri)}>
                  {s.title}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (!ready) return <View style={styles.center}><ActivityIndicator color="#f06292" /></View>;

  const canSend = (input.trim() || pending) && !busy;

  return (
    <View style={[styles.safe, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Shraddha Fan Chat</Text>
          <Text style={styles.subtitle}>Unofficial fan assistant · powered by Gemini</Text>
        </View>
        <Pressable onPress={() => setShowSettings(true)} style={styles.iconBtn}>
          <Text style={styles.icon}>⚙️</Text>
        </Pressable>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.links}>
          {LINKS.map((l) => (
            <Pressable key={l.url} style={styles.chip} onPress={() => Linking.openURL(l.url)}>
              <Text style={styles.chipText}>{l.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View>
              <Text style={styles.empty}>Ask me anything about her films, songs or latest news. You can attach a photo too.</Text>
              {!apiKey && (
                <Text style={[styles.keyLink, { textAlign: 'center', marginTop: 12 }]} onPress={() => Linking.openURL(API_KEY_URL)}>
                  Need a Gemini API key? Get one free →
                </Text>
              )}
            </View>
          }
        />
        {busy && <Text style={styles.typing}>Thinking…</Text>}
        {pending && (
          <View style={styles.preview}>
            <Image source={{ uri: pending.uri }} style={styles.previewImg} />
            <Pressable onPress={() => setPending(null)} style={styles.previewX}><Text style={styles.sendText}>✕</Text></Pressable>
          </View>
        )}
        {/* With the keyboard open it already sits above the system bar, so the extra inset is dropped. */}
        <View style={[styles.inputBar, { paddingBottom: 10 + (kbOpen ? 0 : insets.bottom) }]}>
          <Pressable onPress={pickImage} style={styles.attach}>
            <Text style={styles.attachText}>📎</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message"
            placeholderTextColor="#888"
            multiline
          />
          <Pressable onPress={send} style={[styles.send, !canSend && { opacity: 0.4 }]}>
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSettings} animationType="slide" transparent statusBarTranslucent
        navigationBarTranslucent onRequestClose={() => setShowSettings(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior="padding">
          <View style={[styles.modal, { paddingBottom: 20 + (kbOpen ? 0 : insets.bottom) }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Settings</Text>
              <Text style={styles.label}>Gemini API key (stored securely on this device)</Text>
              <Text style={styles.keyLink} onPress={() => Linking.openURL(API_KEY_URL)}>
                Get a free API key → aistudio.google.com/apikey
              </Text>
              <TextInput style={[styles.field, { marginTop: 10 }]} value={apiKey} onChangeText={setApiKey} secureTextEntry
                autoCapitalize="none" autoCorrect={false} placeholder="AIza…" placeholderTextColor="#666" />

              <View style={styles.switchRow}>
                <Text style={[styles.label, { flex: 1 }]}>Models (from the API)</Text>
                <Pressable onPress={() => loadModels(apiKey)} style={styles.smallBtn}>
                  <Text style={styles.chipText}>{modelsBusy ? 'Loading…' : '↻ Refresh'}</Text>
                </Pressable>
              </View>
              {!!modelsErr && <Text style={styles.errText}>{modelsErr}</Text>}
              <Text style={styles.hint}>Tap a model to make it primary. Tap + to add it as a fallback, in the order you tap.</Text>
              <View style={styles.modelBox}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {models.length === 0 && !modelsBusy && (
                    <Text style={styles.hint}>No models loaded yet. Enter your key and tap Refresh.</Text>
                  )}
                  {models.map((m) => {
                    const fb = fallbacks.indexOf(m.id);
                    return (
                      <View key={m.id} style={styles.modelRow}>
                        <Pressable style={{ flex: 1 }} onPress={() => setModel(m.id)}>
                          <Text style={[styles.modelId, model === m.id && styles.modelOn]} numberOfLines={1}>
                            {model === m.id ? '✓ ' : ''}{m.id}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => toggleFallback(m.id)} style={[styles.fbBtn, fb >= 0 && styles.fbOn]}>
                          <Text style={styles.chipText}>{fb >= 0 ? `#${fb + 1}` : '+'}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.label}>Primary model (you can also type an id)</Text>
              <TextInput style={styles.field} value={model} onChangeText={setModel}
                autoCapitalize="none" autoCorrect={false} placeholderTextColor="#666" />
              <Text style={styles.hint}>Order used: {buildChain(model, fallbacks).join(' → ')}</Text>
              <Text style={styles.hint}>If a model errors (busy, rate-limited, retired), the next one is tried automatically.</Text>

              <View style={styles.switchRow}>
                <Text style={[styles.label, { flex: 1 }]}>Daily reminder</Text>
                <Switch value={dailyOn} onValueChange={setDailyOn} />
              </View>
              {dailyOn && (
                <>
                  <Text style={styles.label}>Hour of day (0–23)</Text>
                  <TextInput style={styles.field} value={hour} onChangeText={setHour} keyboardType="number-pad" />
                </>
              )}
              <Pressable style={styles.save} onPress={saveSettings}><Text style={styles.sendText}>Save</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b10' },
  center: { flex: 1, backgroundColor: '#0b0b10', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#1d1d26' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8a8a99', fontSize: 12, marginTop: 2 },
  links: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { backgroundColor: '#1d1d26', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2c2c38' },
  chipText: { color: '#f48fb1', fontSize: 13, fontWeight: '600' },
  iconBtn: { padding: 8 },
  icon: { fontSize: 20 },
  list: { padding: 12, flexGrow: 1 },
  empty: { color: '#8a8a99', textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  row: { flexDirection: 'row', marginVertical: 4 },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 16 },
  mine: { backgroundColor: '#c2185b', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: '#1d1d26', borderBottomLeftRadius: 4 },
  err: { backgroundColor: '#3b1a1a' },
  text: { color: '#fff', fontSize: 15, lineHeight: 21 },
  pic: { width: 220, height: 220, borderRadius: 12, marginBottom: 6, backgroundColor: '#000' },
  tag: { color: '#f48fb1', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  via: { color: '#8a8a99', fontSize: 11, marginTop: 6 },
  sources: { marginTop: 10, borderTopWidth: 1, borderColor: '#2c2c38', paddingTop: 8 },
  link: { color: '#82b1ff', fontSize: 12, marginTop: 2 },
  typing: { color: '#8a8a99', paddingHorizontal: 16, paddingBottom: 4, fontSize: 12 },
  preview: { paddingHorizontal: 12, paddingTop: 6 },
  previewImg: { width: 72, height: 72, borderRadius: 10 },
  previewX: { position: 'absolute', left: 66, top: 0, backgroundColor: '#000b', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 10, gap: 8 },
  attach: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1d1d26', alignItems: 'center', justifyContent: 'center' },
  attachText: { fontSize: 20 },
  input: { flex: 1, backgroundColor: '#1d1d26', color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120 },
  send: { backgroundColor: '#c2185b', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#14141c', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  label: { color: '#aaa', fontSize: 12, marginTop: 14, marginBottom: 6 },
  hint: { color: '#777', fontSize: 11, marginTop: 6, lineHeight: 15 },
  errText: { color: '#ef9a9a', fontSize: 12, marginTop: 4 },
  keyLink: { color: '#82b1ff', fontSize: 13, marginTop: 10, textDecorationLine: 'underline' },
  field: { backgroundColor: '#1d1d26', color: '#fff', borderRadius: 10, padding: 12 },
  smallBtn: { backgroundColor: '#1d1d26', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  modelBox: { backgroundColor: '#1d1d26', borderRadius: 10, marginTop: 6 },
  modelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderColor: '#14141c' },
  modelId: { color: '#ddd', fontSize: 13, paddingVertical: 8 },
  modelOn: { color: '#f48fb1', fontWeight: '700' },
  fbBtn: { minWidth: 36, alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#2c2c38' },
  fbOn: { backgroundColor: '#3a1f2c', borderColor: '#f48fb1' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  save: { backgroundColor: '#c2185b', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
});
