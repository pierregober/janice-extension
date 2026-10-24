# Janice Coupons

A Chrome extension (Manifest V3) that tries coupon codes on the real **Sharper Image checkout (US)** when you click
**Try coupons**, and keeps only savings the checkout itself confirms.

This first version supports one store (Sharper Image, United States), the locally bundled candidate
`AFF15` (“$15 off when you spend $150 or more”, as supplied), and additional codes you enter yourself.
It is an unpacked extension for local testing.
What was verified on the live checkout, and what was not, is in [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Build it and load it in Chrome

1. Check that your [Node.js](https://nodejs.org/) version is 22.13 or newer (`node --version`).
2. Run `npm install` (the test tools; the build itself needs no packages).
3. Run `npm start`. It builds the extension into `build/`, rebuilds it whenever a file in `extension/` changes, and
   serves the Demo checkout and UI preview below until you press Ctrl+C. Once Chrome has loaded that build, it
   updates itself: see [Automatic reload](#automatic-reload). (`npm run build` builds once.)
4. Load the extension in Chrome:
   1. Go to `chrome://extensions`.
   2. Turn on **Developer mode** (top right).
   3. Click **Load unpacked**.
   4. Select the `build` folder.
5. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to **Janice Coupons**. On sharperimage.com
   Janice also puts its own button on the page; on other pages the toolbar button is how you open it, and clicking
   it is what gives Janice access to that one tab.

Edit the code in [`extension/`](extension/), not in `build/`, which every build overwrites. There is nothing to
compile: `npm run build` writes an exact copy of `extension/` without hidden files such as `.DS_Store`, and the
browser tests run on that same output. To debug the popup, right-click the toolbar button and choose
**Inspect popup**.

To give the extension to someone else, run `npm run package`: it writes `dist/janice-coupons-0.1.0.zip` with the
same files, which they unzip and load the same way.

### Automatic reload

While `npm start` runs, you don't need the reload arrow. After each change, Janice reloads itself in Chrome, and so
do open Sharper Image and Demo checkout tabs, so the page button and panel run the new code. If Janice was already
loaded before you started `npm start`, click its reload arrow once to connect it.

- `npm start`'s build adds a small development script (`scripts/dev-reload.js`) that listens to `npm start` on
  `127.0.0.1:4301`, and it also runs the page button on the local Demo checkout. Developer mode must stay on:
  Chrome turns off a reloaded unpacked extension without it.
- Ctrl+C puts the plain build back in `build/` and reloads Janice with it, so nothing keeps trying to reach
  `npm start`. If `npm start` ends some other way, run `npm run build` and click the reload arrow once.
- While connected, Janice's background script stays awake. To check anything that depends on Chrome stopping it,
  use `npm run build`.

The extension can't update itself anywhere else: Chrome never updates unpacked extensions on its own. Automatic
updates for other people's copies come from publishing in the Chrome Web Store, which is outside this version.

## See the screens without shopping

`npm start` serves these while it runs; `npm run demo` serves them without building.

- **UI preview** at <http://127.0.0.1:4300/ui-preview/>: every popup, page button and panel screen side by side
  (ready, testing, saved, not accepted, stopped, other sites, …), drawn by the extension's own files with simulated
  data. It works without the extension installed, and it is clickable (Try coupons, Stop).
- **Demo checkout** at <http://127.0.0.1:4300/demo-checkout/?spend=20000>: a simulated checkout to run the
  installed extension end to end. Click the toolbar button there and then **Try coupons**. Results are labeled
  **Demo**.

## Use it on Sharper Image

On every sharperimage.com page, Janice's button sits on the right edge of the window. Point at it (or click it) to
open its card: how many coupons Janice found for the store, each with **Copy**, and **Try coupons** when supported
cart/checkout controls are available (**Go to checkout** elsewhere). The card never opens by itself, and opening it changes nothing on the page.

The gear at the top of the card opens a menu:
- **Hide on this page:** the button goes away until you reload or leave the page.
- **Snooze for 24 hours:** the button stays off every store for a day, in every tab.
- **Snooze on this site:** the button stays off Sharper Image (its checkout included) until you turn it back on.
- **Go to settings:** opens Janice's settings page in a new tab.

A snooze also hides the drawer's **Use code** button, and tips keep no prices while it lasts. The toolbar
popup and **Try coupons** still work. To bring the button back, use **Show it again** in the toolbar popup
(it says when the button is snoozed on the store you're on) or the settings page. The popup's gear and
**Options** in the menu of Janice's toolbar icon open the settings page too.

When a Shopify cart drawer (`shopify-section-cart-drawer`, including section variants) opens with a visible
promo, discount or coupon input, Janice adds a thin rainbow outline and a small **Use code** button nearby.
The rainbow uses the colors from usejanice.com's hero border and circulates slowly around the outline.
Each corner matches the input's own radius, including square, pill and elliptical corners; reduced-motion
settings keep the rainbow static. The outline follows the input as the drawer
scrolls, without opening a card or taking focus. **Use code** starts a serial test of the available codes:
Janice puts each candidate in the field at once, presses the drawer's **Apply**, waits for the store's
acceptance/rejection, and compares the actual cart total. The small button becomes **Stop**, with progress
and the latest outcome beside the input. It keeps the best verified improvement, otherwise restores the
original coupon state. Your original field draft is captured and restored when it is still safe; intervening
edits stop testing and are preserved. Closed/offscreen or collapsed fields, unrelated inputs and empty coupon
lists stay quiet. Reduced-motion settings fill each candidate immediately.

The bundled list contains AFF15. To test more candidates, open Janice's popup or page card, expand **Add your
own codes**, and paste your codes before **Try coupons**. The same runner handles the cart drawer and checkout.

Janice detects likely promo fields from their labels and attributes as the store page changes, including
fields revealed later or inside a collapsed summary. A detected field is a hint: automatic testing still
requires a verified Sharper Image checkout or the inspected drawer's dedicated Apply/Remove controls and
readable cart state. A field match alone does not enable testing. Payment, login, search and gift-card-only
fields are excluded. This version does not scan other stores.

1. Add items to your cart on [sharperimage.com](https://sharperimage.com/) (over $150 to meet AFF15's advertised
   minimum, for example the Glass Topper Cocktail Smoker Set) and go to checkout. The address starts with
   `sharperimage.com/checkouts/`. Don't enter payment details; Janice doesn't need them. If you're signed in to
   Shop, the checkout opens on `shop.app/checkout/…` instead. Janice recognizes it there and shows the coupons,
   but doesn't test codes on shop.app yet.
2. Point at the Janice button on the right edge, or click the **Janice Coupons** toolbar button. Both show the
   coupons Janice found and a large **Try coupons** button; the popup also shows the current total.
   **Nothing on the checkout changes yet.** If the button is in the way, drag it up or down the edge, or focus it
   and use the up and down arrow keys. It keeps that spot on later pages.
3. Optionally open **Add your own codes** in the card or popup. Paste codes separated by commas, semicolons or
   new lines. Janice combines them with the local candidates and removes duplicates, up to 20 different codes.
   Codes may contain letters, numbers, hyphens and underscores (64 characters per code).
4. Click **Try coupons**. An overlay opens in the corner of the checkout with the current code, progress,
   **Stop**, and a **codes tried** disclosure with each observed outcome. The checkout remains interactive,
   and the page button steps aside until you close the overlay.
5. When it finishes, the panel shows the outcome, and so do the button's card and the popup when you open them
   again. Each coupon card in the popup says what happened to that code (Applied, Not accepted, …).
   - **You save $X with CODE**, with the amount in large type: the checkout accepted the code and its own total
     went down. The code stays applied.
   - **No better price found**: your original state was kept or put back, and checked.
   - **Code not accepted**: the store's message is shown, and no savings are claimed.
   - **Can't test this checkout**, **Result couldn't be confirmed**, **Testing stopped**,
     **Testing stopped: checkout changed**, **Testing was interrupted**, **Something went wrong**: each says what
     happened and what the checkout shows now.
6. Click **Close** on the panel. Remove the winning code in the order summary if you do not want it on the order.

You can close the popup during a run; the run continues in the page, and reopening the popup shows its progress.
**Stop** lets the update already sent to the store finish, then puts your original coupon state back and checks it.
Janice never fills contact, delivery or payment details and never presses **Pay now**.

### Tips on product pages

On a Sharper Image product page, the Janice button's card shows **tips** about that product, laid out like
Honey's tips panel:
- **The product:** name, picture and store, read from the page's own product data, with **Save**.
- **Price note:** a short note on the price.
- **Potential savings:** how many coupons Janice has for the store, with **Go to checkout**.
- **Price trend:** a chart of the last 30 days with **See price history**, and **Watch for price drops**.
- **Rate this tip.**
- **The gear:** Hide on this page, Snooze for 24 hours, Snooze on this site, Go to settings (see above).

Everything here stays on your device:
- **Price trend:** built from the prices Janice saw when you opened Sharper Image product pages in this Chrome.
  It starts empty and fills in as you browse.
- **Watch for price drops:** Janice compares the price when you come back to the page. It doesn't check
  prices in the background or send alerts.
- **Rewards:** shown as "Not available yet"; Janice has no rewards or cashback program.
- **Save and ratings:** kept only on this device; nothing is sent anywhere.
- **Settings page:** turn off **Remember prices of products I view**, or **Clear price history**.

### What a run does

1. Reads the checkout: applied codes, the order total and its currency, and the items in the cart.
2. Tries each candidate on its own, in the checkout's own **Discount code or gift card** field. If you already
   had a code, it is removed first so the candidate is compared alone (no stacking).
3. Waits for the checkout to finish recalculating (bounded waits), then reads the store's verdict and new total.
4. Compares totals in integer cents on the same basis (the order total, before shipping and taxes when no
   address has been entered). Your original state wins ties.
5. Leaves the best verified code applied, re-checking it first; otherwise it puts your original code back and
   checks the total matches what it was before.

The advertised discount is never used to compute savings, and the advertised minimum is never used to skip a
code: the checkout decides. Editing your cart during a run stops it and discards its comparisons.
Changing applied discount codes yourself also stops testing and preserves your edit. Batches are bounded by
the existing two-minute run limit; slower store responses may stop a batch before every code is tried.

## Permissions and data

- Host access to `sharperimage.com` for testing and the page button; the existing `shop.app` access recognizes
  supported-store checkouts there, with testing disabled until separately verified. A small script runs to show
  the button and its card, and checks field metadata for promo hints. Opening the card reads the checkout
  the way the popup does. **Try coupons** or the drawer's **Use code** starts coupon tests.
- `activeTab`: access to a tab when you click the toolbar button, so the popup can check any page (and run on the
  local Demo checkout). `scripting`: to add Janice's bundled checkout scripts to the tab when the popup or the card
  needs them. `storage`: the latest run state per tab, in session storage, cleared when the browser closes. In
  local storage: where you moved the page button and any snooze (an end time, and the stores you snoozed it on),
  and for tips, the prices of Sharper Image products you viewed (one per day, up to 90 days and 200 products),
  plus your saved items, watched prices and tip ratings. The settings page turns off price remembering and
  clears it.
- No access beyond the listed sites, no remote code, no account or backend. The drawer adapter reads the
  store's same-origin `/cart.js` to verify currency, totals, applied codes and cart identity. Coupon retrieval
  remains local. Cart notes, tokens, customer attributes and payment details are not retained.
- It does not read, store or send payment details. The run state holds codes, totals and messages, nothing personal.
- Draft codes stay in the card/popup's memory. Only codes actually being tested and their outcomes enter the
  temporary run state. Closing the card's document or popup discards its unsubmitted draft.

## Coupon data

[`data/mock-coupons.json`](data/mock-coupons.json) is the user-supplied dataset; the extension bundles a copy
in `extension/data/` (run `npm run sync:data` after editing the original; a test checks they match). Candidates
come through a provider interface ([`extension/providers/coupon-provider.js`](extension/providers/coupon-provider.js))
so a real coupon API can replace the local provider later without touching the checkout code.

## Develop and test

```sh
npm install                    # jsdom and Playwright, for the tests only
npm start                      # development build in build/: reloads itself in Chrome after each change;
                               # also serves the UI preview and Demo checkout
npm run build                  # the plain build in build/, once
npm test                       # unit and fixture tests (Node test runner + jsdom)
npx playwright install chromium
npm run test:e2e               # the built extension in Chromium against the Demo checkout
npm run demo                   # UI preview and Demo checkout on http://127.0.0.1:4300/, without building
npm run package                # dist/janice-coupons-<version>.zip, for sharing the unpacked build
npm run check:live             # live validation on sharperimage.com (see below)
```

If `npm install` fails with `EACCES` on `~/.npm`, your npm cache has root-owned files: run the
`sudo chown` command npm prints, or install with `npm --cache /tmp/npm-cache install`.

**The Demo checkout** (`fixtures/demo-checkout/`) is a simulated checkout built from the markup observed on the
real one, so the real adapter runs on it unchanged. It shows a DEMO banner, and every result Janice reports
there is labeled **Demo**. Its links switch scenarios (rejection, existing code, tie, slow store for trying
Stop, cart change, missing controls, collapsed summary, …). Fixture results are not evidence of live behavior.

**The live check** (`npm run check:live -- [scenario…] [--headed] [--evidence <dir>]`) opens a throwaway
browser profile, adds one item to a new cart on sharperimage.com, opens the real checkout, starts Janice from its
popup and records the outcome next to an independent read of the order summary. It never enters personal or
payment details and never places an order. The store rate-limits automated sessions: run a few scenarios at a
time. Automation loads a temporary build of the extension with host access to the store added, because
Playwright cannot click the toolbar button that grants `activeTab`; the extension's code is otherwise identical.

## Layout

```
extension/                  the extension's source (each build copies it to build/)
  manifest.json
  service-worker.js         injects content scripts on demand, loads candidates, keeps per-tab run state
  popup/                    toolbar popup: store, coupon cards, Try coupons, Stop, results, snooze notice
  options/                  settings page: the page button's snoozes, remembering and clearing prices
  content/
    adapters/sharper-image.js   the checkout integration (selectors and signals from the live inspection)
    launcher.js             the page button, its card and gear menu; launcher-main.js starts it on sharperimage.com
    tips.js                 tips on product pages: product, coupons, price trend, Save and Watch
    run-controller.js       baseline → serial tests → comparison → keep best or restore
    panel.js                the in-page progress/result panel
    stores.js, dom.js, main.js
  providers/                coupon-provider interface and the local provider
  shared/                   money (integer cents), comparison, shopper-facing wording, icons, snooze
  data/mock-coupons.json    bundled copy of data/mock-coupons.json
build/                      the folder to load in Chrome, from npm start or npm run build (not committed)
fixtures/demo-checkout/     Demo checkout fixture
fixtures/ui-preview/        every popup, page button and panel screen, with simulated data
tests/                      unit, fixture, build and package tests; e2e/ drives the built extension in Chromium
scripts/                    build and automatic reload, live check, fixture server, zip packaging, data sync,
                            icon generator
dist/                       zips from npm run package (not committed)
docs/                       product plan, acceptance checklist, checkout notes, test report, evidence
```

## Limitations

- Sharper Image (US) only, with the one bundled code. The adapter follows the US-English Shopify checkout markup
  observed on 2026-10-23; a redesign of that checkout could make it report “Can't test this checkout”.
- Only one existing discount code can be put back; a gift card or several codes make the checkout unsupported
  rather than risk losing them.
- Totals are compared before shipping and taxes are known unless you have already entered an address.
- Not published to the Chrome Web Store.
