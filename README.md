# Malawian App Store — Native Android app

This repository contains the **native React Native + Expo app**, separate from the MAS website. It is not a WebView wrapper.

## Current status

- Native Expo project scaffold and Android APK build profiles.
- Native tab shell: Explore, Social, Developer Space and Profile.
- Search and category filtering for clearly labelled sample catalogue entries.
- Sample Social feed and native-screen previews.
- **Not yet connected:** Supabase sign-in, live catalogue, posting/media, messaging, developer workflows, KYC and payments. The sample content must not be treated as live user or transaction data.

## Setup

1. Install Node.js LTS and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the public Supabase URL and publishable/anon key from the existing MAS project. Never add a service-role key or payment-provider secret to the mobile app.
4. Run `npx expo start` to open the app in Expo Go or a development build.
5. Run `npx tsc --noEmit` for a type check.

## Android APK

Install and authenticate the EAS CLI, then run:

```sh
npx eas-cli build --platform android --profile preview
```

The preview profile is configured to produce an installable APK. An EAS build and on-device tests are still required before the app can be described as release-ready.

## Architecture plan

- Native React Native screens and navigation.
- Existing MAS Supabase backend shared with the website.
- Public client credentials only in the app; all privileged actions stay server-side.
- Test authentication, read access, error states, and Android installation before expanding to social posting, messaging, developer listings, and payments.
