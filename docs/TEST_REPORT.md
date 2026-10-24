# Janice Coupons 0.1.0 — test report

October 23, 2026 · macOS 26 (Darwin 25.6.0) · Node 24.14.0 · installed Google Chrome 155.0.8059.86 ·
automation: Playwright 1.63.0 with Chrome for Testing 153.0.8010.12 · build: uncommitted working tree (the
repository has no commits yet).

Two kinds of evidence are kept apart here. **Fixture (Demo)** results come from the simulated checkout in
`fixtures/demo-checkout/` and prove the logic and the wiring; they say nothing about the real store. **Live**
results come from the real U.S. Sharper Image checkout.

## Summary

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
- **Fixture (Demo):** 81 unit and fixture tests and 10 browser tests pass, covering every row of the
  ACCEPTANCE.md fixture table.
- **Not verified live:** the real toolbar click (`activeTab`) and the page button in branded Google Chrome (the
  page button was checked in Chrome for Testing), a cart edit during a live run, and totals once an address is
  entered, among others listed below.

## Automated checks (fixture — not live evidence)

`npm test`: **81 tests, all passing** (Node test runner + jsdom, about 11 s). `npm run test:e2e`: **10 tests,
all passing** (the built extension in Chrome for Testing 153, the development build's automatic reload, and the
UI preview page, about 40 s).

| Area | What is tested | Where |
| --- | --- | --- |
| Money | Displayed amounts to integer cents (U+2212 minus, thousands separators), ambiguous text refused, display formatting without float drift | `tests/money-and-compare.test.js` |
| Comparison | Lowest verified comparable total wins; baseline keeps ties and worse; rejected/unverified/other-basis attempts never win | `tests/money-and-compare.test.js` |
| Provider | AFF15 with the supplied terms (unknowns stay null), empty list for other stores, malformed/unreadable data as a provider error with retry, bundled copy identical to `data/mock-coupons.json` | `tests/provider.test.js` |
| Adapter on live markup | Sanitized captures of the real order summary: total read from the shown copy (not the lagging roller), USD, AFF15, unchanged subtotal, cart identity, checkout-path detection | `tests/adapter.test.js` |
| Adapter on the Demo checkout | Accept, reject (store message), remove, stalled roller, collapsed summary opened only after Try, missing controls, unreadable total, other currency, gift card, never-settling update → unverified, discount field inside the payment form refused | `tests/adapter.test.js` |
| ACCEPTANCE fixture table | Every row (see below) end to end through the real adapter, controller and provider | `tests/run-controller.test.js` |
| Decision paths | Best of several kept and re-applied, winner re-apply refused, winner vanishing before the final check, codes changed by someone else, other checkout page, run deadline, Stop before anything, busy checkout, basis change, improvement not holding | `tests/run-controller-paths.test.js` |
| Content entry and popup | Detection only reads, one run per page, Demo panel with progress, Stop and the savings figure, Stop relay; popup states (ready, running, result, unsupported, store page, other sites, unreadable pages), coupon cards with the advertised offer and what happened to each code, Copy | `tests/content-and-popup.test.js` |
| Page button | The manifest's page-button scripts: a tab only on Sharper Image pages, once per page, that asks nothing until hovered or clicked; its card counts the coupons, links to the checkout on store pages and offers Try coupons at checkout; unsupported checkouts, no coupons, provider errors and failed reads explained without a Try button; refused starts, Escape, outside clicks, Close, Copy. With main.js on the Demo checkout: Try coupons from the card runs, the button steps aside for the panel and shows the result after Close | `tests/launcher.test.js` |
| Package | MV3, `activeTab`/`scripting`/`storage`, host access to `https://sharperimage.com/*` only, one automatic content script (the page button: top frame of the store's pages, no checkout logic), every loaded file present, no remote code/eval/network, only store and Demo hosts injected; `npm run package` zips exactly the extension, byte for byte, with `manifest.json` at the root, reproducibly; `npm run build` writes exactly the extension's files to `build/`, byte for byte, updates it in place (stale files removed, the folder kept) and leaves alone a folder that isn't a build; `npm start`'s development build differs only by the reloader as the service worker's entry and the Demo checkout's host, and a plain build over it takes both out | `tests/package.test.js` |
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

## Live validation (real Sharper Image checkout)

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
  (product pages, collections, the cart drawer): it was checked live only in Chrome for Testing, on those two pages.
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
- Other browsers, other locales, and other Sharper Image surfaces such as the cart drawer's own discount field.

## Manual validation in your own Chrome

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
