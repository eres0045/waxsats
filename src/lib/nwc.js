// Nostr Wallet Connect (NIP-47) adapter — REAL testnet Lightning.
// The user pastes their own nwc:// connection string (from Alby, Mutiny,
// Zeus, etc.). It is stored only in their browser localStorage and used
// only to talk to their own wallet over its relay. No wallet string is ever
// hardcoded, no mainnet anywhere — testnet only.
//
// The @getalby/sdk NWCClient does the Nostr cryptography (NIP-47 request/
// response events over the wallet's relay). For tests, pass a mock
// clientFactory — no network is touched.

export function isValidNwcUrl(url) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('nwc://')) return false
  try {
    const rest = trimmed.slice('nwc://'.length)
    const [pubkey, query] = rest.split('?')
    if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) return false
    const params = new URLSearchParams(query || '')
    return Boolean(params.get('relay') && params.get('secret'))
  } catch {
    return false
  }
}

/** Human-readable summary of an NWC URL (relay host + optional lud16). Never shows the secret. */
export function describeNwcUrl(url) {
  try {
    const rest = url.trim().slice('nwc://'.length)
    const [, query] = rest.split('?')
    const params = new URLSearchParams(query || '')
    const relay = params.get('relay') || ''
    const host = relay.replace(/^wss?:\/\//, '').split('/')[0]
    const lud16 = params.get('lud16') || ''
    return { relayHost: host, lud16 }
  } catch {
    return { relayHost: '', lud16: '' }
  }
}

async function defaultClientFactory(nwcUrl) {
  const { NWCClient } = await import('@getalby/sdk')
  return new NWCClient({ nostrWalletConnectUrl: nwcUrl })
}

/**
 * Create a wallet backed by a real NWC connection.
 * `clientFactory` is injectable so tests can pass a mock client.
 */
export function createNwcWallet(nwcUrl, { clientFactory = defaultClientFactory } = {}) {
  if (!isValidNwcUrl(nwcUrl)) {
    throw new Error('Adresse NWC invalide. Colle une adresse qui commence par nwc://')
  }
  let client = null

  async function ensureClient() {
    if (!client) {
      client = await clientFactory(nwcUrl.trim())
    }
    return client
  }

  return {
    kind: 'nwc',
    /** Balance in sats (testnet). */
    async getBalance() {
      const c = await ensureClient()
      const info = await c.getBalance()
      return Number(info.balance)
    },
    /** Create a Lightning invoice for `amountSats`. Returns { invoice, paymentHash }. */
    async makeInvoice(amountSats, memo = 'WaxSats') {
      const c = await ensureClient()
      const res = await c.makeInvoice({ amount: amountSats, description: memo })
      return { invoice: res.invoice, paymentHash: res.payment_hash }
    },
    /** Pay a BOLT11 invoice. Returns { preimage }. */
    async payInvoice(invoice) {
      const c = await ensureClient()
      const res = await c.payInvoice({ invoice })
      return { preimage: res.preimage }
    },
    /** Look up an invoice by payment hash (for receive confirmation). */
    async lookupInvoice(paymentHash) {
      const c = await ensureClient()
      return c.lookupInvoice({ payment_hash: paymentHash })
    },
    /** Recent transactions, normalized to our history shape (amounts in sats). */
    async getHistory({ limit = 20 } = {}) {
      const c = await ensureClient()
      const res = await c.listTransactions({ limit })
      const txs = res.transactions || []
      return txs.map((tx) => ({
        id: tx.payment_hash || tx.invoice || `${tx.created_at}`,
        type: tx.type === 'incoming' ? 'receive' : 'send',
        amount_sats: Math.round((tx.amount || 0) / 1000),
        counterparty: tx.description || '',
        memo: tx.description || '',
        at: tx.settled_at
          ? new Date(tx.settled_at * 1000).toISOString()
          : new Date((tx.created_at || 0) * 1000).toISOString(),
        status: tx.state === 'settled' ? 'confirmé' : tx.state,
      }))
    },
    describe: () => describeNwcUrl(nwcUrl),
  }
}
