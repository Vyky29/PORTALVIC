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
      parts.push('Warning: ' + data.warnings.join('; '));
    }
    return parts.length ? parts.join(' · ') : 'Sent.';
  }

  global.PortalParentNotifySend = {
    configure: configure,
    send: sendParentNotify,
    formatSendResult: formatSendResult
  };
})(typeof window !== 'undefined' ? window : globalThis);
