# MAS Native Feature-Parity Tracker

This tracker compares the native Expo app in this repository with the live web prototype in `V1CT330/malawian-app-store`. It is an engineering checklist, not a claim that unverified functionality works in production.

## Definition of done

A feature is **complete** only when the native screen and its real workflow exist, signed-in access and ownership checks are respected, loading/empty/error/success states are handled, data is connected to the existing MAS backend, and CI plus a real Android test pass. A link to the web app, a preview card, sample data, or a typecheck alone does not count as native feature parity.

## Native feature inventory

| Prototype capability | Native state | Remaining work / acceptance criteria |
|---|---|---|
| Explore app and website catalogue | Implemented | Verify live catalogue, search/category filters, details and signed asset URLs on device. |
| Product detail, screenshots, versions, ratings and reviews | Implemented | Verify published release selection, secure download, review upsert and error states. |
| Developer listing drafts and editing | Implemented | Test upload failures/partial saves, edit published/rejected drafts and release version handling. |
| Listing quality checks | Implemented | Compare checks and weights with web `console.quality`; verify all asset requirements. |
| Automatic publishing/security review | Connected through existing RPC | Test rejected/accepted paths against production policies without bypassing server checks. |
| Developer dashboard and listing status | Partial | Add web-prototype analytics metrics and meaningful recent activity; current dashboard is primarily status counts. |
| Reviews and developer replies | Implemented | Verify ownership/RLS and replies on device. |
| Developer public profile and portfolio | Implemented | Native profile editing now includes company, location, contact email, skills and public links; verify persistence and public visibility on device. |
| Social feed, media, reactions and comments | Implemented | Test media upload, pagination, moderation, ownership and network-failure states. |
| Messages, connections and notifications | Implemented | Verify request acceptance/decline, unread state, ordering and privacy on device. |
| Collabo, Investors, Grants and Crowdfund sections | Implemented | Verify section filters and post persistence; money movement must not be implied where no payment workflow exists. |
| Team management | Implemented | Verify invitations, role/status updates, membership and activity log against RLS. |
| Spotlight applications | Implemented | Verify submit/read states and any listing association. |
| Testing / beta testers / feedback | Implemented | Verify invite/tester management and feedback flows; confirm any email/distribution integrations separately. |
| Developer identity verification (manual) | Native workflow added; untested | Saves contact phone, uploads a private ID/passport file, checks developer eligibility and pending/approved status, and submits for review. Verify private `kyc-docs` upload, submission insert and RLS. Never expose document URLs publicly. |
| Didit identity verification | Native start flow added; untested | Test session creation, trusted-host validation, browser return, webhook processing and status refresh. |
| Developer Pro subscription status | Native overview added; checkout is hosted web handoff | Test subscription entitlement, PayChangu return/webhook, cancellation and period-end access. Checkout itself is not native. |
| Advanced analytics | Native screen implemented; CI/device test pending | 7/30/90-day views, installs, conversion, per-product metrics and device/country breakdowns; event queries are gated by active/paid-period Developer Pro entitlement. Compare against web metrics and test RLS. |
| Wallet and earnings | Web handoff | Native menu opens the existing wallet workflow. Decide which read-only wallet data can be shown natively; all money movement must remain server-side. |
| Advertising / promotion | Native campaign workflow implemented; backend metrics displayed | Native screen creates and lists campaigns from the existing `promotions` table, supports placement, MWK budget, duration, target location, pause, and live impressions/clicks/spend/budget fields. Campaign approval, billing/charging and server-side metric updates remain backend-authoritative and must be verified; the native client does not charge or approve campaigns. |
| Console settings and account security | Partial / web handoff | Account profile fields are editable natively; broader security settings, session controls and console preferences still require parity work. |
| Developer assistant / AI tools | Deliberate web handoff | Native menu opens the real prototype assistant rather than a non-functional preview. Native chat/API integration remains future parity work; no fake AI responses. |
| Developer resources and security guidance | Deliberate web handoff | Native menu opens the real guide/security pages instead of generic preview cards. Native content screens remain future parity work. |
| Store administration and moderation | Not a native parity target yet | Decide authorized admin-only workflows and verify the account gate before implementing. |
| Native Android OAuth/session persistence | Code present; device test pending | Test Google sign-in, callback, session persistence, expiry, sign-out and fresh install. |

## Prototype routes to audit

The reference prototype includes dashboard, analytics, assistant, product management, publishing, quality, resources, reviews, security, settings, social, developer profile, subscription, testing, verification, wallet, admin, advertise, library, notifications, Pro, public profile, team, upload and Spotlight. Each route must be assigned either a native implementation, a deliberate secure hosted handoff, or an explicitly out-of-scope decision.

## Release gate

Do not describe MAS as “fully built and only needing testing” until every in-scope route is marked complete, all non-native handoffs are explicitly approved, automated checks pass on the final commit, and a real Android acceptance run covers Google OAuth plus the main store, publishing, Social, verification and subscription journeys.
