// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-home-load
// -----------------------
// Returns linked children + recent club messages for the authenticated parent session.
//
// Headers: x-parent-portal-session

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { resolveParticipantAvatarUrls } from "../_shared/participant_avatar.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";
import {
  applyUnreadFlagsToMessages,
  countUnreadOutboundMessages,
  fetchParentOutboundNotifyRows,
  fetchParentWhatsappInboundRows,
  getParentMessageReadAt,
  markParentMessagesRead,
  mergeParentPortalMessages,
  parentPhoneLast10,
  unreadOutboundCountByContact,
} from "../_shared/parent_portal_messages.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const token = String(req.headers.get("x-parent-portal-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return parentPortalJsonInvalid();

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: sess, error: sessErr } = await supabase
    .from("portal_parent_portal_sessions")
    .select("id, parent_person_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessErr || !sess || sess.revoked_at) return parentPortalJsonInvalid();
  if (new Date(sess.expires_at).getTime() < Date.now()) return parentPortalJsonInvalid();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", sess.id);

  const parentPersonId = String(sess.parent_person_id || "");

  const participantTable = "portal_participants";
  let contactsQuery = supabase
    .from(participantTable)
    .select(
      "contact_id, display_name, first_name, last_name, dob_iso, in_class, on_waiting_list, avatar_storage_path",
    )
    .eq("parent_person_id", parentPersonId)
    .order("display_name", { ascending: true });

  let { data: contacts, error: contactsErr } = await contactsQuery;

  if (contactsErr) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select(
        "contact_id, child_display, child_first_name, child_last_name, dob_iso, in_class, on_waiting_list, city, postcode",
      )
      .eq("parent_person_id", parentPersonId)
      .order("child_display", { ascending: true });
    contacts = fallback.data;
    contactsErr = fallback.error;
  }

  if (contactsErr) {
    console.error("[parent-portal-home-load] contacts error", contactsErr);
    return parentPortalJsonInvalid(500);
  }

  const { data: parentMeta } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile, address_line1, address_line2, city, postcode")
    .eq("parent_person_id", parentPersonId)
    .limit(1)
    .maybeSingle();

  const emailNorm = String(parentMeta?.email || "").trim().toLowerCase();
  const phone10 = parentPhoneLast10(String(parentMeta?.mobile || ""));

  const outbound = await fetchParentOutboundNotifyRows(supabase, emailNorm, phone10, 80);
  const inbound = await fetchParentWhatsappInboundRows(supabase, phone10, 40);

  const messages = mergeParentPortalMessages(outbound, inbound)
    .sort(
      (a, b) =>
        new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime(),
    )
    .slice(0, 20);

  const childrenOut = await Promise.all(
    (contacts || []).map(async (c) => {
      const displayName = c.display_name || c.child_display;
      const avatar = await resolveParticipantAvatarUrls(supabase, url, {
        contact_id: String(c.contact_id || ""),
        display_name: String(displayName || ""),
        dob_iso: c.dob_iso,
        avatar_storage_path: c.avatar_storage_path,
      });
      return {
        contact_id: c.contact_id,
        display_name: displayName,
        first_name: c.first_name || c.child_first_name,
        last_name: c.last_name || c.child_last_name,
        dob_iso: c.dob_iso,
        in_class: c.in_class,
        on_waiting_list: c.on_waiting_list,
        city: c.city || null,
        postcode: c.postcode || null,
        avatar_url: avatar.avatar_url,
        avatar_source: avatar.avatar_source,
        has_avatar: !!(avatar.avatar_url || c.avatar_storage_path),
      };
    }),
  );

  const contactIds = childrenOut
    .map((c) => String(c.contact_id || "").trim())
    .filter(Boolean);
  const reenrolLatestByContact = new Map<string, string>();
  if (contactIds.length) {
    const { data: reenrolRows } = await supabase
      .from("portal_re_enrolment_submissions")
      .select("participant_contact_id, submitted_at")
      .eq("academic_year", REENROL_ACADEMIC_YEAR)
      .in("participant_contact_id", contactIds)
      .order("submitted_at", { ascending: false });
    for (const row of reenrolRows || []) {
      const cid = String(row.participant_contact_id || "").trim();
      if (cid && !reenrolLatestByContact.has(cid)) {
        reenrolLatestByContact.set(cid, String(row.submitted_at || ""));
      }
    }
  }
  const childrenWithReenrol = childrenOut.map((c) => {
    const cid = String(c.contact_id || "").trim();
    const submittedAt = reenrolLatestByContact.get(cid) || null;
    return {
      ...c,
      reenrolment: {
        submitted: !!submittedAt,
        submitted_at: submittedAt,
      },
    };
  });

  const readAt = await getParentMessageReadAt(supabase, parentPersonId);
  const unread_messages_count = countUnreadOutboundMessages(outbound, readAt);
  const unread_by_contact_id = unreadOutboundCountByContact(
    outbound,
    readAt,
    childrenOut.map((c) => ({ contact_id: String(c.contact_id || ""), display_name: c.display_name })),
  );

  return new Response(
    JSON.stringify({
      ok: true,
      session: { expires_at: sess.expires_at },
      parent: {
        parent_person_id: parentPersonId,
        display_name: parentMeta?.parent_display ?? null,
        email: parentMeta?.email ?? null,
        mobile: parentMeta?.mobile ?? null,
        address: {
          line1: parentMeta?.address_line1 ?? null,
          line2: parentMeta?.address_line2 ?? null,
          city: parentMeta?.city ?? null,
          postcode: parentMeta?.postcode ?? null,
        },
      },
      children: childrenWithReenrol,
      messages,
      unread_messages_count,
      unread_by_contact_id,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
