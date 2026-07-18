# Family portal welcome — parent email & WhatsApp (July 2026)

**Where to send the broadcast (no PIN):** Admin dashboard → **Services & Participants** → **Communications** → **Family broadcast**  
(`portal_parent_broadcast`). Subject and bodies load as the defaults below.

**Where to send the PIN (personal):** one WhatsApp per family — see  
`database/local-vault/tmp/parent-portal-pin-whatsapps.txt` (generated list). Do **not** put PINs in the mass email/WA broadcast.

Emanuel’s parent already has access; the message says families already have access (nothing to apply for).

**Re-enrolment deadline:** Wednesday **22 July 2026**.

## Email subject

Welcome to your Family portal — re-enrol by 22 July & crash courses are open

## Email body

Dear families,

We are delighted to welcome you to the new clubSENsational Family portal — a calmer, clearer home for everything about your child’s place with us.

You already have access. There is nothing to apply for.

Open your portal here:
https://www.clubsensational.org/parent

Sign in with:
• your child’s first name (no surname), and
• your family 4-digit PIN (we send this to you on WhatsApp).

What you can do in the Family portal
• See each child’s hub — sessions, photos, weekly notes and messages from the club
• Re-enrol for 2026/27 — please confirm by Wednesday 22 July 2026 (the last day to respond)
• Book July Intensive Courses & Camps (crash courses) now — you can book crash first and finish re-enrolment afterwards if that suits you better
• Update registration details, report absences, and keep in touch with the office

A tip that makes a real difference on your phone
You can use the portal in any browser. For the best experience, add Family to your Home Screen (iPhone: Share → Add to Home Screen; Android: browser menu → Install app), open it from that icon, and turn on alerts. Then session changes, announcements and photos can reach your phone even when the browser is closed.

Important dates for places
• Wednesday 22 July 2026 — last day to respond to re-enrolment
• From Thursday 23 July 2026 — places that have not been confirmed may be released, and unconfirmed slots may be offered to new clients on our booking website

If anything looks unclear when you sign in, just reply to this email or message us on WhatsApp — we are here to help.

Warm wishes,
The clubSENsational team

## WhatsApp body (Meta template {{1}} — under 700 characters, no PIN)

Welcome to your Family portal — you already have access.
https://www.clubsensational.org/parent
Sign in with your child’s first name + your family 4-digit PIN (sent to you on WhatsApp).

Inside you can re-enrol for 2026/27 (by Wed 22 July), book July crash courses now, see sessions, photos and messages.

Tip: Add to Home Screen, open from that icon and turn on alerts so updates reach your phone.

From Thu 23 July, unconfirmed places may be released. Full welcome email has all the details.

## Individual WhatsApp (with PIN) — templates

Use after families already received the first Family portal welcome.  
**Do not** put PINs in the mass Family broadcast — only in these one-to-one WhatsApps.

Generated lists (local):  
`database/local-vault/tmp/parent-portal-pin-whatsapps-thanks.txt`  
`database/local-vault/tmp/parent-portal-pin-whatsapps-pending.txt`

### A — Already re-enrolled (thank you + PIN replaces DOB)

```
Hi {{parent_first}} — thank you for re-enrolling for 2026/27.

For easier access, Family portal login no longer uses date of birth. We’ve switched to a personal family PIN (you can change it anytime after signing in).

Open: https://www.clubsensational.org/parent

Sign in with:
• Child’s first name: {{child_first}}
• Family PIN: {{pin}}

{{same_pin_line_if_multi_child}}

Crash courses are still open to book in the portal if you need them.

Any problem, reply here.
```

### B — Not yet re-enrolled (PIN update + deadline 22 July)

```
Hi {{parent_first}} — quick update on your Family portal login.

For easier access we’ve switched to a personal family PIN (you can change it anytime after signing in). Date of birth is no longer used to sign in.

Open: https://www.clubsensational.org/parent

Sign in with:
• Child’s first name: {{child_first}}
• Family PIN: {{pin}}

{{same_pin_line_if_multi_child}}

Please re-enrol for 2026/27 by Wed 22 July. Crash courses are open now.

Any problem, reply here.
```

**More than one child only** — insert this line after the PIN block:

```
Same PIN works for every child on your account.
```
