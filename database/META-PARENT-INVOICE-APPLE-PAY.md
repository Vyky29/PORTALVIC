# Apple Pay on parent invoice Checkout

Parent **Card / Apple Pay** uses **Stripe Checkout**. Apple Pay / Google Pay appear
automatically when Stripe and the device allow them — no separate Apple Pay SDK
in this repo.

## Checklist (Stripe Dashboard)

1. **Settings → Payment methods** — enable **Apple Pay** (and Google Pay if wanted).
2. **Settings → Apple Pay / domain verification** — add your live domain
   (e.g. `portalvic.vercel.app` and any custom club domain). Stripe hosts the
   verification file for Checkout.
3. Use **HTTPS** production URLs (`PARENT_PORTAL_PUBLIC_ORIGIN`).
4. Test on Safari / iPhone with a card in Wallet.

## Fees

Checkout charges the **invoice amount + Stripe fee gross-up** (see
`STRIPE_FEE_PERCENT` / `STRIPE_FEE_FIXED_PENCE`) so the club nets the invoice total.
Apple Pay uses the same card rates as card Checkout (no extra Apple fee in Stripe UK).

## Prefer bank transfer

Tide bank transfer remains the default (no card fee). Apple Pay is optional for
families who prefer wallet checkout.
