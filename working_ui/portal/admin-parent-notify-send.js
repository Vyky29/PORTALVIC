/**
 * Admin parent notify — server send via portal-parent-notify-send Edge Function.
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) {
      return String(s == null ? '' : s);
    },
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return '';
    },
    getAnonKey: function () {
      return '';
    },
    toast: function (_msg, _type) {}
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || '').replace(/\/$/, '');
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  /**
   * @param {object} payload
   * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
   */
  async function sendParentNotify(payload) {
    var token = await portalAuthToken();
    if (!token) return { ok: false, error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-parent-notify-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify(payload || {})
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j) {
      return {
        ok: false,
        error: (j && (j.error || j.message)) || res.statusText || 'send_failed',
        data: j || null
      };
    }
    if (!j.ok) {
      return { ok: false, error: j.error || 'send_failed', data: j };
    }
    return { ok: true, data: j };
  }

  function formatSendResult(data) {
    if (!data) return 'Sent.';
    var parts = [];
    if (data.email && data.email.status === 'sent') parts.push('Email sent');
    if (data.whatsapp && (data.whatsapp.status === 'sent' || data.whatsapp.status === 'sent_sms')) {
      parts.push(data.whatsapp.status === 'sent_sms' ? 'SMS sent' : 'WhatsApp sent');
    }
    if (data.partial && data.warnings && data.warnings.length) {
      parts.push('Warning: ' + data.warnings.map(formatNotifyError).join('; '));
    }
    return parts.length ? parts.join(' · ') : 'Sent.';
  }

  function formatNotifyError(err, data) {
    var code = String(err == null ? '' : err).trim();
    var map = {
      session_expired: 'Your session expired — sign in again.',
      unauthorized: 'Not allowed — sign in as admin or CEO.',
      invalid_channel: 'Choose Email, WhatsApp, or Both.',
      empty_body: 'Message is empty.',
      missing_parent_email: 'Enter a parent email address.',
      missing_parent_whatsapp: 'Enter a WhatsApp number (digits, with country code).',
      missing_subject: 'Subject is missing.',
      smtp_not_configured: 'Email is not configured — add SMTP secrets on the Portal Supabase project.',
      whatsapp_not_configured: 'WhatsApp is not configured — choose Email only or add Meta secrets.',
      meta_whatsapp_not_configured: 'WhatsApp is not configured — choose Email only or add Meta secrets.',
      send_failed: 'Send failed — check Edge Function logs in Supabase.',
      server_misconfigured: 'Server misconfigured — contact support.',
      invalid_json: 'Invalid request — refresh and try again.',
      method_not_allowed: 'Invalid request method.'
    };
    if (map[code]) return map[code];
    if (/^whatsapp_401/i.test(code) || /authentication error/i.test(code)) {
      return 'WhatsApp token expired — generate a new token in Meta Business Suite, update META_WHATSAPP_TOKEN in Supabase secrets, then run npm run apply:whatsapp.';
    }
    if (/131047|re-engagement/i.test(code)) {
      return 'Outside WhatsApp 24h window — refresh and resend (portal now uses the approved template for cold messages).';
    }
    if (/132018|newline|new-line|consecutive spaces/i.test(code)) {
      return 'WhatsApp template rejected the message format — try again (portal now strips line breaks automatically).';
    }
    if (/132005|translated text too long|too long/i.test(code)) {
      return 'Message too long for the WhatsApp template (keep under ~700 characters). For the contact-numbers update, use Family broadcast’s short WhatsApp field — not the full email body.';
    }
    if (data && Array.isArray(data.warnings) && data.warnings.length) {
      return data.warnings.map(formatNotifyError).join('; ');
    }
    if (!code) return 'Send failed — try again.';
    return code.replace(/_/g, ' ');
  }

  global.PortalParentNotifySend = {
    configure: configure,
    send: sendParentNotify,
    formatSendResult: formatSendResult,
    formatNotifyError: formatNotifyError
  };
})(typeof window !== 'undefined' ? window : globalThis);
