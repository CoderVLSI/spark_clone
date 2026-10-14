import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import TypingDots from './TypingDots';
import { colors, gradient, radius, space, type } from './theme';

const avatar = require('../assets/avatar.png');

export const SUGGESTIONS = [
  { icon: 'newspaper-outline', text: "What's the latest news about Shraddha Kapoor?" },
  { icon: 'film-outline', text: 'Tell me about her best-known films' },
  { icon: 'musical-notes-outline', text: 'Which songs has she sung?' },
  { icon: 'calendar-outline', text: 'What projects are coming up?' },
];

export default function Welcome({ width, height, hasKey, loadingUpdate, onSuggest, onOpenSettings, keyUrl }) {
  const compact = height < 700;
  const size = Math.round(Math.min(Math.max(width * 0.3, 88), compact ? 104 : 132));

  return (
    <ScrollView
      contentContainerStyle={[styles.wrap, { paddingHorizontal: width < 360 ? space.md : space.lg }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['rgba(240,98,146,0.20)', 'rgba(194,24,91,0.04)', 'transparent']}
        style={[styles.hero, { paddingVertical: compact ? space.lg : space.xl }]}>
        <LinearGradient colors={gradient} style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
          <Image source={avatar} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors.bg }} />
        </LinearGradient>
        <Text style={[type.display, styles.center, width < 360 && { fontSize: 22, lineHeight: 28 }]}>
          Shraddha Fan Chat
        </Text>
        <Text style={[type.body, styles.center, { color: colors.textDim }]}>
          Ask about her films, songs and latest news.
        </Text>
        <View style={styles.badge}>
          <Ionicons name="information-circle-outline" size={14} color={colors.pinkSoft} />
          <Text style={styles.badgeText}>Unofficial fan assistant</Text>
        </View>
        <Text style={[type.caption, styles.center]}>Not affiliated with or endorsed by Shraddha Kapoor.</Text>
      </LinearGradient>

      {!hasKey ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="key-outline" size={20} color={colors.pink} />
            <Text style={type.title}>Connect Gemini to start</Text>
          </View>
          <Text style={[type.small, { marginTop: 6 }]}>
            Add your free Gemini API key. It stays on this phone, stored securely.
          </Text>
          <Pressable onPress={onOpenSettings} accessibilityRole="button">
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              <Text style={styles.ctaText}>Add API key</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(keyUrl)} style={styles.getKey}>
            <Text style={styles.link}>Get a free key at aistudio.google.com →</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {loadingUpdate && (
            <View style={styles.loading}>
              <TypingDots />
              <Text style={type.small}>Fetching today's update…</Text>
            </View>
          )}
          <Text style={[type.label, styles.section]}>Try asking</Text>
          <View style={styles.grid}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s.text} onPress={() => onSuggest(s.text)} accessibilityRole="button"
                style={({ pressed }) => [styles.suggest, pressed && { backgroundColor: colors.surface2 }]}>
                <Ionicons name={s.icon} size={20} color={colors.pink} />
                <Text style={styles.suggestText}>{s.text}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={[type.caption, styles.center, styles.foot]}>
        Replies come from Gemini and can be wrong. This app never speaks as her and avoids private-life topics.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: space.xl, flexGrow: 1 },
  hero: { alignItems: 'center', gap: space.sm, borderRadius: radius.lg, marginTop: space.sm, paddingHorizontal: space.lg },
  ring: { alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.pinkGlow, borderWidth: 1, borderColor: 'rgba(240,98,146,0.35)', maxWidth: '100%' },
  badgeText: { color: colors.pinkSoft, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  section: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 2 },
  grid: { gap: space.sm },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  suggestText: { ...type.body, flex: 1, fontSize: 15 },
  card: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cta: { marginTop: space.lg, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  getKey: { alignItems: 'center', paddingTop: space.md, paddingBottom: 2 },
  link: { color: colors.link, fontSize: 13.5, textDecorationLine: 'underline' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  foot: { marginTop: space.xl, paddingHorizontal: space.md },
});
