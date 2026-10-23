# Malawian App Store — Native Android app

This is a **native React Native + Expo app**, separate from the MAS website. It is not a WebView wrapper. It is designed to share the existing MAS Supabase backend when public client configuration is supplied.

## Current implementation

- Native bottom tabs: Explore, Social, Developer Space and Profile.
- Explore queries published MAS listings and opens the selected listing on the MAS website. Sample catalogue entries are used only as a fallback.
- Social queries MAS posts and public profile names; text-post publishing, reactions, comments, connection requests, photo/video selection and Storage upload are implemented in the native client.
- Direct-message screens query and write the existing `social_messages` table.
- Google OAuth sign-in, persisted session display and sign-out are implemented. The `mw.wealthgrid.mas://auth/callback` redirect still requires allowlisting in the existing Supabase Auth configuration and real-device verification.
- Developer Space links into the existing MAS web console for listings, Didit verification, Developer Pro/PayChangu checkout, Social opportunities and wallet information. These are secure web handoffs, not native provider SDK integrations.
- Media upload and messaging depend on the live Supabase schema, storage bucket/policies, user sessions and row-level security. They have not yet been verified against the production project on a real phone.
- Investor, grant and crowdfunding links open MAS Social; they are not represented as completed native funding workflows.

## Configure the native build

1. In GitHub, open **V1CT330/MAS → Settings → Secrets and variables → Actions → Variables**.
2. Add these **repository variables** using the public client values from the existing MAS Supabase project:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the project's public anon key if that is what it currently uses)
3. These are public client values, not privileged secrets. **Never** add a Supabase service-role key, PayChangu secret, Didit secret or webhook secret to the Android app.
4. The Android build workflow reads these variables at build time. If they are absent, the app intentionally falls back to preview data and Supabase-backed actions will not be live.
5. For Google OAuth, add `mw.wealthgrid.mas://auth/callback` to the existing Supabase Auth redirect allowlist. Do not change project settings without authorization.
6. Run `npm install` and `npm run typecheck` to check the project locally.

## Android APK

Pushes to `native/expo-foundation` trigger the Android APK build and native checks. The workflow verifies the APK signature, zip alignment and Android package metadata before uploading the installable debug APK artifact. A successful build is not a substitute for installing and testing on a real device.

## Security and architecture

- Native React Native screens and controls; no WebView wrapper.
- Existing MAS Supabase backend, subject to deployed schema and row-level security.
- Provider credentials and privileged operations remain server-side.
- Live account data, payment settlement and identity verification must be confirmed through the existing server-side workflows; the native client must never mark a payment as paid or a developer as verified by itself.
