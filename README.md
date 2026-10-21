# Malawian App Store — Native Android app

This is a **native React Native + Expo app**, separate from the MAS website. It is not a WebView wrapper. It shares the existing MAS Supabase backend when public client configuration is supplied.

## Current status

- Native Expo project and Android APK build profiles.
- Native bottom tabs: Explore, Social, Developer Space and Profile.
- Live public catalogue query against published MAS listings (falls back to clearly marked sample data if configuration or access is unavailable).
- Live read-only Social feed query against MAS posts and public profile names (falls back to sample posts when unavailable).
- App cards open the corresponding MAS website listing.
- Native sign-in, post creation/media upload, reactions/comments, messaging, developer workflows, KYC and payments are **not implemented yet**. No sample balances or financial activity are represented as real.

## Setup

1. Install Node.js LTS and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the public Supabase URL and publishable/anon key from the existing MAS project.
4. Never add a Supabase service-role key, Didit secret, PayChangu secret, or other privileged key to this mobile app.
5. Run `npx expo start` to open the app in Expo Go or a development build.
6. Run `npm run typecheck` to check TypeScript.

## Android APK

Authenticate the EAS CLI, then run:

```sh
npx eas-cli build --platform android --profile preview
```

The preview profile is configured to produce an installable APK. A successful EAS build, visual checks, and Android device testing are still required before calling this release-ready.

## Architecture

- Native React Native screens and controls.
- Existing MAS Supabase backend shared with the website.
- Public client credentials only in the app; privileged actions must stay server-side.
- Live data reads are subject to the current Supabase schema and row-level security policies.
