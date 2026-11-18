import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../src/App.jsx'

describe('WaxSats app — demo mode flows', () => {
  it('shows the demo badge and the seeded demo balance', async () => {
    render(<App />)
    expect(screen.getByText(/DÉMO — aucun vrai sat ne bouge/)).toBeInTheDocument()
    const balance = await screen.findByTestId('balance')
    expect(balance).toHaveTextContent('12 500')
  })

  it('typed French command routes to the send screen prefilled', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    const input = screen.getByLabelText(/Écris ta commande en français/i)
    fireEvent.change(input, { target: { value: 'Envoie 500 sats à Awa' } })
    fireEvent.submit(input.closest('form'))
    // Send screen: amount + recipient prefilled from the voice command.
    await waitFor(() => {
      expect(screen.getByLabelText(/Montant \(sats\)/)).toHaveValue('500')
    })
    expect(screen.getByLabelText(/À qui/)).toHaveValue('Awa')
  })

  it('full demo send flow: confirm screen shows amount in words, then success, balance drops', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/i }))
    fireEvent.change(screen.getByLabelText(/Montant \(sats\)/), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/À qui/), { target: { value: 'Awa' } })
    fireEvent.click(screen.getByRole('button', { name: /Vérifier/i }))

    const confirmAmount = await screen.findByTestId('confirm-amount')
    expect(confirmAmount).toHaveTextContent('500')
    expect(screen.getByText('(cinq cents sats)')).toBeInTheDocument()
    expect(screen.getByText('à Awa')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirmer/i }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Envoyé !')
    })
    // Back home: balance went from 12 500 to 12 000.
    fireEvent.click(screen.getByRole('button', { name: /Accueil WaxSats/i }))
    const balance = await screen.findByTestId('balance')
    expect(balance).toHaveTextContent('12 000')
  })

  it('send without amount shows a French error, not a crash', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/i }))
    fireEvent.click(screen.getByRole('button', { name: /Vérifier/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mets un montant')
  })

  it('receive flow creates a demo invoice and shows it', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByRole('button', { name: /Recevoir/i }))
    fireEvent.change(screen.getByLabelText(/Montant à recevoir/), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /Créer la facture/i }))
    const section = await screen.findByLabelText('Facture')
    expect(within(section).getByText(/Facture démo/)).toBeInTheDocument()
    expect(within(section).getByText(/lntb1demo1000/)).toBeInTheDocument()
  })

  it('history shows the seeded demo entries', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByRole('button', { name: /Historique/i }))
    expect(await screen.findByText(/Envoyé à Moussa/)).toBeInTheDocument()
    expect(screen.getByText(/Reçu de Awa/)).toBeInTheDocument()
  })

  it('settings lets you switch to real mode and back', async () => {
    render(<App />)
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByRole('button', { name: /Réglages/i }))
    fireEvent.click(screen.getByRole('button', { name: /Réel \(testnet\)/i }))
    expect(screen.getByText(/Ton portefeuille \(testnet\)/)).toBeInTheDocument()
    // Without a valid NWC URL the app stays on the demo wallet.
    expect(screen.getByText(/DÉMO — aucun vrai sat ne bouge/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Démo/i }))
    expect(screen.getByText(/DÉMO — aucun vrai sat ne bouge/)).toBeInTheDocument()
  })
})
