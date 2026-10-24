# Janice Coupons 0.1.0 — test report

Updated October 24, 2026 · macOS 26 (Darwin 25.6.0) · Node 24.14.0 · installed Google Chrome 155.0.8059.86 ·
automation: Playwright 1.63.0 with Chrome for Testing 153.0.8010.12 · build: uncommitted working tree (the
repository has no commits yet).

Two kinds of evidence are kept apart here. **Fixture (Demo)** results come from the simulated checkout in
`fixtures/demo-checkout/` and prove the logic and the wiring; they say nothing about the real store. **Live**
results come from the real U.S. Sharper Image cart drawer or checkout, with the surface identified below.

## Summary

- **Native Apply and serial drawer testing (October 24, 2026, 08:04 UTC):** clicking the small **Use code**
  control now starts the shared coupon runner, animates each candidate into the verified drawer field, clicks
  the merchant's dedicated Apply button, and reads the actual response before trying the next candidate.
  The control becomes **Stop** during testing; progress and results stay beside the field rather than opening
  the large panel. Detection alone makes no coupon changes.

  **Live verified with the full extension in Chrome for Testing 153:** one fresh guest cart, no applied code,
  USD $159.99. A temporary test provider supplied `JANICETEST0`, then `AFF15`. Native Apply rejected the first
  with “Promo code JANICETEST0 is not valid or does not meet requirements.” AFF15 was accepted, and an
  independent `/cart.js` read confirmed USD $144.99 with AFF15 applicable. The shared stored run and compact
  result both reported **You save $15.00 with AFF15**. Event traces from that run show each typed prefix about
  85 ms apart; at the owner's request, entry is now instant, one input event per code, checked in the drawer
  browser tests but not re-run live. The same traces show
  exactly two serial Apply clicks, no overlapping update, and zero checkout clicks. AFF15 stayed applied at
  the end of the extension run. A separate native Remove afterwards restored $159.99 with no active codes.
  No checkout, contact or payment controls were operated. The shipped provider still contains only AFF15.
  [Sanitized report and before/progress/result screenshots](evidence/drawer-apply-2026-10-24/).

  This run verifies the drawer's accepted/rejected responses, native Apply, animated typing, result comparison
  and post-evidence native removal. Drawer Stop, winner reapplication, draft restoration and cart changes are
  fixture/browser verified; they were not additional live scenarios. A later spacing adjustment to the compact
  feedback passed all seven focused drawer browser checks; these live screenshots retain the earlier placement.
  [Final spacing screenshot — Demo fixture only](evidence/drawer-apply-2026-10-24/demo-final-spacing.png).

- **Animated outline update (October 24, 2026):** rainbow colors circulate in eight seconds inside the fixed
  input outline. Individual corner radii replace the former uniform 4–24px clamp, with percentage/elliptical
  geometry and CSS overlap scaling respected. The small button and field layout stay fixed. Reduced motion
  keeps the rainbow static, and forced colors use a static system-color border. This styling update preceded
  the native Apply integration above.
  Checked in Chrome for Testing with two new animation/radius tests, the four existing drawer browser tests,
  and six component unit tests. Animation advances without moving the mask; sharp, pill, asymmetric/elliptical
  and oversized CSS-normalized corners match; input/change/Apply counters remain zero during decoration.

- **Historical fill-only inline control (2026-10-24 06:44 UTC; superseded by native Apply above):** the large reminder was replaced by a thin,
  static rainbow outline around the promo field and a small **Use code** pill. The rainbow stops come from
  the live [usejanice.com hero form border](https://usejanice.com/). Decoration does not fill or focus; clicking **Use code** enters
  the first provider candidate with native input/change events. A different shopper draft is preserved.
  At that revision Store Apply/Checkout controls remained untouched; filling claimed no redemption or savings.

  **Live verified at 06:44 UTC, Chrome for Testing 153:** a fresh one-item guest cart opened through
  `/?cart=true` showed the actual `discount_code` field with the outline and an 89×28px control. No card or
  old reminder opened. Clicking **Use code** filled AFF15 and dispatched exactly one input and one change
  event; Apply and Checkout click counters stayed zero. The field and nearby store controls remained usable.
  This earlier record verifies only the field helper. The later 08:04 UTC run verifies drawer redemption.
  [Live notes/screenshots and desktop/mobile fixtures](evidence/inline-coupon-2026-10-24/).
  Final modal tab-order and feedback-placement refinements pass browser fixtures. A later live keyboard check
  returned an empty guest cart after API setup and could not reach the promo input; keyboard behavior on the
  real modal remains unverified. Its blocked record is retained separately from the successful fill notes.

- **Original Shopify cart-drawer reminder (superseded by the inline control):** a visible promo/discount/coupon field inside
  `shopify-section-cart-drawer` or its section variants previously triggered **You could save on this order**
  with **View coupons**. It was tested in four browser fixtures before the owner requested the quieter inline
  design. The current source and tests implement the field outline/button described above.

  **Live distinction:** read-only inspection at 06:20 UTC confirmed the real drawer's `discount_code` input and
  its modal ancestor's hidden/open behavior. Later extension-loaded validation did not reach a populated
  drawer: after the guest-cart setup, a signup dialog initially blocked Cart, and the final retry opened Cart
  but its discount input never appeared within 30 seconds. No coupon or checkout action occurred. The reminder
  itself was **fixture/browser verified, not live verified**. This blocked historical attempt is separate from
  the later successful native Apply run.
  [Inspection, blocked live attempt, and labeled Demo reminder screenshot](evidence/cart-drawer-2026-10-24/).

- **Promo discovery and batch overlay (2026-10-24 05:39 UTC, October 23 locally):** read-only detection of
  promo fields on Sharper Image, optional shopper codes, deduplicated serial batches, a top-layer non-modal
  overlay with an attempt log, and protection for shopper discount edits during pending operations. A new live
  `batch-overlay` run in Chrome for Testing 153 used the shipped host permissions and provider data. Opening
  the card left checkout unchanged; it detected the promo field. Entering `JANICETEST0, aff15` yielded **2**
  unique candidates including the bundled AFF15. AFF15 was accepted ($159.99 → $144.99), JANICETEST0 was
  rejected with “Enter a valid discount code or gift card”, and AFF15 was reapplied and independently verified
  at $144.99. `overlayInTopLayer: true`, `promoDetected: true`, and no contact/payment fields were filled or
  order submitted. [Report and screenshots](evidence/live-2026-10-24-batch-overlay/).

  This live run precedes final UI-only adjustments: wrapping maximum-length codes, using a neutral shopper-code
  label in the launcher after attempts, and restoring prior shopper codes into a reopened popup's retry draft.
  Those are browser/fixture checked. Concurrent shopper
  discount edits and dynamically inserted controls remain fixture/browser evidence, not new live scenarios.

- **Live, verified on the real checkout:** Janice found the U.S. Sharper Image checkout, entered AFF15 in the
  store's own discount field, read the store's acceptance and reported **$15.00 of verified savings** on the
  order total before shipping and taxes: $159.99 → $144.99, and $149.99 → $134.99 (the store accepted AFF15 below
  its advertised $150 minimum). Also verified live:
  - Stop during an update, with restoration checked;
  - one run for three simultaneous starts;
  - the run continuing after the popup closed;
  - the narrow layout;
  - a real rejection read with the store's message;
  - re-applying the winner after a later candidate;
  - putting a shopper's existing code back after a rejected candidate;
  - "already applied".

  Opening the popup never changed the page. All nine scenarios matched an independent read of the order summary.
- **Honey-style interface (same day, at the owner's request):** a new popup and panel design. The run logic
  is unchanged. Re-checked live with the `apply` scenario at 18:58 UTC: same store responses and result, with
  the new popup and panel (see below).
- **Build folder (same day, at the owner's request):** `npm start` and `npm run build` write the extension to
  `build/`, the folder to choose with **Load unpacked**. It holds exactly the files of `extension/`, and the
  browser tests and live check now load that build output. A fresh `build/` loaded in Chrome for Testing 153 as
  Janice Coupons 0.1.0 (unpacked, enabled, no manifest or runtime errors), with `activeTab`, `scripting`,
  `storage` and, since the page button, host access to `https://sharperimage.com/*` only; its popup opened
  without errors.
- **Page button (same day, at the owner's request):** a Janice button on the right edge of sharperimage.com
  pages, whose card (on hover or click) says how many coupons were found and offers **Try coupons** at checkout.
  Verified live on 2026-10-24 at 03:21 UTC (the evening of October 23 in the U.S.): the button showed on the home
  page and at checkout, the card counted 1 coupon (AFF15), opening it left the checkout unchanged, and
  **Try coupons** in the card took the order from $159.99 to $144.99 with AFF15, matching an independent read.
  The button stepped aside for the panel, and afterwards its card showed “You save $15.00 with AFF15”.
- **Automatic reload (same day, at the owner's request):** while `npm start` runs, its development build reloads
  itself in Chrome after each change, along with open Sharper Image and Demo checkout tabs, and Ctrl+C restores
  the plain build. Checked in Chrome for Testing 153 with the real `npm start` (on a copy of the repository) and
  in a browser test; not checked in branded Google Chrome.
- **Standards pass (2026-10-24, at the owner's request):** the extension was checked against Chrome's
  Manifest V3 extension guidance and current web-platform guidance. Changes:
  - the popup and panel progress bars are native progress bars, labeled and announcing the code being tried;
  - the popup declares its light and dark themes before it draws, and the panel and page-button card theme
    their scrollbars;
  - under reduced motion, spinners and the moving bar slow down instead of stopping;
  - the background and page scripts use async/await, and every event listener handles its errors.

  Coupon testing is unchanged: all unit and browser tests pass, and the new bars were checked by eye in Chrome
  for Testing 153, light and dark, with reduced motion. The live checkout was not re-run for this pass.
  Two guidelines are deliberately not followed:
  - **No `tabs` permission.** The checkout's address is readable through the store's host access or the toolbar
    click, and `tabs` would add a browsing-history warning.
  - **The page button keeps its own hover handling.** The platform's interest invokers and hint popovers need
    Chrome 142 and 151; the extension supports Chrome 116 and later.
- **Movable page button (2026-10-24, at the owner's request):** the button slides up and down the right edge.
  Drag its tab, or focus it and use the up and down arrow keys. It stays inside the window and keeps its spot on
  later pages and in other open tabs. Near the top, its card opens below it. Checked in Chrome for Testing 153 on
  the Demo checkout (drag, reload, keys, card placement) and in unit tests. Not checked on the live store.
- **Tips on product pages (2026-10-24, at the owner's request):** the page button's card shows tips on product
  pages, laid out like Honey's tips panel:
  - the product, read from the page's schema.org Product data, with Save;
  - the coupon count and Go to checkout;
  - a 30-day price trend with a hover and keyboard readout and a price history table, and Watch for price
    drops;
  - Rate this tip.

  Prices, saves, watches and ratings stay in local storage. Rewards show as not available, and there are no
  background price checks. Checked in unit tests and in Chrome for Testing 153 on a Demo product page served
  in place of sharperimage.com, in light and dark.
- **Gear menu and settings page (2026-10-24, at the owner's request):** the gear in the card's header opens a
  menu: Hide on this page, Snooze for 24 hours, Snooze on this site and Go to settings. Go to settings opens
  Janice's settings page in a tab, where the snoozes can be ended and price remembering turned off or cleared.
  The toolbar popup says when the button is snoozed on the store, with Show it again, and its gear opens the
  settings. Checked in unit tests and in Chrome for Testing 153 on the Demo product page: the menu sits under
  the gear and inside the window; Escape closes the menu alone and focus goes back to the gear; Go to settings
  opens the settings tab; Snooze on this site holds across a reload until Show again on the settings page;
  Hide on this page lasts until a reload. Screenshots in light and dark, the settings page also at 375 px.
- **Live (read-only, 2026-10-24):** in a fresh guest profile in Chrome for Testing 153, on
  `/products/smartphone-photo-printer-by-sharper-image`, the tips card showed the product, $189.99, "First
  price seen" and 1 coupon, and kept that day's price. The gear menu opened under the gear, Escape closed it
  alone with focus back on the gear, and Snooze on this site hid the button, also after a reload, until the
  snooze was cleared in storage. Nothing on the store was clicked or changed.
- **Fixture (Demo):** the latest full runs passed **178 unit/fixture tests and 25 browser tests**, including
  native drawer Apply/Remove, serial invalid/valid attempts, winner reapplication and both typing/pending Stop.
  Every row of the ACCEPTANCE.md fixture table remains covered. An earlier batch-overlay browser test failed
  once, then passed on its own and in three later runs.
- **Not verified live:** the real toolbar click (`activeTab`) and the page button in branded Google Chrome (the
  page button was checked in Chrome for Testing), a cart edit during a live run, and totals once an address is
  entered, among others listed below.

## Automated checks (fixture — not live evidence)

Latest complete runs on October 24: `npm test` **178 passing** (Node test runner + jsdom),
`npm run test:e2e` **25 passing** (the built extension in Chrome for Testing 153, development reload, and UI
preview). Browser checks include seven drawer scenarios, two animated-outline/radius scenarios, shopper
batches, popup retry restoration, top-layer rendering, dynamic controls, a 64-character code at 390 px, tips
on a product page, and the gear menu with the settings page.
These deterministic runs simulate store responses and do not establish live coupon validity.

After the final feedback-spacing and draft-error handling adjustments, `npm test` passed **177/177** again,
the seven drawer browser checks passed **7/7** (40.55 s), and a focused accepted-result browser check passed
for the final screenshot. The collision checks keep **Try again** and status away from the merchant's coupon
feedback, discount title, cart total and disclosure. `npm run build` succeeded with 30 extension files. The
earlier complete browser run was **23/23**; the final layout changes were verified by these focused reruns.

| Area | What is tested | Where |
| --- | --- | --- |
| Cart field assist and shared runner | Visible Shopify drawer promo fields + candidates get a moving rainbow outline and small Use code button; decoration does not write/focus/open a card. Explicit Use code starts the same worker/controller run, types and clicks native Apply, shows Stop/progress/result, and creates no large panel. Serial invalid/valid batches remove between accepted attempts and reapply the lowest verified total; Stop during typing prevents Apply and restores the draft, while Stop after Apply settles and restores the original cart. Hidden/collapsed/offscreen, gift/search-only and empty-provider cases stay quiet. Scroll, replacement, mobile layout and deferred stale provider replies are covered | `tests/e2e/cart-drawer.test.js`, `tests/cart-drawer-signal.test.js`, `tests/inline-coupon.test.js` |
| Drawer adapter | Exact safe Apply/Remove selectors and verified origin; whitelisted `/cart.js` fields; only applicable codes count; changing discount line keys do not change cart identity. A replacement component plus stable matching UI/server outcome is required; READY alone, stale errors, DOM/server mismatches, unreadable/throttled responses and never-settling updates cannot claim success. Cart/discount/draft changes between typing and Apply prevent the click; original or shopper-edited drafts are preserved safely | `tests/drawer-adapter.test.js`, `tests/fixtures/drawer/` |
| Animated coupon entry and outline | Native character input events followed by one change; reduced-motion entry, cancellation, shopper edits, stale/replaced/disabled fields and bounded typing. Moving colors preserve a fixed outline and individual square/pill/elliptical corners; reduced motion and forced colors stay static | `tests/coupon-entry.test.js`, `tests/e2e/rainbow-outline.test.js` |
| Discovery and batches | Metadata-based promo hints, unrelated/private field exclusions, collapsed and dynamic fields, no value reads/mutations; separator parsing, validation/deduplication/caps; manual UI and mutation refresh; worker refuses invalid batches/unsupported layouts before start | `tests/checkout-discovery.test.js`, `tests/coupon-candidates.test.js`, `tests/coupon-ui.test.js`, `tests/service-worker-batch.test.js` |
| Money | Displayed amounts to integer cents (U+2212 minus, thousands separators), ambiguous text refused, display formatting without float drift | `tests/money-and-compare.test.js` |
| Comparison | Lowest verified comparable total wins; baseline keeps ties and worse; rejected/unverified/other-basis attempts never win | `tests/money-and-compare.test.js` |
| Provider | AFF15 with the supplied terms (unknowns stay null), empty list for other stores, malformed/unreadable data as a provider error with retry, bundled copy identical to `data/mock-coupons.json` | `tests/provider.test.js` |
| Adapter on live markup | Sanitized captures of the real order summary: total read from the shown copy (not the lagging roller), USD, AFF15, unchanged subtotal, cart identity, checkout-path detection | `tests/adapter.test.js` |
| Adapter on the Demo checkout | Accept, reject (store message), remove, stalled roller, collapsed summary opened only after Try, missing controls, unreadable total, other currency, gift card, never-settling update → unverified, discount field inside the payment form refused | `tests/adapter.test.js` |
| ACCEPTANCE fixture table | Every row (see below) end to end through the real adapter, controller and provider | `tests/run-controller.test.js` |
| Decision paths | Best of several kept and re-applied, winner re-apply refused, winner vanishing before the final check, codes changed by someone else (including pending apply/remove and restoration), other checkout page, run deadline, Stop before anything, busy checkout, basis change, improvement not holding | `tests/run-controller-paths.test.js` |
| Content entry and popup | Detection only reads, one run per page, Demo panel with progress, Stop and the savings figure, Stop relay; popup states (ready, running with a native progress bar that announces the code being tried, result, unsupported, store page, other sites, unreadable pages), coupon cards with the advertised offer and what happened to each code, Copy | `tests/content-and-popup.test.js` |
| Page button | The manifest's page-button scripts: a tab only on Sharper Image pages, once per page, that asks nothing until hovered or clicked; its card counts the coupons, links to the checkout on store pages and offers Try coupons at checkout; unsupported checkouts, no coupons, provider errors and failed reads explained without a Try button; refused starts, Escape, outside clicks, Close, Copy. With main.js on the Demo checkout: Try coupons from the card runs, the button steps aside for the panel and shows the result after Close. Moving it: a drag slides it along the right edge only after a few pixels (a press alone stays a click), and the click that ends a drag doesn't open the card. It stays inside the window; the arrow keys move it 15px; the spot is kept, applied before the button shows, and followed in other tabs; the card opens below when the button is high up. In Chromium: a real mouse drag, the spot after a reload, the keys, the card below | `tests/launcher.test.js`, `tests/launcher-drag.test.js`, `tests/e2e/launcher-drag.test.js` |
| Tips | The product from the page's schema.org Product (og fallback, https images only), none off product pages or without a price; one price per day kept for 90 days and 200 products, none when turned off; the view's trend note, summary, chart points, keyboard readout and history table; Save, Watch (and the drop since watching), Rate; the card in tips mode on a product page with the coupon count and today's price kept. In Chromium on a Demo product page: product, coupons, trend from seeded prices, the image, the card inside the window, Watch kept across a reload | `tests/tips.test.js`, `tests/e2e/tips.test.js` |
| Gear menu, snooze and settings | The gear opens an auto popover of four plain buttons on every page with the button. Hide on this page keeps nothing and the next page shows the button; Snooze for 24 hours hides it on every store and in other tabs, keeps no tips price while it lasts, and ends after 24 hours; Snooze on this site hides it on the store until turned back on; Go to settings asks the service worker, which opens the settings page; a snoozed button also hides the drawer's Use code control and asks nothing; turning a snooze off brings open pages back. Opening the menu pins the card; Escape closes the menu, not the card; closing hands focus back to the gear; without anchor positioning the menu is placed under the gear by hand. The settings page shows and ends each snooze, and turns price remembering off or clears it; the popup says when the button is snoozed on its store, with Show it again, and its gear opens the settings. In Chromium: the menu under the gear and inside the window, Escape and focus, the settings tab, the store snooze across a reload and back from the settings page, Hide on this page until a reload | `tests/launcher-menu.test.js`, `tests/options.test.js`, `tests/content-and-popup.test.js`, `tests/service-worker-batch.test.js`, `tests/e2e/launcher-menu.test.js` |
| Package | MV3, `activeTab`/`scripting`/`storage`, a settings page opened in a tab, scoped Sharper Image host access and separate read-only `shop.app` recognition; unverified Shopify recognition never enables testing. Every loaded file is present; executable logic is bundled, with no remote code/eval. The drawer permits only the exact same-origin read-only `/cart.js` request; provider data stays local. `npm run package` zips exactly the extension reproducibly, with `manifest.json` at the root; build copies files byte for byte, removes stale build files safely and preserves other folders; development reload is removed by a plain build | `tests/package.test.js` |
| Automatic reload | The reload channel turns away web pages, sends extension pages the current build at once, each new build, keep-alive pings and the final switch, over a real WebSocket handshake | `tests/reload-server.test.js` |
| Automatic reload (browser) | The development build in Chromium connects to the channel; a newer build reloads Janice and the open Demo checkout, whose page button then runs the changed script; the final switch leaves the plain build running | `tests/e2e/dev-reload.test.js` |
| Browser (Demo) | Every test runs with the page button on the Demo page, as on the store. The page button: hover → coupon count, Try coupons from its card, steps aside for the panel, result after Close; none where no store is detected. Popup → service worker → injected scripts → panel; Demo label; result after reopening; run survives closing the popup; three simultaneous starts → one run; Stop during an update restores and checks; reload → interrupted; unsupported page; an unrelated host is never injected into | `tests/e2e/extension.test.js` |
| UI preview | Every popup, page button and panel screen drawn from the extension's own files; the popups run Try coupons and Stop, and the checkout card plays a run in a panel; no errors or failed requests | `tests/e2e/ui-preview.test.js` |

ACCEPTANCE.md fixture scenarios (USD, explicit eligible spend, zero tax/shipping, integer cents):

| Scenario | Fixture result | Test |
| --- | --- | --- |
| Spend 14999 | AFF15 rejected (fixture rule), $149.99 unchanged, no savings, state checked | `$149.99: AFF15 rejected…` |
| Spend 15000 | Accepted, 13500, $15 saved, left applied | `$150.00: AFF15 accepted…` |
| Spend 20000 | Accepted, 18500, $15 saved | `$200.00: AFF15 accepted…` |
| Qualifying spend, explicit rejection | Rejected with the store message, baseline kept, no savings claimed | `qualifying spend but explicit rejection…` |
| $200 with an existing $20 code | $180 beats AFF15's $185: SAVE20 removed, AFF15 tested alone, SAVE20 re-applied and checked at $180 | `$200 with an existing $20 code…` |
| Existing code, same total | Original kept on the tie | `an existing code with the same total…` |
| No candidates / provider error | Explained, coupon field never touched | `no candidates or a provider error…` |
| Stop while an application is pending | No further attempts, the pending update recorded, original restored and checked | `Stop while an application is pending…` (+ browser test) |
| Cart changes during testing | Stopped, comparisons discarded, no savings, only Janice's code undone, shopper's edit kept | `the cart changes during testing…`, `a shopper editing the cart mid-run…` |
| Repeated Try coupons | One run, one baseline | `repeated starts…` (+ browser test with three simultaneous requests) |
| Popup closes and reopens | Run continues; reopened popup shows progress, then the result | browser tests |
| Missing controls, unreadable total, timeout | Unsupported / unsupported / unverified; nothing fabricated | `missing controls, an unreadable total…`, `a checkout that never settles…` |
| Final application or restoration fails | Restore refused → error with the state now shown; hanging removal → unverified; dropped winner never reported as applied | `restoring the original code fails…`, `a removal that never settles…`, `a winning code the store drops…`, decision-path tests |

## Live validation — Sharper Image cart drawer, October 24

At 08:04:14–08:04:32 UTC, Codex ran the built extension in Chrome for Testing 153.0.8010.12 with a fresh
temporary guest profile and one $159.99 item. The test copy preserved the shipped manifest's host permissions;
only its local provider data changed to the temporary candidates `JANICETEST0`, then `AFF15`. The actual small
**Use code** control initiated the worker/controller run. The script did not call the adapter directly or open
checkout. No corrective setup retry was needed.

| Stage | Store response / independent read | Extension observation |
| --- | --- | --- |
| Baseline | USD `15999`, no applied codes, one unchanged item | Captured before typing or Apply |
| First native Apply | `JANICETEST0` rejected: “Promo code JANICETEST0 is not valid or does not meet requirements.” | Attempt recorded as rejected; no fabricated discount |
| Second native Apply | AFF15 applied; independent `/cart.js` total USD `14499`, `AFF15` applicable | Attempt accepted; final shared result `better`, `savingsMinor: 1500` |
| End of extension run | AFF15 remains applied at $144.99 | **Try again** / **You save $15.00 with AFF15**, no large panel |
| Separate post-evidence cleanup | Native AFF15 Remove, then independent total `15999`, no active codes | Test cart restored after the successful result was captured |

The coupon-only event trace records `J` through `JANICETEST0`, then `A` through `AFF15`, at roughly 85 ms
between letters. Exactly two Apply clicks occurred, with no overlap and no checkout clicks. Screenshots show
the field, merchant controls and compact Janice feedback only. The JSON retains amounts, applicable code
names, item variant/quantity/original price, local run state and coupon event times; it contains no cart token,
cookies, contact/payment values or unrelated browsing data.

[Live report](evidence/drawer-apply-2026-10-24/report.json),
[before](evidence/drawer-apply-2026-10-24/before.png),
[progress](evidence/drawer-apply-2026-10-24/progress.png),
[result](evidence/drawer-apply-2026-10-24/result.png),
[native-control research](evidence/drawer-apply-2026-10-24/native-research.json).

The adapter is limited to the inspected controls on `https://sharperimage.com`. Field discovery on other
drawers does not establish automatic testing support; `shop.app` recognition remains read-only and unverified.
The live trace proves one invalid/valid pair. Multiple improving candidates, winner reapplication, stopping
during typing/pending Apply, original-draft restoration and concurrent shopper edits are deterministic
fixture/browser scenarios. The current compact-feedback spacing was refined after these live screenshots and
passed the seven focused drawer checks. [Final spacing — Demo only](evidence/drawer-apply-2026-10-24/demo-final-spacing.png)
shows the updated layout, not another live redemption run.

## Earlier live validation — Sharper Image checkout, October 23

How: `scripts/live-check.js`, one item in a new guest cart, the real checkout, Janice started from its popup.
The extension ran from a temporary copy whose manifest adds host access to `https://sharperimage.com/*`,
because Playwright cannot click the toolbar button that grants `activeTab`; the code is otherwise identical.
Each report pairs Janice's claim with an independent read of the Cost summary. No contact, delivery or payment
field was filled, Pay now was never pressed, no order was placed.

All runs: 2026-10-23, 08:36–08:53 UTC, Chrome for Testing 153.0.8010.12. Full records, with timestamps and
screenshots of the panel, popup and Cost summary, are in [evidence/live-2026-10-23/](evidence/live-2026-10-23/);
[CHECKOUT_NOTES.md](CHECKOUT_NOTES.md) has the same table with notes.

| Scenario | Before (codes · total) | Store responses | Janice's result | Checkout afterwards (independent read) |
| --- | --- | --- | --- | --- |
| `apply`: AFF15 over $150 | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15**, left applied | AFF15 · $144.99 |
| `below-minimum`: AFF15 at $149.99 | no code · $149.99 | AFF15 accepted → $134.99 | **You save $15.00 with AFF15** | AFF15 · $134.99 |
| `stop`: Stop while AFF15 is being applied | no code · $159.99 | AFF15 accepted → $144.99, allowed to settle | **Testing stopped**, original state back (checked) | no code · $159.99 |
| `repeat`: three starts at once | no code · $159.99 | AFF15 accepted → $144.99 | one run (ok, already-starting, already-starting); **You save $15.00** | AFF15 · $144.99 |
| `reopen`: popup closed and reopened mid-run | no code · $159.99 | AFF15 accepted → $144.99 | reopened popup showed progress, then **You save $15.00** | AFF15 · $144.99 |
| `narrow`: 390 px window, summary collapsed | no code · $159.99 | AFF15 accepted → $144.99 | summary opened by the run; **You save $15.00** | AFF15 · $144.99 |
| `two-codes`: AFF15 and a made-up code | no code · $159.99 | AFF15 accepted → $144.99; JANICETEST0 rejected: “Enter a valid discount code or gift card” | winner re-applied and checked; **You save $15.00 with AFF15** | AFF15 · $144.99 |
| `restore-existing`: shopper's AFF15, made-up code tried | AFF15 · $144.99 | JANICETEST0 rejected (same message) | **Code not accepted**; AFF15 put back, total checked | AFF15 · $144.99 |
| `already`: AFF15 already applied | AFF15 · $144.99 | none | **Already using the available code**; nothing changed | AFF15 · $144.99 |

`JANICETEST0` exists only in temporary test copies of the dataset; the shipped dataset contains only AFF15.

**After the Honey-style redesign** (popup, panel and shared wording; the adapter and run controller are
unchanged), `apply` was run again at 18:58:56 UTC, also in Chrome for Testing 153: no code · $159.99 → AFF15
accepted → $144.99. Before the run the popup showed “Ready to try 1 coupon” with the AFF15 card, and opening it
left the page unchanged. The new panel showed “$15.00 saved” and “You save $15.00 with AFF15”, the reopened popup
showed the same result with the card marked “Applied · saves $15.00”, and the order summary read AFF15 · $144.99.
Records and screenshots are in [evidence/live-2026-10-23-ui/](evidence/live-2026-10-23-ui/). The other eight
scenarios ran with the earlier interface; the run logic they exercised has not changed since.

**The page button** was checked live with a new `page-button` scenario on 2026-10-24 at 03:21 UTC, in Chrome for
Testing 153, on a new cart. The test copy's manifest had the same permissions as the shipped one, so the button
ran as it ships. On the home page its card read “1 coupon found · for Sharper Image”, listed AFF15 (“$15 off
orders of $150 or more”) and linked to `https://sharperimage.com/checkout`. At checkout it read “1 coupon found”
with **Try coupons**, and opening it left the page unchanged. **Try coupons** in the card: no code · $159.99 →
AFF15 accepted → $144.99. The panel showed “You save $15.00 with AFF15”, the button was hidden while the panel
was open, and after Close its card read “You save $15.00 with AFF15” with **Try coupons again**. The popup agreed,
and the order summary read AFF15 · $144.99. Records and screenshots (the card on both pages, and full-window views
of the home page and of the checkout before anything was entered) are in
[evidence/live-2026-10-24-page-button/](evidence/live-2026-10-24-page-button/). An earlier run at 03:19 UTC gave
the same results, but its checkout screenshots caught the card mid fade-in, so it looked see-through; the evidence
script now lets the animation finish before capturing, and that run's files were replaced.
Between 08:38 and 08:49 UTC the storefront's cart endpoints answered HTTP 429 to these automated sessions;
two attempts failed while building their carts (before Janice ran) and were rerun once the limit lifted.

## Not verified live

- **The toolbar button in branded Google Chrome.** Automation cannot click the toolbar, and branded Chrome no
  longer loads unpacked extensions from automation, so live runs used Chrome for Testing 153 with a test copy that
  has host access instead of the `activeTab` grant a click gives. The shipped `activeTab` path (click → popup →
  tab URL → injection) has not been exercised by a real click. Use the manual steps below.
- **The page button in branded Google Chrome**, and on store pages other than the home page and checkout
  (product pages, collections): it was checked live only in Chrome for Testing. Drawer structure was inspected
  live. The inline helper was checked in Chrome for Testing; branded Chrome remains untested.
- **A cart edit during a live run** (for example a quantity changed in another tab): fixture and browser tests only.
- **Totals after an address is entered**, when shipping and taxes are included: Janice never enters personal
  data, so every live comparison was before shipping and taxes.
- **A second valid code.** None is known, so restoring an existing code was verified with AFF15 as the shopper's
  own code. Replacing a different existing code, ties and worse results are fixture-only.
- **The store's own attempt-limit messages:** never seen at checkout (the HTTP 429s hit the test setup's cart
  requests); Janice's “store is limiting attempts” handling is fixture-only.
- **Gift cards, several applied codes, automatic discounts:** not present in the live carts; the “unsupported, nothing
  changed” handling is fixture-only.
- **A reload or navigation during a live run:** fixture and browser tests only. Note that the live checkout keeps
  an applied code across a reload (observed during inspection), so an interrupted run can leave AFF15 applied;
  Janice says so.
- **Updates that never settle:** not seen live (updates took 0.7–0.85 s); timeout handling is fixture-only.
- **Assistive technology:** the panel and popup use roles, labels, live regions and visible focus, but have not been
  checked with a screen reader.
- **Additional drawer scenarios:** Stop, simultaneous starts, popup closure during a drawer run, shopper edits,
  an existing discount being restored, winner reapplication, several applicable codes and timeout cases are
  fixture/browser verified, not additional live drawer runs. Native drawer Apply/rejection/acceptance and
  native Remove are verified by the October 24 run above.
- Other browsers and other locales.

## Manual validation in your own Chrome

For the batch overlay: open **Add your own codes** in the popup or page card, paste your candidates separated
by commas/new lines, and click **Try coupons**. Expect a unique candidate count, serial progress and a **codes
tried** disclosure showing each store outcome. Reopen the popup afterwards: its retry draft should include prior
shopper codes. Test **Stop** during a pending application and compare the restored coupon/total with the baseline.

For the cart drawer, add an item through the store UI and open Cart on `https://sharperimage.com`. Expect a
thin moving rainbow outline following the visible promo input's corner radii, plus a small **Use code**
button. Opening the drawer or showing the outline must not type, focus or apply anything. Record the current
cart total, applied codes and any draft in the field. Click **Use code**: Janice should type each candidate
visibly, click the merchant's Apply automatically, wait for its response, then continue serially. There is no
need to press Apply yourself. The small button becomes **Stop** and progress stays near the field. At the end,
compare the accepted code and savings with the merchant's cart; rejection or an unverified response must not
claim savings. The lowest verified improvement stays applied; otherwise the original discount is restored
and checked. The original input draft is restored when safe, while newer shopper edits are preserved.

The shipped provider has one candidate, AFF15. To exercise several codes, use **Add your own codes** in the
popup or card and start **Try coupons** there; this uses the same runner and compact drawer feedback. Try an
invalid candidate, Stop during typing, Stop during a pending Apply, and close/reopen the popup. Compare each
final cart/code state with the baseline. Scroll, resize, close/reopen and redraw the drawer: the decoration
should follow the current visible field. Native Apply and Remove must remain usable. Remove any code you do
not want to keep after testing. Do not operate checkout or payment submission controls for this drawer check.

These steps cover what automation could not: the real toolbar button (`activeTab`) and the page button in
branded Google Chrome.

1. Run `npm run build` and load the `build` folder unpacked (see README) in Google Chrome.
2. Open the sharperimage.com home page and point at the Janice button on the right edge. Expect a card with
   “1 coupon found”, AFF15 with **Copy**, and **Go to checkout**; it closes when you move away.
3. Add an item over $150 (for example the Glass Topper Cocktail Smoker Set) and go to checkout. Do not enter
   payment details.
4. Click the Janice Coupons toolbar button. Expect “Ready to try 1 coupon”, your current total and an AFF15 card;
   the page should not change.
5. Click **Try coupons**. Expect the corner panel with AFF15 and a progress bar, then “$15.00 saved” and
   “You save $15.00 with AFF15” if the store still accepts it (or “Code not accepted” with the store's message),
   and the order summary to match.
6. Close the popup during a run and reopen it: it should show progress, then the same result.
7. Remove AFF15 in the order summary, then point at the page button and click **Try coupons** in its card. Expect
   the same panel and result; the button hides until you click **Close**, then its card shows the result.
8. Remove AFF15, run again and press **Stop** while the panel says “Trying AFF15”: expect “Testing stopped” and
   no code applied.
9. Apply AFF15 yourself, then run: expect “Already using the available code”.
10. Make the window narrow (under about 1000 px) and run: Janice should open the order summary and run normally.
11. Afterwards remove AFF15 if you do not want it on the order.
