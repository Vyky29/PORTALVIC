/**
 * Parent portal family PIN helpers.
 * Login: participant first name + 4-digit family PIN (or 6-digit office master PIN).
 */

import { constantTimeEquals, sha256Hex } from "./parent_portal_auth.ts";

const PIN_HASH_PREFIX = "portal-pin-v1:";

export function normalizeParticipantFirstName(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")[0] || "";
}

export function normalizePinDigits(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidFamilyPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** Office master PIN (6 digits). Default 29031988 — override with PARENT_PORTAL_MASTER_PIN. */
export function masterPinFromEnv(): string {
  const fromEnv = String(Deno.env.get("PARENT_PORTAL_MASTER_PIN") || "").replace(/\D/g, "");
  if (fromEnv.length === 6) return fromEnv;
  return "29031988";
}

export function isMasterPin(pinDigits: string): boolean {
  const master = masterPinFromEnv();
  if (pinDigits.length !== master.length) return false;
  return constantTimeEquals(pinDigits, master);
}

export async function hashFamilyPin(pin4: string): Promise<string> {
  return sha256Hex(PIN_HASH_PREFIX + pin4);
}

export async function verifyFamilyPinHash(pin4: string, pinHash: string): Promise<boolean> {
  if (!isValidFamilyPin(pin4) || !pinHash) return false;
  const h = await hashFamilyPin(pin4);
  return constantTimeEquals(h, String(pinHash));
}

/** Avoid trivial PINs. */
export function isWeakFamilyPin(pin4: string): boolean {
  if (!isValidFamilyPin(pin4)) return true;
  if (/^(\d)\1{3}$/.test(pin4)) return true; // 0000, 1111…
  if (pin4 === "1234" || pin4 === "4321" || pin4 === "2580") return true;
  return false;
}

export function newRandomFamilyPin(exclude: Set<string> = new Set()): string {
  for (let i = 0; i < 80; i++) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const pin = String(arr[0] % 10000).padStart(4, "0");
    if (isWeakFamilyPin(pin)) continue;
    if (exclude.has(pin)) continue;
    return pin;
  }
  // Extremely unlikely fallback
  return "4829";
}

/** First-name token from child_first_name or child_display. */
export function childFirstNameToken(row: {
  child_first_name?: unknown;
  child_display?: unknown;
}): string {
  const fromFirst = normalizeParticipantFirstName(row.child_first_name);
  if (fromFirst) return fromFirst;
  return normalizeParticipantFirstName(row.child_display);
}
