/**
 * Admin — registration forms from Booking Portal leads
 * (client registration vs climbing registration — separate screens).
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

  var REGISTRATION_TYPES = {
    client_registration: true,
    climbing_registration: true
  };

  var SCOPE = {
    client: {
      form_type: 'client_registration',
      title: 'Registration forms',
      intro:
        '<strong>New-client registration</strong> — PDF + photo (FYI). No Accept gate; parents finish funding/payment later via the finish-booking link. ' +
        '<strong>Place</strong> is live only (Registered only / Waiting list / Pay hold / Awaiting Tide / In class / Did not finish). Chosen slot is not listed here - it arrives in the pay-hold / I\'ve paid office alerts. ' +
        'After bank transfer, parent WhatsApps or emails office (must send the message - tap alone does not change admin) → check Tide → <strong>Mark paid</strong> in Re-enrolments → PIN. ' +
        '<strong>Mark reviewed</strong> = you opened the PDF; <strong>Resend finish link</strong> if they lost it. ' +
        'Climbing forms: <button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_climbing_registrations">Climbing registrations</button>. ' +
        'Annual consents: <button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_parent_consents">Parent consents</button>.',
      empty: 'No client registration forms yet.',
      emptyFiltered: 'No client registration forms matched this participant yet.',
      hostId: 'portalParticipantDocsHost',
      refreshId: 'portalParticipantDocsRefresh',
      rootClass: 'portal-participant-docs-embed',
      siblingBtn: {
        target: 'portal_climbing_registrations',
        label: 'Open Climbing registrations'
      }
    },
    climbing: {
      form_type: 'climbing_registration',
      title: 'Climbing registrations',
      intro:
        '<strong>Climbing registration forms</strong> — same pay-first flow as client registration: finish-booking link goes out on submit (no Accept gate). ' +
        'Office gets a FYI email; review the PDF after they pay. ' +
        'Client / lead forms: <button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_participant_documents">Registration forms</button>. ' +
        'Annual consents: <button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_parent_consents">Parent consents</button>.',
      empty: 'No climbing registration forms yet.',
      emptyFiltered: 'No climbing registration forms matched this participant yet.',
      hostId: 'portalClimbingRegsHost',
      refreshId: 'portalClimbingRegsRefresh',
      rootClass: 'portal-climbing-regs-embed',
      siblingBtn: {
        target: 'portal_participant_documents',
        label: 'Open Registration forms'
      }
    }
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

  function resolveScope(scopeOrOpts) {
    var key = 'client';
    if (typeof scopeOrOpts === 'string') {
      key = scopeOrOpts;
    } else if (scopeOrOpts && scopeOrOpts.scope) {
      key = scopeOrOpts.scope;
    }
    if (key === 'climbing' || key === 'climbing_registration') return SCOPE.climbing;
    return SCOPE.client;
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

  async function fetchDocuments(participantName, opts) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired', documents: [] };
    var scope = resolveScope(opts);
    var body = { form_type: scope.form_type };
    if (opts && opts.form_type) body.form_type = opts.form_type;
    if (opts && opts.form_types) body.form_types = opts.form_types;
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
      '<th>Submitted</th><th>Form</th><th>Place</th><th>Participant</th><th>Parent</th><th>Office review</th><th>PDF</th><th>Photo</th><th>Review</th>' +
      '</tr></thead><tbody>' +
      docs.map(function (d) {
        var formType = String(d.form_type || '').toLowerCase();
        var isReg = !!REGISTRATION_TYPES[formType];
        var formLab = FORM_LABELS[formType] || d.form_type || '—';
        try {
          if (
            formType === 'client_registration' &&
            d.payload_json &&
            d.payload_json.existing_client_confirm
          ) {
            formLab = 'Place request (existing client)';
          }
        } catch (_lab) {}
        var placeLab = String(d.place_label || '').trim();
        var placeTone = String(d.place_tone || 'pend').trim() || 'pend';
        var placeKind = String(d.place_kind || '').trim();
        if (placeTone === 'warn') placeTone = 'urg';
        // In class · trial = dark green (active seat).
        if (placeKind === 'trial_in_class' || /^in class\s*·\s*trial$/i.test(placeLab)) {
          placeTone = 'okDark';
        }
        if (!placeLab) {
          placeLab = 'Registered only';
          placeTone = 'pend';
        }
        var placeDetail = String(d.place_detail || '').trim();
        var placeSec = String(d.place_secondary_label || '').trim();
        var placeSecTone = String(d.place_secondary_tone || 'info').trim() || 'info';
        if (placeSecTone === 'warn') placeSecTone = 'urgSoft';
        var placeChips = Array.isArray(d.place_chips) ? d.place_chips : null;
        var formChips = Array.isArray(d.form_chips) ? d.form_chips : null;
        // Fallback when API has not deployed form_chips yet: split LA/NHS · ratio from Place.
        if (!formChips && /local authority\s*\/\s*nhs referral/i.test(placeLab)) {
          formChips = [{ label: 'Local Authority / NHS referral', tone: 'info' }];
          var ratioFromPlace = placeLab.match(/·\s*(1to1|2to1|1:1|2:1)/i);
          if (ratioFromPlace) {
            formChips.push({
              label: /2/.test(ratioFromPlace[1]) ? '2to1' : '1to1',
              tone: 'info',
            });
          }
          placeLab = placeDetail ? 'Pending place' : 'Registered only';
          placeTone = 'pend';
          placeSec = '';
          placeChips = null;
        }
        // Split trial-expired office tags into 3 chips if API did not send place_chips yet.
        if (
          !placeChips &&
          (placeKind === 'registered_trial_expired_slot_lost' ||
            placeKind === 'registered_trial_expired_admin_hold' ||
            /registered\s*·\s*trial expired/i.test(placeLab))
        ) {
          placeChips = [
            { label: 'Registered', tone: 'pend' },
            { label: 'Trial expired', tone: 'orange' },
            {
              label:
                placeKind === 'registered_trial_expired_admin_hold' ||
                /slot hold by admin/i.test(placeSec)
                  ? 'Slot hold by admin'
                  : placeSec || 'Slot lost',
              tone:
                placeKind === 'registered_trial_expired_admin_hold' ||
                /slot hold by admin/i.test(placeSec)
                  ? 'urgSoft'
                  : 'urg',
            },
          ];
          placeSec = '';
        }
        var placeTitle = placeDetail
          ? (placeChips
              ? placeChips
                  .map(function (c) {
                    return c && c.label ? String(c.label) : '';
                  })
                  .filter(Boolean)
                  .join(' + ')
              : placeLab + (placeSec ? ' + ' + placeSec : '')) +
              ' — ' +
              placeDetail
          : 'Live place status (slot comes from finish-booking / pay alerts, not this form)';
        function placeChipHtml(label, tone, title) {
          var t = String(tone || 'pend').trim() || 'pend';
          if (t === 'warn') t = 'urgSoft';
          return (
            '<span class="chip chip--' +
            esc(t) +
            '"' +
            (title ? ' title="' + esc(title) + '"' : '') +
            ' style="max-width:100%;overflow-wrap:break-word;white-space:normal;line-height:1.25">' +
            esc(label) +
            '</span>'
          );
        }
        var formChipsHtml = '';
        if (formChips && formChips.length) {
          formChipsHtml = formChips
            .map(function (c) {
              if (!c || !c.label) return '';
              return placeChipHtml(String(c.label), String(c.tone || 'info'), '');
            })
            .filter(Boolean)
            .join('');
        }
        var placeChipsHtml = '';
        if (placeChips && placeChips.length) {
          placeChipsHtml = placeChips
            .map(function (c) {
              if (!c || !c.label) return '';
              return placeChipHtml(String(c.label), String(c.tone || 'pend'), placeTitle);
            })
            .filter(Boolean)
            .join('');
        } else {
          placeChipsHtml =
            placeChipHtml(placeLab, placeTone, placeTitle) +
            (placeSec ? placeChipHtml(placeSec, placeSecTone, '') : '');
        }
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
          : '<span class="muted">No photo</span>';
        var reviewed = String(d.status || '').toLowerCase() === 'reviewed';
        var reviewCell;
        if (!isReg) {
          reviewCell = '<span class="muted" style="font-size:12px">Consents — use Parent consents</span>';
        } else if (reviewed) {
          reviewCell =
            '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
            '<span class="chip chip--ok">Reviewed</span>' +
            '<button type="button" class="btn btn--ghost btn--sm portal-pax-doc-resend" data-id="' +
            esc(d.id) +
            '" data-name="' +
            esc(d.participant_name || '') +
            '">Resend finish link</button>' +
            '</div>';
        } else {
          reviewCell =
            '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
            '<button type="button" class="btn btn--sec btn--sm portal-pax-doc-accept" data-id="' +
            esc(d.id) +
            '" data-name="' +
            esc(d.participant_name || '') +
            '">Mark reviewed</button>' +
            '<button type="button" class="btn btn--ghost btn--sm portal-pax-doc-resend" data-id="' +
            esc(d.id) +
            '" data-name="' +
            esc(d.participant_name || '') +
            '">Resend finish link</button>' +
            '</div>';
        }
        return (
          '<tr>' +
          '<td class="muted" style="white-space:nowrap">' +
          esc(formatDate(d.submitted_at)) +
          '</td>' +
          '<td style="min-width:0;max-width:14rem;overflow-wrap:break-word">' +
          '<div style="display:flex;flex-direction:column;gap:4px;min-width:0;align-items:flex-start">' +
          '<span style="overflow-wrap:break-word">' +
          esc(formLab) +
          '</span>' +
          (formChipsHtml
            ? '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;align-items:flex-start">' +
              formChipsHtml +
              '</div>'
            : '') +
          '</div>' +
          '</td>' +
          '<td style="min-width:0;max-width:12rem">' +
          '<div style="display:flex;flex-direction:column;gap:2px;min-width:0">' +
          placeChipsHtml +
          (placeDetail
            ? '<span class="muted" style="font-size:11px;line-height:1.25;overflow-wrap:break-word">' +
              esc(placeDetail) +
              '</span>'
            : '') +
          '</div></td>' +
          '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
          esc(d.participant_name || '—') +
          '</strong></td>' +
          '<td class="muted" style="min-width:0;max-width:14rem;overflow-wrap:break-word">' +
          esc(parentLine) +
          '</td>' +
          '<td><span class="chip chip--' +
          (reviewed ? 'ok' : 'pend') +
          '">' +
          esc(reviewed ? 'reviewed' : d.status || 'new') +
          '</span></td>' +
          '<td>' +
          pdfLink +
          '</td>' +
          '<td>' +
          photoLink +
          '</td>' +
          '<td style="min-width:0">' +
          reviewCell +
          '</td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table></div></div>'
    );
  }

  function viewHtml(opts) {
    var scope = resolveScope(opts);
    return (
      '<div class="' +
      scope.rootClass +
      '" data-docs-scope="' +
      (scope.form_type === 'climbing_registration' ? 'climbing' : 'client') +
      '">' +
      '<h1 class="page-title">' +
      esc(scope.title) +
      '</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">' +
      scope.intro +
      '</p>' +
      '<div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="' +
      scope.refreshId +
      '">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="' +
      scope.siblingBtn.target +
      '">' +
      esc(scope.siblingBtn.label) +
      '</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_parent_consents">Open Parent consents</button>' +
      '</div>' +
      '<div id="' +
      scope.hostId +
      '"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  async function renderHost(hostEl, participantName, opts) {
    if (!hostEl) return;
    var scope = resolveScope(opts || hostEl.getAttribute('data-docs-scope') || 'client');
    hostEl.setAttribute('data-docs-scope', scope.form_type === 'climbing_registration' ? 'climbing' : 'client');
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var fetchOpts = opts && (opts.form_type || opts.form_types) ? opts : { form_type: scope.form_type };
    var res = await fetchDocuments(participantName, fetchOpts);
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="color:var(--danger,#c62828)">Could not load documents (' + esc(res.error) + ').</p>';
      return;
    }
    var emptyMsg = participantName ? scope.emptyFiltered : scope.empty;
    if (opts && opts.form_types) {
      emptyMsg = participantName
        ? 'No registration forms matched this participant yet.'
        : 'No registration forms yet.';
    }
    var intro = participantName
      ? '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">Matched to <strong>' +
        esc(participantName) +
        '</strong> (' +
        esc(String((res.documents || []).length)) +
        ').</p>'
      : '<p class="muted" style="margin:0 0 10px">' +
        esc(String((res.documents || []).length)) +
        ' submission(s).</p>';
    hostEl.innerHTML = intro + documentsTableHtml(res.documents, emptyMsg);
    hostEl.querySelectorAll('.portal-pax-doc-open').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        var url = String(btn.getAttribute('data-url') || '')
          .replace(/&amp;/g, '&')
          .trim();
        if (!url) return;
        try {
          var a = global.document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.display = 'none';
          global.document.body.appendChild(a);
          a.click();
          if (a.parentNode) a.parentNode.removeChild(a);
        } catch (_e) {
          try {
            global.open(url, '_blank');
          } catch (_e2) {
            cfg.toast('Could not open document — allow pop-ups for this site.', 'err');
          }
        }
      });
    });
    hostEl.querySelectorAll('[data-view-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-view-target');
        if (id && typeof global.portalAdminSetView === 'function') {
          global.portalAdminSetView(id);
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
            'Mark registration reviewed for ' +
              name +
              '?\n\nThis only records that you opened the form. Payment finish-booking is already sent on submit — use Resend finish link if they need it again.'
          )
        ) {
          return;
        }
        btn.disabled = true;
        btn.textContent = '…';
        void acceptDocument(id, 'accept').then(function (out) {
          if (!out || !out.ok) {
            btn.disabled = false;
            btn.textContent = 'Mark reviewed';
            global.alert('Could not mark reviewed (' + ((out && out.error) || 'failed') + ').');
            return;
          }
          if (typeof cfg.toast === 'function') {
            cfg.toast(
              'Reviewed · finish link ' +
                (out.finish_url_sent ? 'sent/resent' : 'ok') +
                (out.email_ok ? ' · email' : '') +
                (out.wa_ok ? ' · WhatsApp' : '')
            );
          } else {
            global.alert('Marked reviewed. Finish-booking link resent if needed.');
          }
          void renderHost(hostEl, participantName, { scope: hostEl.getAttribute('data-docs-scope') || 'client' });
        });
      });
    });
    hostEl.querySelectorAll('.portal-pax-doc-resend').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = String(btn.getAttribute('data-id') || '').trim();
        var name = String(btn.getAttribute('data-name') || '').trim() || 'this participant';
        if (!id) return;
        if (!global.confirm(
          'Resend finish-booking link for ' +
            name +
            '?\n\nThis re-holds their Booking Portal seat for 30 minutes and tells them to finish funding/payment now. If the slot is full, nothing is sent.',
        )) return;
        btn.disabled = true;
        btn.textContent = '…';
        void acceptDocument(id, 'resend_finish_link').then(function (out) {
          btn.disabled = false;
          btn.textContent = 'Resend finish link';
          if (!out || !out.ok) {
            global.alert(
              out && out.error === 'slot_unavailable'
                ? 'Could not re-hold — that slot looks full. Link was not sent.'
                : 'Could not resend (' + ((out && out.error) || 'failed') + ').',
            );
            return;
          }
          var holdMsg = out.slot_held
            ? ' · seat held 30′'
            : out.rehold_error
              ? ' · no seat re-hold (' + out.rehold_error + ')'
              : '';
          if (typeof cfg.toast === 'function') {
            cfg.toast(
              'Finish link resent' +
                holdMsg +
                (out.email_ok ? ' · email' : '') +
                (out.wa_ok ? ' · WhatsApp' : ''),
            );
          } else {
            global.alert('Finish-booking link resent' + holdMsg + '.');
          }
        });
      });
    });
  }

  function bindModule(opts) {
    var scope = resolveScope(opts);
    var host = global.document.getElementById(scope.hostId);
    if (host) void renderHost(host, '', { scope: scope.form_type === 'climbing_registration' ? 'climbing' : 'client' });
    var btn = global.document.getElementById(scope.refreshId);
    if (btn) {
      btn.addEventListener('click', function () {
        var h = global.document.getElementById(scope.hostId);
        void renderHost(h, '', { scope: scope.form_type === 'climbing_registration' ? 'climbing' : 'client' });
      });
    }
    var root = global.document.querySelector('.' + scope.rootClass);
    if (root) {
      root.querySelectorAll('[data-view-target]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-view-target');
          if (id && typeof global.portalAdminSetView === 'function') {
            global.portalAdminSetView(id);
          }
        });
      });
    }
  }

  function workspacePanelHtml(participantName) {
    return (
      '<div class="pax-contacts-more-inner">' +
      '<div class="card card-pad"><h3 style="margin:0 0 8px">Registration forms</h3>' +
      '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">Client and climbing registration PDF + photo. Annual consents are under Documents → Parent consents.</p></div>' +
      '<div id="paxWorkspaceDocsHost" data-pax-docs-name="' +
      esc(participantName || '') +
      '"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  function bindWorkspacePanel(root) {
    var host = root ? root.querySelector('#paxWorkspaceDocsHost') : global.document.getElementById('paxWorkspaceDocsHost');
    if (!host) return;
    var name = host.getAttribute('data-pax-docs-name') || '';
    void renderHost(host, name, {
      form_types: ['client_registration', 'climbing_registration']
    });
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
