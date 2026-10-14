# Shraddha Fan Chat

An unofficial, chat-only Android app (React Native / Expo) for fans of Shraddha Kapoor, powered by the Gemini API.

- Chat UI backed by Gemini with Google Search grounding, so answers about recent news cite sources.
- A daily update is fetched automatically the first time you open the app each day.
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
- Notifications may be limited in Expo Go on newer SDKs. Use a development build (`npx expo run:android`) to test them.
