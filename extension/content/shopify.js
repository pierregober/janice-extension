/*
 * Recognizes a Shopify checkout from the page itself, whatever its host.
 * Shopify's checkout names its shop in meta[name="serialized-shop"]: JSON
 * with the id gid://shopify/Shop/<digits>, the name, the store's domain, its
 * myshopify.com domain and origins. Observed on sharperimage.com and on
 * shop.app on 2026-10-24 (docs/CHECKOUT_NOTES.md). The record counts only
 * next to another checkout marker. Only that record is parsed: the other
 * serialized-* tags hold session tokens and consent state, and are never
 * read.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const SHOP_GID = /^gid:\/\/shopify\/Shop\/(\d+)$/
  // Each was present on both hosts; one is enough alongside the shop record.
  const CHECKOUT_MARKERS = [
    'meta[name="generator"][content="Shopify"]',
    '#checkout-main',
    'script[src*="/shopifycloud/checkout-web/"], link[rel="modulepreload"][href*="/shopifycloud/checkout-web/"]',
  ]

  const text = value => (typeof value === 'string' ? value : null)

  /** The shop a Shopify checkout page belongs to ({ id, name, domain, myshopifyDomain, origins }), or null. */
  function recognize(document) {
    const record = document?.querySelector('meta[name="serialized-shop"]')?.getAttribute('content')
    if (!record || !CHECKOUT_MARKERS.some(selector => document.querySelector(selector))) return null

    let shop
    try {
      shop = JSON.parse(record)
    } catch {
      return null
    }
    const id = SHOP_GID.exec(text(shop?.id) ?? '')?.[1]
    if (!id) return null
    return {
      id,
      name: text(shop.name),
      domain: text(shop.domain),
      myshopifyDomain: text(shop.myshopifyDomain),
      origins: Array.isArray(shop.origins) ? shop.origins.filter(origin => typeof origin === 'string') : [],
    }
  }

  Janice.shopify = { recognize }

  if (typeof module === 'object' && module.exports) module.exports = Janice.shopify
})(typeof globalThis === 'object' ? globalThis : this)
