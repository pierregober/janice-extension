# Sharper Image checkout research and validation

Worksheet initialized October 14, 2026. Inspection and live validation recorded October 23, 2026. Each item is
marked **Observed** (seen on the live site, with evidence), **Inferred** (a reading of what was observed) or
**Not tested**.

## Planning facts

- The user chose **United States** and **real Sharper Image checkout with local mock coupon data**.
- Official storefront: [sharperimage.com](https://sharperimage.com/). Planning notes record that `www.sharperimage.com` redirected here when checked October 14, 2026. This confirms the storefront target only.
- User-supplied candidate: `AFF15`, “Receive $15 Off Your Order when You Spend $150 or More. Enter Coupon Code: AFF15 at Checkout!”
- Expiry, exclusions, stacking rules, and whether the $150 threshold includes tax/shipping: **unknown** in the supplied data. The store decides live eligibility (see the live record: it accepted AFF15 below $150 on October 23).
- Final-action default: leave the lowest verified improving coupon applied, preserving the original on ties/worse outcomes. This is editable and was not explicitly confirmed by the user.
- `data/mock-coupons.json` was left exactly as supplied (including `checkoutIntegrationStatus` and `liveValidation`): it is provider data, and checkout outcomes are recorded here and in [TEST_REPORT.md](TEST_REPORT.md), not in the dataset.

## How the inspection was done

- **Observer:** Claude Code, automated with Playwright 1.63.0, on the owner's Mac; no person watched the runs.
- **Browsers:** inspection in the installed Google Chrome 155.0.8059.86 with a fresh temporary profile (no
  sign-in, no saved data); extension validation in Chrome for Testing 153.0.8010.12 (Playwright's Chromium,
  which, unlike branded Chrome, still loads unpacked extensions from automation).
- **Carts:** new guest carts, one or two items, built with the storefront's cart endpoints. No contact,
  delivery or payment field was ever filled; Pay now was never pressed; no order was placed.
- Network observations record request names and status codes only, never request bodies or tokens.

## Inspection record

| Item | Observed evidence / status |
| --- | --- |
| Inspection date and observer | **Observed** 2026-10-23, 07:58–09:00 UTC, Claude Code (automated). |
| Chrome version and extension build/revision | Inspection: Google Chrome 155.0.8059.86. Validation: Chrome for Testing 153.0.8010.12 with Janice Coupons 0.1.0 (uncommitted working tree; the repository had no commits). |
| Path from storefront to cart/checkout | **Observed** `/cart` redirects to `/?cart=true`, a cart drawer whose button `button[name="checkout"]` (“Checkout–$319.98”) leads to checkout. `/checkout` also redirects to the current cart's checkout. A Klaviyo sign-up dialog (`role="dialog"`, `aria-label="POPUP Form"`) can cover the drawer until closed. The drawer has its own discount field (`input[name="discount_code"]`); Janice does not use it in this version. |
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
