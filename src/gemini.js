const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_MODEL = 'gemini-flash-latest';

export const SYSTEM_PROMPT = `You are a friendly fan-companion assistant for fans of Shraddha Kapoor, the Indian actor and singer.
You are NOT Shraddha Kapoor and must never pretend to be her, speak as her, or invent quotes from her.
Talk about her public work: films, songs, brand work, public appearances and official social posts.
Do not speculate about her private life, relationships, health or location, and do not help locate or contact her.
Be warm, upbeat and concise. When you state recent facts, use Google Search and say when you are unsure.
If asked for photos, point to her official accounts instead of describing or generating images of her.`;

export const DAILY_PROMPT = `Give me today's update on Shraddha Kapoor: new film or song announcements, release dates, public appearances, and official social posts from the last 48 hours.
Use search. Keep it to 4-6 short bullet points, most important first. Only report what you actually found, and if there is nothing new, say so in one sentence.`;

export async function askGemini({ apiKey, model, history, search = true }) {
  // Gemini requires the conversation to start with a user turn.
  const turns = [...history];
  while (turns.length && turns[0].role !== 'user') turns.shift();

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: turns.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
  };
  if (search) body.tools = [{ google_search: {} }];

  const res = await fetch(`${BASE}/${model || DEFAULT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  }

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty reply. Try rephrasing.');

  const seen = new Set();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w) => ({ title: w.title || w.uri, uri: w.uri }));

  return { text, sources };
}
