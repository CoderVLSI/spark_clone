import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildChain, DEFAULT_LIVE_MODELS, VOICES } from './gemini';
import { colors, gradient, radius, space, type } from './theme';

function Section({ icon, title, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={colors.pink} />
        <Text style={type.label}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function SettingsModal(p) {
  const insets = useSafeAreaInsets();
  const chain = buildChain(p.model, p.fallbacks);

  return (
    <Modal visible={p.visible} animationType="slide" transparent statusBarTranslucent
      navigationBarTranslucent onRequestClose={p.onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={{ flex: 1 }} onPress={p.onClose} accessibilityLabel="Close settings" />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Text style={type.title}>Settings</Text>
            <Pressable onPress={p.onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textDim} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: space.lg }}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Section icon="key-outline" title="Gemini API key">
              <Text style={type.small}>Stored securely on this device only.</Text>
              <Pressable onPress={() => Linking.openURL(p.keyUrl)} style={{ paddingVertical: 6 }}>
                <Text style={styles.link}>Get a free API key → aistudio.google.com/apikey</Text>
              </Pressable>
              <TextInput style={styles.field} value={p.apiKey} onChangeText={p.setApiKey} secureTextEntry
                autoCapitalize="none" autoCorrect={false} placeholder="AIza…" placeholderTextColor={colors.muted} />
            </Section>

            <Section icon="sparkles-outline" title="Models">
              <View style={styles.rowBetween}>
                <Text style={[type.small, { flex: 1 }]}>
                  Tap a model to make it primary. Tap + to add fallbacks, in the order you tap.
                </Text>
                <Pressable onPress={p.onRefresh} style={styles.refresh} accessibilityRole="button">
                  {p.modelsBusy
                    ? <ActivityIndicator size="small" color={colors.pink} />
                    : <Ionicons name="refresh" size={15} color={colors.pinkSoft} />}
                  <Text style={styles.refreshText}>Refresh</Text>
                </Pressable>
              </View>
              {!!p.modelsErr && (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={[type.small, { color: colors.danger, flex: 1 }]}>{p.modelsErr}</Text>
                </View>
              )}
              <View style={styles.modelBox}>
                {p.models.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="cloud-download-outline" size={26} color={colors.muted} />
                    <Text style={[type.small, { textAlign: 'center' }]}>
                      {p.modelsBusy ? 'Loading models…' : 'No models loaded yet. Enter your key and tap Refresh.'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 230 }} showsVerticalScrollIndicator>
                    {p.models.map((m, i) => {
                      const fb = p.fallbacks.indexOf(m.id);
                      const on = p.model === m.id;
                      return (
                        <View key={m.id} style={[styles.modelRow, i > 0 && styles.divider]}>
                          <Pressable style={styles.modelMain} onPress={() => p.setModel(m.id)}>
                            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18}
                              color={on ? colors.pink : colors.muted} />
                            <Text style={[styles.modelId, on && { color: colors.pinkSoft, fontWeight: '700' }]} numberOfLines={1}>
                              {m.id}
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => p.toggleFallback(m.id)} hitSlop={6}
                            style={[styles.fb, fb >= 0 && styles.fbOn]} accessibilityLabel={`Toggle fallback ${m.id}`}>
                            <Text style={[styles.fbText, fb >= 0 && { color: colors.pinkSoft }]}>{fb >= 0 ? `#${fb + 1}` : '+'}</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <Text style={[type.small, { marginTop: space.md, marginBottom: 6 }]}>Primary model (you can also type an id)</Text>
              <TextInput style={styles.field} value={p.model} onChangeText={p.setModel}
                autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} />
              <Text style={[type.caption, { marginTop: space.sm }]}>Order used: {chain.join(' → ')}</Text>
              <Text style={[type.caption, { marginTop: 4 }]}>
                If a model errors (busy, rate-limited or retired), the next one is tried automatically.
              </Text>
            </Section>

            <Section icon="mic-outline" title="Voice mode (Gemini Live)">
              <Text style={type.small}>Pick the AI voice. These are Gemini's stock voices, not hers.</Text>
              <View style={styles.voices}>
                {VOICES.map((v) => (
                  <Pressable key={v} onPress={() => p.setVoice(v)} style={[styles.voice, p.voice === v && styles.voiceOn]} accessibilityRole="button">
                    <Text style={[styles.voiceText, p.voice === v && { color: colors.pinkSoft }]}>{v}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[type.small, { marginTop: space.md, marginBottom: 6 }]}>Live model (leave empty for the newest available)</Text>
              <TextInput style={styles.field} value={p.liveModel} onChangeText={p.setLiveModel} placeholder="Automatic"
                autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} />
              <Text style={[type.caption, { marginTop: space.sm }]}>
                Voice mode asks your key which Live models it can use and picks the newest, then falls back through: {DEFAULT_LIVE_MODELS.join(', ')}.
              </Text>
            </Section>

            <Section icon="notifications-outline" title="Daily reminder">
              <View style={styles.rowBetween}>
                <Text style={[type.body, { flex: 1 }]}>Remind me to read today's update</Text>
                <Switch value={p.dailyOn} onValueChange={p.setDailyOn}
                  trackColor={{ false: colors.border, true: colors.pinkDeep }} thumbColor={p.dailyOn ? colors.pinkSoft : '#bbb'} />
              </View>
              {p.dailyOn && (
                <View style={{ marginTop: space.md }}>
                  <Text style={[type.small, { marginBottom: 6 }]}>Hour of day (0–23)</Text>
                  <TextInput style={styles.field} value={p.hour} onChangeText={p.setHour} keyboardType="number-pad" maxLength={2} />
                </View>
              )}
            </Section>

            <View style={styles.about}>
              <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
              <Text style={[type.caption, { flex: 1 }]}>
                Unofficial fan assistant. Not affiliated with or endorsed by Shraddha Kapoor or her team.
                Replies are generated by Gemini and may contain mistakes.
              </Text>
            </View>
          </ScrollView>

          {/* Pinned outside the ScrollView so Save is always reachable. */}
          <View style={[styles.footer, { paddingBottom: space.md + (p.kbOpen ? 0 : insets.bottom) }]}>
            <Pressable onPress={p.onSave} accessibilityRole="button">
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.save}>
                <Text style={styles.saveText}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1, paddingHorizontal: space.lg },
  section: { marginTop: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  field: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  link: { color: colors.link, fontSize: 13.5, textDecorationLine: 'underline' },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.pinkGlow },
  refreshText: { color: colors.pinkSoft, fontSize: 13, fontWeight: '700' },
  errBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: space.sm, padding: space.md, borderRadius: radius.sm, backgroundColor: colors.dangerBg },
  modelBox: { marginTop: space.md, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 8, padding: space.xl },
  modelRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modelMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  modelId: { color: colors.textDim, fontSize: 14, flex: 1 },
  fb: { minWidth: 40, alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  fbOn: { backgroundColor: colors.pinkGlow, borderColor: colors.pink },
  fbText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  voices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  voice: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  voiceOn: { backgroundColor: colors.pinkGlow, borderColor: colors.pink },
  voiceText: { color: colors.textDim, fontSize: 13.5, fontWeight: '600' },
  about: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: space.lg, paddingHorizontal: 4 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  save: { borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
});
