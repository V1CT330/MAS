# Malawian App Store — Native Android app

This is a **native React Native + Expo app**, separate from the MAS website. It is not a WebView wrapper. It is designed to share the existing MAS Supabase backend when public client configuration is supplied.

## Current implementation

- Native bottom tabs: Explore, Social, Developer Space and Profile.
- Explore loads published MAS listings when the backend is configured and shows sample entries only as a fallback.
- Listing details, versions, screenshots, ratings/reviews and developer listing workflows are implemented in the native client where supported by the existing backend schema.
- Social includes feed posts, reactions, comments, connection requests, activity, direct messages, photo/video selection and Storage upload.
- Google OAuth sign-in, persisted session display and sign-out are implemented. The `mw.wealthgrid.mas://auth/callback` redirect still requires allowlisting in the existing Supabase Auth configuration and real-device verification.
- Developer Space includes listing drafts, release uploads and quality checks. Some advanced workflows are native screens backed by existing tables; others hand off to the MAS website where the secure web flow already exists.
- Investor opportunities, grants and crowdfunding must not be treated as completed funding transactions just because a listing or link is visible. Native investment opportunity publishing is not payment collection or investment settlement.
- Media upload, messaging, account profiles, release upload and developer workflows depend on the live Supabase schema, storage buckets/policies, user sessions and row-level security. They must be verified against production on a real phone.

## Configure the native build

1. In GitHub, open **V1CT330/MAS → Settings → Secrets and variables → Actions → Variables**.
2. Add these **repository variables** using the public client values from the existing MAS Supabase project:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. These are public client values, not privileged secrets. **Never** add a Supabase service-role key, PayChangu secret, Didit secret or webhook secret to the Android app.
4. If the variables are absent or invalid, the app intentionally uses preview data and backend actions are not live.
5. For Google OAuth, add `mw.wealthgrid.mas://auth/callback` to the existing Supabase Auth redirect allowlist. This is a Supabase setting change and must be authorized before it is made.
6. Run `npm install`, `npm run typecheck` and `npx expo config --type public` before making a release build.

## Accelerated release checklist

### Code and build
- [ ] Native typecheck passes on the current branch.
- [ ] Expo config resolves the correct app ID, scheme, version and EAS project.
- [ ] Android APK build completes and the artifact installs.
- [ ] Increment `android.versionCode` for each new distributed Android release.

### Real-device smoke test
- [ ] Cold launch, tab navigation, back navigation and no-network state.
- [ ] Google sign-in callback, persisted session, sign-out and expired session.
- [ ] Live catalogue, listing details, screenshots, versions and release download.
- [ ] Profile load/update and avatar upload.
- [ ] Social feed, media upload, reactions, comments, connections and direct messages.
- [ ] Developer draft, APK upload, listing submission and status display.
- [ ] Developer Pro checkout opens the existing secure web checkout; verify subscription status is server-derived.
- [ ] Didit opens the existing verification flow; verification status is server-derived.
- [ ] Payment success, cancellation, failure and return paths are checked against server-side payment records.
- [ ] Investor/grant/crowdfunding screens do not claim funds were transferred or settled without a verified server-side workflow.

### Backend/security gate
- [ ] Confirm public Supabase client variables are set in GitHub Actions.
- [ ] Confirm the OAuth redirect is allowlisted in the existing Supabase project.
- [ ] Verify the deployed schema, RLS policies and Storage policies against each native query.
- [ ] Confirm PayChangu, Didit and privileged operations remain server-side.
- [ ] Do not change Supabase settings, production schema, payment configuration or secrets without explicit authorization.

## Android APK

The existing native branch is `native/expo-foundation`; accelerated work should be reviewed before it is merged there. Use the existing EAS project and build profiles to generate a direct-distribution APK. A successful build is not a substitute for installing and testing on a real Android device. MAS is intended for direct APK distribution, not Google Play publishing.

## Security and architecture

- Native React Native screens and controls; no WebView wrapper.
- Existing MAS Supabase backend, subject to deployed schema and row-level security.
- Provider credentials and privileged operations remain server-side.
- The mobile client must never mark a payment as paid or a developer as verified by itself.
- Keep the native Android repo and the MAS website repo separate; do not copy the native project into the website repository.
