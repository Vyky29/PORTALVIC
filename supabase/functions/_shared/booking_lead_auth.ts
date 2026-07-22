// Shared helpers for Booking Portal lead gate (OTP + session).

import {
  clientDeviceFromRequest,
  clientIp,
  constantTimeEquals,
  newOtpCode,
  newSessionToken,
  normalizePhoneE164,
  sha256Hex,
} from "./parent_portal_auth.ts";

export {
  clientDeviceFromRequest,
  clientIp,
  constantTimeEquals,
  newOtpCode,
  newSessionToken,
  normalizePhoneE164,
  sha256Hex,
};

export const bookingLeadCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-lead-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const BOOKING_LEAD_PRIVACY_NOTICE_VERSION = "2026-07-v1";
export const BOOKING_LEAD_OTP_TTL_MS = 10 * 60 * 1000;
export const BOOKING_LEAD_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const BOOKING_LEAD_OTP_MAX_ATTEMPTS = 5;
export const BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_EMAIL = 6;
export const BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_IP = 20;

export function bookingLeadJson(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...bookingLeadCorsHeaders, "Content-Type": "application/json" },
  });
}

export function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

export function maskEmail(raw: string): string {
  const e = normalizeEmail(raw);
  const at = e.indexOf("@");
  if (at < 1) return "***";
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const shown = user.slice(0, Math.min(2, user.length));
  return shown + "***@" + domain;
}

/** Parent/carer display name — matches registration `parent_name`. */
export function sanitizeParentName(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

/** @deprecated use sanitizeParentName */
export const sanitizeFirstName = sanitizeParentName;
