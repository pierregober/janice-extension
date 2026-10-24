# Recognizing Shopify checkouts on any host

Owner request (2026-10-24): Janice must account for the Shopify checkout when it is served from
`shop.app`. More generally, it should recognize "this is a Shopify checkout for a supported store" from the
page itself, whatever the host.

**Status (2026-10-24): implemented by Claude, at the owner's request.**
- `content/shopify.js` recognizes the checkout.
- `content/stores.js` matches the store by shop ID, through `SHOPIFY_CHECKOUT_HOSTS`.
- The manifest has host access to shop.app, and the page button runs on `shop.app/checkout/*`.
- Try coupons is refused there with `unverified-checkout`.
- Tests are in `tests/shopify-checkout.test.js`.

Remaining: one supervised Try coupons run on a shop.app checkout. Once the store's responses there match
sharperimage.com's, set `isTestingVerified: true` for shop.app in `content/stores.js` and record the run in
`CHECKOUT_NOTES.md`.

## Verified on the live Sharper Image checkout

Checked 2026-10-24 in Chrome for Testing 153, fresh profile, guest cart, read-only (nothing typed or clicked
on the checkout):

- `meta[name="serialized-shop"]` holds the shop as JSON, independent of the host:
  `{"id":"gid://shopify/Shop/85659779361","name":"Sharper Image","domain":"sharperimage.com",
  "myshopifyDomain":"30786c.myshopify.com","origins":["https://30786c.myshopify.com",
  "https://30786c.account.myshopify.com","https://sharperimage.com","https://www.sharperimage.com"],...}`
- Corroborating checkout markers on the same page:
  - `meta[name="generator"][content="Shopify"]`;
  - 39 `meta[name^="serialized-"]` tags, including `serialized-checkoutLayout` (`"one-page"`),
    `serialized-sourceType` (`"cn"`) and `serialized-serverRenderedRoute`;
  - `#checkout-main`;
  - `script[data-shop-id="85659779361"]` with `data-storefront-base-url="https://sharperimage.com"`;
  - scripts and module preloads under `/cdn/shopifycloud/checkout-web/`;
  - the wallet iframe at `checkout.shopify.com/85659779361/sandboxes/wallets`.
- On the storefront: `meta[data-shop-id="85659779361"]`, and `Shopify.shop` is `30786c.myshopify.com` in
  the page's own script world, which content scripts can't read.
- The Shop Pay button (`a#shop-pay-button`) links to the same-domain checkout with `payment=shop_pay`. It was
  not followed: it is a payment control.
- Other `serialized-*` tags hold session tokens, consent state and identifiers. Read only `serialized-shop`
  and the presence of the markers above, never those values.

## Verified read-only on the shop.app checkout

As a guest, `https://shop.app/checkout/85659779361/cn/<token>` only redirected to `https://sharperimage.com/`.
So it was checked on 2026-10-24 in the owner's own Chrome, signed in to Shop, through Claude in Chrome. Only
markers and structure were read; nothing was typed or clicked, and no personal data was read.

- **Automatic redirect:** for a signed-in Shop user, `https://sharperimage.com/checkout` redirects to
  `https://shop.app/checkout/85659779361/cn/<token>/en-us/shoppay`, with
  `redirect_source=checkout_automatic_redirect`. The shop ID is in the path. Many Shop Pay users will land
  here rather than on sharperimage.com.
- **Same markers:**
  - the generator meta, and a `serialized-shop` record identical to the one on sharperimage.com;
  - `serialized-checkoutLayout` is `"one-page"` and `serialized-sourceType` is `"cn"`, among 40
    `serialized-*` tags;
  - `serialized-serverRenderedRoute` is `/checkout/85659779361/cn/<token>/en-us/shoppay`;
  - `#checkout-main`, and `script[data-shop-id="85659779361"]` with storefront base URL
    `https://sharperimage.com`;
  - checkout-web assets from `cdn.shopify.com` and `shop.app`.
- **Same controls as the adapter uses on sharperimage.com:**
  - one `input[name="reductions"]` (text, labeled "Discount code or gift card", in a form, visible);
  - its Apply button, `aria-label="Apply Discount Code"`, disabled until a code is typed. The same form also
    has a generic `Submit` button, which must never be used.
  - one `MoneyLine-Heading` table with Subtotal, Shipping, Estimated taxes and Total rows. The Total cell
    holds `USD`, the shown amount and the roller copy, as the adapter expects.
  - an empty `#reduction-tags`, and header links back to `sharperimage.com/` and `/cart`.
- **Not observed on shop.app:**
  - what happens after applying or removing a code: acceptance, the rejection message, the roller settling;
  - the narrow layout;
  - restoration.

  Applying codes in the owner's real checkout wasn't authorized. Confirm with one supervised run, such as the
  owner pressing Try coupons there once, before claiming live support.

## Proposed design

1. **Recognizer** (new shared content file, e.g. `content/shopify.js`). A page is a Shopify checkout when
   `serialized-shop` parses to an id of the form `gid://shopify/Shop/<digits>`, and at least one
   corroborating marker is present: the generator meta, `#checkout-main`, or a checkout-web script. It
   returns `{ shopId, name, domain, myshopifyDomain, origins }`. It reads no other content.
2. **Stores** (`content/stores.js`):
   - Give the Sharper Image entry `shopifyShopIds: ['85659779361']`.
   - `detect()` keeps today's host rules first, then falls back to the recognizer and matches by shop ID,
     with page `checkout`. Match by ID, never by the shop's name.
   - A Shopify checkout for an unknown shop returns no store, plus the shop's name, so the UI can say
     "This Shopify store isn't supported yet" instead of "not a store".
3. **Service worker:** `isCandidateHost()` stops everything on shop.app today. Admit `shop.app` and let
   detection decide. The toolbar popup then works there through `activeTab`, with no new permission.
4. **Manifest** (owner decision: it adds a "shop.app" install warning). To show the page button on shop.app:
   - add `https://shop.app/*` to `host_permissions`;
   - add a content-script match scoped to `https://shop.app/checkout/*`.

   Do this only once the shop.app checkout is verified (AGENTS.md: extra host access only for verified
   checkout origins). Update the package tests and README's permissions section.
5. **Adapter:** the shop.app checkout uses the same controls and summary as sharperimage.com (see above), so
   `adapters/sharper-image.js` should work unchanged. Two things still gate it:
   - Today a page counts as the checkout by `checkoutPath` (`/^\/checkouts\//`) on the store's hosts. On
     shop.app it must also accept `/checkout/<shopId>/cn/<token>/...`, with the shop ID matching
     `serialized-shop`.
   - Store responses haven't been observed there yet.

   Until one supervised run confirms them, report "Sharper Image checkout recognized; automatic testing isn't
   verified here. Nothing was changed." with no Try coupons, like the existing promo-field hint.
6. **Tests:** fixture pages for:
   - the marker set on a shop.app URL;
   - an unknown shop ID;
   - `serialized-shop` without corroborating markers (not a checkout);
   - malformed JSON;
   - a non-Shopify page.

   Also check that only the shop metadata is read.

## Read-only snippet for the shop.app checkout (no personal data)

Paste into DevTools on the shop.app checkout page. It prints shop metadata, marker presence and the coupon
field's attributes only. It reads no field values or names, addresses, email or payment details.

```js
(() => {
  const meta = n => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? null
  const field = document.querySelector('input[name="reductions"]')
  return JSON.stringify({
    path: location.host + location.pathname.replace(/\/(cn|c)\/[^/]+/, '/$1/<token>'),
    generator: meta('generator'),
    shop: meta('serialized-shop'),
    layout: meta('serialized-checkoutLayout'),
    sourceType: meta('serialized-sourceType'),
    serializedCount: document.querySelectorAll('meta[name^="serialized-"]').length,
    checkoutMain: Boolean(document.getElementById('checkout-main')),
    dataShopId: document.querySelector('[data-shop-id]')?.getAttribute('data-shop-id') ?? null,
    checkoutWeb: [...document.querySelectorAll('script[src],link[rel="modulepreload"]')].some(e => /shopifycloud\/checkout-web\//.test(e.src || e.href)),
    couponField: field && { type: field.type, placeholder: field.placeholder, aria: field.getAttribute('aria-label'), inForm: Boolean(field.form) },
    summaryTables: [...document.querySelectorAll('[role="table"]')].filter(t => /^MoneyLine-Heading/.test(t.getAttribute('aria-labelledby') ?? '')).length,
    reductionTags: document.querySelectorAll('#reduction-tags button[aria-label^="Remove "]').length,
  }, null, 2)
})()
```
