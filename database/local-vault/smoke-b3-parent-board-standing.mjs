#!/usr/bin/env node
/**
 * B3 smoke — parent hub chips/Team from capacity-chain standing board.
 *
 * Checks live Edge parent-portal-participant-detail against the deployed
 * standing occupants twin:
 *   1) aquatic halves merge to one chip per programme+day
 *   2) services_detail.instructor matches board seat
 *   3) team includes board instructors (no empty invent gap)
 *   4) a live instructor_reassign cover still surfaces on team
 *
 *   node database/local-vault/smoke-b3-parent-board-standing.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const startedAt = new Date().toISOString();
const results = [];

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function log(step, ok, detail) {
  const row = { step, ok: !!ok, detail: detail == null ? "" : String(detail) };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${row.detail ? " — " + row.detail : ""}`);
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTok(s) {
  return normName(s).split(/\s+/)[0] || "";
}

function serviceIdToProgramme(id) {
  const s = String(id || "").toLowerCase();
  if (s === "aquatic") return "Aquatic Activity";
  if (s === "climbing") return "Climbing Activity";
  if (s === "physical") return "Physical Activity";
  if (s === "multi") return "Multi-Activity";
  if (s === "day_centre" || s === "daycentre") return "Day Centre";
  if (s === "bespoke") return "Bespoke";
  return String(id || "Service");
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = readEnv("SUPABASE_ANON_KEY");
if (!serviceKey || !anonKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fnBase = url.replace(/\/$/, "") + "/functions/v1";

const standing = JSON.parse(
  readFileSync(
    path.join(root, "supabase/functions/_shared/portal_capacity_chain_standing_occupants.json"),
    "utf8",
  ),
);

/** Expected board seats for a client display name (strict roster label match). */
function boardSessionsForClient(wantDisplay) {
  const want = normName(wantDisplay);
  const aliases = new Set([want]);
  // Common board shortenings: Adam Pilcher → adam p / adam pi
  const parts = want.split(/\s+/);
  if (parts.length >= 2) {
    aliases.add(`${parts[0]} ${parts[1][0]}`);
    aliases.add(`${parts[0]} ${parts[1].slice(0, 2)}`);
  }
  const out = [];
  for (const slot of Object.values(standing.bySlotId || {})) {
    for (const line of slot.seatLines || []) {
      const kind = String(line.kind || "").toLowerCase();
      if (kind !== "booked" && kind !== "hold") continue;
      const client = String(line.client || "").trim();
      if (!client) continue;
      const got = normName(client);
      if (![...aliases].some((a) => got === a || got === want)) continue;
      out.push({
        client,
        day: slot.day,
        venue: slot.venue,
        timeLabel: slot.timeLabel,
        service: serviceIdToProgramme(slot.serviceId),
        instructor: String(line.instructor || "").trim(),
        serviceId: slot.serviceId,
      });
    }
  }
  return out;
}

function expectedChips(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = `${s.service}|${s.day}`.toLowerCase();
    let g = map.get(key);
    if (!g) {
      g = {
        labelHint: s.service,
        day: s.day,
        venue: s.venue,
        instructors: new Set(),
        halves: 0,
      };
      map.set(key, g);
    }
    g.halves += 1;
    if (s.instructor) g.instructors.add(s.instructor.toLowerCase());
  }
  return [...map.values()];
}

async function callFn(name, { sessionToken, body }) {
  const headers = {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (sessionToken) headers["x-parent-portal-session"] = sessionToken;
  const res = await fetch(`${fnBase}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, ok: res.ok && !(json && json.ok === false) };
}

async function mintParentSession(parentPersonId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  await admin
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("parent_person_id", parentPersonId)
    .is("revoked_at", null);
  const { error } = await admin.from("portal_parent_portal_sessions").insert({
    parent_person_id: parentPersonId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`mint session: ${error.message}`);
  return token;
}

async function findContactByDisplay(displayName) {
  const first = firstTok(displayName);
  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, child_display, child_first_name, child_last_name, parent_person_id, in_class")
    .ilike("child_display", `${first}%`)
    .limit(40);
  if (error) throw new Error(error.message);
  const want = normName(displayName);
  const rows = data || [];
  let hit =
    rows.find((r) => normName(r.child_display) === want) ||
    rows.find((r) => normName(r.child_display).startsWith(want)) ||
    rows.find((r) => want.startsWith(normName(r.child_display))) ||
    null;
  if (!hit) {
    hit = rows.find((r) => {
      const d = normName(r.child_display);
      const last = normName(r.child_last_name || "");
      const wantLast = want.split(/\s+/).slice(1).join(" ");
      return firstTok(d) === first && (!wantLast || last.startsWith(wantLast) || d.includes(wantLast));
    });
  }
  if (!hit) return null;
  return {
    id: hit.contact_id,
    display_name: hit.child_display,
    first_name: hit.child_first_name,
    last_name: hit.child_last_name,
    parent_person_id: hit.parent_person_id,
  };
}

async function smokeChild(label, boardName, contactHint) {
  const board = boardSessionsForClient(boardName);
  if (!board.length) {
    log(`${label}:board`, false, `no seats for ${boardName}`);
    return null;
  }
  const chips = expectedChips(board);
  const contact = await findContactByDisplay(contactHint || boardName);
  if (!contact?.id || !contact.parent_person_id) {
    log(`${label}:contact`, false, `no portal_contacts for ${boardName}`);
    return null;
  }
  log(
    `${label}:contact`,
    true,
    `${contact.display_name} (${contact.id.slice(0, 8)}…) parent=${contact.parent_person_id}`,
  );

  const token = await mintParentSession(contact.parent_person_id);
  const detail = await callFn("parent-portal-participant-detail", {
    sessionToken: token,
    body: {
      contact_id: contact.id,
      sections: ["general", "sessions", "team"],
    },
  });
  if (!detail.ok) {
    log(`${label}:detail`, false, `HTTP ${detail.status} ${JSON.stringify(detail.json).slice(0, 180)}`);
    return null;
  }
  log(`${label}:detail`, true, `ok`);

  const payload = detail.json || {};
  const services = Array.isArray(payload.general?.services_detail)
    ? payload.general.services_detail
    : Array.isArray(payload.services_detail)
      ? payload.services_detail
      : [];
  const team = Array.isArray(payload.team) ? payload.team : [];

  // Aquatic / multi halves: one chip per programme+day, not one per 30'
  for (const exp of chips) {
    const dayHits = services.filter(
      (s) =>
        String(s.day || "").toLowerCase() === String(exp.day || "").toLowerCase() &&
        String(s.label || s.service || "")
          .toLowerCase()
          .includes(String(exp.labelHint).toLowerCase().split(" ")[0]),
    );
    const okCount = dayHits.length === 1 || (exp.halves === 1 && dayHits.length >= 1);
    // For aquatic with 2+ halves expect exactly 1 merged chip for that day
    const expectOne = exp.halves >= 2;
    const pass = expectOne ? dayHits.length === 1 : dayHits.length >= 1;
    log(
      `${label}:chip ${exp.day} ${exp.labelHint}`,
      pass,
      expectOne
        ? `boardHalves=${exp.halves} hubChips=${dayHits.length} ${dayHits.map((d) => d.time || d.label).join(" | ")}`
        : `hubChips=${dayHits.length}`,
    );
    if (dayHits[0]) {
      const inst = String(dayHits[0].instructor || "").toLowerCase();
      const boardInst = [...exp.instructors];
      const hasInst = !boardInst.length || boardInst.some((b) => inst.includes(b));
      log(
        `${label}:instructor ${exp.day}`,
        hasInst && (!!inst || !boardInst.length),
        `hub="${dayHits[0].instructor || ""}" board=[${boardInst.join(",")}]`,
      );
    }
  }

  const teamBlob = team
    .map((m) => [m.name, m.staff_key, m.staff_id, m.role].filter(Boolean).join(" "))
    .join(" | ")
    .toLowerCase();
  const boardInstructors = [
    ...new Set(board.map((b) => b.instructor).filter(Boolean).map((n) => n.toLowerCase())),
  ];
  for (const bi of boardInstructors) {
    const tok = bi.split(/\s+/)[0];
    const onTeam = teamBlob.includes(tok);
    log(`${label}:team ${tok}`, onTeam, teamBlob.slice(0, 160) || "(empty team)");
  }

  return { contact, services, team, board, chips };
}

async function smokeCover() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  const to = new Date(today);
  to.setDate(to.getDate() + 21);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const { data: ovs, error } = await admin
    .from("schedule_overrides")
    .select(
      "id, session_date, override_type, anchor_client_id, anchor_staff_id, payload, reason, status",
    )
    .eq("override_type", "instructor_reassign")
    .eq("status", "active")
    .gte("session_date", fromIso)
    .lte("session_date", toIso)
    .order("session_date", { ascending: true })
    .limit(40);
  if (error) {
    log("cover:query", false, error.message);
    return;
  }
  const active = (ovs || []).filter((o) => {
    const p = o.payload && typeof o.payload === "object" ? o.payload : {};
    const cover = String(p.covering_staff_id || p.cover_staff_id || "").trim();
    const client = String(o.anchor_client_id || "").trim();
    return cover && client && client !== "available" && !/cover_needed|tbc/i.test(cover);
  });
  if (!active.length) {
    log("cover:sample", true, `no named cover OV in ${fromIso}..${toIso} (skip assert)`);
    return;
  }
  const ov = active[0];
  const p = ov.payload || {};
  const clientName = String(ov.anchor_client_id || "").trim();
  const coverId = String(p.covering_staff_id || p.cover_staff_id || "").trim();
  const coverName = String(p.covering_staff_name || "").trim();
  log(
    "cover:sample",
    true,
    `${ov.session_date} ${clientName} · ${p.absent_staff_id || ov.anchor_staff_id} → ${coverId}`,
  );
  const contact = await findContactByDisplay(clientName);
  if (!contact?.id || !contact.parent_person_id) {
    // try slug-ish id as display (patrick → look up)
    const { data: bySlug } = await admin
      .from("portal_parent_contacts")
      .select("contact_id, child_display, parent_person_id")
      .ilike("child_display", `${clientName}%`)
      .limit(5);
    const hit = (bySlug || [])[0];
    if (!hit) {
      log("cover:contact", false, `no contact for ${clientName}`);
      return;
    }
    const token = await mintParentSession(hit.parent_person_id);
    const detail = await callFn("parent-portal-participant-detail", {
      sessionToken: token,
      body: { contact_id: hit.contact_id, sections: ["general", "sessions", "team"] },
    });
    if (!detail.ok) {
      log("cover:detail", false, `HTTP ${detail.status}`);
      return;
    }
    const team = Array.isArray(detail.json?.team) ? detail.json.team : [];
    const blob = JSON.stringify(team).toLowerCase();
    const coverTok = (coverName || coverId).toLowerCase().split(/[_\s-]+/)[0];
    const hitTeam =
      blob.includes(coverTok) ||
      team.some((m) => String(m.role || "").toLowerCase() === "cover");
    log(
      "cover:team",
      hitTeam,
      `looking for ${coverTok}; roles=${team.map((m) => `${m.name}:${m.role || "instructor"}`).join(", ")}`,
    );
    return;
  }
  const token = await mintParentSession(contact.parent_person_id);
  const detail = await callFn("parent-portal-participant-detail", {
    sessionToken: token,
    body: { contact_id: contact.id, sections: ["general", "sessions", "team"] },
  });
  if (!detail.ok) {
    log("cover:detail", false, `HTTP ${detail.status}`);
    return;
  }
  const team = Array.isArray(detail.json?.team) ? detail.json.team : [];
  const blob = JSON.stringify(team).toLowerCase();
  const coverTok = (coverName || coverId).toLowerCase().split(/[_\s-]+/)[0];
  const hit =
    blob.includes(coverTok) || team.some((m) => String(m.role || "").toLowerCase() === "cover");
  log(
    "cover:team",
    hit,
    `looking for ${coverTok}; roles=${team.map((m) => `${m.name}:${m.role || "instructor"}`).join(", ")}`,
  );
}

async function main() {
  console.log(`B3 parent board smoke @ ${startedAt}`);
  // Aquatic multi-half + Physical single + Northolt (invent regression)
  await smokeChild("adam-aquatic", "Adam Pilcher");
  await smokeChild("ayaan-physical", "Ayaan", "Ayaan Imam");
  // Prefer a Northolt booked seat from board
  let northoltName = "";
  for (const slot of Object.values(standing.bySlotId || {})) {
    if (!/northolt/i.test(String(slot.venue || ""))) continue;
    for (const line of slot.seatLines || []) {
      if (String(line.kind).toLowerCase() === "booked" && line.client && line.instructor) {
        northoltName = String(line.client).trim();
        break;
      }
    }
    if (northoltName) break;
  }
  if (northoltName) {
    await smokeChild("northolt-board", northoltName);
  } else {
    log("northolt:board", false, "no booked Northolt seat in standing JSON");
  }

  await smokeCover();

  const failed = results.filter((r) => !r.ok);
  const outDir = path.join(root, "database/local-vault/tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "smoke-b3-parent-board-standing-report.json");
  writeFileSync(
    outPath,
    JSON.stringify({ startedAt, endedAt: new Date().toISOString(), results, failed: failed.length }, null, 2),
  );
  console.log(`\n${failed.length ? "FAILED" : "OK"}  ${results.length - failed.length}/${results.length} pass — ${outPath}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
