# Janice coupon extension — first-version implementation plan

Version 1.0 · Prepared October 14, 2026

This is a handoff brief for a future implementation run. The accompanying kickoff prompt authorizes that run when the owner uses it. This package itself contains context and data, not a built extension.

## Goal and confirmed scope

Build a Chrome extension that tries coupon candidates on the real Sharper Image checkout and reports verified savings for the shopper's current cart.

Confirmed during planning:

- Chrome is the first browser.
- Testing starts when the shopper clicks **Try coupons**.
- The first version targets the real Sharper Image checkout in the United States.
- Coupon retrieval is mocked locally for now, using the user-provided AFF15 offer.
- An actual coupon API and additional selected stores are later milestones.

The planning target is the official [Sharper Image storefront](https://sharperimage.com/). Its www address was checked on October 14, 2026 and redirected there. The actual checkout route, page structure, currency, code validity, and restoration behavior were inspected on October 23, 2026 (Shopify one-page checkout at `sharperimage.com/checkouts/cn/<token>`, USD); the evidence is in `CHECKOUT_NOTES.md`.

**Implementation status (October 23, 2026):** the first version's source is in `extension/`, and `npm start` or `npm run build` writes the folder to load to `build/`. The defaults below are unchanged except **Start interface**, **Look and feel** and **Distribution**, which the owner adjusted after the first build (a button on the store's pages; a Honey-like look; a boilerplate-style `build/` folder). See `README.md` for loading and use, and `TEST_REPORT.md` for what was verified on the live checkout versus the Demo fixture.

## Editable defaults

Use these defaults unless the owner changes them. They are implementation choices, not additional confirmed user selections. This table is the single source of truth for editable defaults across the handoff; an edit here overrides older default summaries elsewhere in the package. The user's latest direct instructions take precedence.

| Choice | Default |
| --- | --- |
| Working product name | Janice Coupons |
| Start interface | Toolbar popup with **Try coupons**, plus a button on the right edge of sharperimage.com pages whose card, opened on hover or click, shows how many coupons were found and offers **Try coupons** at checkout (**Go to checkout** elsewhere). At the owner's request (October 23, 2026); it needs host access to sharperimage.com, the verified checkout origin. The card never opens by itself, and testing still starts only with **Try coupons**. |
| Progress and results | Small checkout panel with progress, **Stop**, and outcome |
| Final coupon action | Leave the best verified coupon applied |
| Candidate testing | One code at a time; no stacking |
| Existing discounts | Keep the original discount unless a tested candidate lowers the comparable amount; keep original on ties |
| Distribution | Unpacked extension for local testing, built with `npm start` or `npm run build` into `build/` and loaded with **Load unpacked**, like common extension boilerplates (at the owner's request, October 23, 2026). While `npm start` runs, its development build reloads itself in Chrome after each change (also at the owner's request); `npm run build` is the plain extension. |
| Accounts and backend | None in this version |
| Currency target | USD; verify the actual checkout currency |
| Look and feel | Honey-like, at the owner's request (October 23, 2026): a branded popup with the store, a card per coupon (with **Copy**) and a large **Try coupons** button; the checkout panel shows the code being tried, a progress bar, and verified savings in large type. Accessible, with Janice's own name, colors and icon (no Honey branding). |

If the final-action default is changed to **Show result, then Apply**, restore and verify the original coupon state after testing, then reapply and verify the selected code only when the shopper clicks **Apply**. Do not silently leave a test coupon applied in that mode.

## Coupon candidate

Use `data/mock-coupons.json` as the first local provider dataset.

- Store: Sharper Image.
- Code: **AFF15**.
- Supplied offer: “Receive $15 Off Your Order when You Spend $150 or More. Enter Coupon Code: AFF15 at Checkout!”
- Advertised discount: $15 off the order.
- Advertised minimum: $150 or more, inclusive.
- Expiry, exclusions, stacking rules, and whether minimum spend includes tax/shipping: unknown.
- Country: United States, selected by the user.
- Currency fields use the project's USD target; live currency must be checked.
- Live validity: not tested. Do not infer an affiliate relationship from the code's name.

These fields describe a candidate offer. The live store decides applicability. Do not skip the code because of an assumed minimum-spend calculation, force acceptance, or calculate claimed live savings by subtracting the advertised $15.

The mock provider returns this candidate for the Sharper Image store identifier and an empty list for stores without mock data. It requires no account, API key, backend, or external coupon request. Keep a provider interface so an API adapter can replace it later.

## Shopper flow

1. Shopper reaches the real Sharper Image checkout and opens the extension.
2. Popup identifies the store and reports whether the current checkout can be tested.
3. Shopper clicks **Try coupons**. Merely opening the popup does not change checkout.
4. Extension reads the local candidates and captures the current coupon state, comparable amount, currency, and cart identity.
5. Checkout panel shows progress and **Stop** while candidates are tested serially.
6. Store integration enters AFF15 in the actual coupon control, triggers the store's apply action, and waits for a settled result using bounded timeouts.
7. Extension reads authoritative acceptance/rejection and comparable updated amounts.
8. Extension compares each verifiable result with the original baseline.
9. It verifies the best final coupon state or restores and verifies the original state when nothing improves it.
10. Panel shows the verified result and savings, or the appropriate rejection, no-improvement, unsupported, or unverified message.

Example fixture only: eligible spend $150.00, no tax/shipping, AFF15 accepted → amount $135.00. This is a deterministic test scenario, not evidence of current live behavior.

## Checkout behavior

- Record the baseline before changes, including existing applied codes or discounts where observable.
- Compare the same monetary basis in the same currency after the store has finished recalculating. If only a subtotal can be read, explicitly label it as a subtotal.
- Use integer minor units for calculations and locale-aware formatting for display.
- Keep original discounts on ties, worse totals, rejection, or no verified improvement.
- Reapply and verify the winning code before reporting it as applied.
- On **Stop** or a failed run, stop further attempts and restore the original coupon state when the page still permits. Verify restoration and show any failure clearly.
- If the shopper edits the cart, stop and invalidate the old comparison. Do not restore cart contents or treat the old cart total as the current baseline. Restore coupon state only when it can be done without overriding the shopper's intervening edits.
- If checkout is left or reloaded, interrupt the run and report its state honestly; do not continue mutations on a different page.
- Permit one active run per tab and guard against rapid repeated clicks.
- Closing the toolbar popup must not abandon an active run. The checkout panel remains usable.
- Bound waits and attempts; stop when the store blocks further attempts or controls become incompatible.
- Never place an order, advance payment submission, or fill payment information.

If original coupon state cannot be read or restored reliably, the integration must report that limitation and avoid replacing an existing discount it cannot preserve. Document the supported subset rather than silently degrading the shopper's checkout.

## Result states

| State | Shopper message should communicate |
| --- | --- |
| Better verified result | Applied code, verified savings, and amount basis |
| No improvement | Original discount retained/restored; no better price found |
| Code rejected | Store did not accept the candidate; no claimed savings |
| No candidates | No coupon candidates available for this store |
| Unsupported checkout | Coupon controls or supported checkout layout unavailable |
| Unverified | Outcome or comparable amounts could not be established |
| Stopped | Testing stopped; current coupon/restoration status |
| Cart changed | Testing stopped because the cart changed; old comparisons discarded |
| Error/restoration failure | Specific failure and current known checkout state |

## Architecture and permissions

Use Manifest V3. Keep the implementation small and compatible with the existing repository; the implementation agent may choose JavaScript or TypeScript and the minimum practical tooling.

- **Popup:** start control and current-tab status.
- **Content script:** store detection, checkout panel, serialized testing, DOM interaction, and reading observed results.
- **Service worker:** event/message coordination and extension state as needed; do not rely on it staying alive indefinitely.
- **Coupon provider:** local dataset behind a replaceable interface.
- **Store adapter:** explicit Sharper Image integration; adding a second store should not require rewriting comparison logic.
- **Storage:** durable settings separately from temporary run state; retain only necessary data.
- **Fixtures and tests:** isolated deterministic checkout simulations, clearly labeled and never substituted for live outcomes.

Propose `activeTab`, `scripting`, and `storage`. Invoking the toolbar extension can supply temporary tab access; **Try coupons** starts mutations. Add extra host access only for verified checkout origins that need it. Do not use access to all sites for convenience, fetch remote executable checkout scripts, or introduce a server for the local dataset.

Chrome reference material: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements). Verify current API behavior while implementing.

## Implementation sequence

1. Read repository instructions and the handoff. Inspect the real checkout and fill the research worksheet with verified findings or access limitations.
2. Build the minimal extension shell, popup, local provider, comparison logic, and checkout panel.
3. Add deterministic fixtures and meaningful tests from `ACCEPTANCE.md`.
4. Implement the actual Sharper Image adapter and interruption/restoration behavior.
5. Run appropriate checks and verify the unpacked extension in Chrome on the real checkout without submitting an order.
6. Deliver extension files, practical installation instructions, evidence, and remaining limitations. A correctly reported live coupon rejection is acceptable; fixture success alone is insufficient evidence of live support.

If live checkout access is unavailable, finish independent code and tests, document what could not be checked, and provide concrete manual validation steps. Do not label the integration live-verified until that check succeeds.

## Later scope

Real coupon provider/API, provider credentials/backend if needed, additional stores, stacking, accounts/history, other browsers, automatic prompts, cashback/affiliate monetization, and Chrome Web Store distribution. Preserve a clean provider/adapter boundary now without building these features.

## Definition of delivery

A runnable local extension with the above behavior, documented installation/load steps, passing appropriate checks, actual checkout research notes, and a truthful fixture-versus-live validation report. See `ACCEPTANCE.md` for the checklist. Do not publish or submit the extension as part of this first build.
