# Sharper Image checkout research and validation

Worksheet initialized October 14, 2026. Checkout validation recorded October 23; native cart-drawer testing
validated October 24, 2026. Each item is
marked **Observed** (seen on the live site, with evidence), **Inferred** (a reading of what was observed) or
**Not tested**.

## Product pages, for tips (2026-10-24)

Read-only, from a fresh guest session in Chrome for Testing 153, on
`/products/smartphone-photo-printer-by-sharper-image`.

- **Observed:** a `script[type="application/ld+json"]` holds a schema.org `Product`, after a JSON-LD array.
  It has `name`, `sku`, `image`, and `offers[]` with `price` (189.99), `priceCurrency` (USD) and `availability`.
  `og:price:amount` and `og:price:currency` match. `og:title` adds a marketing suffix, so it is only a
  fallback.
- **Observed:** `/products/<handle>.js` answers with the product id, the title, and each variant's price in
  cents. Tips don't use it: the page's own data needs no request.
- **Observed (later on 2026-10-24, fresh guest profile):** most of the store's own product links open the
  product inside a collection, at `/collections/<collection>/products/<handle>`: 144 of 159 product links on
  the home page and 66 of 81 on `/collections/all`. One such link from the home page was followed with a
  scripted click on the link (the store's sign-up dialog covered the page and was left open). It loaded a new
  document at `/collections/fall-essentials/products/weighted-heated-throw` (navigation type `navigate`). That
  page declares the same JSON-LD Product (`price` 169.99, `priceCurrency` USD), with `url`, `link[rel=canonical]`
  and `og:url` all at `/products/weighted-heated-throw`.
- **Janice's behavior:** tips read the JSON-LD Product (falling back to the og tags) and key prices by the
  product's handle. A product page at `/products/<handle>` and one at `/collections/<collection>/products/<handle>`
  are the same product. Tips store at most one price per day on this device.
- **Observed with Janice loaded, product inside a collection (2026-10-24):** before the fix, the button's card
  on `/collections/fall-essentials/products/weighted-heated-throw` showed the coupon view, not tips. With the
  fix, in a fresh guest profile with the built extension, the card showed tips: "Weighted Heated Throw", $169.99,
  "First price seen", 1 coupon, Save, Watch for price drops, Rate this tip (since removed) and the gear menu.
  Save kept the product under `weighted-heated-throw` at
  `https://sharperimage.com/products/weighted-heated-throw`. Only Janice's own controls were used.
- **Observed with Janice loaded (later on 2026-10-24, fresh guest profile, same page):** the tips card showed
  "Smartphone Photo Printer by Sharper Image", $189.99 and 1 coupon, and kept that day's price. The gear menu
  (Hide on this page, Snooze for 24 hours, Snooze on this site, Go to settings) opened under the gear. Snooze on
  this site hid the button, also after a reload, until the snooze was cleared. Only Janice's own controls were
  used; nothing on the store was clicked.
- **Observed with Janice loaded (later on 2026-10-24, fresh profile, the weighted throw again):** during the
  store's "Spooktacular Savings" banner (22% off $149, 15% off with no minimum, code SPOOKY), the page showed
  $132.59 "WITH CODE: SPOOKY", "Save $37.40" and "Comp. Value: $169.99". The card showed $169.99, the price in the
  page's product data, which Janice reads; SPOOKY is not among Janice's local candidates (AFF15 only). The card
  showed whole, with no rating, at 1280 × 900, 700 and 560. Only Janice's tab was hovered.

## The checkout on shop.app (shoppers signed in to Shop)

Read-only inspection on 2026-10-24, in the owner's own Chrome signed in to Shop, through Claude in Chrome.
Nothing was typed or clicked on the checkout, and no personal data was read. Details and the guest-session
probe are in `SHOPIFY_CHECKOUT_DETECTION.md`.

- **Observed:** for a signed-in Shop shopper, `https://sharperimage.com/checkout` redirects automatically to
  `https://shop.app/checkout/85659779361/cn/<token>/en-us/shoppay` (`redirect_source=checkout_automatic_redirect`).
  As a guest, the same shop.app address only redirects to the store's home page.
- **Observed:** the page names its shop in `meta[name="serialized-shop"]`, the same record as on
  sharperimage.com: `gid://shopify/Shop/85659779361`, "Sharper Image", `sharperimage.com`,
  `30786c.myshopify.com`. Other checkout markers are present too: `meta[name="generator"]` = Shopify,
  `#checkout-main`, and checkout-web scripts.
- **Observed:** the controls match sharperimage.com's:
  - `input[name="reductions"]`, labeled "Discount code or gift card", in its own form;
  - `button[aria-label="Apply Discount Code"]`. The same form also holds a generic `Submit` button, which
    Janice must never press.
  - the `MoneyLine-Heading` table (Subtotal, Shipping, Estimated taxes, Total), with `USD` in the Total cell;
  - `#reduction-tags`.
- **Not tested:** the store's responses on shop.app (acceptance, rejection message, settling), the narrow
  layout, and restoration.
- **Janice's behavior:**
  - it recognizes the Sharper Image checkout on shop.app by shop ID, and the ID in the address must agree;
  - it reads the total and shows the coupons;
  - Try coupons is refused with `unverified-checkout` until a supervised run confirms those responses (see
    `content/stores.js`).

## Native cart-drawer Apply and serial testing — October 24

**Observed with the full extension, 08:04:14–08:04:32 UTC, Chrome for Testing 153.0.8010.12:** a fresh
one-item guest cart at `https://sharperimage.com/?cart=true` began at USD $159.99 with no applied codes.
Clicking Janice's actual small **Use code** control started the shared worker/controller run. A temporary
test provider supplied `JANICETEST0`, then `AFF15`; the shipped AFF15 provider data was unchanged. The first
native Apply was rejected with “Promo code JANICETEST0 is not valid or does not meet requirements.” The
second native Apply accepted AFF15. Independent same-origin `/cart.js` readback confirmed `total_price:
14499`, currency USD and AFF15 applicable. Janice's shared result and compact feedback showed **You save
$15.00 with AFF15**, leaving AFF15 applied. A separate native Remove after evidence capture restored
`15999` with no active codes. No checkout was opened and no contact, delivery, payment or order control was
operated. No corrective guest setup retry was needed.

(Since this run, at the owner's request, **Use code** enters each code in one step, with one input event and
one change event; the drawer browser tests cover it, but it has not been re-run live.) The coupon-only trace
records animated prefixes for both candidates about 85 ms apart, exactly two Apply
clicks, no overlap and zero checkout clicks. The button changed **Use code → Stop → Try again**; no large
panel opened. [Sanitized report/screenshots](evidence/drawer-apply-2026-10-24/) retain the live placement;
compact-feedback spacing was subsequently refined and passed seven focused browser checks.
[Final spacing screenshot — Demo fixture only](evidence/drawer-apply-2026-10-24/demo-final-spacing.png) is
separate from the live redemption evidence.

| Drawer fact | Evidence / implementation boundary |
| --- | --- |
| Origin, visible surface and safe controls | **Observed:** exact origin `https://sharperimage.com`, root `#shopify-section-cart-drawer`, component `discount-code-component`, text input `input[name="discount_code"]`, dedicated Apply `button[type="button"][data-qa="promo-apply"]`. Applied-code removal is `button[type="button"][data-discount-code][data-qa^="promo-remove-"]`. Generic “Remove” text is unsafe because product removal uses that text too. Hidden/inert/`aria-hidden` ancestors and disabled controls are refused. Other origins, including unverified `shop.app`, are not enabled by a field match. |
| Accepted and rejected responses | **Observed:** both responses clear the field. Accepted AFF15 has its exact code/remove button and an Order discount row of −$15.00. Rejection is `.cart-discount-code__message__item--is-error p`, naming the requested code. `/cart.js` retains an invalid code with `applicable:false`; only `applicable:true` entries are applied codes. A previous error can remain visible while the next request starts, so it is insufficient alone. |
| Completed update | **Observed from the store's exact public `cart-drawer.js` source, then exercised by the extension run:** Apply sets `data-is-updating="true"`; section rendering replaces the component/input via `.js-cart--draw.innerHTML`. The busy flag can clear before that asynchronous render finishes. The adapter therefore requires an actual new component node, a matching requested outcome, stable UI for 600 ms and consistent fresh cart data. A reused generated input id or busy-clear alone is not completion. Waits are bounded at 20 s; missing freshness/outcomes remain unverified. |
| Authoritative amount and codes | **Observed:** `/cart.js` confirms USD `total_price` 15999 → 14499 → 15999, matching native AFF15 Apply/Remove. A reliable visible amount/currency DOM pair was not independently established for this drawer, so advertised product “with code” prices and `item.final_line_price` are not used as the comparable amount. Results are labeled **cart total**, before shipping/taxes. DOM code tags and server applicable codes must agree in both directions before mutation or a result. |
| Minimum data read | **Implemented:** exact same-origin read-only `GET /cart.js`, with bounded fetch and no-store caching. Whitelist: `currency`, `total_price`, optional `items_subtotal_price`, `discount_codes` (`code`, `applicable`) and item `variant_id`, `quantity`, `original_line_price`. Cart tokens, notes, customer attributes, contact/payment data and unrelated response fields are discarded. DOM polls do not issue API requests; a settled state uses one cart read, with an additional fresh read after animated typing and before Apply. |
| Stable cart identity and shopper edits | **Observed:** applying AFF15 changes product `data-key`/line keys. Identity therefore uses sorted variant id + quantity + original line price, excluding discount-derived keys/prices. **Implemented and fixture tested:** compare fresh identity and applied codes after typing, before clicking Apply; changes stop the run and invalidate the old comparison. A pending UI, replaced field, different draft or DOM/server code mismatch prevents Apply. |
| Original discount and field draft | **Implemented and fixture/browser tested:** capture baseline codes, cart total/currency/identity and original draft before testing. Remove/reapply only exact native coupon controls through the existing serial controller, verify the final winner or original state, and report restoration failures. Restore the original field draft only when the field is still empty or contains Janice's own value; preserve newer shopper text. Stop during typing sends no Apply, and Stop after submission first settles that update. |
| Remaining live limits | The live drawer run establishes invalid/accepted native Apply, animated entry, final savings and native Remove. Drawer Stop, repeated starts, popup closure, original-discount restoration, a second improving candidate, cart/draft edits and timeouts are fixture/browser checks. Branded Chrome, screen readers, shipping/tax after an address, other stores and stacking remain unverified. |

Native-control research and exact public-source reference are preserved in
[native-research.json](evidence/drawer-apply-2026-10-24/native-research.json). The bundled adapter is
[`sharper-image-drawer.js`](../extension/content/adapters/sharper-image-drawer.js); executable merchant code is
not downloaded or run by Janice. The source research was read-only.

## Earlier promo discovery and field-helper records

- **Historical fill-only helper, observed 2026-10-24 06:44 UTC, Chrome for Testing 153:** a fresh one-item guest cart at
  `/?cart=true` rendered the actual drawer input. Janice outlined it with the static usejanice.com hero
  rainbow and showed an 89×28px **Use code** control. No old reminder/card opened, and decoration took no
  focus. Clicking the helper filled AFF15 with one input and one change event. Store Apply and Checkout
  counters both stayed zero. This record confirms field decoration/fill at that revision only; the native
  Apply run above supersedes its earlier redemption limitation.
  [Evidence and later keyboard-check limitation](evidence/inline-coupon-2026-10-24/). The final tab-order/status
  adjustments are browser-fixture checked; a later live keyboard setup returned an empty cart and never
  reached a promo field.

- **Observed 2026-10-24 06:20 UTC, Chrome for Testing 153:** the real `#shopify-section-cart-drawer` sits inside
  `modal-dialog#modal-cart[role="dialog"]`. Closing the drawer sets `aria-hidden="true"` and `display:none` on
  that ancestor; opening removes the attribute and uses `display:flex`. Drawer classes stay unchanged. The
  input is `input[name="discount_code"]`, with generated id and label “Enter code here”, inside
  `discount-code-component > .cart-discount-code`. Its Apply button is
  `button[type="button"][data-qa="promo-apply"]`. The fresh empty cart had no promo field; a one-item guest
  cart did. No coupon was entered, Apply was not pressed, and checkout was not opened for this inspection.
- **Historical reminder, superseded:** the earlier floating reminder was tested in browser fixtures. An extension-loaded live attempt at
  06:26 UTC opened Cart after dismissing a delayed signup dialog, but the drawer did not populate its discount
  field within 30 seconds after guest-cart API setup and storefront reload. Detection never reached a visible
  live promo field in that attempt, so it does not establish reminder compatibility or a Janice failure.
  Follow the manual steps in `TEST_REPORT.md` using a cart populated through the store UI.
  [Sanitized inspection and validation evidence](evidence/cart-drawer-2026-10-24/).

- **Implemented, fixture/browser checked:** read-only field discovery uses labels, names, placeholders and ARIA
  metadata rather than requiring a checkout URL to recognize a likely promo field. Dynamically added controls
  and collapsed summaries are covered. This does not broaden the adapter's execution support.
- **Discovery versus support:** a generic Shopify drawer promo field remains only a discovery candidate.
  Automatic execution is limited to the separately verified Sharper Image drawer and checkout adapters.
- **Implemented:** optional shopper codes are combined with the provider list (20 unique codes maximum), tried
  serially only after **Try coupons** or the verified drawer's **Use code**, and reported beside the drawer
  field or in the checkout's non-modal overlay. The supplied AFF15 dataset remains
  unchanged. New validation evidence is recorded in `TEST_REPORT.md`; earlier live records below describe their
  original revisions.

## Planning facts

- The user chose **United States** and **real Sharper Image checkout with local mock coupon data**.
- Official storefront: [sharperimage.com](https://sharperimage.com/). Planning notes record that `www.sharperimage.com` redirected here when checked October 14, 2026. This confirms the storefront target only.
- User-supplied candidate: `AFF15`, “Receive $15 Off Your Order when You Spend $150 or More. Enter Coupon Code: AFF15 at Checkout!”
- Expiry, exclusions, stacking rules, and whether the $150 threshold includes tax/shipping: **unknown** in the supplied data. The store decides live eligibility (see the live record: it accepted AFF15 below $150 on October 23).
- Final-action default: leave the lowest verified improving coupon applied, preserving the original on ties/worse outcomes. This is editable and was not explicitly confirmed by the user.
- `data/mock-coupons.json` was left exactly as supplied (including `checkoutIntegrationStatus` and `liveValidation`): it is provider data, and checkout outcomes are recorded here and in [TEST_REPORT.md](TEST_REPORT.md), not in the dataset.

## How the October 23 checkout inspection was done

- **Observer:** Claude Code, automated with Playwright 1.63.0, on the owner's Mac; no person watched the runs.
- **Browsers:** inspection in the installed Google Chrome 155.0.8059.86 with a fresh temporary profile (no
  sign-in, no saved data); extension validation in Chrome for Testing 153.0.8010.12 (Playwright's Chromium,
  which, unlike branded Chrome, still loads unpacked extensions from automation).
- **Carts:** new guest carts, one or two items, built with the storefront's cart endpoints. No contact,
  delivery or payment field was ever filled; Pay now was never pressed; no order was placed.
- Network observations record request names and status codes only, never request bodies or tokens.

## October 23 checkout inspection record

| Item | Observed evidence / status |
| --- | --- |
| Inspection date and observer | **Observed** 2026-10-23, 07:58–09:00 UTC, Claude Code (automated). |
| Chrome version and extension build/revision | Inspection: Google Chrome 155.0.8059.86. Validation: Chrome for Testing 153.0.8010.12 with Janice Coupons 0.1.0 (uncommitted working tree; the repository had no commits). |
| Path from storefront to cart/checkout | **Observed** `/cart` redirects to `/?cart=true`, a cart drawer whose button `button[name="checkout"]` (“Checkout–$319.98”) leads to checkout. `/checkout` also redirects to the current cart's checkout. A Klaviyo sign-up dialog (`role="dialog"`, `aria-label="POPUP Form"`) can cover the drawer until closed. The drawer has its own discount field (`input[name="discount_code"]`); the October 23 checkout revision did not use it. Native drawer testing was added and validated October 24 as recorded above. |
| Actual checkout URL and redirected origin(s) | **Observed** `https://sharperimage.com/checkouts/cn/<token>/en-us?_r=…`, title “Checkout - Sharper Image”: Shopify's one-page checkout, same origin as the storefront. The shop is `30786c.myshopify.com`. |
| U.S. region selection and displayed currency | **Observed** shop currency USD, country US (`/meta.json`); checkout `lang="en-US"`, Country/Region defaults to United States, the Total cell shows the code `USD`, amounts are written `$1,234.56`. |
| Coupon input, apply/remove controls | **Observed** `input[name="reductions"]` (label and placeholder “Discount code or gift card”) in its own `<form>`, with `button[type=submit][aria-label="Apply Discount Code"]` (text “Apply”, disabled while the field is empty) and a hidden `aria-hidden` Submit button. Applied codes: `#reduction-tags` → `ul[role=list][aria-label="Discount code or gift card"]`, one item per code with `button[aria-label="Remove <CODE>"]`. Element ids such as `ReductionsInputPS2t_…-51` are generated and are not used. |
| Controls in frames or different origins | **Observed** the discount form and order summary are in the top document. Card fields are iframes from `https://checkout.pci.shopifyinc.com`; PayPal is an iframe from `https://checkout.shopify.com`; other frames come from `extensions.shopifycdn.com`, `cdn.shopify.com` and web-pixel sandboxes on `sharperimage.com`. Janice touches none of them; no extra host access is needed. |
| Existing coupon readback and restoration behavior | **Observed** applied codes are readable from the Remove buttons' labels; pressing Remove restores the previous total (“Discount code AFF15 has been removed”, total back to $319.98 / $149.99). An applied code **survives a page reload** (the checkout keeps it server-side), so an interrupted run can leave a test code applied. Re-entering a removed code works (live scenario restore-existing below). |
| Displayed subtotal/order total and amount type used | **Observed** “Cost summary” table: `[role=table][aria-labelledby^="MoneyLine-Heading"]`, rows of `rowheader`/`cell`: Subtotal; “Order discount” and a code row (`AFF15` · `− $15.00`, written with U+2212); Shipping; Total; “TOTAL SAVINGS $15.00”. The Subtotal does **not** change for an order discount, so Janice compares the **Total**. The Total cell holds `USD`, an `aria-hidden` copy of the amount, and an animated digit roller whose `aria-label` lags behind (still the old amount 2 s later in headless runs; animations also pause in background tabs). Janice reads the `aria-hidden` copy, which updates at once and matched the live-region announcement in every run. |
| Tax/shipping treatment and amount comparability | **Observed** before an address is entered, Shipping reads “Enter shipping address” and there is no tax row, so the Total is merchandise minus discounts. Janice records that basis and labels results “before shipping and taxes are calculated”. **Not tested:** totals after entering an address (Janice never enters one); a basis change during a run makes totals incomparable (handled, fixture-tested). |
| Coupon acceptance/rejection indicator | **Observed** accepted: a code tag with a Remove button, the Order discount row, the field cleared, and a `role="status"` announcement “Discount code AFF15 has been applied / Updated total price: 304.98 US dollars”. Rejected: the field keeps the text, gets `aria-invalid="true"`, and `aria-describedby` points to “Enter a valid discount code or gift card”; the total does not change; no announcement. |
| Reliable completed-update signal | **Observed** while the checkout recalculates (a `Proposal` GraphQL request, 0.7–0.85 s in these runs) an element in the summary carries `aria-busy="true"`; the Apply button is replaced meanwhile. Janice treats an update as complete when nothing is `aria-busy`, the outcome indicator above is present (code tag, or `aria-invalid` with a message), and the reading holds for 600 ms; it gives up after 20 s and reports “unverified”. |
| Cart-change identity/signals | **Inferred** from the “Shopping cart” table (`section[aria-label="Shopping cart"] [role=table]`: title in a `<p>`, quantity in the first cell) plus the checkout token; discounts do not change it. **Not tested live:** whether this checkout reflects a cart edit made in another tab without a reload. Cart-change handling is fixture-tested only. |
| Attempt limits, timeout, or blocking behavior | **Observed** no discount-attempt limit was hit (about 20 applications across all runs). **Observed** store-level throttling of automation: after about eight fresh automated sessions in 45 minutes, `/cart.js` and `/cart/clear.js` answered **HTTP 429** with a verification page for this machine's sessions. That affected the live-check script's cart setup, not the extension; the store's checkout messages for rate limits were never seen, so Janice's handling of them (“Too many attempts…” → stop, unverified) is fixture-tested only. |
| Narrow layout | **Observed** at 390 px the order summary (with the discount field and totals) is collapsed behind an “Order summary” disclosure (`button[aria-expanded="false"]`) and an “Add discount” toggle; expanding the disclosure reveals a visible field and Cost summary. Janice reads the hidden summary for the popup without opening it, and opens the disclosure only after Try coupons. See the live record for the extension run at this width. |
| Evidence references | Sanitized markup: [`tests/fixtures/live-summary-baseline.html`](../tests/fixtures/live-summary-baseline.html), [`tests/fixtures/live-summary-aff15.html`](../tests/fixtures/live-summary-aff15.html). Live runs: [`docs/evidence/live-2026-10-23/`](evidence/live-2026-10-23/) (one JSON report per scenario with timestamps, plus screenshots of Janice's panel and the store's Cost summary only; no personal data was ever present). |

The adapter ([`extension/content/adapters/sharper-image.js`](../extension/content/adapters/sharper-image.js)) is
built from this table; its header lists the signals it relies on.

## Live run record

Each run used a fresh profile and a fresh one-item cart; details and timestamps are in the matching JSON file
under [`docs/evidence/live-2026-10-23/`](evidence/live-2026-10-23/). Amounts are in USD minor units; “before
S&T” means the order total before shipping and taxes.

| Scenario | What it checks | Before (codes · total) | Store responses | Janice's result | Checkout afterwards (independent read) | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `apply` | AFF15 on a cart over $150; the best verified result is left applied | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed). | AFF15 · $144.99 | [apply.json](evidence/live-2026-10-23/apply.json) |
| `below-minimum` | AFF15 on a $149.99 cart; the store decides, not the advertised minimum | no code · $149.99 | AFF15 accepted → $134.99 | **You save $15.00 with AFF15** (better; restoration not-needed). | AFF15 · $134.99 | [below-minimum.json](evidence/live-2026-10-23/below-minimum.json) |
| `stop` | Stop pressed while the store is applying AFF15 | no code · $159.99 | AFF15 accepted → $144.99 (the update in flight was allowed to settle) | **Testing stopped** (stopped; restoration verified). | no code · $159.99 | [stop.json](evidence/live-2026-10-23/stop.json) |
| `repeat` | Three Try coupons requests at once | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed). Starts: ok, already-starting, already-starting. | AFF15 · $144.99 | [repeat.json](evidence/live-2026-10-23/repeat.json) |
| `reopen` | Popup closed right after Try coupons and reopened | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed). Reopened popup: “Reading your checkout…”. | AFF15 · $144.99 | [reopen.json](evidence/live-2026-10-23/reopen.json) |
| `narrow` | A 390 px wide window, where the order summary starts collapsed | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed). | AFF15 · $144.99 | [narrow.json](evidence/live-2026-10-23/narrow.json) |
| `two-codes` | AFF15 and a made-up code: a real rejection, then the winner re-applied and checked | no code · $159.99 | AFF15 accepted → $144.99; JANICETEST0 rejected (“Enter a valid discount code or gift card”) | **You save $15.00 with AFF15** (better; restoration not-needed). | AFF15 · $144.99 | [two-codes.json](evidence/live-2026-10-23/two-codes.json) |
| `restore-existing` | Shopper already applied AFF15; only the made-up code is tried; AFF15 must be put back | AFF15 · $144.99 | JANICETEST0 rejected (“Enter a valid discount code or gift card”) | **Code not accepted** (rejected; restoration verified). | AFF15 · $144.99 | [restore-existing.json](evidence/live-2026-10-23/restore-existing.json) |
| `already` | AFF15 already applied by the shopper; nothing new to try | AFF15 · $144.99 | — | **Already using the available code** (no-improvement, already-applied; restoration not-needed). | AFF15 · $144.99 | [already.json](evidence/live-2026-10-23/already.json) |
| `apply` (new interface) | The same as `apply`, after the Honey-style popup and panel redesign | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed), shown by the new panel and popup. | AFF15 · $144.99 | [apply.json](evidence/live-2026-10-23-ui/apply.json) |
| `page-button` | The page button on the home page and at checkout; Try coupons from its card | no code · $159.99 | AFF15 accepted → $144.99 | **You save $15.00 with AFF15** (better; restoration not-needed), started from the button's card, which showed the result afterwards. | AFF15 · $144.99 | [page-button.json](evidence/live-2026-10-24-page-button/page-button.json) |

Notes on these runs:

- **When and with what:** 2026-10-23, 08:36–08:53 UTC, Chrome for Testing 153.0.8010.12, Janice Coupons 0.1.0
  loaded from a temporary copy that adds host access to `https://sharperimage.com/*` (Playwright cannot click the
  toolbar button that grants `activeTab`). `apply`, `below-minimum` and `stop` each used a new cart; `repeat`
  through `narrow` shared one cart, with setup steps that used the store's own Remove button or discount field
  between scenarios; `two-codes` was run again last, on a new cart, with that day's first build. The `apply`
  (new interface) row was run at 18:58 UTC, on a new cart, after the popup and panel were redesigned; the run
  logic had not changed.
- **AFF15 was accepted every time it was tried**, including below the advertised minimum ($149.99 → $134.99).
  Observed savings were always $15.00 of the order total before shipping and taxes. No address was entered, so
  whether the discount still holds once shipping and taxes are calculated is **not tested**.
- **Opening the popup never changed the page** (`pageUnchangedByPopup: true` in every report).
- **The page button** (`page-button`, 2026-10-24 03:21 UTC, Chrome for Testing 153, a new cart, the shipped
  permissions): the button showed on the home page and at checkout, and its card counted 1 coupon on both. On the
  home page it linked to `https://sharperimage.com/checkout`, the redirecting address recorded above (the live
  check reaches the checkout through that address too; the link itself was not clicked). Opening the card at
  checkout left the page unchanged (`pageUnchangedByCard: true`), and the button was hidden while the panel was
  open (`buttonHiddenDuringPanel: true`). The live check closes the store's sign-up dialog first if it covers the
  button.
- `JANICETEST0` is a made-up code that exists only in temporary test copies of the dataset, to observe a real
  rejection; the shipped dataset contains only AFF15.
- **Throttling:** from 08:38 to 08:49 UTC the storefront's cart endpoints answered HTTP 429 to this machine's
  automated sessions. Two attempts in that window (`repeat`, `reopen`) failed while building their carts, before
  Janice ran, and were run again after the limit lifted; the reports above are the successful runs.
- Screenshots in the evidence folders show only Janice's panel or popup and the store's Cost summary, except in
  the page-button folder: the button's card over the page, and full-window views of the home page and of the
  checkout taken before anything was entered.
