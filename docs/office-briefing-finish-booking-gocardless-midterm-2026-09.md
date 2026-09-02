# Finish booking - GoCardless for mid-term joiners (office briefing)

**For:** Sevitha / office  
**From:** Portal team  
**Date:** 2 September 2026  
**Audience:** Staff who accept Booking Portal places and confirm Tide payments

---

## What this is about

When a family finishes booking **after term has started** (or after the monthly Direct Debit day), they must only be charged for **remaining sessions** (pro-rata). If they choose **GoCardless**, we still collect **everyone on the 1st of each month** so we do not create separate GoCardless payment fees on random booking days.

---

## Pro-rata (always)

1. Count only sessions from the child's **first attended / first bookable session** onward.
2. Sessions already missed are **not** billed.
3. Example: full Autumn weekday term = 14 sessions x 50 GBP = 700 GBP. If one session is already past, payable = **13 x 50 = 650 GBP**.

The finish-booking screen shows this as **"Payable from today: N sessions"** under the full term price.

---

## GoCardless rule - same day for everyone

- GoCardless / Direct Debit collections for term instalments are only on the **1st of each month**.
- That keeps all families in **one batch** and avoids paying multiple GoCardless invoice/collection fees for charges on different days.
- We do **not** take a GoCardless payment on the day they open the finish-booking link (unless that day is already the shared 1st).

---

## If they choose GoCardless after this month's 1st (typical now in September)

They must do **two steps**:

### Step 1 - Bank transfer (now)

- Pay **this month's share** of the pro-rata total by **bank transfer** (Tide).
- Example shape: remaining programme split across remaining months (e.g. Sep bank + Oct + Nov + Dec GoCardless).
- Parent transfers, then WhatsApps / emails the office. There is **no "I've paid" button**.
- **Office job:** check Tide, mark the first instalment paid, then send Parent Portal PIN when ready.

### Step 2 - Set up GoCardless (mandate)

- On the same finish-booking page they also tap **Set up GoCardless**.
- That sets up the Direct Debit for **later months** (collections on the 1sts with everyone else).
- The Billing Request is **mandate-only** when the first amount is bank (no separate GoCardless charge for the September remainder).

Both steps are required. Bank alone does not enrol later months; GoCardless alone does not pay the post-1st remainder.

---

## If they choose GoCardless on or before the 1st

- No bank remainder for that month.
- They set up GoCardless; collections run on the **1sts** only (same day as other families).
- First collection date shown on screen is the next shared 1st (or today if they finish on the 1st).

---

## Other pay options (unchanged idea)

| Choice | What parent does |
|--------|------------------|
| Bank one-off | Pays full remaining term by bank now |
| Bank flexi | Two bank instalments; if the fixed first due date (e.g. Autumn 15 Aug) has passed, **first half is due now**, not a stale past date |
| Own way | Minimum prepaid (2 sessions + 50 GBP admin); top up as they go |
| Trial | Pay one session now (card / Apple Pay or bank) |

LA Direct Payments + bank flexi still means: open the link, choose that path, pay the first half **now** if the old fixed date has passed. Office only confirms Tide.

---

## What office should / should not do

**Do**

- Accept / validate the registration as usual.
- Let the parent use the finish-booking link (funding, term vs trial, pay method).
- For bank / bank-remainder: watch Tide, mark paid, send PIN.
- Expect mid-month GoCardless families to complete **bank + GoCardless setup**.

**Do not**

- Manually invent a "pay on booking day" GoCardless charge for mid-month joiners.
- Tell them the first flexi date is still 15 August if they are booking in September (the page now says due now / real date).
- Assume GoCardless alone covers the month they joined after the 1st.

---

## Short script for parents (optional)

> Your invoice is only for the sessions still left this term. Because monthly Direct Debit runs on the 1st for everyone, please (1) bank-transfer this month's share now and message us when sent, and (2) set up GoCardless on the same page for the later months. We confirm the bank payment on Tide and then send your Parent Portal PIN.

---

## Local preview (office)

Demo walkthrough (no live token):

`http://127.0.0.1:3456/parent_finish_booking.html?demo=1`

Path: Own money → This term only → GoCardless → Create invoice & pay  
You should see pro-rata remaining sessions, bank details for the first amount, and **Step 2 - Set up GoCardless**.

Production finish-booking uses the parent's magic link after Accept.

---

## Technical note (for portal / support)

- Live logic is in Edge Function `portal-booking-finish` and shared schedule helpers.
- Deployed on Portal Supabase; static finish-booking UI deploys via Vercel from `main`.

If anything on a live family link looks wrong, send the finish-booking URL (or invoice number) to Victor / portal support.
