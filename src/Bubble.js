import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from './Markdown';
import TypingDots from './TypingDots';
import { colors, gradient, radius, space, type } from './theme';

const avatar = require('../assets/avatar.png');

const time = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function BotAvatar() {
  return <Image source={avatar} style={styles.avatar} />;
}

export function TypingBubble() {
  return (
    <View style={styles.row}>
      <BotAvatar />
      <View style={[styles.bubble, styles.bot, { paddingVertical: 14 }]}>
        <TypingDots />
      </View>
    </View>
  );
}

export default function Bubble({ item, maxWidth, onRetry }) {
  const mine = item.role === 'user';
  const image = !!item.uri && <Image source={{ uri: item.uri }} style={styles.pic} resizeMode="cover" />;

  if (mine) {
    return (
      <View style={[styles.row, styles.rowMine]}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.mine, { maxWidth }]}>
          {image}
          {!!item.text && <Text style={styles.mineText} selectable>{item.text}</Text>}
          {!!item.ts && <Text style={styles.timeMine}>{time(item.ts)}</Text>}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <BotAvatar />
      <View style={[styles.bubble, styles.bot, item.error && styles.err, { maxWidth }]}>
        {item.kind === 'daily' && (
          <View style={styles.dailyTag}>
            <Ionicons name="newspaper-outline" size={13} color={colors.pink} />
            <Text style={styles.dailyText}>Daily update</Text>
          </View>
        )}
        {item.error ? (
          <View style={styles.errRow}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[type.body, { color: colors.danger, flex: 1 }]} selectable>{item.text.replace(/^⚠️\s*/, '')}</Text>
          </View>
        ) : (
          <Markdown text={item.text} style={type.body} bulletColor={colors.pink} />
        )}
        {item.error && onRetry && (
          <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Ionicons name="refresh" size={14} color={colors.pinkSoft} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
        {item.fellBack && (
          <Text style={styles.via}>↪ answered by {item.model} (fallback)</Text>
        )}
        {item.sources?.length > 0 && (
          <View style={styles.sources}>
            <Text style={type.label}>Sources</Text>
            {item.sources.slice(0, 5).map((s) => (
              <Pressable key={s.uri} onPress={() => Linking.openURL(s.uri)} style={styles.sourceRow}>
                <Ionicons name="link-outline" size={13} color={colors.link} />
                <Text style={styles.link} numberOfLines={1}>{s.title}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {!!item.ts && <Text style={styles.time}>{time(item.ts)}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginVertical: 5 },
  rowMine: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.pinkDeep, backgroundColor: colors.surface2 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md },
  mine: { borderBottomRightRadius: 5 },
  bot: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 5, flexShrink: 1 },
  err: { backgroundColor: colors.dangerBg, borderColor: '#4a2a31' },
  mineText: { ...type.body, color: '#fff' },
  pic: { width: 220, height: 220, borderRadius: radius.sm, marginBottom: 6, backgroundColor: '#000', maxWidth: '100%' },
  time: { ...type.caption, marginTop: 6, alignSelf: 'flex-end' },
  timeMine: { ...type.caption, color: 'rgba(255,255,255,0.75)', marginTop: 4, alignSelf: 'flex-end' },
  dailyTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  dailyText: { ...type.label, color: colors.pink },
  errRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(240,98,146,0.14)' },
  retryText: { color: colors.pinkSoft, fontSize: 13, fontWeight: '700' },
  via: { ...type.caption, marginTop: 8 },
  sources: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8, gap: 4 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  link: { color: colors.link, fontSize: 12.5, flex: 1 },
});
