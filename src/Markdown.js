import { Text, View } from 'react-native';

// Gemini answers in light markdown. This handles what it actually uses: **bold**, bullets, headings.
function inline(text, key) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.length > 4 && p.startsWith('**') && p.endsWith('**')
      ? <Text key={`${key}-${i}`} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
      : p.replace(/\*(?!\s)/g, ''),
  );
}

export default function Markdown({ text, style, bulletColor }) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
        const bullet = line.match(/^\s*[*\-•]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={{ flexDirection: 'row', marginTop: 3 }}>
              <Text style={[style, { width: 18, color: bulletColor }]}>•</Text>
              <Text style={[style, { flex: 1 }]}>{inline(bullet[1], i)}</Text>
            </View>
          );
        }
        const head = line.match(/^#{1,4}\s+(.*)$/);
        if (head) {
          return <Text key={i} style={[style, { fontWeight: '800', marginTop: 4 }]}>{inline(head[1], i)}</Text>;
        }
        return <Text key={i} style={style}>{inline(line, i)}</Text>;
      })}
    </View>
  );
}
