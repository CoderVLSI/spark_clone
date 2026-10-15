# Shraddha Fan Chat

An unofficial, chat-only Android app (React Native / Expo) for fans of Shraddha Kapoor, powered by the Gemini API.

- Dark theme with pink accents, a welcome screen with suggested questions, typing indicator, retry on errors, and light markdown rendering of replies.
- Layout uses `react-native-safe-area-context`: the header clears the status bar and display cutout, and the composer clears the system navigation bar and rides above the keyboard.
- Settings is a bottom sheet with a scrolling body and a pinned Save button.
- Chat UI backed by Gemini with Google Search grounding, so answers about recent news cite sources.
- A daily update is fetched automatically the first time you open the app each day.
- Attach a photo with 📎 and ask about it. The bot describes what's visible and does not name people from faces.
- Settings lists every model your key can use, fetched from the Gemini API (`GET /v1beta/models`). Pick a primary and tap + to add fallbacks. If a model errors, the next one is tried automatically, and the reply says which one answered.
- Voice mode: tap the mic button (shown when the text box is empty) for a live spoken conversation over the Gemini Live API (WebSocket, 16 kHz mic in, 24 kHz speech out). Echo cancellation comes from `@speechmatics/expo-two-way-audio`. You can talk over the assistant to interrupt it. The app asks your key which Live models it supports and picks the newest, falling back through a built-in list. Pick the voice in Settings. The call's transcript is saved into the chat. It is an AI voice, not hers.
- Optional daily local reminder notification (set the hour in Settings).
- Your API key is stored with `expo-secure-store` on the device. It is never committed to the repo.
- The assistant does not impersonate her and does not speculate about her private life.
- A row of link chips (official Instagram, news, photos, YouTube) opens in your browser instead of scraping photos.

## Run

```bash
npm install
npx expo start      # scan the QR code with Expo Go on your phone
```

Get a free key at https://aistudio.google.com/apikey, then paste it in the app's Settings.
The default model is the `gemini-flash-latest` alias. You can change it in Settings.

## Limits

- The daily reminder is a local notification, and the update is fetched when you open the app. Pushing a message while the app is closed needs a small server (for example a scheduled job calling Gemini and sending an Expo push). That isn't included yet.
- Voice mode needs a real build (the APK or `npx expo run:android`) because it uses a native audio module. It does not run in Expo Go. Live sessions use more of your Gemini quota than text chat.
- Notifications may be limited in Expo Go on newer SDKs. Use a development build (`npx expo run:android`) to test them.
