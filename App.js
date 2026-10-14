import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform,
  Pressable, SafeAreaView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { askGemini, DAILY_PROMPT, DEFAULT_MODEL } from './src/gemini';
import { getSetting, loadChat, saveChat, setSetting } from './src/storage';
import { cancelDailyReminder, scheduleDailyReminder } from './src/notifications';

const OFFICIAL_INSTAGRAM = 'https://www.instagram.com/shraddhakapoor/';
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [dailyOn, setDailyOn] = useState(false);
  const [hour, setHour] = useState('9');
  const listRef = useRef(null);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const push = useCallback((msg) => {
    setMessages((prev) => {
      const next = [...prev, { id: uid(), ...msg }];
      saveChat(next);
      return next;
    });
  }, []);

  const runGemini = useCallback(async (history, key, mdl, kind) => {
    setBusy(true);
    try {
      const { text, sources } = await askGemini({ apiKey: key, model: mdl, history });
      push({ role: 'model', text, sources, kind });
    } catch (e) {
      push({ role: 'model', text: `⚠️ ${e.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }, [push]);

  // Load saved state; fetch today's update once per day.
  useEffect(() => {
    (async () => {
      const [key, mdl, daily, h, chat, last] = await Promise.all([
        getSetting('apiKey'), getSetting('model', DEFAULT_MODEL), getSetting('dailyOn'),
        getSetting('hour', '9'), loadChat(), getSetting('lastUpdate'),
      ]);
      setApiKey(key); setModel(mdl); setDailyOn(daily === '1'); setHour(h);
      setMessages(chat); messagesRef.current = chat;
      setReady(true);
      if (!key) { setShowSettings(true); return; }
      if (last !== today()) {
        await setSetting('lastUpdate', today());
        runGemini([{ role: 'user', text: DAILY_PROMPT }], key, mdl, 'daily');
      }
    })();
  }, [runGemini]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!apiKey) { setShowSettings(true); return; }
    setInput('');
    const history = [...messagesRef.current.filter((m) => !m.error), { role: 'user', text }];
    push({ role: 'user', text });
    runGemini(history.slice(-30), apiKey, model);
  };

  const saveSettings = async () => {
    await setSetting('apiKey', apiKey.trim());
    await setSetting('model', model.trim() || DEFAULT_MODEL);
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
          <Text style={styles.text} selectable>{item.text}</Text>
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Shraddha Fan Chat</Text>
          <Text style={styles.subtitle}>Unofficial fan assistant · powered by Gemini</Text>
        </View>
        <Pressable onPress={() => Linking.openURL(OFFICIAL_INSTAGRAM)} style={styles.iconBtn}>
          <Text style={styles.icon}>📷</Text>
        </Pressable>
        <Pressable onPress={() => setShowSettings(true)} style={styles.iconBtn}>
          <Text style={styles.icon}>⚙️</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.empty}>Ask me anything about her films, songs or latest news.</Text>}
        />
        {busy && <Text style={styles.typing}>Thinking…</Text>}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message"
            placeholderTextColor="#888"
            multiline
          />
          <Pressable onPress={send} style={[styles.send, (!input.trim() || busy) && { opacity: 0.4 }]}>
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.label}>Gemini API key (stored securely on this device)</Text>
            <TextInput style={styles.field} value={apiKey} onChangeText={setApiKey} secureTextEntry
              autoCapitalize="none" autoCorrect={false} placeholder="AIza…" placeholderTextColor="#666" />
            <Text style={styles.label}>Model</Text>
            <TextInput style={styles.field} value={model} onChangeText={setModel}
              autoCapitalize="none" autoCorrect={false} placeholderTextColor="#666" />
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
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b10' },
  center: { flex: 1, backgroundColor: '#0b0b10', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#1d1d26' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8a8a99', fontSize: 12, marginTop: 2 },
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
  tag: { color: '#f48fb1', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  sources: { marginTop: 10, borderTopWidth: 1, borderColor: '#2c2c38', paddingTop: 8 },
  link: { color: '#82b1ff', fontSize: 12, marginTop: 2 },
  typing: { color: '#8a8a99', paddingHorizontal: 16, paddingBottom: 4, fontSize: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: { flex: 1, backgroundColor: '#1d1d26', color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120 },
  send: { backgroundColor: '#c2185b', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#14141c', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  label: { color: '#aaa', fontSize: 12, marginTop: 14, marginBottom: 6 },
  field: { backgroundColor: '#1d1d26', color: '#fff', borderRadius: 10, padding: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  save: { backgroundColor: '#c2185b', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
});
