# Android ↔ WebApp Feature-Parity Audit

**Status:** Partial parity. The GitHub-built release APK compiled, passed signature/package checks, installed and launched in a clean Android emulator on 2026-11-23. Physical-device authentication, provider returns and full workflow parity remain unverified.

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
| Store discovery | Native published catalogue, kind filters, search, listing details and sponsored app/website placements using the production `active_ad_creatives` view | Verify live ad-view access, ad-event RLS/telemetry and click destinations on a physical device; compare remaining ranking and review behavior |
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
- Latest artifact at that verification point: `mas-android-debug-apk`, ID `14212125951`; ZIP size 39,297,939 bytes; SHA-256 `a3d7a7241c9588b6c94415653d88333619297b6a6a3c69dc830f033e2d1fe384`.
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
- Open native PR #5 and WebApp PR #18/#28 remain unmerged. Review their diffs before any merge; preserve the approved side menu. WebApp PR #18 still requires its Supabase migration and PayChangu test/pricing confirmation.
- WebApp PR #18 requires a Supabase migration and PayChangu test/pricing confirmation. It was not merged, and no production database or payment configuration was changed.
- Native PR #2 targets `native/expo-foundation`, not `main`; it is not a production change set.
- No Vercel project settings, Supabase settings, secrets, environment variables, payment configuration or identity-verification configuration were modified.

### Native Social message-read parity — 2026-11-16

- Main commit: [`d933396`](https://github.com/V1CT330/MAS/commit/d9333967b9f74d9a218238f196155bcd1853fcaa).
- The native conversation-open handler now checks the recipient-scoped `read_at` update, reports failures instead of silently ignoring them, and synchronizes local message state only after the backend confirms success. This matches the production WebApp's error and query-refresh behavior without changing the database or RLS rules.
- Native checks: [run 43836005497](https://github.com/V1CT330/MAS/actions/runs/43836005497) — passed.
- APK build/emulator verification: [run 43836208958](https://github.com/V1CT330/MAS/actions/runs/43836208958) — completed successfully on commit `ef1610f`; all build, signature, clean-emulator install/launch and artifact-upload steps passed.

## Native Developer dashboard parity — 2026-11-17

- Main code commit: [`e9eeaa6`](https://github.com/V1CT330/MAS/commit/e9eeaa670c41421bb35971d53bb06eb537b893b5) aligns the dashboard's fourth summary metric with the production WebApp's **Needs attention** count: rejected listings plus incomplete drafts.
- The native listing query now reads the fields required by the WebApp's `submissionRequirements`: name, tagline, description, category, icon, screenshots and website URL. The native completeness checks mirror the production WebApp rules, including the website-address requirement.
- Follow-up commit [`9fc039c`](https://github.com/V1CT330/MAS/commit/9fc039c4525fa5b21d6dd15022a107dd2e6324e4) corrects the website URL validation expression after the first CI attempt caught a malformed regex.
- Native checks: [run 44051014186](https://github.com/V1CT330/MAS/actions/runs/44051014186) — passed TypeScript and Android JavaScript bundling.
- APK workflow: [run 44051014173](https://github.com/V1CT330/MAS/actions/runs/44051014173) — first attempt hit Maven Central HTTP 429 while resolving Gson; the failed build job was rerun. Do not count this new commit's APK as verified until retry attempt 2 completes.
- No side-menu, Supabase, Vercel, payment or identity-verification configuration was changed.


### Native Developer workspace authorization — 2026-11-17

- Main code commit: [`eed81ec`](https://github.com/V1CT330/MAS/commit/eed81ec6567c7a91fc74eaad08efa60fd3dd0c68).
- The native Developer workspace now uses the same authoritative `profiles.mode === "developer"` check as the WebApp's `useRequireDeveloper` guard. It checks the profile before querying developer listings or analytics and clears stale dashboard data when access is not confirmed.
- This removes the previous fallback that treated `is_developer === true` as sufficient even when the active mode was `user`.
- Native checks: [run 44061880450](https://github.com/V1CT330/MAS/actions/runs/44061880450) — passed Expo configuration validation, TypeScript and Android JavaScript bundling.
- APK build: [run 44061880617](https://github.com/V1CT330/MAS/actions/runs/44061880617) — build started; signature, clean-emulator install/launch and artifact upload were still pending when this audit note was added. Do not count this commit's APK as verified until all steps complete.
- The WebApp, Vercel, Supabase settings and environment variables were not changed.

### Parity gaps reconfirmed — 2026-11-17

- User Mode: discovery shelves and core filters are native; sponsored store placements are not. Account appearance controls (dark theme and accent presets) remain hosted in WebApp settings rather than native.
- Developer Mode: dashboard, product list/detail, publishing, analytics, verification, subscription, settings and notifications have native counterparts. Testing, quality, reviews, wallet/earnings, advertise, spotlight, AI assistant, resources and team management are not all native workflows; some remain secure WebApp handoffs or are not exposed in the native dashboard.
- Social: native Feed, People, Messages, Notifications, Search, Find Investors, Monetization and My profile sections exist. The WebApp labels People as Friends and exposes extra Collabo/Grants/Crowdfund menu entries that currently show unavailable notices; the native horizontal navigation is not a pixel-identical shell.
- Responsive layout: native root and developer dashboard use width-aware layouts. Physical-device checks for safe areas, keyboard/IME, font scaling, narrow/short screens and touch targets remain outstanding. The app config currently disables Android edge-to-edge; this does not replace device verification.
- Shared rules: `src/shared/mas-core.ts` remains byte-for-byte identical in both repositories (blob SHA `c12efcd1808a822870932c1b1219f7959983ceb3`).

### Developer workspace resume authorization — 2026-11-18

- Main code commits: [`1959407`](https://github.com/V1CT330/MAS/commit/195940782f014721cfff7caa7db9312114b152c8) and [`65fe179`](https://github.com/V1CT330/MAS/commit/65fe179be300171607f0dbde0cde993aec2b142d).
- The active native Developer screen now revalidates the signed-in user and authoritative `profiles.mode === "developer"` permission when Android returns from the background.
- It clears cached developer data while rechecking, delays assigning the authenticated developer user ID until the profile confirms access, and gates nested publishing/listing/analytics/KYC/subscription/settings/notification workflows behind that check.
- A request-generation guard prevents an older in-flight profile check from overwriting a newer foreground refresh; async network exceptions now clear protected dashboard state and produce a visible error instead of leaving the loading indicator stuck.
- When the session is missing, the profile lookup fails, or workspace mode is no longer developer, it exits the nested workflow and clears selected listing state.
- This mirrors the WebApp's `useRequireDeveloper` rule and avoids leaving a stale native developer workflow visible after an account/mode change made outside the app.
- Latest previously verified APK remains commit [`eed81ec`](https://github.com/V1CT330/MAS/commit/eed81ec6567c7a91fc74eaad08efa60fd3dd0c68): run [44061880617](https://github.com/V1CT330/MAS/actions/runs/44061880617) passed all 16 build, signature, clean-emulator install/launch and artifact-upload steps; artifact ID `14318249552`, 39,297,940 bytes.
- The new resume-authorization commit `1959407` still requires its own native-check and APK/emulator run; do not inherit the previous build's result.
- No side-menu, Supabase, Vercel, payment or identity-verification configuration was changed.

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


## Native reliability and responsive pass — 2026-11-19

### Developer dashboard layout

- Main commit: [`b04d622`](https://github.com/V1CT330/MAS/commit/b04d622bc0d57a474285b67f0acb9980964ea2a5).
- Dashboard metric columns now adapt at 2 columns below 600 px, 3 columns from 600 px, and 4 columns from 900 px. This avoids leaving tablet-width screens in a two-column layout while preserving the existing phone layout.
- Native checks: [run 44493683185](https://github.com/V1CT330/MAS/actions/runs/44493683185) — passed.
- The APK job [44493683154](https://github.com/V1CT330/MAS/actions/runs/44493683154) failed during Gradle configuration because the release workflow used the obsolete Expo Gradle minification property. The metric change itself passed the TypeScript/bundle checks.

### Social data freshness and account isolation

- Main code commits: [`503e3f1`](https://github.com/V1CT330/MAS/commit/503e3f10e1a5b4f533d6d075138580c0aa606ede), [`9398164`](https://github.com/V1CT330/MAS/commit/93981648329f2c903bc968268822995e85cff8b3), [`2c6dec0`](https://github.com/V1CT330/MAS/commit/2c6dec0d594a1918e9fe6955871d26f31b4a18c1), and [`108a723`](https://github.com/V1CT330/MAS/commit/108a723c8694ec8f0d3205231248a3e27ea6b00d).
- Social refreshes now use request-generation guards so an older request cannot overwrite a newer refresh. In-flight loads are invalidated on unmount.
- Account-scoped Social data and unsent drafts are cleared when the signed-in account changes or authentication can no longer be confirmed. Unexpected fetch rejections now produce a visible error and clear the loading state.
- Social data is refreshed when Android returns from background to active, in addition to the existing message realtime refresh.
- Native checks: [run 44494681333](https://github.com/V1CT330/MAS/actions/runs/44494681333) — passed TypeScript and Android JavaScript bundling.
- The APK run on the pre-fix workflow [44494681239](https://github.com/V1CT330/MAS/actions/runs/44494681239) failed at Gradle configuration for the same obsolete minification property; the Social code was not the cause.

### Store catalogue loading

- Main commit: [`efc1dc4`](https://github.com/V1CT330/MAS/commit/efc1dc48f2141ee7af8eb2467fb4ab73dc8da1d8).
- The Store catalogue loader now catches rejected network/storage requests, prevents stale loads from overwriting newer requests, always ends the active loading state, and invalidates pending loads when the screen unmounts.
- Native checks: [run 44495165683](https://github.com/V1CT330/MAS/actions/runs/44495165683) — queued at the time this note was written.
- APK build: [run 44495165663](https://github.com/V1CT330/MAS/actions/runs/44495165663) — pending at the time this note was written.

### Release APK workflow root cause and correction

- The optimized release build was introduced in [`06fab90`](https://github.com/V1CT330/MAS/commit/06fab90f589c971c2225b1f514c2c1e70e8d3787) to enable R8 and resource shrinking and reduce the APK footprint.
- CI logs from [run 44381339926](https://github.com/V1CT330/MAS/actions/runs/44381339926) showed the precise failure: Android resource shrinking was enabled while code minification remained disabled. Expo SDK 54's generated Gradle template reads `android.enableMinifyInReleaseBuilds`; the workflow was still passing the older `android.enableProguardInReleaseBuilds` property.
- Corrected the workflow in [`43b6c97`](https://github.com/V1CT330/MAS/commit/43b6c97c9c7a52090c97283899642806d7cec093) to pass `android.enableMinifyInReleaseBuilds=true` together with `android.enableShrinkResourcesInReleaseBuilds=true`.
- The corrected release APK job [44495005243](https://github.com/V1CT330/MAS/actions/runs/44495005243) was in progress at the time of this note. Do not claim the optimized release artifact, its size, signature, emulator install or launch as verified until this run finishes all steps.
- The subsequent Store commit has its own build [44495165663](https://github.com/V1CT330/MAS/actions/runs/44495165663), which will validate the accumulated changes if it completes successfully.

### Current release gate

- The last proven installable artifact remains the debug APK from [run 44061880617](https://github.com/V1CT330/MAS/actions/runs/44061880617), commit `eed81ec`. Its signature, clean-emulator installation, launch and artifact upload passed.
- The optimized release APK is not yet verified. Physical-device installation, existing EAS-signed update compatibility, Google OAuth/session restoration, Didit return, PayChangu return and complete feature parity remain untested.
- The Vercel team connection still lists no linked projects; direct production visual inspection remains blocked. GitHub's Vercel status for WebApp main commit `33c7576` is successful, but that is not visual acceptance.
- No approved side-menu changes, Supabase/Vercel settings, secrets, environment variables, payment settings or identity-verification settings were made.

## Developer dashboard density and catalogue pass — 2026-11-20

- Main code commit: [`768eb0a`](https://github.com/V1CT330/MAS/commit/768eb0a04ce4a5dec9f60bc6ceaba6f2835290d1).
- Removed the duplicate product presentation: the dashboard previously showed the first five listings and then repeated them in the searchable/filterable catalogue. The native dashboard now renders each product once in a single searchable, status-filtered list, with a first-listing empty state.
- Flattened the Developer dashboard's performance, attention, catalogue and tools sections into transparent sections separated by faint horizontal rules. Summary metrics use restrained left accents rather than individual cards; controls use smaller, sharper radii. The full-width horizontal search field and status filters remain available.
- This keeps the approved side menu untouched and does not alter backend queries, listing status rules, publishing, authentication, KYC or payment flows.
- The WebApp source-of-truth Social feed restoration is now on main at [`f9a0403`](https://github.com/V1CT330/malawian-app-store/commit/f9a0403abd3d0e02caf19815781e1e0671a8b57b); GitHub reports its Vercel commit status as successful. Live visual acceptance is still unavailable through the current Vercel connection.
- The native change is committed, but its TypeScript/bundle and APK/emulator checks have not yet been confirmed. Do not count it as runtime-verified until the corresponding GitHub Actions run completes.

## Native Developer Quality workflow — 2026-11-20

- Added `src/screens/NativeQualityScreen.tsx` and wired it to the existing Developer Mode Quality review tool in [`DeveloperScreen.tsx`](https://github.com/V1CT330/MAS/blob/main/src/screens/DeveloperScreen.tsx). Commits: [`eb31c11`](https://github.com/V1CT330/MAS/commit/eb31c11546345e239887af8ba17ff186235eb156) and [`6182a14`](https://github.com/V1CT330/MAS/commit/6182a140ea33efd475367c00b0f36fadc62699df).
- The native screen mirrors the WebApp Quality page: listing-readiness percentage, store-optimisation percentage from the byte-identical shared `asoReport` rule, and up to four unmet submission requirements per listing.
- It revalidates `profiles.mode === "developer"` before querying the developer's listings, uses request-generation guards, shows loading/error/empty states, and opens the existing native listing-management workflow.
- The query reads existing listing columns only; no schema, RLS, payment, KYC, authentication or provider configuration was changed.
- Native TypeScript/bundle checks and APK/emulator verification for this implementation are pending. The Expo workflow status is reported as an error, but the available connection does not expose its job logs. The independent GitHub APK workflow remains the required release verification path.

## Release verification and Social UI cleanup — 2026-11-22

### Production WebApp

- Main commit: [`66f2a97`](https://github.com/V1CT330/malawian-app-store/commit/66f2a97f7ff2d84517046a68f55908b52bde6e14) adds an accessible workspace-switching state while the User Mode / Developer Mode mutation is pending, preventing stale settings content from remaining interactive.
- Web build: [run 45004914511](https://github.com/V1CT330/malawian-app-store/actions/runs/45004914511) — passed.
- GitHub's Vercel commit status — success. Direct production visual acceptance remains blocked: the connected Vercel team lists no linked projects and deployment listing returns 403. Do not treat the status check as a visual review.

### Native Social UI

- Main commits: [`e9c3e2d`](https://github.com/V1CT330/MAS/commit/e9c3e2d49dec865cda38f433a8bbcc5e620358a8) and [`a3927d2`](https://github.com/V1CT330/MAS/commit/a3927d21bdb39cdda625c39f3eb4b5b0e60eb814).
- Social feed, notifications, opportunity entries and other shared content rows no longer render as repeated white rounded cards. They use transparent surfaces with restrained separators, matching the production WebApp's flatter content hierarchy.
- Social form fields explicitly fill the available content width. Existing comment/reply and message bubbles remain rounded. Unread notification accent behavior is preserved.
- The approved navigation/side menu, authentication, Supabase queries, RLS, KYC and payment flows were not changed.

### Latest Android release verification

- Native checks: [run 45005239677](https://github.com/V1CT330/MAS/actions/runs/45005239677) — passed TypeScript, Expo configuration and Android JS bundling.
- APK build: [run 45005239704](https://github.com/V1CT330/MAS/actions/runs/45005239704) — passed every step, including optimized release compilation, APK signature/package checks, clean API 35 Android emulator installation, launch and artifact upload.
- Package: `mw.wealthgrid.mas`; version `1.0.4`; versionCode `5`.
- APK size: 54,892,010 bytes. APK Signature Scheme v2 verification passed. Universal native libraries include `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64`.
- Artifact: `mas-android-release-apk`, ID `14747409305`; ZIP size 22,730,059 bytes; SHA-256 `0d57d22c0c559342f67ef6939e071e17c26fc15077f843ba7168ec3dcbc41747`. Artifact expires 2026-12-06.
- The APK was also downloaded and extracted from the exact artifact; the ZIP contents and APK file size were verified locally.
- The separate Expo/EAS status check still reports an error. The independent GitHub Actions APK workflow above is successful; the available EAS status does not expose a root cause in this run.

### Remaining release blockers

- Physical-device installation and updating an existing EAS-signed installation are not verified. The clean-emulator test proves fresh installation and launch in that environment only.
- Real-device Google OAuth callback/session restoration, Didit return/status refresh, PayChangu return, storage permissions/RLS and the supported end-to-end workflows still require acceptance testing.
- Complete Android-to-production-WebApp feature parity is not yet verified.
- Production visual inspection remains blocked by the Vercel connection limitation described above.

No production Supabase/Vercel settings, secrets, environment variables, payment configuration or identity-verification configuration were changed.


## Production and native parity pass — 2026-11-23

### Native Store sponsored placements

- Main commit: [`5636d15`](https://github.com/V1CT330/MAS/commit/5636d150bc36e4156bfe876ba2cf2fe8cac58ab3).
- `StoreScreen.tsx` now mirrors the production WebApp's Store sponsored-creative query: up to four `app_listing` and four `website_banner` creatives from `active_ad_creatives` with the `store` placement.
- Sponsored apps and websites appear only when the search field is empty and the selected kind allows that creative type. App icons and website banners resolve through the existing `app-assets` storage bucket or unchanged HTTPS URLs.
- Published sponsored apps open their production listing route. Website destinations are accepted only over HTTPS. Coming-soon app creatives are displayed without an active navigation action.
- Signed-in impression/click telemetry mirrors the WebApp's `ad_events` writes. Telemetry errors are deliberately non-blocking; live view/RLS and event acceptance still need production verification.
- No database migration, Supabase setting, credential, payment or KYC configuration was changed.
- Native checks: [run 45148958071](https://github.com/V1CT330/MAS/actions/runs/45148958071) — passed TypeScript and Android JavaScript bundling.
- Release APK: [run 45148957795](https://github.com/V1CT330/MAS/actions/runs/45148957795) — passed optimized release compilation, signature/package metadata verification, clean Android emulator installation and launch, and artifact upload.
- Artifact: `mas-android-release-apk`, ID `14805871884`; ZIP size 22,733,198 bytes; SHA-256 `8a4c0bffe6e33d33dec566bbf1c37500ad6ed7378a350d5fece37208f9895294`; expires 2026-12-07.
- Extracted APK: 54,898,542 bytes; SHA-256 `92f1f9290b25e501f14e692fbd1085dcfbee3c581d5619c5bc93a830ef15186e`.
- The APK is verified in the clean emulator only. Physical-device install/update and the complete Store click/install workflow remain untested.

### User Mode Settings — targeted reference correction

- WebApp main commit: [`eb22313`](https://github.com/V1CT330/malawian-app-store/commit/eb22313fab099260097f5bbab5dd60e87caf7b28).
- Changed only `src/routes/_authenticated/settings.tsx`. The approved side menu, AppShell, top navigation/header and all other User Mode screens were not changed.
- The Settings overview now uses the reference's gear heading, profile banner with a restrained sunrise treatment, conditional verification badge only when KYC status is approved, five compact settings rows with distinct pastel icon treatments and right chevrons, and the bottom information banner.
- Settings row minimum height is 84 px on narrow screens and 92 px at the small-screen breakpoint; icon size is 56 px. Navigation targets, mode-switch behavior, profile upload and sign-out handlers remain unchanged.
- Web build: [run 45150186584](https://github.com/V1CT330/malawian-app-store/actions/runs/45150186584) — passed.
- GitHub's Vercel status for the main commit reports **Deployment has completed**. The connected Vercel API still returns 404 for the project and direct production visual acceptance remains unavailable. Do not treat deployment status as a visual review.

### Current release gates

- Shared `src/shared/mas-core.ts` remains byte-for-byte identical in both repositories: blob SHA `c12efcd1808a822870932c1b1219f7959983ceb3`.
- No open GitHub issues were found in either repository during this run.
- Still untested: physical-device install/update, Google OAuth callback and session restore, Didit return/status refresh, PayChangu return, production ad-event/RLS behavior, and complete native feature parity.
- Production visual acceptance remains blocked by the Vercel connector's project lookup failure. The successful Vercel status is deployment evidence only.
- No approved side-menu changes, preview-only fixes, Supabase/Vercel settings, secrets, environment variables, payment configuration or identity-verification configuration were changed.
