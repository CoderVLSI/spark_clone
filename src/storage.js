import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';

const CHAT_FILE = new File(Paths.document, 'chat.json');

export async function getSetting(key, fallback = '') {
  try {
    return (await SecureStore.getItemAsync(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  try {
    if (value === '' || value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, String(value));
  } catch {}
}

export async function loadChat() {
  try {
    if (!CHAT_FILE.exists) return [];
    return JSON.parse(await CHAT_FILE.text());
  } catch {
    return [];
  }
}

export function saveChat(messages) {
  try {
    // Image bytes are kept in memory only; the saved chat keeps just the picture's uri.
    CHAT_FILE.write(JSON.stringify(messages.slice(-200).map((m) => ({ ...m, b64: undefined }))));
  } catch {}
}
