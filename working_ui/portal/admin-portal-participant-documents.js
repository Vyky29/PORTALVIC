/**
 * Admin — participant documents from parent registration forms.
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) {
      return String(s == null ? '' : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return '';
    },
    getAnonKey: function () {
      return '';
    }
  };

  var FORM_LABELS = {
    climbing_registration: 'Climbing registration',
    client_registration: 'Client registration'
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function esc(s) {
    return cfg.esc(s);
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

  async function fetchDocuments(participantName) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired', documents: [] };
    var body = {};
    if (participantName) body.participant_name = String(participantName).trim();
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-participant-documents-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify(body)
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', documents: [] };
    }
    return { documents: j.documents || [], meta: j.meta || {} };
  }

  async function acceptDocument(documentId, action) {
    var token = await portalAuthToken();
    if (!token) return { ok: false, error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-participant-document-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify({ document_id: documentId, action: action || 'accept' })
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { ok: false, error: (j && j.error) || 'request_failed' };
    }
    return j;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function documentsTableHtml(docs, emptyMsg) {
    if (!docs.length) {
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">' + esc(emptyMsg || 'No documents yet.') + '</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Submitted</th><th>Form</th><th>Participant</th><th>Parent</th><th>Requested slot</th><th>Status</th><th>PDF</th><th>Photo</th><th>Review</th>' +
      '</tr></thead><tbody>' +
      docs.map(function (d) {
        var formLab = FORM_LABELS[d.form_type] || d.form_type || '—';
        var parentLine = [d.parent_name, d.parent_email].filter(Boolean).join(' · ') || '—';
        var pdfLink = d.pdf_signed_url
          ? '<button type="button" class="btn btn--pri btn--sm portal-pax-doc-open" data-url="' +
            esc(d.pdf_signed_url) +
            '">Open PDF</button>'
          : '—';
        var photoLink = d.photo_signed_url
          ? '<button type="button" class="btn btn--ghost btn--sm portal-pax-doc-open" data-url="' +
            esc(d.photo_signed_url) +
            '">View photo</button>'
          : '—';
        var slotLine = '—';
        try {
          var br = d.payload_json && d.payload_json.booking_request;
          if (br && typeof br === 'object') {
            var bits = [
              br.service_name || br.service || br.service_id,
              br.venue,
              br.day || br.day_label,
              br.time || br.time_label,
            ].filter(Boolean);
            slotLine = bits.length ? bits.join(' · ') : (br.slot_id || '—');
          }
        } catch (_e) {
          slotLine = '—';
        }
        var reviewed = String(d.status || '').toLowerCase() === 'reviewed';
        var reviewCell = reviewed
          ? '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
            '<span class="chip chip--ok">Accepted</span>' +
            '<button type="button" class="btn btn--ghost btn--sm portal-pax-doc-resend" data-id="' +
            esc(d.id) +
            '" data-name="' +
            esc(d.participant_name || '') +
            '">Resend finish link</button>' +
            '</div>'
          : '<button type="button" class="btn btn--sec btn--sm portal-pax-doc-accept" data-id="' +
            esc(d.id) +
            '" data-name="' +
            esc(d.participant_name || '') +
            '">Accept</button>';
        return (
          '<tr>' +
          '<td class="muted" style="white-space:nowrap">' + esc(formatDate(d.submitted_at)) + '</td>' +
          '<td style="min-width:0;overflow-wrap:break-word">' + esc(formLab) + '</td>' +
          '<td style="min-width:0;overflow-wrap:break-word"><strong>' + esc(d.participant_name || '—') + '</strong></td>' +
          '<td class="muted" style="min-width:0;max-width:14rem;overflow-wrap:break-word">' + esc(parentLine) + '</td>' +
          '<td class="muted" style="min-width:0;max-width:16rem;overflow-wrap:break-word">' + esc(slotLine) + '</td>' +
          '<td><span class="chip chip--' + (reviewed ? 'ok' : 'pend') + '">' + esc(reviewed ? 'reviewed' : (d.status || 'new')) + '</span></td>' +
          '<td>' + pdfLink + '</td>' +
          '<td>' + photoLink + '</td>' +
          '<td style="min-width:0">' + reviewCell + '</td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table></div></div>'
    );
  }

  function viewHtml() {
    return (
      '<div class="portal-participant-docs-embed">' +
      '<h1 class="page-title">Participant documents</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">New-client flow: Booking Portal slot → registration form → <strong>Accept</strong> (emails/WhatsApps the parent a finish-booking link) → parent chooses funding &amp; payment and pays the first instalment → Parent Portal PIN. Use <strong>Resend finish link</strong> if needed.</p>' +
      '<div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParticipantDocsRefresh">Refresh</button>' +
      '</div>' +
      '<div id="portalParticipantDocsHost"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  async function renderHost(hostEl, participantName) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var res = await fetchDocuments(participantName);
    if (res.error) {
      hostEl.innerHTML = '<p class="muted" style="color:var(--danger,#c62828)">Could not load documents (' + esc(res.error) + ').</p>';
      return;
    }
    var intro = participantName
      ? '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">Matched to <strong>' + esc(participantName) + '</strong> (' + esc(String((res.documents || []).length)) + ').</p>'
      : '<p class="muted" style="margin:0 0 10px">' + esc(String((res.documents || []).length)) + ' submission(s).</p>';
    hostEl.innerHTML = intro + documentsTableHtml(res.documents, participantName ? 'No parent forms matched this participant yet.' : 'No parent forms submitted yet.');
    hostEl.querySelectorAll('.portal-pax-doc-open').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = String(btn.getAttribute('data-url') || '')
          .replace(/&amp;/g, '&')
          .trim();
        if (!url) return;
        var win = global.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
          try {
            global.location.href = url;
          } catch (_e) {}
        }
      });
    });
    hostEl.querySelectorAll('.portal-pax-doc-accept').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = String(btn.getAttribute('data-id') || '').trim();
        var name = String(btn.getAttribute('data-name') || '').trim() || 'this participant';
        if (!id) return;
        if (
          !global.confirm(
            'Accept registration for ' +
              name +
              '?\n\nThis validates the held slot and sends the parent an email/WhatsApp link to choose funding, payment method, and pay the first instalment.'
          )
        ) {
          return;
        }
        btn.disabled = true;
        btn.textContent = '…';
        void acceptDocument(id, 'accept').then(function (out) {
          if (!out || !out.ok) {
            btn.disabled = false;
            btn.textContent = 'Accept';
            global.alert('Could not accept (' + ((out && out.error) || 'failed') + ').');
            return;
          }
          if (typeof cfg.toast === 'function') {
            cfg.toast(
              'Accepted · finish link ' +
                (out.finish_url_sent ? 'sent' : 'queued') +
                (out.email_ok ? ' · email' : '') +
                (out.wa_ok ? ' · WhatsApp' : '')
            );
          } else {
            global.alert(
              'Accepted. Parent was sent a finish-booking link (email/WhatsApp when configured).'
            );
          }
          void renderHost(hostEl, participantName);
        });
      });
    });
    hostEl.querySelectorAll('.portal-pax-doc-resend').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = String(btn.getAttribute('data-id') || '').trim();
        var name = String(btn.getAttribute('data-name') || '').trim() || 'this participant';
        if (!id) return;
        if (!global.confirm('Resend finish-booking link to parent for ' + name + '?')) return;
        btn.disabled = true;
        btn.textContent = '…';
        void acceptDocument(id, 'resend_finish_link').then(function (out) {
          btn.disabled = false;
          btn.textContent = 'Resend finish link';
          if (!out || !out.ok) {
            global.alert('Could not resend (' + ((out && out.error) || 'failed') + ').');
            return;
          }
          if (typeof cfg.toast === 'function') {
            cfg.toast(
              'Finish link resent' +
                (out.email_ok ? ' · email' : '') +
                (out.wa_ok ? ' · WhatsApp' : '')
            );
          } else {
            global.alert('Finish-booking link resent.');
          }
        });
      });
    });
  }

  function bindModule() {
    var host = global.document.getElementById('portalParticipantDocsHost');
    if (host) void renderHost(host, '');
    var btn = global.document.getElementById('portalParticipantDocsRefresh');
    if (btn) {
      btn.addEventListener('click', function () {
        var h = global.document.getElementById('portalParticipantDocsHost');
        void renderHost(h, '');
      });
    }
  }

  function workspacePanelHtml(participantName) {
    return (
      '<div class="pax-contacts-more-inner">' +
      '<div class="card card-pad"><h3 style="margin:0 0 8px">Parent-submitted documents</h3>' +
      '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">Climbing registration PDFs and client registration forms (with ID/face photo) sent from the public parent links on Vercel.</p></div>' +
      '<div id="paxWorkspaceDocsHost" data-pax-docs-name="' + esc(participantName || '') + '"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  function bindWorkspacePanel(root) {
    var host = root ? root.querySelector('#paxWorkspaceDocsHost') : global.document.getElementById('paxWorkspaceDocsHost');
    if (!host) return;
    var name = host.getAttribute('data-pax-docs-name') || '';
    void renderHost(host, name);
  }

  global.PortalParticipantDocuments = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    workspacePanelHtml: workspacePanelHtml,
    bindWorkspacePanel: bindWorkspacePanel,
    fetchDocuments: fetchDocuments
  };
})(typeof window !== 'undefined' ? window : globalThis);
