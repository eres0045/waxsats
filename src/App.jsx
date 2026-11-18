import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { parseIntent, intentHint } from './lib/intent.js'
import { numberToFrenchWords } from './lib/frenchNumbers.js'
import { groqParseIntent } from './lib/groq.js'
import { createNwcWallet, isValidNwcUrl, describeNwcUrl } from './lib/nwc.js'
import { createDemoWallet } from './lib/demoWallet.js'
import { isLightningAddress, looksLikeInvoice, resolveLightningAddress } from './lib/lnurl.js'
import { isSpeechRecognitionSupported, listenOnce, speak } from './lib/speech.js'

const LS_MODE = 'waxsats.mode'
const LS_NWC = 'waxsats.nwc'
const LS_GROQ = 'waxsats.groq'
const LS_VOICE = 'waxsats.voice'

function load(key, fallback) {
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}
function save(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode */ }
}

function formatSats(n) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function App() {
  const [screen, setScreen] = useState('home') // home | send | receive | history | settings
  const [mode, setMode] = useState(() => load(LS_MODE, 'demo'))
  const [nwcUrl, setNwcUrl] = useState(() => load(LS_NWC, ''))
  const [groqKey, setGroqKey] = useState(() => load(LS_GROQ, ''))
  const [voiceOn, setVoiceOn] = useState(() => load(LS_VOICE, 'on') === 'on')

  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(null) // {title, detail}

  // Send flow state
  const [sendAmount, setSendAmount] = useState('')
  const [sendTo, setSendTo] = useState('')
  const [confirming, setConfirming] = useState(null) // {amount, recipient}

  // Receive flow state
  const [receiveAmount, setReceiveAmount] = useState('')
  const [invoice, setInvoice] = useState(null) // {invoice, paymentHash}
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [testResult, setTestResult] = useState('')

  const demoWalletRef = useRef(null)
  if (!demoWalletRef.current) demoWalletRef.current = createDemoWallet()

  const wallet = useMemo(() => {
    if (mode === 'real' && isValidNwcUrl(nwcUrl)) {
      try {
        return createNwcWallet(nwcUrl)
      } catch {
        return null
      }
    }
    return demoWalletRef.current
  }, [mode, nwcUrl])

  const isDemo = mode === 'demo' || !wallet || wallet.kind === 'demo'
  const voiceSupported = isSpeechRecognitionSupported()

  const say = useCallback((text) => {
    if (voiceOn) void speak(text)
  }, [voiceOn])

  const refreshBalance = useCallback(async () => {
    if (!wallet) return
    setBalanceLoading(true)
    try {
      const b = await wallet.getBalance()
      setBalance(b)
    } catch (e) {
      setError(`Impossible de lire le solde : ${e.message}`)
    } finally {
      setBalanceLoading(false)
    }
  }, [wallet])

  const refreshHistory = useCallback(async () => {
    if (!wallet?.getHistory) { setHistory([]); return }
    try {
      setHistory(await wallet.getHistory())
    } catch {
      setHistory([])
    }
  }, [wallet])

  useEffect(() => { void refreshBalance() }, [refreshBalance])
  useEffect(() => { if (screen === 'history') void refreshHistory() }, [screen, refreshHistory])

  useEffect(() => { save(LS_MODE, mode) }, [mode])
  useEffect(() => { save(LS_NWC, nwcUrl) }, [nwcUrl])
  useEffect(() => { save(LS_GROQ, groqKey) }, [groqKey])
  useEffect(() => { save(LS_VOICE, voiceOn ? 'on' : 'off') }, [voiceOn])

  // ---- Voice command handling ----
  const handleCommand = useCallback(async (text) => {
    setHeard(text)
    setError('')
    setSuccess(null)
    let intent = parseIntent(text)
    // Groq LLM as a second opinion when the local parse is unsure.
    if (groqKey && intent.confidence < 0.85) {
      try {
        const g = await groqParseIntent(text, groqKey)
        if (g.action !== 'unknown') intent = { ...g, source: 'groq' }
      } catch {
        // Local parse stands; Groq is only a bonus.
      }
    }

    if (intent.action === 'balance') {
      await refreshBalance()
      const b = balance ?? (await wallet?.getBalance?.().catch(() => null))
      if (b !== null && b !== undefined) {
        say(`Ton solde est de ${formatSats(b)} sats.`)
      }
      setScreen('home')
      return
    }
    if (intent.action === 'receive') {
      if (intent.amount_sats) setReceiveAmount(String(intent.amount_sats))
      setScreen('receive')
      return
    }
    if (intent.action === 'send') {
      if (intent.amount_sats) setSendAmount(String(intent.amount_sats))
      if (intent.recipient) setSendTo(intent.recipient)
      setScreen('send')
      if (intent.amount_sats === null || !intent.recipient) {
        setHint(intentHint(intent))
      }
      return
    }
    setHint(intentHint(intent))
  }, [groqKey, balance, wallet, refreshBalance, say])

  const onMic = useCallback(async () => {
    setError('')
    setHint('')
    if (!voiceSupported) {
      setHint('La voix ne marche pas sur ce navigateur. Écris ta commande ci-dessous.')
      return
    }
    setListening(true)
    try {
      const text = await listenOnce()
      await handleCommand(text)
    } catch (e) {
      setError(e.message)
    } finally {
      setListening(false)
    }
  }, [voiceSupported, handleCommand])

  // ---- Send flow ----
  const startConfirm = () => {
    setError('')
    const amount = parseInt(String(sendAmount).replace(/\s/g, ''), 10)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Mets un montant en sats, par exemple 500.')
      return
    }
    if (!sendTo.trim()) {
      setError('À qui ? Écris un nom, une adresse Lightning ou colle une facture.')
      return
    }
    setConfirming({ amount, recipient: sendTo.trim() })
  }

  const doSend = async () => {
    if (!confirming || !wallet) return
    setBusy(true)
    setError('')
    try {
      if (isDemo) {
        await wallet.payInvoice(`lntb1demo${confirming.amount}p1waxsats`, {
          amount_sats: confirming.amount,
          counterparty: confirming.recipient,
          memo: 'Envoi vocal WaxSats',
        })
      } else {
        let invoiceToPay = confirming.recipient
        if (isLightningAddress(confirming.recipient)) {
          invoiceToPay = await resolveLightningAddress(confirming.recipient, confirming.amount)
        } else if (!looksLikeInvoice(confirming.recipient)) {
          throw new Error('En mode réel, colle une facture Lightning ou une adresse du type nom@alby.com.')
        }
        await wallet.payInvoice(invoiceToPay)
      }
      await refreshBalance()
      await refreshHistory()
      setSuccess({
        title: 'Envoyé !',
        detail: `${formatSats(confirming.amount)} sats à ${confirming.recipient}`,
      })
      say(`Envoyé. ${formatSats(confirming.amount)} sats à ${confirming.recipient}. Jërejëf !`)
      setConfirming(null)
      setSendAmount('')
      setSendTo('')
      setScreen('home')
    } catch (e) {
      setError(`Échec de l’envoi : ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // ---- Receive flow ----
  const createInvoice = async () => {
    setError('')
    const amount = parseInt(String(receiveAmount).replace(/\s/g, ''), 10)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Mets un montant en sats, par exemple 1000.')
      return
    }
    if (!wallet) {
      setError('Connecte ton portefeuille dans Réglages, ou reste en mode démo.')
      return
    }
    setBusy(true)
    try {
      const inv = await wallet.makeInvoice(amount, 'WaxSats — paiement reçu')
      setInvoice(inv)
      try {
        setQrDataUrl(await QRCode.toDataURL(inv.invoice, { width: 320, margin: 1 }))
      } catch {
        setQrDataUrl('')
      }
      say(`Facture créée pour ${formatSats(amount)} sats. Montre le code à la personne.`)
    } catch (e) {
      setError(`Impossible de créer la facture : ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const testNwc = async () => {
    setTestResult('')
    setError('')
    if (!isValidNwcUrl(nwcUrl)) {
      setError('Adresse NWC invalide. Elle doit commencer par nwc://')
      return
    }
    setBusy(true)
    try {
      const w = createNwcWallet(nwcUrl)
      const b = await w.getBalance()
      const d = describeNwcUrl(nwcUrl)
      setTestResult(`Connecté ! Solde testnet : ${formatSats(b)} sats (relais ${d.relayHost}).`)
    } catch (e) {
      setError(`Connexion échouée : ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const goHome = () => { setScreen('home'); setError(''); setHint(''); setSuccess(null); setConfirming(null) }

  return (
    <div className="min-h-screen bg-[#0c1a12] text-[#f2f7f3]">
      <div className="mx-auto w-full max-w-md px-4 pb-10 pt-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button onClick={goHome} className="flex items-center gap-2" aria-label="Accueil WaxSats">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-400 text-2xl" aria-hidden>⚡</span>
            <span className="text-2xl font-black tracking-tight">WaxSats</span>
          </button>
          <button
            onClick={() => setScreen('settings')}
            className="rounded-full border border-white/20 px-3 py-2 text-lg"
            aria-label="Réglages"
          >
            ⚙️
          </button>
        </header>

        {/* Mode badge — always visible, honest about what moves */}
        <div className={`mt-3 rounded-xl px-4 py-3 text-center text-base font-bold ${isDemo ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>
          {isDemo
            ? '🟡 DÉMO — aucun vrai sat ne bouge'
            : '🟢 TESTNET — vrais sats de test, jamais mainnet'}
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-xl bg-red-500/20 px-4 py-3 text-base font-semibold text-red-200">
            {error}
          </div>
        )}

        {screen === 'home' && (
          <HomeScreen
            balance={balance}
            balanceLoading={balanceLoading}
            onRefresh={refreshBalance}
            listening={listening}
            voiceSupported={voiceSupported}
            onMic={onMic}
            heard={heard}
            hint={hint}
            onCommand={handleCommand}
            goSend={() => { setScreen('send'); setSuccess(null) }}
            goReceive={() => { setScreen('receive'); setSuccess(null) }}
            goHistory={() => setScreen('history')}
            success={success}
            say={say}
          />
        )}

        {screen === 'send' && (
          <SendScreen
            amount={sendAmount}
            setAmount={setSendAmount}
            to={sendTo}
            setTo={setSendTo}
            hint={hint}
            heard={heard}
            listening={listening}
            voiceSupported={voiceSupported}
            onMic={onMic}
            onConfirm={startConfirm}
            confirming={confirming}
            onDoSend={doSend}
            onCancelConfirm={() => setConfirming(null)}
            busy={busy}
            isDemo={isDemo}
            onBack={goHome}
          />
        )}

        {screen === 'receive' && (
          <ReceiveScreen
            amount={receiveAmount}
            setAmount={setReceiveAmount}
            onCreate={createInvoice}
            busy={busy}
            invoice={invoice}
            qrDataUrl={qrDataUrl}
            isDemo={isDemo}
            onBack={goHome}
          />
        )}

        {screen === 'history' && (
          <HistoryScreen history={history} onBack={goHome} />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            mode={mode}
            setMode={setMode}
            nwcUrl={nwcUrl}
            setNwcUrl={setNwcUrl}
            groqKey={groqKey}
            setGroqKey={setGroqKey}
            voiceOn={voiceOn}
            setVoiceOn={setVoiceOn}
            onTestNwc={testNwc}
            testResult={testResult}
            busy={busy}
            onBack={goHome}
          />
        )}

        <footer className="mt-8 text-center text-sm text-white/50">
          WaxSats — Dakar Bitcoin Hack 2026 · Bitcoin testnet uniquement · Les clés restent dans ton navigateur.
        </footer>
      </div>
    </div>
  )
}

function HomeScreen({ balance, balanceLoading, onRefresh, listening, voiceSupported, onMic, heard, hint, onCommand, goSend, goReceive, goHistory, success, say }) {
  const [typed, setTyped] = useState('')
  return (
    <main>
      <p className="mt-5 text-center text-xl text-white/80">Salaam maalekum 👋</p>

      {/* Balance — huge numbers, voice readout */}
      <section className="mt-2 rounded-3xl bg-white/5 px-4 py-6 text-center" aria-label="Solde">
        <p className="text-lg text-white/70">Ton solde</p>
        <p className="mt-1 text-6xl font-black tracking-tight" data-testid="balance">
          {balanceLoading ? '…' : balance === null ? '—' : formatSats(balance)}
          <span className="ml-2 text-2xl font-bold text-yellow-400">sats</span>
        </p>
        <div className="mt-3 flex justify-center gap-3">
          <button onClick={onRefresh} className="rounded-full border border-white/20 px-4 py-2 text-base font-semibold" aria-label="Actualiser le solde">
            🔄 Actualiser
          </button>
          <button
            onClick={() => balance !== null && say(`Ton solde est de ${formatSats(balance)} sats.`)}
            className="rounded-full border border-white/20 px-4 py-2 text-base font-semibold"
            aria-label="Écouter le solde"
          >
            🔊 Écouter
          </button>
        </div>
      </section>

      {success && (
        <div role="status" className="mt-4 rounded-2xl bg-emerald-500/20 px-4 py-4 text-center">
          <p className="text-2xl font-black text-emerald-300">{success.title}</p>
          <p className="mt-1 text-lg">{success.detail}</p>
          <p className="mt-1 text-base text-white/70">Jërejëf — merci !</p>
        </div>
      )}

      {/* Big mic — the main interaction */}
      <section className="mt-6 text-center">
        <button
          onClick={onMic}
          disabled={listening}
          aria-label="Parler — donne une commande vocale"
          className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-yellow-400 text-5xl text-black ${listening ? 'mic-pulse' : ''}`}
        >
          {listening ? '🎙️' : '🎤'}
        </button>
        <p className="mt-3 text-xl font-bold">
          {listening ? 'J’écoute…' : 'Touche et parle'}
        </p>
        <p className="text-base text-white/60">
          {voiceSupported
            ? 'Dis par exemple : « Envoie 500 sats à Awa »'
            : 'Voix non disponible ici — écris ta commande ci-dessous.'}
        </p>
      </section>

      {heard && (
        <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-center text-lg" data-testid="heard">
          J’ai entendu : « {heard} »
        </p>
      )}
      {hint && (
        <p className="mt-3 rounded-xl bg-amber-400/10 px-4 py-3 text-center text-base text-amber-200" data-testid="hint">
          {hint}
        </p>
      )}

      {/* Typed command fallback */}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void onCommand(typed.trim()) }}
      >
        <label htmlFor="typed-command" className="sr-only">Écris ta commande en français</label>
        <input
          id="typed-command"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Écris : Envoie 500 sats à Awa"
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-lg placeholder:text-white/40"
        />
        <button type="submit" className="rounded-xl bg-yellow-400 px-5 py-3 text-lg font-bold text-black">
          OK
        </button>
      </form>

      {/* Quick actions */}
      <nav className="mt-6 grid grid-cols-3 gap-3" aria-label="Actions">
        <button onClick={goSend} className="btn-big bg-emerald-500 text-white">📤<br />Envoyer</button>
        <button onClick={goReceive} className="btn-big bg-sky-600 text-white">📥<br />Recevoir</button>
        <button onClick={goHistory} className="btn-big bg-white/10 text-white">📜<br />Historique</button>
      </nav>
    </main>
  )
}

function SendScreen({ amount, setAmount, to, setTo, hint, heard, listening, voiceSupported, onMic, onConfirm, confirming, onDoSend, onCancelConfirm, busy, isDemo, onBack }) {
  return (
    <main>
      <button onClick={onBack} className="mt-4 text-lg text-white/70" aria-label="Retour à l’accueil">← Accueil</button>
      <h1 className="mt-2 text-3xl font-black">Envoyer des sats</h1>

      {heard && <p className="mt-3 rounded-xl bg-white/5 px-4 py-3 text-lg">J’ai entendu : « {heard} »</p>}
      {hint && <p className="mt-3 rounded-xl bg-amber-400/10 px-4 py-3 text-base text-amber-200">{hint}</p>}

      {!confirming ? (
        <>
          <div className="mt-5 text-center">
            <button
              onClick={onMic}
              disabled={listening || !voiceSupported}
              aria-label="Dicter l’envoi"
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl text-black ${listening ? 'mic-pulse' : ''}`}
            >
              🎤
            </button>
            <p className="mt-2 text-base text-white/60">
              {voiceSupported ? 'Ou dicte : « Envoie 500 sats à Awa »' : 'Écris les détails ci-dessous.'}
            </p>
          </div>

          <label className="mt-5 block text-lg font-bold" htmlFor="send-amount">Montant (sats)</label>
          <input
            id="send-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d ]/g, ''))}
            placeholder="500"
            className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-2xl font-bold placeholder:text-white/30"
          />

          <label className="mt-4 block text-lg font-bold" htmlFor="send-to">
            {isDemo ? 'À qui ? (nom)' : 'À qui ? (nom, adresse Lightning ou facture)'}
          </label>
          <input
            id="send-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={isDemo ? 'Awa' : 'awa@alby.com ou lnbc…'}
            className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-xl placeholder:text-white/30"
          />
          {!isDemo && (
            <p className="mt-2 text-sm text-white/60">
              En mode réel, un simple nom ne suffit pas : colle la facture Lightning de la personne, ou son adresse du type nom@alby.com.
            </p>
          )}

          <button onClick={onConfirm} className="btn-big mt-6 w-full bg-yellow-400 text-black">
            Vérifier →
          </button>
        </>
      ) : (
        <section className="mt-6 rounded-3xl bg-white/5 px-5 py-6 text-center" aria-label="Confirmation">
          <p className="text-xl text-white/70">Tu envoies</p>
          <p className="mt-2 text-6xl font-black text-yellow-400" data-testid="confirm-amount">
            {formatSats(confirming.amount)} <span className="text-2xl">sats</span>
          </p>
          <p className="mt-2 text-xl italic text-white/80">
            ({numberToFrenchWords(confirming.amount)} sats)
          </p>
          <p className="mt-4 text-2xl font-bold">à {confirming.recipient}</p>
          {isDemo && <p className="mt-2 text-sm text-amber-300">Mode démo — aucun vrai sat ne bouge.</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={onCancelConfirm} className="btn-big bg-white/10">Annuler</button>
            <button onClick={onDoSend} disabled={busy} className="btn-big bg-emerald-500 text-white">
              {busy ? '…' : '✅ Confirmer'}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function ReceiveScreen({ amount, setAmount, onCreate, busy, invoice, qrDataUrl, isDemo, onBack }) {
  return (
    <main>
      <button onClick={onBack} className="mt-4 text-lg text-white/70" aria-label="Retour à l’accueil">← Accueil</button>
      <h1 className="mt-2 text-3xl font-black">Recevoir des sats</h1>

      <label className="mt-5 block text-lg font-bold" htmlFor="receive-amount">Montant à recevoir (sats)</label>
      <input
        id="receive-amount"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d ]/g, ''))}
        placeholder="1000"
        className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-2xl font-bold placeholder:text-white/30"
      />
      <button onClick={onCreate} disabled={busy} className="btn-big mt-4 w-full bg-yellow-400 text-black">
        {busy ? '…' : 'Créer la facture ⚡'}
      </button>

      {invoice && (
        <section className="mt-6 rounded-3xl bg-white/5 px-5 py-6 text-center" aria-label="Facture">
          {isDemo && <p className="mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-base font-bold text-amber-300">Facture démo — ne paie rien de réel avec.</p>}
          {qrDataUrl && (
            <img src={qrDataUrl} alt="Code QR de la facture Lightning" className="mx-auto h-64 w-64 rounded-2xl bg-white p-2" />
          )}
          <p className="mt-4 break-all rounded-xl bg-black/40 px-3 py-3 text-left font-mono text-sm text-white/80">
            {invoice.invoice}
          </p>
          <button
            onClick={() => navigator.clipboard?.writeText(invoice.invoice).catch(() => {})}
            className="mt-3 rounded-full border border-white/20 px-4 py-2 text-base font-semibold"
          >
            📋 Copier la facture
          </button>
        </section>
      )}
    </main>
  )
}

function HistoryScreen({ history, onBack }) {
  return (
    <main>
      <button onClick={onBack} className="mt-4 text-lg text-white/70" aria-label="Retour à l’accueil">← Accueil</button>
      <h1 className="mt-2 text-3xl font-black">Historique</h1>
      {history.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white/5 px-4 py-6 text-center text-lg text-white/70">
          Rien pour l’instant.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-4">
              <div>
                <p className="text-lg font-bold">
                  {h.type === 'send' ? '📤 Envoyé à' : '📥 Reçu de'} {h.counterparty || '—'}
                </p>
                <p className="text-sm text-white/60">{h.memo || ''} · {formatDate(h.at)} · {h.status}</p>
              </div>
              <p className={`text-xl font-black ${h.type === 'send' ? 'text-red-300' : 'text-emerald-300'}`}>
                {h.type === 'send' ? '−' : '+'}{formatSats(h.amount_sats)} sats
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function SettingsScreen({ mode, setMode, nwcUrl, setNwcUrl, groqKey, setGroqKey, voiceOn, setVoiceOn, onTestNwc, testResult, busy, onBack }) {
  return (
    <main>
      <button onClick={onBack} className="mt-4 text-lg text-white/70" aria-label="Retour à l’accueil">← Accueil</button>
      <h1 className="mt-2 text-3xl font-black">Réglages</h1>

      <section className="mt-5 rounded-2xl bg-white/5 px-4 py-4">
        <h2 className="text-xl font-bold">Mode</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('demo')}
            aria-pressed={mode === 'demo'}
            className={`rounded-xl px-3 py-4 text-lg font-bold ${mode === 'demo' ? 'bg-amber-400 text-black' : 'bg-white/10'}`}
          >
            🟡 Démo
          </button>
          <button
            onClick={() => setMode('real')}
            aria-pressed={mode === 'real'}
            className={`rounded-xl px-3 py-4 text-lg font-bold ${mode === 'real' ? 'bg-emerald-500 text-white' : 'bg-white/10'}`}
          >
            🟢 Réel (testnet)
          </button>
        </div>
        <p className="mt-3 text-base text-white/70">
          Démo : tout est simulé, aucun vrai sat ne bouge — parfait pour essayer la voix.
          Réel : ton vrai portefeuille testnet, via Nostr Wallet Connect. Jamais mainnet.
        </p>
      </section>

      <section className="mt-5 rounded-2xl bg-white/5 px-4 py-4">
        <h2 className="text-xl font-bold">Ton portefeuille (testnet)</h2>
        <p className="mt-1 text-base text-white/70">
          Colle ton adresse NWC (nwc://…) depuis Alby, Mutiny ou Zeus. Elle reste dans ce navigateur uniquement.
        </p>
        <label className="sr-only" htmlFor="nwc-url">Adresse Nostr Wallet Connect</label>
        <input
          id="nwc-url"
          type="password"
          value={nwcUrl}
          onChange={(e) => setNwcUrl(e.target.value.trim())}
          placeholder="nwc://…"
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 font-mono text-base placeholder:text-white/30"
        />
        <button onClick={onTestNwc} disabled={busy} className="mt-3 w-full rounded-xl bg-white/10 px-4 py-3 text-lg font-bold">
          {busy ? '…' : 'Tester la connexion'}
        </button>
        {testResult && <p role="status" className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-base text-emerald-200">{testResult}</p>}
      </section>

      <section className="mt-5 rounded-2xl bg-white/5 px-4 py-4">
        <h2 className="text-xl font-bold">Clé Groq (optionnel)</h2>
        <p className="mt-1 text-base text-white/70">
          Sans clé, tout marche déjà : la voix du navigateur + le parseur français local.
          Avec ta clé Groq, la compréhension devient plus fine (LLM) et la transcription Whisper prend le relais si ton navigateur n’a pas de reconnaissance vocale.
        </p>
        <label className="sr-only" htmlFor="groq-key">Clé API Groq</label>
        <input
          id="groq-key"
          type="password"
          value={groqKey}
          onChange={(e) => setGroqKey(e.target.value.trim())}
          placeholder="gsk_…"
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 font-mono text-base placeholder:text-white/30"
        />
      </section>

      <section className="mt-5 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-4">
        <div>
          <h2 className="text-xl font-bold">Réponses vocales</h2>
          <p className="text-base text-white/70">L’app te répond à voix haute en français.</p>
        </div>
        <button
          onClick={() => setVoiceOn(!voiceOn)}
          aria-pressed={voiceOn}
          aria-label="Activer ou couper les réponses vocales"
          className={`rounded-full px-5 py-3 text-lg font-bold ${voiceOn ? 'bg-emerald-500' : 'bg-white/10'}`}
        >
          {voiceOn ? '🔊 Oui' : '🔇 Non'}
        </button>
      </section>

      <p className="mt-5 text-sm text-white/50">
        Sécurité : tes clés ne quittent jamais ce navigateur. WaxSats ne touche que le testnet Bitcoin — aucun vrai bitcoin, jamais.
      </p>
    </main>
  )
}
