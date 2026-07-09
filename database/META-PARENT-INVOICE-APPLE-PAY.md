# Apple Pay on parent invoice Checkout

Parent **Card / Apple Pay** uses **Stripe Checkout**. Apple Pay / Google Pay appear
automatically when Stripe and the device allow them — no separate Apple Pay SDK
in this repo.

## Live family portal URL

Families use:

- **https://www.clubsensational.org/parents** (also **/parent** — same portal)
- Technical host: **https://family.clubsensational.org/parent** (Vercel)

Apple Pay verifies the **hostname**, not the `/parents` path.

## Checklist (Stripe Dashboard)

1. **Settings → Payment methods** — enable **Apple Pay** (and Google Pay if wanted).
2. **Settings → Payment methods → Apple Pay → Add domain** — verify these hosts:
   - `www.clubsensational.org` ← **required** (what parents see)
   - `family.clubsensational.org` ← if Checkout can open on that host
   - `portalvic.vercel.app` ← optional (admin/dev / direct Vercel)
3. Stripe hosts the Apple domain association file for Checkout once the domain is verified.
4. Set Edge Function secret (recommended):

   ```bash
   PARENT_PORTAL_PUBLIC_ORIGIN=https://www.clubsensational.org
   ```

   After card pay, parents return to `/parent` on that origin (works with the WordPress proxy).
5. Test on Safari / iPhone with a card in Wallet, starting from
   **https://www.clubsensational.org/parents** (or `/parent`).

## Fees

Checkout charges the **invoice amount + Stripe fee gross-up** (see
`STRIPE_FEE_PERCENT` / `STRIPE_FEE_FIXED_PENCE`) so the club nets the invoice total.
Apple Pay uses the same card rates as card Checkout (no extra Apple fee in Stripe UK).

## Prefer bank transfer

Tide bank transfer remains the default (no card fee). Apple Pay is optional for
families who prefer wallet checkout.
