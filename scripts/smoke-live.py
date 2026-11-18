"""WaxSats live smoke test: real Chromium against the deployed GitHub Pages demo.

Run: node ~/workspace/tmp-connect-fwd.mjs (in one shell), then:
  ~/workspace/.venvs/pw/bin/python /tmp/waxsats-smoke.py
"""
import json
import re
from playwright.sync_api import sync_playwright

URL = "https://eres0045.github.io/waxsats/"

def norm(s):
    # fr-FR Intl uses narrow no-break space (U+202F) as thousands separator.
    return s.replace("\u202f", " ").replace("\u00a0", " ")

with sync_playwright() as p:
    browser = p.chromium.launch(
        proxy={"server": "http://127.0.0.1:18080"},
        args=["--ignore-certificate-errors"],
    )
    context = browser.new_context(ignore_https_errors=True, viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector("text=WaxSats", timeout=20000)
    assert "DÉMO" in page.content(), "demo badge missing"
    bal = page.get_by_test_id("balance")
    bal.wait_for(timeout=15000)
    assert "12 500" in norm(bal.inner_text()), f"unexpected balance: {bal.inner_text()}"
    print("SMOKE 1/5: home renders, demo badge, balance 12 500 sats")

    # Typed French command -> send screen prefilled
    page.get_by_label("Écris ta commande en français").fill("Envoie 500 sats à Awa")
    page.get_by_role("button", name="OK", exact=True).click()
    page.wait_for_selector("text=Envoyer des sats", timeout=10000)
    assert page.get_by_label("Montant (sats)").input_value() == "500"
    assert page.get_by_label("À qui ? (nom)").input_value() == "Awa"
    print("SMOKE 2/5: typed command routed to send screen, prefilled 500 / Awa")

    # Confirm screen: digits + French words
    page.get_by_role("button", name="Vérifier →").click()
    page.wait_for_selector("text=Tu envoies", timeout=10000)
    assert "cinq cents sats" in page.content(), "amount in French words missing"
    assert "à Awa" in page.content(), "recipient missing on confirm screen"
    print("SMOKE 3/5: confirm screen shows 500 sats = cinq cents sats, à Awa")

    # Confirm payment -> success, balance drops
    page.get_by_role("button", name="✅ Confirmer").click()
    page.wait_for_selector("text=Envoyé !", timeout=10000)
    assert "500 sats à Awa" in page.content()
    bal = page.get_by_test_id("balance")
    bal.wait_for(timeout=10000)
    assert "12 000" in norm(bal.inner_text()), f"balance did not drop: {bal.inner_text()}"
    print("SMOKE 4/5: payment confirmed, success shown, balance now 12 000 sats")

    # Receive: create a demo invoice with QR
    page.get_by_role("button", name=re.compile("Recevoir")).click()
    page.get_by_label("Montant à recevoir (sats)").fill("1000")
    page.get_by_role("button", name="Créer la facture ⚡").click()
    page.wait_for_selector("text=Facture démo", timeout=10000)
    assert "lntb1demo1000" in page.content(), "demo invoice string missing"
    assert page.locator("img[alt='Code QR de la facture Lightning']").count() == 1, "QR missing"
    print("SMOKE 5/5: receive flow creates demo invoice + QR")

    # History shows the send we just made
    page.get_by_role("button", name=re.compile("Retour")).click()
    page.get_by_role("button", name=re.compile("Historique")).click()
    page.wait_for_selector("text=Envoyé à Awa", timeout=10000)
    print("SMOKE 6/5: history lists the 500-sat send to Awa")

    print("page errors:", json.dumps(errors))
    assert not errors, f"page errors: {errors}"
    print("SMOKE OK — live demo verified end to end")
    browser.close()
