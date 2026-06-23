# Meta WhatsApp templates — parent notify (Portal)

Portal sends parent/carer messages from **Admin → Bookings / Scheduling / Ops orders** via `portal-parent-notify-send`.  
Email uses the same draft text as WhatsApp (Google SMTP). WhatsApp requires an **approved Meta template** for cold outbound.

## One template covers all message types (recommended)

The Edge Function sends **one body variable** `{{1}}` with the full message (signature stripped — see below).

| Field | Value |
|-------|--------|
| **Name** | `portal_parent_update` |
| **Category** | Utility |
| **Language** | English (US) — `en_US` (portal also tries `en` / `en_GB`) |
| **Body** | `{{1}}` |
| **Footer** | `ClubSENsational` |

**Example variable sample for Meta review:**

```
Hi Sarah,

This is ClubSENsational.

We are writing about fees for Joel — 1:1 swim (Mon 3pm to 4pm at Acton Centre).

Amount currently outstanding: £45.00.

Please use your usual bank reference, or reply if you need the details again.
```

The portal appends “Thank you, ClubSENsational” in the draft; the API **removes that line** before filling `{{1}}`, because the template **footer** carries the brand.

### Supabase secrets (after Meta approves)

In `local-secrets/secrets.env`:

```env
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE=portal_parent_update
META_WHATSAPP_TEMPLATE_LANG=en_US
```

Then:

```bash
npm run apply:whatsapp
```

Test: **Admin → Settings → Send test WhatsApp**, then **Scheduling → Parent messaging → Send now**.

---

## Message kinds (email + WhatsApp draft text)

Drafts are built in `working_ui/portal/portal-parent-notify-templates.js` and shown in the **Message for parent** modal before send.

| Kind | When to use | Subject line |
|------|-------------|--------------|
| `payment_due` | Outstanding fees, Bookings / Payments / Ops order | Payment reminder · {participant} |
| `instructor_change` | Cover / instructor reassign (Scheduling) | Instructor update · {participant} |
| `absence_announced` | Override **Absent** | Absence · {participant} |
| `makeup_scheduled` | Override **Make up** | Make up · {participant} |
| `trial_scheduled` | Override **Trial** / new participant trial | Trial session · {participant} |
| `session_cancelled` | Override **Cancelled** | Session cancelled · {participant} |
| `booking_confirmation` | New booking confirmed (no balance due) | Booking confirmation · {participant} |

Staff can edit the text in the modal before **Send now**. Sends are logged in `portal_parent_notify_log`.

**Instructor photo (change of instructor / make-up):** the portal resolves the photo from the staff dashboard roster (`portal/staff_photos/`). **Email** embeds the image in the HTML body. **WhatsApp** includes a public photo URL in the draft (link preview) and, after the template text, tries a follow-up image message. Optional: approve a Meta template with an **IMAGE header** and set `PORTAL_PARENT_NOTIFY_WHATSAPP_PHOTO_HEADER=true` to send the photo in the template header.

---

## Optional: separate Meta templates per kind

Only needed if Meta rejects the generic utility template or you want fixed wording in Meta.

Add env vars (names must match approved template **names** in Meta):

```env
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE=portal_parent_update
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_PAYMENT=portal_parent_payment
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_INSTRUCTOR=portal_parent_instructor
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_ABSENCE=portal_parent_absence
PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_MAKEUP=portal_parent_makeup
```

Each optional template still uses **one body variable** `{{1}}` (same as above). The portal picks the template by `kind` and falls back to `PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE`.

Run `npm run apply:whatsapp` after changing secrets.

---

## Staff OTP (separate)

Staff profile OTP uses `META_WHATSAPP_TEMPLATE_NAME` if set (optional). Parent notify does **not** use that key.

---

## Checklist

1. Meta Business Suite → WhatsApp → Message templates → Create `portal_parent_update` (Utility, en_US).
2. Wait for **Approved**.
3. Set secrets + `npm run apply:whatsapp`.
4. Admin → Settings → test WhatsApp on your mobile.
5. Scheduling → save an override → **Notify parent** → Send now (email and/or WhatsApp).

**Replies** to the API number: **Family messages** in admin (after webhook below) and [Meta Business Suite inbox](https://business.facebook.com/latest/inbox/all).

---

## Inbound replies webhook (V3)

Store family replies in **Admin → Family messages** (not only Meta inbox).

### 1. Secrets (`local-secrets/secrets.env`)

```env
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=paste-a-long-random-string-here
META_WHATSAPP_APP_SECRET=paste-from-meta-app-settings-basic
```

`META_WHATSAPP_APP_SECRET` is **App secret** in [Meta for Developers](https://developers.facebook.com/) → your app → **Settings → Basic**. Used to verify `X-Hub-Signature-256`.

### 2. Deploy

Apply DB migration `20260620120000_portal_parent_whatsapp_inbound.sql` on Portal Supabase, then:

```bash
npm run apply:whatsapp
```

This syncs secrets and deploys `portal-whatsapp-webhook`.

### 3. Meta webhook URL

In **Meta for Developers** → your app → **WhatsApp → Configuration**:

| Field | Value |
|-------|--------|
| **Callback URL** | `https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-whatsapp-webhook` |
| **Verify token** | Same as `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` |

Subscribe to **messages** for your WhatsApp Business account. Click **Verify and save**.

### 4. Test

1. **Send now** a WhatsApp to your mobile from Scheduling.
2. Reply from that phone to the API number.
3. **Family messages → Refresh** — reply appears with blue **Reply** chip.

Older replies before webhook setup are **not** backfilled.
