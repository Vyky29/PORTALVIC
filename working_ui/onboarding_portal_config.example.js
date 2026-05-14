/**
 * Interview / onboarding portal — optional local Supabase anon config.
 *
 * Production: open the page from the staff portal host and sign in; `Working_interview.html` loads
 * `auth-handler.js` and uses your session (RLS on `onboarding_candidates` — see migration
 * `database/migrations/20260424_onboarding_candidates.sql`).
 *
 * Local / file: copy to `onboarding_portal_config.js`, set URL + anon key from Supabase → API.
 * Keep real keys out of git (repo `.gitignore` lists `onboarding_portal_config.js`).
 */
window.PORTAL_ONBOARDING_SUPABASE_URL = "";
window.PORTAL_ONBOARDING_SUPABASE_ANON_KEY = "";
