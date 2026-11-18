// Lightning Address (LNURL-pay) resolution — lets a real-mode send to
// "awa@alby.com" turn into a real BOLT11 invoice to pay.
// Standard LNURL-pay flow: GET https://<domain>/.well-known/lnurlp/<name>
// -> { callback, minSendable, maxSendable, tag: "payRequest" }
// -> GET <callback>?amount=<millisats> -> { pr: "<bolt11 invoice>" }

export function parseLightningAddress(address) {
  const match = /^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i.exec((address || '').trim())
  if (!match) return null
  return { name: match[1], domain: match[2].toLowerCase() }
}

export function isLightningAddress(text) {
  return parseLightningAddress(text) !== null
}

/** Resolve a Lightning address to a BOLT11 invoice for `amountSats`. */
export async function resolveLightningAddress(address, amountSats, fetchImpl = fetch) {
  const parsed = parseLightningAddress(address)
  if (!parsed) throw new Error('Adresse Lightning invalide (exemple : awa@alby.com).')
  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    throw new Error('Montant invalide.')
  }
  const metaUrl = `https://${parsed.domain}/.well-known/lnurlp/${parsed.name}`
  const metaRes = await fetchImpl(metaUrl)
  if (!metaRes.ok) throw new Error('Adresse introuvable chez ce fournisseur.')
  const meta = await metaRes.json()
  if (meta.tag !== 'payRequest' || !meta.callback) {
    throw new Error('Ce fournisseur ne supporte pas les paiements LNURL.')
  }
  const msats = amountSats * 1000
  if (meta.minSendable && msats < meta.minSendable) {
    throw new Error(`Montant trop petit : minimum ${Math.ceil(meta.minSendable / 1000)} sats.`)
  }
  if (meta.maxSendable && msats > meta.maxSendable) {
    throw new Error(`Montant trop grand : maximum ${Math.floor(meta.maxSendable / 1000)} sats.`)
  }
  const sep = meta.callback.includes('?') ? '&' : '?'
  const invRes = await fetchImpl(`${meta.callback}${sep}amount=${msats}`)
  if (!invRes.ok) throw new Error('Le fournisseur n’a pas créé la facture.')
  const inv = await invRes.json()
  if (!inv.pr) throw new Error('Le fournisseur n’a pas renvoyé de facture.')
  return inv.pr
}

/** Very rough BOLT11 check: starts with lnbc/lntb/lnbcrt + encoded payload. */
export function looksLikeInvoice(text) {
  return /^ln(bc|tb|bcrt)1[0-9a-z]+$/i.test((text || '').trim())
}
