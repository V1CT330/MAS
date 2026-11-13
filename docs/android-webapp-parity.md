# Android ↔ WebApp Feature-Parity Audit

**Status:** Initial repository audit; not a claim of completed parity or production-device validation.

## Source of truth and repository boundaries

- Production WebApp: `V1CT330/malawian-app-store`.
- Native Android app: `V1CT330/MAS`.
- Keep platform-neutral business rules synchronized in `src/shared/mas-core.ts` in both repositories. The shared module must not depend on React, React Native, browser APIs, or Supabase.
- Implement Android-specific screens and integrations in `V1CT330/MAS`; do not copy the WebApp into the APK or change production WebApp behavior just to make the native client appear complete.
- Reuse the existing Supabase project, tables, RPCs, storage buckets, server functions, and authenticated WebApp workflows. Never ship service-role, payment-provider, or identity-provider secrets in the Android app.

## Initial findings

The native app is a separate Expo/React Native client (not a WebView). Its current entry point is the root `App.tsx`; Supabase client configuration is in `src/lib/supabase.ts`; shared rules are in `src/shared/mas-core.ts`.

The native README describes a user storefront, account/session display, Social feed interactions and messaging, and some developer summary screens. It also explicitly records important gaps: developer workflows are often web handoffs, live backend behavior has not been validated on a real device, some funding links only open Social, and OAuth redirect allowlisting is still required. Code inspection confirms that several developer-console destinations open the WebApp rather than providing native workflows. The native user storefront and Social entry points also hand off to web routes rather than providing all corresponding native screens.

The production WebApp has authenticated routes for store/library/notifications and a broad developer console including products, product details, publishing, testing, quality, analytics, reviews, verification, subscription, wallet, Social, settings, and administration. The existence of these routes is a parity target, not proof that each can or should be duplicated natively. Secure flows may remain authenticated HTTPS handoffs where native integration would duplicate trusted server-side logic or require privileged credentials.

Native web handoffs now use `https://malawian-app-store.vercel.app`, matching the existing Account and Developer screens. The older `j6pm` deployment alias was inconsistent and has been removed from the native app. The Vercel project is not exposed through the current deployment connection, so the production-domain response still needs an external live check; do not treat repository consistency alone as proof of deployment availability.

## Feature parity matrix (initial)

| Area | Native status observed | WebApp capability to compare | Next verification/implementation |
| --- | --- | --- | --- |
| Authentication and account | Google OAuth/session handling exists; callback allowlisting and real-device flow remain unverified | Authenticated account, profile, settings, developer mode | Validate redirect, session restore/expiry, sign-out, account/profile editing and authorization on Android |
| Store discovery | Native screen links to the WebApp; catalogue data is available in code/search findings | Published catalogue, product details, search/discovery | Build native catalogue/detail/search using published listings and shared filters; never use preview entries as live results without a clear preview state |
| Library | No native library implementation found in inspected `App.tsx` | Installed apps, saved listings, download history, updates | Use existing `installed_apps`, `wishlist`, `install_events`, and signed asset workflow; implement clear Android install/update confirmation states |
| Notifications | Notification destinations are web handoffs | List, mark all read, dismiss, unread state | Use the existing `notifications` records with current-user scoping and RLS; add loading/empty/error/retry states |
| Developer dashboard/products | Summary and listing query exist; other product routes hand off to web | Dashboard, product CRUD/details, uploads, review status | Keep server-authoritative review states; implement native upload/forms only after confirming existing schema, storage policies and RPCs |
| Publishing/release | Native app links to existing publishing workflow | Draft creation, media/package uploads, review and release process | Never publish directly or bypass review; mirror the WebApp's validated transitions and backend checks |
| KYC/verification | Contact phone save and secure Didit session handoff are present; manual documents and full status UX are not native | Phone and identity verification, reviewer outcomes | Keep identity checks server/admin-controlled; test provider return flow and status refresh without allowing client self-approval |
| Developer Pro/payments | Payment checkout is a WebApp handoff | MK5,000/month subscription with PayChangu server-side confirmation | Keep checkout and settlement on trusted server workflows; do not write paid status from the app |
| Wallet/earnings | Native wallet view is a limited handoff/placeholder | Existing wallet/ledger information | First confirm current WebApp scope and server-owned ledger semantics; do not invent payout or balance operations |
| Social | Native text, media, reactions/comments, requests and direct messages are described as implemented; production schema/RLS validation remains outstanding | Feed, profiles, connections, messages, notifications | Validate every query and mutation against production schema/RLS; add pagination, failure states and device media-permission checks |
| Administration | Admin role is read in the native client, but admin workflows are not native | Listing/release moderation, KYC decisions, people and notices | Prefer secure WebApp admin handoff; do not expose admin mutations or rely on client-side role checks as authorization |
| Responsive UX/accessibility | Existing responsive native layout work is present | WebApp terminology, visual identity and responsive behavior | Test narrow and large Android screens, keyboard/IME, safe areas, font scaling, screen readers and touch targets |

## Correct code locations

- `App.tsx`: Native app composition, route/mode presentation and screen wiring. Split large screens into components as the implementation grows rather than placing all feature code here.
- `src/lib/supabase.ts`: Shared Supabase client configuration only.
- `src/lib/`: Native backend adapters and domain-specific client workflows; keep each feature's queries/mutations together and reuse existing Supabase APIs.
- `src/shared/mas-core.ts`: Platform-neutral MAS business rules; keep byte-for-byte synchronized with the WebApp copy when changed.
- `src/components/`: Reusable React Native UI components.
- `src/screens/`: Feature screens (store, library, notifications, account, developer and Social) as they are extracted from the app shell.
- `assets/`: Bundled icons and static imagery; do not store user uploads here.
- `.github/workflows/`: Android build and automated checks.
- `docs/android-webapp-parity.md`: This audit, implementation decisions and verification record. Do not put product screens or executable app code in documentation directories.

## Verification gates

Before calling parity complete:

1. Compare each WebApp workflow's inputs, validation, backend calls, authorization, error states, and success state with its native counterpart.
2. Run `npm ci` and `npm run typecheck` in `V1CT330/MAS`; run the Android build/check workflow and fix failures.
3. Test configured and unconfigured builds separately so preview/fallback data can never be mistaken for live backend data.
4. Exercise OAuth callback, expired sessions, RLS-denied requests, upload failures, slow/offline connectivity, empty data, retries, and Android back navigation.
5. Install and test the generated APK on real Android devices at multiple screen sizes. Verify OAuth, media permissions, file downloads/install handoff, external links, and return from secure web/provider flows.
6. Record any backend configuration/schema/RLS prerequisites as blockers; do not change production Supabase settings or WebApp code without explicit authorization.

This audit is based on repository source inspection only. No production credentials, live Supabase data, payment settlement, Didit session, APK installation, or physical Android device were available for verification in this change.
