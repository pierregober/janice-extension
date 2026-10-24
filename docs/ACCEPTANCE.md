# Janice extension acceptance checklist

Updated October 14, 2026. These criteria describe the first implementation milestone: a Chrome extension that tries the local mock candidate `AFF15` on the **real U.S. Sharper Image checkout**. A fixture is test infrastructure and must display “Demo”; its passing results do not validate the live store.

## Shared behavior

- [ ] Start checkout mutations only after the shopper clicks **Try coupons**.
- [ ] Load `AFF15` locally through a replaceable coupon-provider interface. Record the user-supplied offer as $15 off when spending $150 or more; unknown expiry/exclusions remain unknown.
- [ ] Allow one active run per tab. Repeated clicks do not duplicate application attempts or overwrite the original baseline.
- [ ] Keep the run and its visible checkout progress panel working when the toolbar popup closes. Reopening the popup shows the current state.
- [ ] Before testing, capture the existing coupon state, comparable amount type, currency, and cart identity. If that state cannot be read and restored reliably, explain the limitation before changing it.
- [ ] Test one candidate at a time and await an authoritative, completed checkout update with bounded waits. Missing elements, rejection, timeout, and unreadable amounts have clear outcomes.
- [ ] Use integer minor units for money. Compare matching amount types and currencies for the same cart; display subtotal savings as subtotal savings if an order total is unavailable.
- [ ] Choose the lowest verified comparable amount, including the baseline. Keep the original state on ties or worse results. Never derive live savings by subtracting the advertised $15.
- [ ] Follow the current final-action default in `PRODUCT_PLAN.md`. For leave-best-applied mode, reapply and verify an improving winner before reporting it as applied. For show-then-Apply mode, restore and verify the original state after testing, then reapply and verify the winner only after Apply is clicked. The initial leave-best-applied default was proposed, not explicitly confirmed by the user.
- [ ] On no improvement, restore and verify the original coupon state. Clearly report any restoration failure and the last observable coupon state.
- [ ] **Stop** prevents new attempts, handles any already submitted application settling, and restores the original coupon state when the checkout permits it. Do not claim cancellation or restoration succeeded while a pending checkout update can still change the result.
- [ ] A cart edit invalidates old comparisons and stops the run. Do not reapply a previously selected winner or report savings for the old cart; any restoration must be safe for the current checkout state.
- [ ] Navigation, inaccessible checkout, or store attempt limits stop the run with an accurate result. Report when restoration cannot be verified.
- [ ] No available coupons or provider failure leaves the checkout unchanged and shows an actionable message.
- [ ] Fixture results are labeled **Demo**. Live acceptance, rejection, and savings come from the store's response and observed checkout amounts.
- [ ] Never place an order or activate payment/order submission controls. Do not read, store, or transmit payment details.

## Deterministic fixture checks

Use USD, an explicit eligible-spend value, zero tax/shipping, and integer cents. These are fixture rules; live minimum-spend treatment is unknown and must be decided by the store.

| Scenario | Expected fixture result |
| --- | --- |
| Eligible spend `14999` cents ($149.99) | Reject AFF15; unchanged $149.99; $0 savings. |
| Eligible spend `15000` cents ($150.00) | Accept AFF15; total `13500` cents; $15 savings. |
| Eligible spend `20000` cents ($200.00) | Accept AFF15; total `18500` cents; $15 savings. |
| Qualifying spend but explicit rejection | Report rejection; unchanged baseline; no advertised savings claim. |
| $200 cart with an existing $20 discount | Baseline $180 beats AFF15's $185; restore and verify existing code, final $180. |
| Existing code gives the same comparable total | Preserve the original code on the tie. |
| Empty candidates or provider error | Explain outcome; no coupon-field mutations. |
| Stop while an application is pending | No subsequent attempts; settle outstanding update, restore if possible, and report verified final state. |
| Cart changes during testing | Stop; invalidate prior amounts/winner; no old-cart savings claim. |
| Repeated Try coupons clicks | One run and one baseline; no overlapping application. |
| Popup closes and reopens | Run continues; popup reflects current progress/result. |
| Missing controls, unreadable total, or timeout | Unsupported/unverified result; no fabricated acceptance or savings. |
| Final application or restoration fails | Clearly explain failure; do not label an unverified coupon as applied/restored. |

## Live checkout validation

**Current status: performed October 23, 2026, by automation.** The checkout was inspected and nine live scenarios were run; AFF15 was accepted live. Results, evidence and what remains unverified (notably the real toolbar click in branded Chrome) are in `TEST_REPORT.md` and `CHECKOUT_NOTES.md`. The criteria below are unchanged.

1. Inspect the actual U.S. checkout from the official storefront. Record URL/origins, currency, coupon controls, amount types, existing-code behavior, and asynchronous update signals in `CHECKOUT_NOTES.md`.
2. Load the unpacked extension in Chrome. Use a non-purchased cart and stop before any payment or order submission. Start only with **Try coupons**.
3. Record the pre-run coupon and comparable amount, actual AFF15 acceptance/rejection, post-run amount, calculated observed savings, and final coupon state. Unknown offer terms do not justify skipping the store's eligibility decision.
4. Verify no-improvement restoration where an existing code is available. Verify Stop, repeated starts, popup closure, and cart-change handling where practical. Mark every untested scenario explicitly.
5. Record browser version, extension build/revision, date, evidence, and limitations. Screenshots/notes must exclude personal and payment information.

A rejected or expired AFF15 is an acceptable live outcome when handled accurately. A fixture pass, mocked store response, or a detected coupon field alone does not count as live support. If checkout inspection/access is blocked, deliver completed fixture work with live support explicitly unverified and document the concrete blocker.
