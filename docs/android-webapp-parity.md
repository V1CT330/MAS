# Android ↔ WebApp Feature-Parity Audit

**Status:** Partial parity. The GitHub-built APK compiled, passed signature/package checks, installed and launched in a clean Android emulator on 2026-11-15. Physical-device authentication, provider returns and full workflow parity remain unverified.

## Source of truth and repository boundaries

- Production WebApp: `V1CT330/malawian-app-store`.
- Native Android app: `V1CT330/MAS`.
- Treat the production WebApp as the source of truth for product behavior and supported workflows.
- Keep platform-neutral business rules synchronized in `src/shared/mas-core.ts` in both repositories. The shared module must not depend on React, React Native, browser APIs or Supabase.
- Implement Android-specific screens and integrations in `V1CT330/MAS`; do not copy the WebApp into the APK or change production WebApp behavior merely to make the native client appear complete.
- Reuse the existing Supabase project, tables, RPCs, storage buckets, server functions and authenticated WebApp workflows. Never ship service-role, payment-provider or identity-provider secrets in the Android app.

## Active native architecture

- `index.ts` registers `NativeRoot.tsx`. `App.tsx` is a legacy, unreferenced root and is not the runtime source of truth.
- `NativeRoot.tsx` owns the native Store/Developer/Social spaces, Store tabs, OAuth deep-link listener and screen wiring.
- `src/screens/StoreScreen.tsx` implements native published-listing discovery, filters and search.
- `src/screens/LibraryScreen.tsx` implements installed, saved and history views, signed downloads and explicit update confirmation.
- `src/screens/NotificationsScreen.tsx` implements user/developer notification lists, mark-all-read, dismiss, refresh and error/empty states.
- `src/screens/AccountScreen.tsx` implements Google OAuth launch, profile editing and sign-out; `NativeRoot.tsx` exchanges the returned PKCE code.
- `src/screens/DeveloperScreen.tsx` wires the native dashboard, listing filters/search, listing detail, publishing, analytics, verification, subscription, settings and developer notifications.
- `src/screens/NativePublishingScreen.tsx` and `NativeListingDetailScreen.tsx` implement native listing/release workflows and asset uploads.
- `src/screens/NativeAnalyticsScreen.tsx` reads the existing `developer_stats` RPC.
- `src/screens/NativeVerificationScreen.tsx` reads server-authoritative KYC status and starts a validated HTTPS Didit handoff. Manual document upload is deliberately disabled in the UI until private KYC storage is provisioned.
- `src/screens/NativeSubscriptionScreen.tsx` reads subscription state and hands checkout/cancellation to the existing secure WebApp/PayChangu flow. It does not write paid status.
- `src/screens/SocialScreen.tsx` implements feed, media posts, comments/replies, reactions, connections, messages, notifications, Find Investors, monetization setup states and search across people, posts, published apps and developer projects.

## Feature-parity matrix

| Area | Native implementation on main | Remaining gap / verification |
| --- | --- | --- |
| Authentication and account | Google OAuth PKCE callback, session listener, account profile edit and sign-out | Real-device redirect allowlisting, session restore/expiry and sign-out acceptance remain untested |
| Store discovery | Native published catalogue, kind filters, search and listing details | Compare ranking, ratings/reviews, sponsored placements and ad-event behavior against production |
| Library | Installed, saved and history tabs; signed asset downloads; update download and explicit version confirmation | Test signed downloads and Android package-install handoff on a physical device; removing a library row is not an OS-level uninstall |
| Notifications | Current-user and scope-filtered list, mark all read, dismiss, retry and empty states | Verify RLS behavior and notification destinations on device |
| Developer dashboard | Native summary, listing status filters/search, product detail, publishing, analytics, settings and developer notifications | Some team/security/quality/administration destinations remain secure WebApp handoffs; validate all mutations against production RLS |
| Publishing and releases | Native listing creation, package/image uploads, listing detail, release upload and review-status display | Test upload cleanup, file limits, review transitions and release downloads against production storage/RPC policies |
| KYC/verification | Server-authoritative status, phone contact update and validated Didit session handoff | Manual document upload is intentionally disabled; test Didit return/webhook/status refresh on a real device |
| Developer Pro/payments | Native subscription overview; checkout/cancellation remain hosted | Test PayChangu handoff and return on device; never update subscription state from the client |
| Wallet/earnings | Secure WebApp handoff; no client-side balance or payout writes | Keep withdrawals and unimplemented marketplace settlement disabled until trusted server workflows exist |
| Social | Feed, media, comments/replies, likes, connections, messages, notifications, investor directory/opportunities, monetization setup states and search across people/posts/apps/projects | Verify production RLS, media permissions, message read state, pagination and external links on device |
| Administration | Secure WebApp handoff | Keep privileged moderation/KYC decisions server-side; client role checks are not authorization |
| Responsive UX/accessibility | Native width-aware layouts, full-width search/input fields and responsive dashboard metric columns | Physical-device checks for short/narrow screens, keyboard/IME, safe areas, font scaling, screen readers and touch targets remain outstanding |

## Latest verification record — 2026-11-15

### Native Android

- Main commit: `8d165b9d0189d4ba2744f80e9ac35c56c5822116` — Social search now matches the WebApp's People, Posts, published Apps and developer Projects result groups. App results open the production listing route; project URLs are restricted to HTTP(S).
- Native checks: [run 43699573914](https://github.com/V1CT330/MAS/actions/runs/43699573914) — passed.
- APK build: [run 43699573897](https://github.com/V1CT330/MAS/actions/runs/43699573897) — passed.
- APK workflow hardening: [commit `408a015`](https://github.com/V1CT330/MAS/commit/408a01544c5b0fdeb0b87dedd0b9c0bc06fa2ea6) switches the build to lockfile-enforced `npm ci` and enables npm dependency caching.
- Reproducibility verification: [run 43701243458](https://github.com/V1CT330/MAS/actions/runs/43701243458) — passed all build, signature, clean-emulator install/launch and artifact-upload steps.
- Latest artifact: `mas-android-debug-apk`, ID `14156920960`; ZIP size 39,297,946 bytes; SHA-256 `1c3922e83d1785897643717ad620faa7f5aa4fa571ad5b9169bad0b3050659e9`.
- Verified workflow steps: debug APK build; APK signature/package metadata; KVM setup; clean-emulator install and launch; artifact upload.
- Log result: `MAS installed and launched successfully in the clean Android emulator.`
- Package: `mw.wealthgrid.mas`; version `1.0.4`; versionCode `5`. APK Signature Scheme v2 verification passed.
- Artifact: `mas-android-debug-apk`, ID `14155533050`; ZIP size 39,297,945 bytes. The contained universal APK is 110,913,302 bytes and includes arm64-v8a, armeabi-v7a, x86 and x86_64 native libraries.
- This is a debug-signed APK. Updating an existing EAS-signed installation and physical-device installation are not verified.
- The separate EAS build status is blocked by the account's Free-plan Android build quota, which resets on 2026-12-01. This does not block the independent GitHub Actions APK workflow.

### Production WebApp and shared rules

- WebApp main commit: `33c757647825c797f8e583d9eb9d3c1091617753`.
- Web build: [run 43583155837](https://github.com/V1CT330/malawian-app-store/actions/runs/43583155837) — passed.
- GitHub's Vercel commit status reports deployment completed. Direct browser inspection of the production UI was not available in this run; the current Vercel connector cannot resolve the linked project, so do not treat the status check as visual acceptance.
- The two `src/shared/mas-core.ts` files were checked and are byte-for-byte identical (SHA `c12efcd1808a822870932c1b1219f7959983ceb3`).

### Open work and safety constraints

- No open GitHub issues were found in either repository.
- Open native PR #5 and WebApp PR #19 contain responsive navigation/drawer changes. Do not merge them without review; the approved side menu must remain unchanged.
- WebApp PR #18 requires a Supabase migration and PayChangu test/pricing confirmation. It was not merged, and no production database or payment configuration was changed.
- Native PR #2 targets `native/expo-foundation`, not `main`; it is not a production change set.
- No Vercel project settings, Supabase settings, secrets, environment variables, payment configuration or identity-verification configuration were modified.

## Release verification gates

Before calling parity complete:

1. Compare each supported WebApp workflow's inputs, validation, backend calls, authorization, error states and success state with its native counterpart.
2. Keep `src/shared/mas-core.ts` synchronized in both repositories.
3. Run native TypeScript/config checks and the GitHub Android APK build; verify the artifact and signature.
4. Install and launch the APK on a physical Android device. Test both clean install and update compatibility without deleting user data.
5. Test OAuth callback, session restore/expiry, RLS-denied requests, offline/slow network, media permissions, signed downloads, Android back navigation and external/provider return flows.
6. Test Didit and PayChangu handoffs without changing provider configuration or allowing the client to self-approve KYC or payment state.
7. Verify production WebApp deployment and visually inspect the actual production site at phone and desktop widths.
8. Record any backend schema/RLS or external-service prerequisites as blockers; do not change production Supabase/Vercel settings or secrets without Victor's approval.

A successful clean-emulator install proves the APK can install and launch in that environment. It does not prove physical-device compatibility, OAuth/provider return, EAS-signature update compatibility or complete feature parity.
