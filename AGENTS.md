# Janice extension — instructions for Codex

This repository is for a Chrome extension that tries coupon codes at checkout. This handoff package contains context and sample data; the extension still needs to be implemented.

## Read first

1. `START_HERE.md` — package orientation.
2. `docs/PRODUCT_PLAN.md` — scope, behavior, architecture, and editable defaults.
3. `docs/ACCEPTANCE.md` — tests and completion evidence.
4. `docs/CHECKOUT_NOTES.md` — actual checkout research status and worksheet.
5. `data/mock-coupons.json` — user-provided candidate coupon data.

Treat the user's current instructions as authoritative. Keep the plan and checkout notes updated when requirements or verified findings change.

## First-version scope

- Chrome Manifest V3 extension for the real Sharper Image checkout in the United States, starting at https://sharperimage.com/.
- The shopper opens the extension, then clicks **Try coupons** before checkout changes begin.
- Use the local AFF15 record: advertised $15 off when spending $150 or more. This is mock coupon retrieval, not a mocked live redemption result.
- Obtain acceptance/rejection and savings from the real checkout. AFF15 may be rejected or expired; reporting that correctly is valid behavior.
- Simulated checkouts are test fixtures, not proof of live support.
- Defer other stores, a real coupon API, backend, accounts, stacking, cashback, affiliate features, and public release.

## Working defaults

The user chose the store, country, mock source, and manual trigger. Other choices are editable implementation defaults, not additional user-confirmed decisions.

The **Editable defaults** table in `docs/PRODUCT_PLAN.md` is the single source of truth for the name, interface, final coupon action, distribution, and other defaults. Read its current values instead of relying on earlier summaries. If the owner edits that table, follow the updated values; older references in the research worksheet or checklist do not override it. The user's latest direct instructions take precedence over all package files.

Proceed using the current plan defaults when implementing; keep routine choices reversible rather than stopping to reconfirm them. Describe material deviations in the delivery notes.

## Implementation rules

- Inspect the existing repository and applicable nested instructions. Preserve existing package metadata and unrelated work. Add the smallest practical toolchain and useful scripts.
- Inspect and document the actual checkout route, controls, responses, currency, and restoration behavior before claiming live support. Do not invent selectors or infer compatibility from the storefront alone.
- Use a provider interface for local coupon retrieval so a real API can replace it later. Keep provider data separate from checkout outcomes.
- Do not treat advertised discount amounts as observed savings. Do not assume tax/shipping threshold rules, expiry, exclusions, or affiliate status.
- Use minimal permissions. Toolbar invocation can grant temporary `activeTab` access; clicking **Try coupons** authorizes checkout mutations. Automatic access to every site is outside this version's scope.
- Scope any extra host access to verified checkout origins. Keep executable checkout logic bundled with the extension.
- Keep runs independent of the popup, prevent duplicate runs per tab, bound waits, and support cancellation.
- Capture the baseline, verify the final applied code, and verify restoration after failed or canceled runs when possible. If the cart changes, discard the old comparison and stop; do not overwrite the shopper's cart edits.
- Never submit an order or operate payment submission controls. Avoid storing payment details, unrelated browsing data, or unnecessary personal data.
- Show clear unsupported, rejected, unverified, and restoration-failure states rather than claiming success.

## Completion

Deliver runnable extension files, installation instructions, meaningful automated tests, and a concise report of what was verified. Follow `docs/ACCEPTANCE.md`.

If live checkout access is unavailable, complete independent implementation and fixture checks, document exactly what remains unverified, and provide manual validation steps. Fixture success alone must not be described as live checkout validation.

Do not publish, submit to the Chrome Web Store, push changes, or create a purchase as part of this first-version build unless the user separately requests it.
