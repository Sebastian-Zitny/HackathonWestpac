# Known limitations and what a real deployment would need

## This prototype

- **Hackathon prototype, simulated data.** This is a student hackathon project, not a live Westpac product. The customer, accounts, merchants, bills and transactions are all fictional. No real bank systems are called.
- **Second tap.** After approving a top-up the customer taps their card again. Completing the original card payment without a second tap would need integration with the bank's real-time card authorisation and scheme infrastructure. **This capability does not exist today; it is a concept.**
- **The AI is illustrative.**
  - The model is trained on data we generated, so it learns our assumptions about spending.
  - The 0–100 trust score and its 85/60 bands are prototype choices, not validated risk thresholds, and **not fraud probabilities**.
  - The hold-out metrics only show behaviour on synthetic data.
- **Authentication is simulated.**
  - The PIN is a hard-coded demo value (`1234`).
  - The "biometric" step is a button with an animation.
  - The "signed-in app session" is a flag you can toggle in the demo panel.
- **Single customer, single process.** There's no user login, and data is held in one SQLite file. Locking is in-process, which is fine for a demo but not for multiple servers.
- **Explanations are template-based.** The wording follows fixed patterns filled with the model's real results. A production version could add natural-language generation, ideally on bank-approved infrastructure.
- **Accessibility and localisation** follow good practice (icons with text, focusable controls, reduced motion) but haven't been formally audited.

## What a production version would need

1. **Card authorisation integration.** A hook in issuer processing to decide a top-up within the authorisation time budget (stand-in processing or a pre-authorisation balance check), plus scheme-compliant handling of declines and retries.
2. **Core banking transfer APIs.** Idempotency keys, ledger postings and reconciliation, and handling of holds and pending transactions.
3. **Strong customer authentication** through the bank's existing app. Device binding, secure push approval, and real biometrics and PIN, with step-up handled by the bank's identity platform.
4. **Fraud and risk platform signals.** Device, network, mule and scam indicators, confirmed-fraud labels, and models validated by the bank's risk teams, with ongoing monitoring for drift and bias.
5. **Customer protection.**
   - Clear consent and terms for top-up requests and the approval window.
   - Scam-awareness friction (for example, always requiring PIN for payee types linked to scams).
   - Hardship-sensitive design, and easy pause and cancel.
6. **Regulatory and privacy review.**
   - Australian Privacy Principles.
   - Consumer Data Right implications if external data is used.
   - ePayments Code obligations.
   - Model risk governance.
   - Record keeping and complaints handling.
7. **Scale and resilience.** A multi-instance service with a shared database, distributed locking and idempotency, observability, and audit logs that meet retention requirements.
