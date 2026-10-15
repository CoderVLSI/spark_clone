const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL = 'gemini-flash-latest';

// Tried in order after the user's own choices. Unknown or retired ids just 404 and fall through.
export const DEFAULT_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

export const SYSTEM_PROMPT = `You are a friendly fan-companion assistant for fans of Shraddha Kapoor, the Indian actor and singer.
You are NOT Shraddha Kapoor and must never pretend to be her, speak as her, or invent quotes from her.
Talk about her public work: films, songs, brand work, public appearances and official social posts.
Do not speculate about her private life, relationships, health or location, and do not help locate or contact her.
Be warm, upbeat and concise. When you state recent facts, use Google Search and say when you are unsure.
If the user sends an image, describe what is visible (clothing, setting, mood) and answer questions about it, but never name or identify a person from their face. Go by captions or text the user provides.
If asked for photos, point to her official accounts instead of generating images of her.`;

export const DAILY_PROMPT = `Give me today's update on Shraddha Kapoor: new film or song announcements, release dates, public appearances, and official social posts from the last 48 hours.
Use search. Keep it to 4-6 short bullet points, most important first. Only report what you actually found, and if there is nothing new, say so in one sentence.`;

// Same call as: curl "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY"
export async function listModels(apiKey) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${BASE}/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Could not list models (${res.status})`);
    out.push(...(data.models || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  const chatty = out
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name, desc: m.description || '' }))
    .filter((m) => m.id.startsWith('gemini') && !/embedding|tts|image|live|audio|robotics|computer-use|aqa/i.test(m.id));

  const ver = (id) => {
    const v = id.match(/(\d+(?:\.\d+)?)/);
    return v ? parseFloat(v[1]) : 0;
  };
  // Newest version first, `-latest` aliases on top, previews after stable.
  return chatty.sort((a, b) => {
    const al = /latest/.test(a.id), bl = /latest/.test(b.id);
    if (al !== bl) return al ? -1 : 1;
    if (ver(a.id) !== ver(b.id)) return ver(b.id) - ver(a.id);
    const ap = /preview|exp/.test(a.id), bp = /preview|exp/.test(b.id);
    if (ap !== bp) return ap ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

export function buildChain(primary, fallbacks) {
  return [...new Set([primary || DEFAULT_MODEL, ...(fallbacks || []), ...DEFAULT_FALLBACKS])];
}

function toContents(history) {
  const turns = [...history];
  while (turns.length && turns[0].role !== 'user') turns.shift(); // must start with a user turn
  return turns.map((m) => {
    const parts = [];
    if (m.b64) parts.push({ inlineData: { mimeType: m.mime || 'image/jpeg', data: m.b64 } });
    parts.push({ text: m.text || (m.b64 ? 'What do you see in this image?' : m.uri ? '[image]' : '') });
    return { role: m.role === 'user' ? 'user' : 'model', parts };
  });
}

class GeminiError extends Error {
  constructor(message, status, fatal) {
    super(message);
    this.status = status;
    this.fatal = fatal;
  }
}

async function callOnce(apiKey, model, contents, search) {
  const body = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents };
  if (search) body.tools = [{ google_search: {} }];
  let res;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError(`Network error: ${e.message}`, 0, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini request failed (${res.status})`;
    // A bad key fails on every model, so stop instead of walking the whole chain.
    const fatal = res.status === 401 || /API key not valid|API_KEY_INVALID/i.test(msg);
    throw new GeminiError(msg, res.status, fatal);
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) {
    const why = data.promptFeedback?.blockReason || cand?.finishReason || 'empty reply';
    throw new GeminiError(`No answer (${why})`, 0, false);
  }
  const seen = new Set();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w) => ({ title: w.title || w.uri, uri: w.uri }));
  return { text, sources };
}

// Walks `models` in order and returns the first success, plus which model answered.
export async function askGemini({ apiKey, models, history }) {
  const contents = toContents(history);
  const tried = [];
  let last;
  for (const model of models) {
    try {
      try {
        return { ...(await callOnce(apiKey, model, contents, true)), model, tried };
      } catch (e) {
        // Some models reject the search tool; retry the same model without it before moving on.
        if (e.status === 400 && /tool|search|ground/i.test(e.message)) {
          return { ...(await callOnce(apiKey, model, contents, false)), model, tried };
        }
        throw e;
      }
    } catch (e) {
      last = e;
      tried.push(model);
      if (e.fatal) break;
    }
  }
  const n = tried.length;
  throw new Error(`${last?.message || 'Request failed'}${n > 1 ? ` (tried ${n} models)` : ''}`);
}

// ---- Gemini Live (voice mode) ----

export const VOICES = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];
export const DEFAULT_VOICE = 'Kore';

// Tried in order when the API's own model list can't be fetched. Retired or unknown ids fail at
// setup and the session moves on to the next one.
export const DEFAULT_LIVE_MODELS = [
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-live-2.5-flash-preview',
];

export const VOICE_PROMPT = `${SYSTEM_PROMPT}
You are speaking aloud in a live voice chat. Keep answers short and natural, one to three sentences unless asked for more. No lists, no markdown, no emojis. Say the AI-assistant part plainly if asked who you are: you are an unofficial fan assistant, not Shraddha Kapoor.`;

const liveRank = (id) => {
  const v = id.match(/(\d+(?:\.\d+)?)/);
  const date = id.match(/(\d{2})-(\d{4})$/); // e.g. 12-2025
  return [v ? parseFloat(v[1]) : 0, date ? Number(date[2]) * 100 + Number(date[1]) : 0, /native-audio/.test(id) ? 1 : 0];
};

// Same idea as listing models with curl, but keeps the ones that support the Live (bidi) method.
export async function listLiveModels(apiKey) {
  const res = await fetch(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Could not list models (${res.status})`);
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => /live|native-audio/.test(id))
    .sort((a, b) => {
      const A = liveRank(a), B = liveRank(b);
      for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return B[i] - A[i];
      return a.localeCompare(b);
    });
}

export function buildLiveChain(preferred, discovered) {
  return [...new Set([preferred, ...(discovered || []), ...DEFAULT_LIVE_MODELS].filter(Boolean))];
}
