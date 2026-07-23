/**
 * Admin — share client invoice PDFs with the parent hub (Phase 1: view only).
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

  var state = {
    filter: 'all',
    amountPeriod: 'autumn',
    invoices: [],
    meta: {},
    searchHits: [],
    tideMatches: [],
    tideMeta: {}
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

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        var p = iso.split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function formatMoney(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return '£' + v.toFixed(2);
  }

  async function api(path, body, isForm) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired', message: 'Sign in again to load Finance.' };
    var headers = {
      Authorization: 'Bearer ' + token,
      apikey: cfg.getAnonKey()
    };
    var opts = { method: 'POST', headers: headers };
    if (isForm) {
      opts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    var res;
    try {
      res = await fetch(supabaseBase() + '/functions/v1/' + path, opts);
    } catch (err) {
      return {
        error: 'network_error',
        message: (err && err.message) || 'Could not reach Supabase (network / CORS).'
      };
    }
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || ('HTTP ' + res.status) };
    }
    return j;
  }

  function tideScoreChip(score) {
    var s = String(score || 'none');
    var tone = s === 'strong' ? 'ok' : s === 'medium' ? 'pend' : 'warn';
    return '<span class="chip chip--' + tone + '">' + esc(s) + '</span>';
  }

  function tideMatchRowHtml(m) {
    var id = esc(m.id);
    var inv = m.invoice || null;
    var invLabel = inv
      ? esc(inv.invoice_number || String(inv.id).slice(0, 8)) +
        ' · ' +
        esc(inv.participant_name || inv.contact_id || '—') +
        ' · ' +
        esc(formatMoney(inv.amount_gbp))
      : '<span class="muted">No invoice suggested</span>';
    var confirmDisabled = !inv || inv.payment_status === 'paid' ? ' disabled' : '';
    return (
      '<tr>' +
      '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word">' +
      esc(formatDate(m.booking_date)) +
      '</td>' +
      '<td>' +
      esc(formatMoney(m.amount_gbp)) +
      '</td>' +
      '<td style="min-width:0;max-width:18rem;overflow-wrap:break-word">' +
      esc(m.reference_raw || '—') +
      '</td>' +
      '<td>' +
      tideScoreChip(m.score) +
      '</td>' +
      '<td style="min-width:0;max-width:16rem;overflow-wrap:break-word">' +
      invLabel +
      '</td>' +
      '<td style="white-space:nowrap">' +
      '<button type="button" class="btn btn--sm btn--primary" data-tide-act="confirm" data-tide-id="' +
      id +
      '"' +
      confirmDisabled +
      '>Confirm</button> ' +
      '<button type="button" class="btn btn--sm btn--ghost" data-tide-act="ignore" data-tide-id="' +
      id +
      '">Ignore</button>' +
      '</td>' +
      '</tr>'
    );
  }

  async function loadTideMatches() {
    var r = await api('portal-admin-tide-match-list', { status: 'suggested', limit: 80 });
    if (r.error) {
      state.tideMatches = [];
      state.tideMeta = {};
      return r;
    }
    state.tideMatches = r.matches || [];
    state.tideMeta = r.meta || {};
    return r;
  }

  function renderTidePanel() {
    var host = global.document.getElementById('portalTideMatchHost');
    if (!host) return;
    var rows = state.tideMatches || [];
    var meta = state.tideMeta || {};
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted" style="margin:8px 0 0;overflow-wrap:break-word">No open Tide suggestions. Export credits from Tide and upload the CSV above.</p>';
      return;
    }
    host.innerHTML =
      '<p class="muted" style="margin:0 0 8px;overflow-wrap:break-word">' +
      esc(String(meta.suggested || rows.length)) +
      ' suggested (' +
      esc(String(meta.strong || 0)) +
      ' strong · ' +
      esc(String(meta.medium || 0)) +
      ' review). Confirm marks the invoice paid and creates the Xero ACCREC if missing (awaiting payment) — mark Paid + reconcile in Xero.</p>' +
      '<div style="overflow:auto;max-width:100%">' +
      '<table class="table" style="width:100%;min-width:42rem">' +
      '<thead><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Score</th><th>Invoice</th><th>Actions</th></tr></thead>' +
      '<tbody>' +
      rows.map(tideMatchRowHtml).join('') +
      '</tbody></table></div>';

    host.querySelectorAll('[data-tide-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-tide-act');
        var matchId = btn.getAttribute('data-tide-id');
        if (!act || !matchId) return;
        btn.disabled = true;
        void api('portal-admin-tide-match-confirm', {
          action: act,
          match_id: matchId
        }).then(function (r) {
          btn.disabled = false;
          if (r.error) {
            cfg.toast(r.message || r.error || 'Tide match failed', 'error');
            return;
          }
          cfg.toast(
            act === 'confirm' ? 'Tide match confirmed — invoice paid' : 'Tide row ignored',
            'ok'
          );
          void refreshTideAndInvoices();
        });
      });
    });
  }

  async function refreshTideAndInvoices() {
    await loadTideMatches();
    renderTidePanel();
    var invHost = global.document.getElementById('portalParentInvoicesHost');
    if (invHost) void renderHost(invHost);
  }

  function bindTideMatchPanel() {
    var fileEl = global.document.getElementById('portalTideMatchFile');
    var uploadBtn = global.document.getElementById('portalTideMatchUpload');
    var refreshBtn = global.document.getElementById('portalTideMatchRefresh');
    if (uploadBtn && fileEl) {
      uploadBtn.addEventListener('click', function () {
        var file = fileEl.files && fileEl.files[0];
        if (!file) {
          cfg.toast('Choose a Tide CSV first', 'error');
          return;
        }
        var fd = new FormData();
        fd.append('file', file);
        uploadBtn.disabled = true;
        void api('portal-admin-tide-match-upload', fd, true).then(function (r) {
          uploadBtn.disabled = false;
          if (r.error) {
            cfg.toast(r.message || r.error || 'Upload failed', 'error');
            return;
          }
          var scores = r.scores || {};
          cfg.toast(
            'Parsed ' +
              (r.parsed || 0) +
              ' · ' +
              (scores.strong || 0) +
              ' strong / ' +
              (scores.medium || 0) +
              ' review',
            'ok'
          );
          fileEl.value = '';
          void refreshTideAndInvoices();
        });
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        void refreshTideAndInvoices();
      });
    }
    void loadTideMatches().then(function () {
      renderTidePanel();
    });
  }

  function statusChip(payment, share) {
    var pay = String(payment || 'unpaid');
    var sh = String(share || 'hidden');
    /* Green = paid only; orange = unpaid only. Everything else uses neutral tones. */
    var payCls = 'pp-inv-acc__pay-chip pp-inv-acc__pay-chip--other';
    if (pay === 'paid') payCls = 'pp-inv-acc__pay-chip pp-inv-acc__pay-chip--paid';
    else if (pay === 'unpaid') payCls = 'pp-inv-acc__pay-chip pp-inv-acc__pay-chip--unpaid';
    else if (pay === 'pending_confirmation') payCls = 'pp-inv-acc__pay-chip pp-inv-acc__pay-chip--pending';
    else if (pay === 'partial') payCls = 'pp-inv-acc__pay-chip pp-inv-acc__pay-chip--pending';
    var shareCls =
      'pp-inv-acc__pay-chip ' +
      (sh === 'ready' ? 'pp-inv-acc__pay-chip--shared' : 'pp-inv-acc__pay-chip--hidden');
    return (
      '<span class="' +
      payCls +
      '">' +
      esc(pay.replace(/_/g, ' ')) +
      '</span> ' +
      '<span class="' +
      shareCls +
      '">' +
      esc(sh) +
      '</span>'
    );
  }

  /** Payment via: Bank Transfer & Apple Pay · GoCardless */
  function methodChannelLabel(inv) {
    var reenrolPay = String(inv.reenrol_payment_method_code || '').toLowerCase();
    var hint = String(inv.payment_method_hint || '').toLowerCase();
    var via = String(inv.paid_via || '').toLowerCase();
    if (hint === 'la_funded') return 'LA funded';
    if (
      reenrolPay === 'gocardless' ||
      via === 'gocardless' ||
      hint === 'gocardless' ||
      inv.gocardless_url
    ) {
      return 'GoCardless';
    }
    if (via === 'stripe' || hint === 'payment_link' || inv.payment_link_url) {
      return 'Bank Transfer & Apple Pay';
    }
    if (
      reenrolPay === 'bank_transfer' ||
      via === 'tide' ||
      via === 'bank' ||
      hint === 'bank_transfer'
    ) {
      return 'Bank Transfer & Apple Pay';
    }
    if (via === 'admin') return 'Admin / Office';
    return 'Bank Transfer & Apple Pay';
  }

  function scheduleRows(inv) {
    var sched = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
    return sched.filter(function (r) {
      return r && Number(r.amount_gbp) > 0;
    });
  }

  /**
   * Arrangement chip:
   * One-off payment (year) · One-off payment (term) ·
   * Flexi: 2 instalments per Term / 6 per year ·
   * GoCardless (one invoice per term) · GoCardless (monthly ×10)
   */
  function schedulePlanShort(inv) {
    var code = String(inv.reenrol_payment_schedule_code || '').toLowerCase();
    var channel = methodChannelLabel(inv);
    var isGc = channel === 'GoCardless';
    if (code === 'yearly_1off') return 'One-off payment (year)';
    if (code === 'term_flexi') return 'Flexi: 2 instalments per Term / 6 per year';
    if (code === 'monthly_10') return 'GoCardless (monthly ×10)';
    if (code === 'monthly_term') return 'GoCardless (monthly)';
    if (code === 'term_3') {
      return isGc ? 'GoCardless (one invoice per term)' : 'One-off payment (term)';
    }

    var rows = scheduleRows(inv);
    var blob = rows
      .map(function (r) {
        return String(r.label || '');
      })
      .join(' ')
      .toLowerCase();
    var notes = String(inv.notes || '').toLowerCase();
    var hay = blob + ' ' + notes;
    var n = rows.length;
    if (!n) return '';
    if (
      /yearly_1off|one[\s-]?off.*(year|annual)|full academic year|whole year/.test(hay) ||
      (n === 1 && /\b(year|annual|full year)\b/.test(blob))
    ) {
      return 'One-off payment (year)';
    }
    if (n >= 2 && /\b(half|1st|2nd|flexi)\b/.test(hay)) {
      return 'Flexi: 2 instalments per Term / 6 per year';
    }
    if (isGc && n >= 3) return 'GoCardless (monthly ×10)';
    if (isGc && n === 1) return 'GoCardless (one invoice per term)';
    if (!isGc && n === 1) return 'One-off payment (term)';
    if (!isGc) return 'Flexi: 2 instalments per Term / 6 per year';
    return 'GoCardless (monthly ×10)';
  }

  function isAutoReenrolledInv(inv) {
    return !!(inv && (inv.created_via === 'la_office_auto' || inv.is_la_office_auto));
  }

  /** Enrolment cadence / method: AUTO vs TERMLY */
  function enrolmentCadenceKey(inv) {
    if (isAutoReenrolledInv(inv)) return 'AUTO';
    var cadence = String(inv.reenrol_enrolment_cadence || '').toLowerCase();
    if (cadence === 'whole_year' || cadence === 'auto') return 'AUTO';
    if (cadence === 'term_by_term' || cadence === 'termly') return 'TERMLY';
    var plan = schedulePlanShort(inv);
    if (plan === 'One-off payment (year)') return 'AUTO';
    var notes = String((inv && inv.notes) || '').toLowerCase();
    if (/yearly_1off|auto[_\s-]?continue/.test(notes)) return 'AUTO';
    return 'TERMLY';
  }

  function enrolmentCadenceChipHtml(key) {
    var k = key === 'AUTO' ? 'AUTO' : 'TERMLY';
    var cls = k === 'AUTO' ? 'pp-inv-acc__type pp-inv-acc__type--auto' : 'pp-inv-acc__type pp-inv-acc__type--termly';
    var title =
      k === 'AUTO'
        ? 'AUTO — place continues for the year (office renew or yearly plan)'
        : 'TERMLY — re-enrol / bill each term';
    return (
      '<span class="' +
      cls +
      '" title="' +
      title +
      '">' +
      k +
      '</span>'
    );
  }

  function groupEnrolmentCadenceKey(invoices) {
    var list = invoices || [];
    if (!list.length) return 'TERMLY';
    if (list.some(isAutoReenrolledInv)) return 'AUTO';
    var allAuto = list.every(function (inv) {
      return enrolmentCadenceKey(inv) === 'AUTO';
    });
    return allAuto ? 'AUTO' : 'TERMLY';
  }

  function autoReenrolledChipHtml() {
    return enrolmentCadenceChipHtml('AUTO');
  }

  function methodLabel(inv) {
    var channel = methodChannelLabel(inv);
    var plan = schedulePlanShort(inv);
    return plan ? channel + ' · ' + plan : channel;
  }

  function arrangementChipHtml(plan) {
    var text = String(plan || '').trim();
    if (!text) return '';
    return (
      '<span class="pp-inv-acc__arrange" title="Payment arrangement">' +
      esc(text) +
      '</span>'
    );
  }

  /** Funding → AUTO/TERMLY → via → arrangement (detail card). */
  function methodChipsHtml(inv) {
    var cadence = enrolmentCadenceKey(inv);
    var channel = methodChannelLabel(inv);
    var plan = schedulePlanShort(inv);
    var html = fundingChipHtml(inv) + ' ' + enrolmentCadenceChipHtml(cadence);
    if (!isAutoReenrolledInv(inv)) {
      html += ' ' + methodChipHtml(channel);
    }
    if (plan && !(plan === 'TERMLY' && cadence === 'TERMLY')) {
      html += ' ' + arrangementChipHtml(plan);
    }
    var rows = scheduleRows(inv);
    if (rows.length) {
      var dates = rows
        .map(function (r) {
          return formatDate(r.due_date);
        })
        .filter(Boolean)
        .join(' · ');
      if (dates) {
        html +=
          '<div class="muted pp-inv-acc__plan-dates" style="font-size:11px;margin-top:4px;line-height:1.35;min-width:0;overflow-wrap:break-word">' +
          esc(dates) +
          '</div>';
      }
    }
    return html;
  }

  /**
   * Funding: Privately · Supported with Funds from the LA · LA managed · NHS managed.
   * Prefer API category; never infer DP from vat_mode=exempt alone.
   */
  function fundingCategoryLabel(inv) {
    var cat = String((inv && inv.funding_category) || '').toLowerCase();
    var fundRaw = String((inv && inv.funding_label) || '').toLowerCase();
    var apiLabel = String((inv && inv.funding_category_label) || '').trim();
    var code = String((inv && inv.reenrol_funding_code) || '').toLowerCase();
    var billing = String((inv && inv.reenrol_billing_mode) || '').toLowerCase();
    var blob = code + ' ' + billing + ' ' + fundRaw + ' ' + apiLabel.toLowerCase();

    if (
      cat === 'nhs_managed' ||
      /\bnhs\b/.test(blob) ||
      /\bsbs\b/.test(blob)
    ) {
      return 'NHS managed';
    }
    if (
      cat === 'la_managed' ||
      billing === 'funder_invoice' ||
      code === 'la_managed' ||
      /^la managed$/i.test(apiLabel)
    ) {
      return 'LA managed';
    }
    if (
      cat === 'parent_direct_payment' ||
      billing === 'direct_payments' ||
      code === 'la_direct_payments' ||
      /direct payment|supported with funds|care package|ehcp/.test(blob)
    ) {
      return 'Supported with Funds from the LA';
    }
    if (
      cat === 'parent_private' ||
      billing === 'private' ||
      code === 'privately_funded' ||
      code === 'private' ||
      /private/i.test(apiLabel) ||
      /private/.test(fundRaw)
    ) {
      return 'Privately';
    }
    if (apiLabel) return apiLabel;
    var hint = String((inv && inv.payment_method_hint) || '').toLowerCase();
    if (hint === 'la_funded') return 'LA managed';
    return 'Privately';
  }

  /** VAT line must follow funding route — never show 20% VAT on DP / LA / NHS. */
  function vatDisplayLabel(inv) {
    var cat = String(inv.funding_category || '').toLowerCase();
    var fund = fundingCategoryLabel(inv).toLowerCase();
    if (
      cat === 'parent_direct_payment' ||
      cat === 'la_managed' ||
      cat === 'nhs_managed' ||
      fund.indexOf('supported with funds') >= 0 ||
      fund === 'la managed' ||
      fund === 'nhs managed'
    ) {
      return 'Exempt';
    }
    var vat = String(inv.vat_mode || '').toLowerCase();
    if (vat === 'exempt' && cat && cat !== 'parent_private') return 'Exempt';
    if (vat === 'vat_20') return 'Includes 20% VAT (in price)';
    if (cat === 'parent_private' || fund === 'privately') {
      return 'Includes 20% VAT (in price)';
    }
    if (vat === 'exempt') return 'Exempt';
    return '—';
  }

  function fundingToneClass(label) {
    var s = String(label || '').toLowerCase();
    if (s.indexOf('nhs') >= 0) return 'pp-inv-acc__fund--nhs';
    if (s === 'la managed' || s.indexOf('la funded') >= 0) {
      return 'pp-inv-acc__fund--la';
    }
    if (s.indexOf('supported with funds') >= 0 || s.indexOf('direct payment') >= 0) {
      return 'pp-inv-acc__fund--direct';
    }
    return 'pp-inv-acc__fund--private';
  }

  function fundingChipHtml(inv) {
    var text = fundingCategoryLabel(inv);
    return (
      '<span class="pp-inv-acc__fund ' +
      fundingToneClass(text) +
      '" title="Funding route">' +
      esc(text) +
      '</span>'
    );
  }

  function groupFundingChipsHtml(invoices) {
    var seen = Object.create(null);
    var out = [];
    (invoices || []).forEach(function (inv) {
      var m = fundingCategoryLabel(inv);
      if (!seen[m]) {
        seen[m] = true;
        out.push(
          '<span class="pp-inv-acc__fund ' +
            fundingToneClass(m) +
            '" title="Funding route">' +
            esc(m) +
            '</span>',
        );
      }
    });
    return out.join('');
  }

  function methodToneClass(label) {
    var s = String(label || '').toLowerCase();
    if (s.indexOf('la funded') >= 0 || s === 'la') {
      return 'pp-inv-acc__method--la';
    }
    if (s.indexOf('gocardless') >= 0) {
      return 'pp-inv-acc__method--gc';
    }
    if (s.indexOf('card') >= 0 || s.indexOf('apple') >= 0 || s.indexOf('stripe') >= 0) {
      return 'pp-inv-acc__method--card';
    }
    if (s.indexOf('admin') >= 0 || s.indexOf('office') >= 0) {
      return 'pp-inv-acc__method--admin';
    }
    if (s.indexOf('bank') >= 0 || s.indexOf('tide') >= 0) {
      return 'pp-inv-acc__method--bank';
    }
    return 'pp-inv-acc__method--other';
  }

  function methodChipHtml(label) {
    var text =
      String(label || 'Bank Transfer & Apple Pay').trim() ||
      'Bank Transfer & Apple Pay';
    return (
      '<span class="pp-inv-acc__method ' +
      methodToneClass(text) +
      '" title="Payment via">' +
      esc(text) +
      '</span>'
    );
  }

  /**
   * Summary chips: Funding → AUTO/TERMLY → via → arrangement.
   */
  function groupMetaChipsHtml(invoices) {
    var list = invoices || [];
    var cadence = groupEnrolmentCadenceKey(list);
    var autoOnly = list.length > 0 && list.every(isAutoReenrolledInv);
    var ready = list.filter(function (inv) {
      return String(inv.share_status || '').toLowerCase() === 'ready';
    });
    var pool = ready.length
      ? ready
      : list.filter(function (inv) {
          return !isAutoReenrolledInv(inv);
        });
    if (!pool.length) pool = list;
    var withSched = pool.filter(function (inv) {
      return scheduleRows(inv).length > 0;
    });
    var source = withSched.length ? withSched : pool;
    var seen = Object.create(null);
    var out = [];
    out.push(groupFundingChipsHtml(list));
    out.push(enrolmentCadenceChipHtml(cadence));
    if (autoOnly) return out.join('');
    source.forEach(function (inv) {
      if (isAutoReenrolledInv(inv)) return;
      var channel = methodChannelLabel(inv);
      var plan = schedulePlanShort(inv);
      var key = channel + '|' + plan;
      if (seen[key]) return;
      seen[key] = true;
      out.push(methodChipHtml(channel));
      if (plan && !(plan === 'TERMLY' && cadence === 'TERMLY')) {
        out.push(arrangementChipHtml(plan));
      }
    });
    return out.join('');
  }

  function xeroSummary(inv) {
    var pay = String((inv && inv.payment_status) || '').toLowerCase();
    /* Xero push creates ACCREC awaiting payment — unpaid drafts stay Portal-only. */
    if (pay !== 'paid') return '';
    if (inv.xero_invoice_id) {
      return inv.xero_payment_id
        ? '<span class="pp-inv-acc__xero pp-inv-acc__xero--ok">In Xero · paid</span>'
        : '<span class="pp-inv-acc__xero pp-inv-acc__xero--ok">In Xero</span>';
    }
    if (inv.xero_push_status === 'failed') {
      return '<span class="pp-inv-acc__xero pp-inv-acc__xero--fail">Xero failed</span>';
    }
    if (inv.created_via === 'portal' || inv.created_via === 'reenrolment') {
      return '<span class="pp-inv-acc__xero">Not in Xero</span>';
    }
    return '';
  }

  /** YYYY-MM-DD of when the family completed re-enrolment (local calendar day). */
  function reenrolDateKey(inv) {
    var raw = String(
      (inv && (inv.reenrolment_submitted_at || inv.created_at || inv.document_created_at)) || '',
    ).trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      /* Prefer local calendar day from the timestamp when time is present. */
      try {
        var d0 = new Date(raw);
        if (!isNaN(d0.getTime()) && /T|\d{2}:\d{2}/.test(raw)) {
          var y0 = d0.getFullYear();
          var m0 = String(d0.getMonth() + 1).padStart(2, '0');
          var day0 = String(d0.getDate()).padStart(2, '0');
          return y0 + '-' + m0 + '-' + day0;
        }
      } catch (_e0) {}
      return raw.slice(0, 10);
    }
    try {
      var d = new Date(raw);
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    } catch (_e) {
      return '';
    }
  }

  function formatReenrolDayLabel(isoDate) {
    if (!isoDate) return 'No re-enrolment date';
    var p = String(isoDate).split('-');
    if (p.length < 3) return String(isoDate);
    try {
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      if (isNaN(d.getTime())) return String(isoDate);
      return d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (_e) {
      return String(isoDate);
    }
  }

  function groupInvoicesByParticipant(invoices) {
    var order = [];
    var byId = Object.create(null);
    (invoices || []).forEach(function (inv) {
      var key = String(inv.contact_id || inv.participant_display || inv.id || '');
      if (!byId[key]) {
        byId[key] = {
          contact_id: inv.contact_id,
          name: inv.participant_display || inv.related_client || inv.contact_id || 'Participant',
          invoices: [],
          reenrolment_submitted_at: inv.reenrolment_submitted_at || null,
          booked_annual_gbp: null,
          booked_autumn_gbp: null,
          booked_spring_gbp: null,
          booked_summer_gbp: null,
          booked_term_gbp: null,
          billing_term_label: inv.billing_term_label || null,
          is_la_office_auto: !!inv.is_la_office_auto || inv.created_via === 'la_office_auto'
        };
        order.push(key);
      }
      var g = byId[key];
      g.invoices.push(inv);
      if (inv.reenrolment_submitted_at) {
        if (
          !g.reenrolment_submitted_at ||
          String(inv.reenrolment_submitted_at) > String(g.reenrolment_submitted_at)
        ) {
          g.reenrolment_submitted_at = inv.reenrolment_submitted_at;
        }
      }
      var ann = Number(inv.booked_annual_gbp);
      if (Number.isFinite(ann) && ann > 0) {
        g.booked_annual_gbp = Math.max(Number(g.booked_annual_gbp) || 0, ann);
      }
      ['autumn', 'spring', 'summer'].forEach(function (term) {
        var bookedKey = 'booked_' + term + '_gbp';
        var v = Number(inv[bookedKey]);
        if (Number.isFinite(v) && v > 0) {
          g[bookedKey] = Math.max(Number(g[bookedKey]) || 0, v);
        }
      });
      var term = Number(inv.booked_term_gbp);
      if (Number.isFinite(term) && term > 0) {
        g.booked_term_gbp = Math.max(Number(g.booked_term_gbp) || 0, term);
      }
      if (inv.billing_term_label) g.billing_term_label = inv.billing_term_label;
      if (inv.is_la_office_auto || inv.created_via === 'la_office_auto') {
        g.is_la_office_auto = true;
      }
    });
    return order
      .map(function (k) {
        return byId[k];
      })
      .sort(function (a, b) {
        var ta = String(a.reenrolment_submitted_at || '');
        var tb = String(b.reenrolment_submitted_at || '');
        if (ta && tb && ta !== tb) return tb.localeCompare(ta);
        if (ta && !tb) return -1;
        if (!ta && tb) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }

  /**
   * Nested: re-enrolment completion date → participants.
   * Newest re-enrolment days first; undated at the end.
   */
  function groupInvoicesByDayThenParticipant(invoices) {
    var byDay = Object.create(null);
    var dayOrder = [];
    (invoices || []).forEach(function (inv) {
      var key = reenrolDateKey(inv) || '_none';
      if (!byDay[key]) {
        byDay[key] = [];
        dayOrder.push(key);
      }
      byDay[key].push(inv);
    });
    dayOrder.sort(function (a, b) {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      return String(b).localeCompare(String(a));
    });
    return dayOrder.map(function (key) {
      var list = byDay[key] || [];
      var participants = groupInvoicesByParticipant(list);
      var invIds = Object.create(null);
      var invN = 0;
      list.forEach(function (inv) {
        var id = String(inv.id || inv.invoice_number || '');
        if (!id || invIds[id]) return;
        invIds[id] = 1;
        invN += 1;
      });
      return {
        day: key === '_none' ? 'No re-enrolment date' : formatReenrolDayLabel(key),
        day_key: key,
        participants: participants,
        invoice_count: invN,
        participant_count: participants.length,
      };
    });
  }

  function groupMethodSummary(invoices) {
    var seen = Object.create(null);
    var labels = [];
    (invoices || []).forEach(function (inv) {
      var m = methodLabel(inv);
      if (!seen[m]) {
        seen[m] = true;
        labels.push(m);
      }
    });
    return labels.length ? labels.join(' · ') : 'Bank transfer';
  }

  function invoiceSortRank(inv) {
    var pay = String((inv && inv.payment_status) || 'unpaid').toLowerCase();
    if (pay === 'paid') return 0;
    if (pay === 'pending_confirmation') return 1;
    if (pay === 'partial') return 2;
    if (pay === 'unpaid') return 3;
    if (pay === 'void') return 8;
    return 5;
  }

  function sortInvoicesForDisplay(invoices) {
    return (invoices || []).slice().sort(function (a, b) {
      var ra = invoiceSortRank(a);
      var rb = invoiceSortRank(b);
      if (ra !== rb) return ra - rb;
      var da = String(a.updated_at || a.due_date || '');
      var db = String(b.updated_at || b.due_date || '');
      return db.localeCompare(da);
    });
  }

  function summaryFilterChip(filter, label, payTone) {
    var cls = 'pp-inv-acc__pay-chip pp-inv-acc__filter-chip';
    if (payTone === 'paid') cls += ' pp-inv-acc__pay-chip--paid';
    else if (payTone === 'unpaid') cls += ' pp-inv-acc__pay-chip--unpaid';
    else if (payTone === 'pending') cls += ' pp-inv-acc__pay-chip--pending';
    else if (payTone === 'hidden') cls += ' pp-inv-acc__pay-chip--hidden';
    else cls += ' pp-inv-acc__pay-chip--other';
    return (
      '<button type="button" class="' +
      cls +
      '" data-inv-filter="' +
      esc(filter) +
      '" title="Show ' +
      esc(label) +
      ' only">' +
      esc(label) +
      '</button>'
    );
  }

  function groupStatusSummary(invoices) {
    var unpaid = 0;
    var paid = 0;
    var pending = 0;
    var hidden = 0;
    var xeroFail = 0;
    var xeroMissing = 0;
    (invoices || []).forEach(function (inv) {
      /* Office autos have no family payment status chip. */
      if (inv.created_via === 'la_office_auto' || inv.is_la_office_auto) return;
      var pay = String(inv.payment_status || 'unpaid');
      if (pay === 'void') return; /* void chips not shown */
      if (pay === 'paid') paid += 1;
      else if (pay === 'pending_confirmation') pending += 1;
      else unpaid += 1;
      if (String(inv.share_status || '') === 'hidden') hidden += 1;
      /* Xero chips: paid Portal INV-Ps only */
      if (pay !== 'paid') return;
      if (inv.xero_invoice_id) return;
      if (inv.xero_push_status === 'failed') xeroFail += 1;
      else if (inv.created_via === 'portal' || inv.created_via === 'reenrolment') xeroMissing += 1;
    });
    var chips = [];
    if (unpaid) {
      chips.push(summaryFilterChip('unpaid', unpaid + ' unpaid', 'unpaid'));
    }
    if (pending) {
      chips.push(summaryFilterChip('pending', pending + ' pending', 'pending'));
    }
    if (paid) {
      chips.push(summaryFilterChip('paid', paid + ' paid', 'paid'));
    }
    if (hidden) {
      chips.push(summaryFilterChip('hidden', hidden + ' hidden', 'hidden'));
    }
    if (xeroFail) {
      chips.push('<span class="pp-inv-acc__xero pp-inv-acc__xero--fail">Xero failed ×' + xeroFail + '</span>');
    } else if (xeroMissing) {
      chips.push('<span class="pp-inv-acc__xero">Not in Xero ×' + xeroMissing + '</span>');
    }
    return chips.join(' ');
  }

  function groupTotalGbp(invoices) {
    return (invoices || []).reduce(function (sum, inv) {
      if (inv.created_via === 'la_office_auto') return sum;
      var n = Number(inv.amount_gbp);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  function amountPeriodLabel(period) {
    var p = String(period || 'autumn').toLowerCase();
    if (p === 'year' || p === 'annual') return 'Year 26/27';
    if (p === 'spring') return 'Spring 27';
    if (p === 'summer') return 'Summer 27';
    return 'Autumn 26/27';
  }

  function groupAmountForPeriod(group, period) {
    var p = String(period || state.amountPeriod || 'autumn').toLowerCase();
    if (p === 'year' || p === 'annual') return Number(group.booked_annual_gbp);
    if (p === 'spring') return Number(group.booked_spring_gbp);
    if (p === 'summer') return Number(group.booked_summer_gbp);
    if (p === 'autumn') return Number(group.booked_autumn_gbp);
    return Number(group.booked_term_gbp);
  }

  /** TERM · term £ · Year £ — separate spans for the summary row order. */
  function groupBookedAmountsHtml(group) {
    var period = String(state.amountPeriod || 'autumn').toLowerCase();
    var selected = groupAmountForPeriod(group, period);
    var annual = Number(group.booked_annual_gbp);
    var invTotal = groupTotalGbp(group.invoices || []);
    var termLabel = amountPeriodLabel(period);
    var parts = [];
    if (period === 'year' || period === 'annual') {
      var yearAmt = Number.isFinite(selected) && selected > 0 ? selected : annual;
      if (!(Number.isFinite(yearAmt) && yearAmt > 0) && invTotal > 0) yearAmt = invTotal;
      if (Number.isFinite(yearAmt) && yearAmt > 0) {
        parts.push(
          '<span class="pp-inv-acc__term">' +
            esc(termLabel) +
            '</span><span class="pp-inv-acc__amt">' +
            esc(formatMoney(yearAmt)) +
            '</span>',
        );
      }
    } else {
      parts.push('<span class="pp-inv-acc__term">' + esc(termLabel) + '</span>');
      if (Number.isFinite(selected) && selected > 0) {
        parts.push('<span class="pp-inv-acc__amt">' + esc(formatMoney(selected)) + '</span>');
      } else if (invTotal > 0) {
        parts.push('<span class="pp-inv-acc__amt">' + esc(formatMoney(invTotal)) + '</span>');
      }
      if (Number.isFinite(annual) && annual > 0 && annual !== selected) {
        parts.push(
          '<span class="pp-inv-acc__year">Year ' + esc(formatMoney(annual)) + '</span>',
        );
      }
    }
    if (!parts.length) return '<span class="pp-inv-acc__amt">—</span>';
    return parts.join('');
  }

  function invoiceDetailCardHtml(inv, opts) {
    opts = opts || {};
    var showHoldOnce = !!opts.showHoldOnce;
    var id = esc(inv.id);
    var reportBits = [];
    if (inv.parent_reported_paid_at) {
      reportBits.push('Reported ' + formatDate(inv.parent_reported_paid_at));
    }
    if (inv.parent_reported_ref) reportBits.push('ref ' + inv.parent_reported_ref);
    if (inv.parent_reported_method) reportBits.push(inv.parent_reported_method);
    var linkBits = [];
    if (inv.gocardless_url) linkBits.push('GoCardless');
    if (inv.payment_link_url) linkBits.push('Payment link');
    var confirmBtn =
      inv.payment_status === 'pending_confirmation'
        ? '<button type="button" class="btn btn--sm btn--primary" data-inv-act="paid" data-inv-id="' +
          id +
          '">Confirm paid</button> '
        : inv.payment_status !== 'paid'
          ? '<button type="button" class="btn btn--sm btn--sec" data-inv-act="paid" data-inv-id="' +
            id +
            '">Mark paid</button> '
          : '<button type="button" class="btn btn--sm btn--ghost" data-inv-act="unpaid" data-inv-id="' +
            id +
            '">Mark unpaid</button> ';
    var hold = inv.payment_hold || null;
    var holdChip = '';
    var holdBtns = '';
    var buf = inv.buffer_status || null;
    var bufferChip = '';
    if (showHoldOnce) {
      if (buf && buf.is_low) {
        bufferChip =
          '<div class="chip chip--pend" style="margin-top:4px;font-size:11px;background:#fef3c7;color:#92400e">' +
          'Buffer low · £' +
          esc(Number(buf.shortfall_gbp || 0).toFixed(2)) +
          ' short</div>';
      } else if (buf && buf.is_own_arrangement !== false && Number(buf.required_gbp) > 0) {
        bufferChip =
          '<div class="chip" style="margin-top:4px;font-size:11px;background:#ecfdf5;color:#065f46">' +
          'Buffer OK · £' +
          esc(Number(buf.available_gbp || 0).toFixed(2)) +
          ' / £' +
          esc(Number(buf.required_gbp || 0).toFixed(2)) +
          '</div>';
      }
      if (hold && (hold.status === 'soft_hold' || hold.status === 'session_held' || hold.status === 'hard_cut')) {
        var holdLabel =
          hold.status === 'session_held'
            ? 'Session held'
            : hold.status === 'hard_cut'
              ? 'Hard cut'
              : 'Soft hold';
        holdChip =
          '<div class="chip chip--pend" style="margin-top:4px;font-size:11px">' +
          esc(holdLabel) +
          (hold.reminder_count ? ' · ' + esc(String(hold.reminder_count)) + ' reminders' : '') +
          (hold.held_session_label ? ' · ' + esc(String(hold.held_session_label).slice(0, 48)) : '') +
          '</div>';
        if (hold.status !== 'hard_cut') {
          holdBtns =
            '<button type="button" class="btn btn--sm btn--ghost" data-hold-act="remind" data-hold-contact="' +
            esc(inv.contact_id) +
            '" data-inv-id="' +
            id +
            '">Remind</button> ' +
            (hold.status === 'soft_hold'
              ? '<button type="button" class="btn btn--sm btn--sec" data-hold-act="hold_session" data-hold-contact="' +
                esc(inv.contact_id) +
                '">Hold 1 session</button> '
              : '') +
            '<button type="button" class="btn btn--sm btn--ghost" data-hold-act="clear" data-hold-contact="' +
            esc(inv.contact_id) +
            '">Release hold</button> ';
        }
      } else if (inv.payment_status !== 'paid') {
        holdBtns =
          '<button type="button" class="btn btn--sm btn--ghost" data-hold-act="soft_hold" data-hold-contact="' +
          esc(inv.contact_id) +
          '" data-inv-id="' +
          id +
          '">Soft hold</button> ';
      }
    }
    var paidMeta =
      inv.payment_status === 'paid'
        ? '<div class="muted" style="font-size:11px;color:#065f46;margin-top:4px">Paid' +
          (inv.paid_via ? ' via ' + esc(String(inv.paid_via)) : '') +
          (inv.paid_at ? ' · ' + esc(formatDate(inv.paid_at)) : '') +
          '</div>'
        : '';
    var xeroChip = inv.xero_invoice_id
      ? '<div class="muted" style="font-size:11px">Xero ' +
        esc(String(inv.xero_invoice_id).slice(0, 8)) +
        '…' +
        (inv.xero_payment_id ? ' · paid in Xero' : '') +
        '</div>'
      : inv.payment_status === 'paid' && inv.xero_push_status === 'failed'
        ? '<div class="muted" style="font-size:11px;color:#b91c1c">Xero push failed' +
          (inv.xero_push_error
            ? ': ' + esc(String(inv.xero_push_error).slice(0, 60))
            : '') +
          '</div>'
        : inv.payment_status === 'paid' &&
            (inv.created_via === 'portal' || inv.created_via === 'reenrolment')
          ? '<div class="muted" style="font-size:11px;color:#92400e">Paid · not in Xero yet</div>'
          : '';

    return (
      '<article class="pp-inv-acc__card' +
      (inv.payment_status === 'paid' ? ' pp-inv-acc__card--paid' : '') +
      '" data-invoice-id="' +
      id +
      '">' +
      '<div class="pp-inv-acc__grid">' +
      '<div class="pp-inv-acc__col" style="min-width:0">' +
      bufferChip +
      holdChip +
      '<div style="font-size:13px;overflow-wrap:break-word">' +
      '<strong>' +
      esc(inv.invoice_number || '—') +
      '</strong>' +
      '<div class="muted" style="font-size:12px">' +
      esc(inv.title || '') +
      '</div>' +
      paidMeta +
      xeroChip +
      invoiceServiceLinesHtml(inv) +
      (linkBits.length
        ? '<div class="muted" style="font-size:11px">' + esc(linkBits.join(' · ')) + '</div>'
        : '') +
      (reportBits.length
        ? '<div class="muted" style="font-size:11px;color:#92400e">' +
          esc(reportBits.join(' · ')) +
          '</div>'
        : '') +
      '</div></div>' +
      '<div class="pp-inv-acc__col">' +
      '<div><span class="muted">Amount</span><br><strong>' +
      esc(formatMoney(inv.amount_gbp)) +
      '</strong></div>' +
      '<div style="margin-top:8px"><span class="muted">Due</span><br>' +
      esc(formatDate(inv.due_date)) +
      '</div>' +
      '<div style="margin-top:8px"><span class="muted">Type · funding · arrangement</span><br>' +
      methodChipsHtml(inv) +
      '</div>' +
      '<div style="margin-top:8px"><span class="muted">VAT</span><br>' +
      esc(vatDisplayLabel(inv)) +
      '</div>' +
      '<div style="margin-top:8px">' +
      statusChip(inv.payment_status, inv.share_status) +
      '</div></div>' +
      '<div class="pp-inv-acc__col pp-inv-acc__actions">' +
      (inv.pdf_url
        ? '<a class="btn btn--ghost btn--sm" href="' +
          esc(inv.pdf_url) +
          '" target="_blank" rel="noopener">PDF</a> '
        : '') +
      (inv.share_status === 'ready'
        ? '<button type="button" class="btn btn--sm btn--ghost" data-inv-act="hide" data-inv-id="' +
          id +
          '">Hide</button> '
        : '<button type="button" class="btn btn--sm btn--primary" data-inv-act="share" data-inv-id="' +
          id +
          '">Share</button> ') +
      confirmBtn +
      holdBtns +
      '</div></div></article>'
    );
  }

  /** Service + time slot lines under INV-P number (from line_items / line_description). */
  function invoiceServiceLinesHtml(inv) {
    var items = Array.isArray(inv.line_items) ? inv.line_items : [];
    var rows = [];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var desc = String(it.description || it.service_key || '').trim();
      var detail = String(it.detail || '').trim();
      var dates = String(it.dates || '').trim();
      var qty = Number(it.quantity);
      var amt = it.amount_gbp != null ? Number(it.amount_gbp) : null;
      if (!desc && !detail) return;
      /* Skip bare "Credits" / narrative-only credit rows unless they carry a slot. */
      if (/^credits?$/i.test(desc) && !detail) return;
      var metaBits = [];
      if (detail) metaBits.push(detail);
      if (Number.isFinite(qty) && qty > 0 && !/^credits?$/i.test(desc)) {
        metaBits.push(qty + (qty === 1 ? ' session' : ' sessions'));
      }
      if (amt != null && Number.isFinite(amt)) metaBits.push(formatMoney(amt));
      rows.push(
        '<li class="pp-inv-acc__svc-row">' +
          '<div class="pp-inv-acc__svc-name">' +
          esc(desc || 'Service') +
          '</div>' +
          (metaBits.length
            ? '<div class="pp-inv-acc__svc-meta">' + esc(metaBits.join(' · ')) + '</div>'
            : '') +
          (dates
            ? '<div class="pp-inv-acc__svc-dates">' + esc(dates) + '</div>'
            : '') +
          '</li>',
      );
    });
    if (!rows.length) {
      var raw = String(inv.line_description || '').trim();
      if (raw) {
        /* Prefer the service lines after the boilerplate paragraph. */
        var parts = raw
          .split(/\n+/)
          .map(function (p) {
            return String(p || '').trim();
          })
          .filter(Boolean)
          .filter(function (p) {
            return !/^structured activity support/i.test(p);
          });
        if (parts.length) {
          rows = parts.map(function (p) {
            return (
              '<li class="pp-inv-acc__svc-row">' +
              '<div class="pp-inv-acc__svc-name">' +
              esc(p) +
              '</div></li>'
            );
          });
        }
      }
    }
    if (!rows.length) return '';
    return (
      '<div class="pp-inv-acc__svc">' +
      '<div class="pp-inv-acc__svc-lab">Service</div>' +
      '<ul class="pp-inv-acc__svc-list">' +
      rows.join('') +
      '</ul></div>'
    );
  }

  function bookedSlotsHtml(inv) {
    var slots = Array.isArray(inv.booked_slots) ? inv.booked_slots : [];
    if (!slots.length) {
      var raw = String(inv.booked_service_raw || '').trim();
      return raw
        ? '<div style="margin-top:10px;font-size:12px;overflow-wrap:break-word"><span class="muted">Services</span><br>' +
          esc(raw) +
          '</div>'
        : '';
    }
    var period = String(state.amountPeriod || inv.billing_term || 'autumn').toLowerCase();
    var periodLabel = amountPeriodLabel(period);
    var rows = slots
      .map(function (s) {
        var label = String(s.label || s.service || 'Service').trim();
        var price =
          s.price_per_session_gbp != null && Number(s.price_per_session_gbp) > 0
            ? formatMoney(s.price_per_session_gbp) + '/session'
            : '—/session';
        var sessN = Number(s.term_sessions);
        if (!Number.isFinite(sessN) || sessN < 0) sessN = 0;
        var sessLabel =
          period === 'year' || period === 'annual'
            ? sessN + ' sessions / year'
            : sessN + ' sessions · ' + periodLabel;
        var termAmt =
          s.term_total_gbp != null && Number(s.term_total_gbp) > 0
            ? ' · ' + formatMoney(s.term_total_gbp)
            : '';
        return (
          '<li style="margin:0 0 8px;padding:8px 10px;border:1px solid var(--line,#e5e7eb);border-radius:10px;min-width:0;overflow-wrap:break-word">' +
          '<div style="font-weight:700;font-size:13px">' +
          esc(label) +
          '</div>' +
          '<div class="muted" style="font-size:12px;margin-top:2px">' +
          esc(price) +
          ' · ' +
          esc(sessLabel) +
          esc(termAmt) +
          '</div></li>'
        );
      })
      .join('');
    return (
      '<div style="margin-top:10px;min-width:0">' +
      '<div class="muted" style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px">Booked services</div>' +
      '<ul style="list-style:none;margin:0;padding:0">' +
      rows +
      '</ul></div>'
    );
  }

  function participantAccordionHtml(group) {
    var invoices = sortInvoicesForDisplay(group.invoices || []);
    var realInvoices = invoices.filter(function (inv) {
      return inv.created_via !== 'la_office_auto';
    });
    var n = realInvoices.length;
    var contactId = esc(group.contact_id || '');
    var name = group.name || 'Participant';
    var cards = invoices
      .map(function (inv, idx) {
        if (inv.created_via === 'la_office_auto') {
          return (
            '<article class="pp-inv-acc__card" data-invoice-id="' +
            esc(inv.id) +
            '">' +
            '<div class="pp-inv-acc__grid">' +
            '<div class="pp-inv-acc__col" style="min-width:0">' +
            '<div style="font-size:13px;overflow-wrap:break-word">' +
            autoReenrolledChipHtml() +
            '<div class="muted" style="font-size:12px;margin-top:6px">Place renews with the office — no family invoice shared yet. Booked totals from the LA payments sheet.</div>' +
            bookedSlotsHtml(inv) +
            '</div></div>' +
            '<div class="pp-inv-acc__col">' +
            '<div><span class="muted">Year 26/27</span><br><strong>' +
            esc(formatMoney(inv.booked_annual_gbp)) +
            '</strong></div>' +
            '<div style="margin-top:8px"><span class="muted">Autumn 26/27</span><br><strong>' +
            esc(formatMoney(inv.booked_autumn_gbp != null ? inv.booked_autumn_gbp : inv.booked_term_gbp)) +
            '</strong></div>' +
            '<div style="margin-top:8px"><span class="muted">Spring 27</span><br><strong>' +
            esc(formatMoney(inv.booked_spring_gbp)) +
            '</strong></div>' +
            '<div style="margin-top:8px"><span class="muted">Summer 27</span><br><strong>' +
            esc(formatMoney(inv.booked_summer_gbp)) +
            '</strong></div>' +
            '<div style="margin-top:8px"><span class="muted">Funding</span><br>' +
            fundingChipHtml(inv) +
            '</div></div></div></article>'
          );
        }
        return invoiceDetailCardHtml(inv, { showHoldOnce: idx === 0 });
      })
      .join('');
    var countLabel = group.is_la_office_auto && !n
      ? 'Auto re-enrolled · no INV-P'
      : String(n) + ' invoice' + (n === 1 ? '' : 's');
    return (
      '<details class="pp-inv-acc__item pp-inv-acc__item--pax" data-contact-id="' +
      contactId +
      '">' +
      '<summary class="pp-inv-acc__sum">' +
      '<span class="pp-inv-acc__chev" aria-hidden="true"></span>' +
      '<span class="pp-inv-acc__who">' +
      '<strong class="pp-inv-acc__name">' +
      esc(name) +
      '</strong>' +
      '<span class="pp-inv-acc__num">' +
      esc(countLabel) +
      (contactId ? ' · ' + contactId : '') +
      '</span>' +
      '</span>' +
      '<span class="pp-inv-acc__amounts" title="Booked amount for selected year / term filter">' +
      groupBookedAmountsHtml(group) +
      '</span>' +
      '<span class="pp-inv-acc__methods">' +
      groupMetaChipsHtml(invoices) +
      '</span>' +
      '<span class="pp-inv-acc__status">' +
      groupStatusSummary(invoices) +
      '</span>' +
      '</summary>' +
      '<div class="pp-inv-acc__body">' +
      '<div class="pp-inv-acc__cards">' +
      cards +
      '</div></div></details>'
    );
  }

  function dayAccordionHtml(dayGroup) {
    var day = dayGroup.day || 'No re-enrolment date';
    var dayKey = dayGroup.day_key || '';
    var participants = dayGroup.participants || [];
    var paxN = dayGroup.participant_count != null ? dayGroup.participant_count : participants.length;
    var invN = dayGroup.invoice_count != null ? dayGroup.invoice_count : 0;
    var allInvs = [];
    participants.forEach(function (g) {
      (g.invoices || []).forEach(function (inv) {
        allInvs.push(inv);
      });
    });
    var sub =
      'Re-enrolled · ' +
      String(paxN) +
      ' participant' +
      (paxN === 1 ? '' : 's') +
      ' · ' +
      String(invN) +
      ' invoice' +
      (invN === 1 ? '' : 's');
    return (
      '<details class="pp-inv-acc__item pp-inv-acc__item--day" data-inv-day="' +
      esc(dayKey || day) +
      '">' +
      '<summary class="pp-inv-acc__sum pp-inv-acc__sum--day">' +
      '<span class="pp-inv-acc__chev" aria-hidden="true"></span>' +
      '<span class="pp-inv-acc__who">' +
      '<strong class="pp-inv-acc__name">' +
      esc(day) +
      '</strong>' +
      '<span class="pp-inv-acc__num">' +
      esc(sub) +
      '</span>' +
      '</span>' +
      '<span class="pp-inv-acc__status">' +
      groupStatusSummary(allInvs) +
      '</span>' +
      '</summary>' +
      '<div class="pp-inv-acc__body pp-inv-acc__body--day">' +
      '<div class="pp-inv-acc__day-pax">' +
      participants.map(participantAccordionHtml).join('') +
      '</div></div></details>'
    );
  }

  function accordionListStyles() {
    return (
      '<style id="pp-inv-acc-css">' +
      '.pp-inv-acc{display:flex;flex-direction:column;gap:8px;min-width:0}' +
      '.pp-inv-acc__item{border:1px solid #dbe4ec;border-radius:10px;background:#fff;min-width:0;overflow:hidden}' +
      '.pp-inv-acc__item--day{border-color:#c5d4e3;background:#f8fafc}' +
      '.pp-inv-acc__item--pax{background:#fff}' +
      '.pp-inv-acc__day-pax{display:flex;flex-direction:column;gap:8px;min-width:0}' +
      '.pp-inv-acc__body--day{background:#eef2f7}' +
      '.pp-inv-acc__sum{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px;cursor:pointer;list-style:none;min-width:0}' +
      '.pp-inv-acc__sum--day{background:#e8eef5}' +
      '.pp-inv-acc__sum::-webkit-details-marker{display:none}' +
      '.pp-inv-acc__chev{width:0;height:0;border-left:5px solid #4a6578;border-top:4px solid transparent;border-bottom:4px solid transparent;flex:0 0 auto;transition:transform .15s ease}' +
      '.pp-inv-acc__item[open]>.pp-inv-acc__sum .pp-inv-acc__chev{transform:rotate(90deg)}' +
      '.pp-inv-acc__who{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 140px}' +
      '.pp-inv-acc__name{overflow-wrap:break-word}' +
      '.pp-inv-acc__num{font-size:12px;color:#4a6578;overflow-wrap:break-word}' +
      '.pp-inv-acc__amounts{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;flex:1 1 200px;min-width:0;justify-content:flex-end;text-align:right}' +
      '.pp-inv-acc__term{font-weight:700;color:#0f172a;overflow-wrap:break-word}' +
      '.pp-inv-acc__amt{font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;overflow-wrap:break-word}' +
      '.pp-inv-acc__year{font-weight:700;color:#475569;font-variant-numeric:tabular-nums;overflow-wrap:break-word}' +
      '.pp-inv-acc__methods{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;flex:0 1 auto;max-width:100%}' +
      // Chip shell + exclusive colours (never put /* */ between + — it injects NaN).
      '.pp-inv-acc__type,.pp-inv-acc__method,.pp-inv-acc__arrange,.pp-inv-acc__fund{display:inline-flex;align-items:center;font-size:11px;font-weight:700;letter-spacing:.01em;border-radius:999px;padding:4px 10px;flex:0 0 auto;max-width:100%;overflow-wrap:break-word;border:1px solid transparent}' +
      '.pp-inv-acc__type--termly{color:#1e3a8a;background:#dbeafe;border-color:#60a5fa}' +
      '.pp-inv-acc__type--auto{color:#5b21b6;background:#ede9fe;border-color:#a78bfa;letter-spacing:.03em}' +
      '.pp-inv-acc__fund--private{color:#312e81;background:#e0e7ff;border-color:#818cf8}' +
      '.pp-inv-acc__fund--direct{color:#115e59;background:#ccfbf1;border-color:#2dd4bf}' +
      '.pp-inv-acc__fund--la{color:#86198f;background:#fae8ff;border-color:#e879f9}' +
      '.pp-inv-acc__fund--nhs{color:#9f1239;background:#ffe4e6;border-color:#fb7185}' +
      '.pp-inv-acc__method--bank{color:#3f3f46;background:#f4f4f5;border-color:#a1a1aa}' +
      '.pp-inv-acc__method--gc{color:#9d174d;background:#fbcfe8;border-color:#ec4899}' +
      '.pp-inv-acc__method--card{color:#1e40af;background:#93c5fd;border-color:#2563eb}' +
      '.pp-inv-acc__method--la{color:#6b21a8;background:#ddd6fe;border-color:#8b5cf6}' +
      '.pp-inv-acc__method--admin{color:#334155;background:#e2e8f0;border-color:#94a3b8}' +
      '.pp-inv-acc__method--other{color:#4a6578;background:#eef2f5;border-color:#94a3b8}' +
      '.pp-inv-acc__arrange{color:#854d0e;background:#fef08a;border-color:#eab308}' +
      '.pp-inv-acc__plan-dates{max-width:100%}' +
      '.pp-inv-acc__pay-chip{font-size:11px;font-weight:700;letter-spacing:.01em;border-radius:999px;padding:4px 10px;flex:0 0 auto;max-width:100%;overflow-wrap:break-word;border:1px solid transparent;display:inline-flex;align-items:center}' +
      '.pp-inv-acc__pay-chip--unpaid{color:#9a3412;background:#ffedd5;border-color:#fdba74}' +
      '.pp-inv-acc__pay-chip--pending{color:#1e40af;background:#dbeafe;border-color:#93c5fd}' +
      '.pp-inv-acc__pay-chip--shared{color:#1e3a8a;background:#e0e7ff;border-color:#a5b4fc}' +
      '.pp-inv-acc__pay-chip--hidden{color:#475569;background:#f1f5f9;border-color:#cbd5e1}' +
      '.pp-inv-acc__pay-chip--other{color:#4a6578;background:#eef2f5;border-color:#d5dee6}' +
      '.pp-inv-acc__status{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}' +
      '.pp-inv-acc__xero{font-size:11px;color:#64748b}' +
      '.pp-inv-acc__xero--ok{color:#1e40af}' +
      '.pp-inv-acc__xero--fail{color:#b91c1c}' +
      '.pp-inv-acc__body{border-top:1px solid #e8eef3;padding:12px;background:#fafcfd;min-width:0}' +
      '.pp-inv-acc__cards{display:flex;flex-direction:column;gap:10px;min-width:0}' +
      '.pp-inv-acc__card{border:1px solid #e2eaf0;border-radius:8px;padding:10px;background:#fff;min-width:0}' +
      '.pp-inv-acc__card--paid{border-color:#86efac;background:#f0fdf4}' +
      '.pp-inv-acc__filter-chip{-webkit-appearance:none;appearance:none;margin:0;cursor:pointer;font:inherit;line-height:inherit}' +
      '.pp-inv-acc__filter-chip:hover{filter:brightness(.97)}' +
      'button.pp-inv-acc__pay-chip--paid,.pp-inv-acc__pay-chip--paid{color:#047857;background-color:#bbf7d0;background:#bbf7d0;border:1px solid #34d399}' +
      'button.pp-inv-acc__pay-chip--unpaid,.pp-inv-acc__pay-chip--unpaid{color:#9a3412;background-color:#ffedd5;background:#ffedd5;border:1px solid #fdba74}' +
      'button.pp-inv-acc__pay-chip--pending,.pp-inv-acc__pay-chip--pending{color:#1e40af;background-color:#dbeafe;background:#dbeafe;border:1px solid #93c5fd}' +
      'button.pp-inv-acc__pay-chip--hidden,.pp-inv-acc__pay-chip--hidden{color:#475569;background-color:#f1f5f9;background:#f1f5f9;border:1px solid #cbd5e1}' +
      'button.pp-inv-acc__pay-chip--other,.pp-inv-acc__pay-chip--other{color:#4a6578;background-color:#eef2f5;background:#eef2f5;border:1px solid #d5dee6}' +
      '.pp-inv-acc__grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,.7fr) minmax(0,.9fr);gap:12px;min-width:0}' +
      '@media (max-width:820px){.pp-inv-acc__grid{grid-template-columns:1fr}}' +
      '.pp-inv-acc__actions{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;min-width:0}' +
      '.pp-inv-acc__svc{margin-top:10px;min-width:0}' +
      '.pp-inv-acc__svc-lab{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin:0 0 6px}' +
      '.pp-inv-acc__svc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}' +
      '.pp-inv-acc__svc-row{margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;min-width:0}' +
      '.pp-inv-acc__svc-name{font-size:13px;font-weight:700;color:#0f172a;overflow-wrap:break-word}' +
      '.pp-inv-acc__svc-meta{margin-top:2px;font-size:12px;color:#475569;overflow-wrap:break-word}' +
      '.pp-inv-acc__svc-dates{margin-top:4px;font-size:11px;color:#64748b;overflow-wrap:break-word}' +
      '</style>'
    );
  }

  function csvEscape(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadXeroCsv(rows) {
    var header = [
      'ContactName',
      'InvoiceNumber',
      'InvoiceDate',
      'DueDate',
      'Description',
      'Quantity',
      'UnitAmount',
      'TaxType',
      'Reference',
      'PONumber',
    ];
    var lines = [header.join(',')];
    rows.forEach(function (inv) {
      var qty = Number(inv.quantity);
      if (!Number.isFinite(qty) || qty <= 0) qty = 1;
      var amount = Number(inv.amount_gbp) || 0;
      var unit = Number(inv.unit_price_gbp);
      if (!Number.isFinite(unit) || unit <= 0) unit = amount / qty;
      var tax = inv.vat_mode === 'exempt' ? 'EXEMPT' : 'OUTPUT2';
      var invDate = inv.document_created_at
        ? String(inv.document_created_at).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      var contactName =
        inv.parent_display || inv.participant_display || inv.related_client || inv.contact_id || '';
      lines.push(
        [
          csvEscape(contactName),
          csvEscape(inv.invoice_number || ''),
          csvEscape(invDate),
          csvEscape(inv.due_date || ''),
          csvEscape(inv.line_description || inv.title || 'Structured activity support'),
          csvEscape(String(qty)),
          csvEscape(unit.toFixed(4)),
          csvEscape(tax),
          csvEscape(inv.reference_text || inv.invoice_number || ''),
          '',
        ].join(','),
      );
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = global.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'portal_family_invoices_xero_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function pushUnsyncedToXero() {
    var btn = global.document.getElementById('portalParentInvoicesPushXero');
    if (btn) btn.disabled = true;
    var r = await api('portal-admin-xero-batch-push', { limit: 40 });
    if (btn) btn.disabled = false;
    if (r.error) {
      cfg.toast(r.message || r.error || 'Xero push failed', 'error');
      return;
    }
    var msg =
      r.message ||
      'Pushed ' + String(r.pushed || 0) + (r.failed ? ', ' + r.failed + ' failed' : '');
    if (r.failed && Array.isArray(r.results)) {
      var fails = r.results
        .filter(function (x) {
          return x && x.ok === false;
        })
        .slice(0, 3)
        .map(function (x) {
          return (
            String(x.invoice_number || 'invoice') +
            ': ' +
            String((x.detail || x.error || (x.payment && (x.payment.detail || x.payment.error)) || 'failed')).slice(0, 80)
          );
        });
      if (fails.length) msg = msg + ' — ' + fails.join('; ');
    }
    cfg.toast(msg, r.failed ? 'error' : 'ok');
    void renderHost(global.document.getElementById('portalParentInvoicesHost'));
  }

  async function exportUnsyncedXeroCsv() {
    var r = await api('portal-admin-parent-invoices-list', {
      limit: 200,
      filter: 'xero_unsynced',
    });
    if (r.error) {
      cfg.toast(r.message || r.error || 'Export failed', 'error');
      return;
    }
    var rows = r.invoices || [];
    if (!rows.length) {
      cfg.toast('No unsynced Portal invoices to export', 'ok');
      return;
    }
    downloadXeroCsv(rows);
    cfg.toast('Exported ' + rows.length + ' invoice' + (rows.length === 1 ? '' : 's') + ' for Xero', 'ok');
  }

  async function renderHost(host) {
    if (!host) return;
    host.innerHTML = '<p class="muted">Loading…</p>';
    try {
      var body = { limit: 300 };
      if (state.filter === 'ready' || state.filter === 'hidden') body.share_status = state.filter;
      if (state.filter === 'unpaid') {
        body.share_status = 'ready';
        body.payment_status = 'unpaid';
      }
      if (state.filter === 'paid') {
        body.payment_status = 'paid';
      }
      if (state.filter === 'void') {
        body.payment_status = 'void';
      }
      if (state.filter === 'pending') {
        body.share_status = 'ready';
        body.payment_status = 'pending_confirmation';
      }
      if (state.filter === 'buffer_low' || state.filter === 'xero_unsynced' || state.filter === 'la_auto') {
        body.filter = state.filter;
      }
      body.billing_amount = state.amountPeriod || 'autumn';
      var r = await api('portal-admin-parent-invoices-list', body);
      if (r.error) {
        host.innerHTML =
          '<p class="muted">Could not load invoices (' +
          esc(r.message || r.error) +
          '). Try Refresh, or sign out and back in.</p>';
        return;
      }
      state.invoices = r.invoices || [];
      state.meta = r.meta || {};
      var metaEl = global.document.getElementById('portalParentInvoicesMetaEmbed');
      if (metaEl) {
        var parts = [];
        parts.push(String(state.meta.ready_unpaid || 0) + ' unpaid');
        if (state.meta.pending_confirmation) {
          parts.push(String(state.meta.pending_confirmation) + ' pending');
        }
        if (state.meta.payment_holds_open) {
          parts.push(String(state.meta.payment_holds_open) + ' holds');
        }
        if (state.meta.buffer_low_contacts) {
          parts.push(String(state.meta.buffer_low_contacts) + ' buffer low');
        }
        if (state.meta.xero_unsynced) {
          parts.push(String(state.meta.xero_unsynced) + ' paid not in Xero');
        }
        if (state.meta.la_office_auto) {
          parts.push(String(state.meta.la_office_auto) + ' auto re-enrolled');
        }
        metaEl.textContent = parts.join(' · ');
      }
      if (!state.invoices.length) {
        host.innerHTML = '<p class="muted">No invoices yet. Upload a PDF below to share with a family.</p>';
        return;
      }
      host.innerHTML =
        accordionListStyles() +
        '<div class="pp-inv-acc" role="list">' +
        groupInvoicesByDayThenParticipant(state.invoices).map(dayAccordionHtml).join('') +
        '</div>';
      bindRowActions(host);
      /* Day + participant accordions stay closed until opened. */
    } catch (err) {
      host.innerHTML =
        '<p class="muted">Could not load invoices (' +
        esc((err && err.message) || 'unexpected_error') +
        ').</p>';
    }
  }

  function setInvoiceFilter(filter) {
    state.filter = filter || 'all';
    global.document.querySelectorAll('.toolbar [data-inv-filter]').forEach(function (b) {
      var on = b.getAttribute('data-inv-filter') === state.filter;
      b.classList.toggle('btn--ghost', !on);
    });
  }

  function setAmountPeriod(period) {
    var p = String(period || 'autumn').toLowerCase();
    if (p !== 'year' && p !== 'autumn' && p !== 'spring' && p !== 'summer') p = 'autumn';
    state.amountPeriod = p;
    global.document.querySelectorAll('.toolbar [data-inv-amount]').forEach(function (b) {
      var on = b.getAttribute('data-inv-amount') === state.amountPeriod;
      b.classList.toggle('btn--ghost', !on);
    });
  }

  function bindRowActions(host) {
    host.querySelectorAll('.pp-inv-acc__filter-chip').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setInvoiceFilter(btn.getAttribute('data-inv-filter') || 'all');
        void renderHost(host);
      });
    });
    host.querySelectorAll('[data-inv-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-inv-act');
        var id = btn.getAttribute('data-inv-id');
        if (!id) return;
        btn.disabled = true;
        var body = { action: 'update', invoice_id: id };
        if (act === 'share') body.share_status = 'ready';
        else if (act === 'hide') body.share_status = 'hidden';
        else if (act === 'paid') {
          body.payment_status = 'paid';
          body.paid_via = 'admin';
        }
        else if (act === 'unpaid') body.payment_status = 'unpaid';
        else {
          btn.disabled = false;
          return;
        }
        void api('portal-admin-parent-invoices-upsert', body).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Update failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast(
            r.hold && r.hold.restored
              ? 'Invoice paid — held session restored'
              : 'Invoice updated',
            'ok',
          );
          void renderHost(global.document.getElementById('portalParentInvoicesHost'));
        });
      });
    });
    host.querySelectorAll('[data-hold-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-hold-act');
        var contactId = btn.getAttribute('data-hold-contact');
        var invId = btn.getAttribute('data-inv-id');
        if (!act || !contactId) return;
        if (
          act === 'hold_session' &&
          !global.confirm(
            'Cancel their next upcoming session (recoverable)? They can pay to restore it before a hard cut.',
          )
        ) {
          return;
        }
        btn.disabled = true;
        var body = { action: act, contact_id: contactId };
        if (invId) body.invoice_share_id = invId;
        void api('portal-admin-payment-hold-action', body).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Hold action failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast(r.message || 'Hold updated', 'ok');
          void renderHost(global.document.getElementById('portalParentInvoicesHost'));
        });
      });
    });
  }

  async function searchParticipants(q) {
    var client = cfg.getClient();
    var hitsEl = global.document.getElementById('portalParentInvoicesSearchHits');
    if (!client || !hitsEl) return;
    var term = String(q || '').trim();
    if (term.length < 2) {
      hitsEl.innerHTML = '';
      hitsEl.hidden = true;
      return;
    }
    var { data, error } = await client
      .from('portal_participants')
      .select('contact_id, display_name, first_name, last_name')
      .or(
        'display_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,first_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,last_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,contact_id.ilike.%' +
          term.replace(/%/g, '') +
          '%'
      )
      .limit(12);
    if (error) {
      hitsEl.innerHTML = '<p class="muted">Search failed.</p>';
      hitsEl.hidden = false;
      return;
    }
    state.searchHits = data || [];
    if (!state.searchHits.length) {
      hitsEl.innerHTML = '<p class="muted">No matches.</p>';
      hitsEl.hidden = false;
      return;
    }
    hitsEl.hidden = false;
    hitsEl.innerHTML = state.searchHits
      .map(function (p) {
        var name =
          String(p.display_name || '').trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.contact_id;
        return (
          '<button type="button" class="btn btn--ghost btn--sm" style="display:block;width:100%;text-align:left;margin:0 0 4px" data-pick-contact="' +
          esc(p.contact_id) +
          '" data-pick-name="' +
          esc(name) +
          '">' +
          esc(name) +
          ' <span class="muted">' +
          esc(p.contact_id) +
          '</span></button>'
        );
      })
      .join('');
    hitsEl.querySelectorAll('[data-pick-contact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cid = btn.getAttribute('data-pick-contact') || '';
        var name = btn.getAttribute('data-pick-name') || '';
        var idEl = global.document.getElementById('portalParentInvoiceContactId');
        var nameEl = global.document.getElementById('portalParentInvoiceParticipantLabel');
        if (idEl) idEl.value = cid;
        if (nameEl) nameEl.textContent = name + ' (' + cid + ')';
        var clientIdEl = global.document.getElementById('portalParentInvoiceClientId');
        if (clientIdEl && !String(clientIdEl.value || '').trim()) clientIdEl.value = cid;
        void (async function () {
          var vatEl = global.document.getElementById('portalParentInvoiceVatMode');
          if (!client || !vatEl) return;
          var fl = '';
          var { data: pc } = await client
            .from('portal_parent_contacts')
            .select('funding_label')
            .eq('contact_id', cid)
            .maybeSingle();
          fl = String((pc && pc.funding_label) || '').toLowerCase();
          if (!fl) {
            var { data: pay } = await client
              .from('client_payments')
              .select('data, sheet')
              .or('client_key.eq.' + cid + ',client_name.ilike.' + name.replace(/,/g, ''))
              .limit(1)
              .maybeSingle();
            if (pay) {
              var d = pay.data || {};
              var vatRaw = String(d.VAT || d.vat || '').toLowerCase();
              var fundRaw = String(d.Fund || d.fund || '').toLowerCase();
              if (vatRaw.includes('exempt') || fundRaw.includes('la') || fundRaw.includes('nhs')) {
                fl = 'la exempt';
              } else if (vatRaw.includes('20') || fundRaw.includes('private')) {
                fl = 'private vat';
              }
              if (String(pay.sheet || '').toUpperCase() === 'LA') fl = 'la exempt';
            }
          }
          if (
            fl.includes('la') ||
            fl.includes('nhs') ||
            fl.includes('ehcp') ||
            fl.includes('exempt') ||
            fl.includes('direct payment') ||
            fl.includes('local authority')
          ) {
            vatEl.value = 'exempt';
          } else if (fl.includes('private') || fl.includes('vat') || fl.includes('pf')) {
            vatEl.value = 'vat_20';
          }
          syncLaCreateFields();
        })();
        hitsEl.hidden = true;
        hitsEl.innerHTML = '';
      });
    });
  }

  function syncLaCreateFields() {
    var vatEl = global.document.getElementById('portalParentInvoiceVatMode');
    var laBox = global.document.getElementById('portalParentInvoiceLaFields');
    var laHint = global.document.getElementById('portalParentInvoiceLaHint');
    var isLa = !!(vatEl && vatEl.value === 'exempt');
    if (laBox) {
      laBox.hidden = !isLa;
      laBox.style.display = isLa ? 'flex' : 'none';
    }
    if (laHint) laHint.hidden = !isLa;
    var clientIdEl = global.document.getElementById('portalParentInvoiceClientId');
    var contactId = String(
      (global.document.getElementById('portalParentInvoiceContactId') || {}).value || ''
    ).trim();
    if (isLa && clientIdEl && !String(clientIdEl.value || '').trim() && contactId) {
      clientIdEl.value = contactId;
    }
  }

  function bindUploadForm() {
    var createForm = global.document.getElementById('portalParentInvoiceCreateForm');
    var form = global.document.getElementById('portalParentInvoiceUploadForm');
    if (createForm && createForm.getAttribute('data-bound') !== '1') {
      createForm.setAttribute('data-bound', '1');
      var vatElBound = global.document.getElementById('portalParentInvoiceVatMode');
      if (vatElBound) {
        vatElBound.addEventListener('change', syncLaCreateFields);
        syncLaCreateFields();
      }
      createForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var contactId = String(
          (global.document.getElementById('portalParentInvoiceContactId') || {}).value || ''
        ).trim();
        if (!contactId) {
          cfg.toast('Pick a participant first', 'error');
          return;
        }
        var amountEl = global.document.getElementById('portalParentInvoiceAmount');
        var amount = amountEl && amountEl.value ? Number(amountEl.value) : NaN;
        if (!isFinite(amount) || amount <= 0) {
          cfg.toast('Enter amount £', 'error');
          return;
        }
        var vatEl = global.document.getElementById('portalParentInvoiceVatMode');
        var qtyEl = global.document.getElementById('portalParentInvoiceQty');
        var dueEl = global.document.getElementById('portalParentInvoiceDue');
        var descEl = global.document.getElementById('portalParentInvoiceDesc');
        var refEl = global.document.getElementById('portalParentInvoiceRef');
        var invNo = global.document.getElementById('portalParentInvoiceNumber');
        var notes = global.document.getElementById('portalParentInvoiceNotes');
        var clientIdEl = global.document.getElementById('portalParentInvoiceClientId');
        var poEl = global.document.getElementById('portalParentInvoicePo');
        var isLa = vatEl && vatEl.value === 'exempt';
        if (isLa && poEl && !String(poEl.value || '').trim()) {
          cfg.toast('LA funded: enter the PO (changes per invoice)', 'error');
          return;
        }
        var body = {
          action: 'create_portal',
          contact_id: contactId,
          amount_gbp: amount,
          vat_mode: isLa ? 'exempt' : 'vat_20',
          quantity: qtyEl && qtyEl.value ? Number(qtyEl.value) : 1,
          due_date: dueEl && dueEl.value ? dueEl.value : null,
          line_description:
            (descEl && descEl.value) ||
            (isLa
              ? 'Structured activity support delivered for a SEND participant as part of funded provision (EHCP or local authority care package).'
              : 'Structured activity support delivered for a SEND participant.'),
          reference: refEl && refEl.value ? refEl.value : null,
          invoice_number: invNo && invNo.value ? invNo.value : null,
          notes: notes && notes.value ? notes.value : null,
          share_status: isLa ? 'hidden' : 'ready',
          payment_method_hint: isLa ? 'la_funded' : 'bank_transfer',
          client_id_label:
            (clientIdEl && String(clientIdEl.value || '').trim()) || contactId,
          po_label: poEl && poEl.value ? String(poEl.value).trim() : ''
        };
        var submitBtn = createForm.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        void api('portal-admin-parent-invoices-upsert', body, false).then(function (r) {
          if (submitBtn) submitBtn.disabled = false;
          if (r.error) {
            cfg.toast(r.message || r.error || 'Create failed', 'error');
            return;
          }
          var num =
            r.invoice && r.invoice.invoice_number
              ? String(r.invoice.invoice_number)
              : 'Invoice';
          cfg.toast(num + ' created & shared', 'ok');
          createForm.reset();
          var qtyReset = global.document.getElementById('portalParentInvoiceQty');
          if (qtyReset) qtyReset.value = '1';
          var nameEl = global.document.getElementById('portalParentInvoiceParticipantLabel');
          if (nameEl) nameEl.textContent = 'No participant selected';
          var idEl = global.document.getElementById('portalParentInvoiceContactId');
          if (idEl) idEl.value = '';
          void renderHost(global.document.getElementById('portalParentInvoicesHost'));
        });
      });
    }

    var search = global.document.getElementById('portalParentInvoiceSearch');
    var searchTimer = null;
    if (search && search.getAttribute('data-bound') !== '1') {
      search.setAttribute('data-bound', '1');
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          void searchParticipants(search.value);
        }, 280);
      });
    }

    if (!form || form.getAttribute('data-bound') === '1') return;
    form.setAttribute('data-bound', '1');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var contactId = String(
        (global.document.getElementById('portalParentInvoiceContactId') || {}).value || ''
      ).trim();
      var fileInput = global.document.getElementById('portalParentInvoiceFile');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!contactId) {
        cfg.toast('Pick a participant first', 'error');
        return;
      }
      if (!file) {
        cfg.toast('Choose a PDF', 'error');
        return;
      }
      var fd = new FormData();
      fd.append('action', 'create');
      fd.append('contact_id', contactId);
      fd.append('file', file);
      var invNo = global.document.getElementById('portalParentInvoiceNumber');
      var amount = global.document.getElementById('portalParentInvoiceAmount');
      var due = global.document.getElementById('portalParentInvoiceDue');
      var title = global.document.getElementById('portalParentInvoiceTitle');
      var notes = global.document.getElementById('portalParentInvoiceNotes');
      var xeroId = global.document.getElementById('portalParentInvoiceXeroId');
      var gcUrl = global.document.getElementById('portalParentInvoiceGcUrl');
      var plUrl = global.document.getElementById('portalParentInvoicePlUrl');
      var plNote = global.document.getElementById('portalParentInvoicePlNote');
      if (invNo && invNo.value) fd.append('invoice_number', invNo.value);
      if (amount && amount.value) fd.append('amount_gbp', amount.value);
      if (due && due.value) fd.append('due_date', due.value);
      if (title && title.value) fd.append('title', title.value);
      if (notes && notes.value) fd.append('notes', notes.value);
      if (xeroId && xeroId.value) fd.append('xero_invoice_id', xeroId.value);
      if (gcUrl && gcUrl.value) fd.append('gocardless_url', gcUrl.value);
      if (plUrl && plUrl.value) fd.append('payment_link_url', plUrl.value);
      if (plNote && plNote.value) fd.append('payment_link_surcharge_note', plNote.value);
      fd.append('payment_method_hint', 'bank_transfer');
      fd.append('share_status', 'ready');
      fd.append('payment_status', 'unpaid');

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      void api('portal-admin-parent-invoices-upsert', fd, true).then(function (r) {
        if (submitBtn) submitBtn.disabled = false;
        if (r.error) {
          cfg.toast(r.message || r.error || 'Upload failed', 'error');
          return;
        }
        cfg.toast('Invoice shared with family', 'ok');
        form.reset();
        var nameEl = global.document.getElementById('portalParentInvoiceParticipantLabel');
        if (nameEl) nameEl.textContent = 'No participant selected';
        var idEl = global.document.getElementById('portalParentInvoiceContactId');
        if (idEl) idEl.value = '';
        void renderHost(global.document.getElementById('portalParentInvoicesHost'));
      });
    });
  }

  function createInvoiceEmbedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Create invoice</h3></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word"><strong>Create in Portal</strong> generates a TAX INVOICE PDF and shares it with the family. Use the term reference (e.g. Summer Term 25/26 or Autumn Term 26/27) so invoices group correctly in Payments.</p>' +
      '<form id="portalParentInvoiceCreateForm" class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--line,#e5e7eb)">' +
      '<div style="font-weight:700">Create invoice in Portal</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
      '<label style="flex:1 1 200px;min-width:0">Search participant' +
      '<input class="inp" id="portalParentInvoiceSearch" type="search" placeholder="Name or contact id" autocomplete="off" style="width:100%" />' +
      '</label>' +
      '<div style="flex:1 1 180px;min-width:0"><span class="muted" style="font-size:12px">Selected</span>' +
      '<div id="portalParentInvoiceParticipantLabel" style="font-weight:700;overflow-wrap:break-word">No participant selected</div>' +
      '<input type="hidden" id="portalParentInvoiceContactId" value="" />' +
      '</div></div>' +
      '<div id="portalParentInvoicesSearchHits" hidden style="margin-top:-4px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<label style="flex:1 1 140px;min-width:0">VAT / funding' +
      '<select class="inp" id="portalParentInvoiceVatMode" style="width:100%">' +
      '<option value="vat_20">Private · Includes 20% VAT (in price)</option>' +
      '<option value="exempt">LA funded · Exempt</option>' +
      '</select></label>' +
      '<label style="flex:1 1 100px;min-width:0">Amount £ (total)<input class="inp" id="portalParentInvoiceAmount" type="number" min="0.01" step="0.01" required style="width:100%" /></label>' +
      '<label style="flex:1 1 80px;min-width:0">Qty<input class="inp" id="portalParentInvoiceQty" type="number" min="0.01" step="0.01" value="1" style="width:100%" /></label>' +
      '<label style="flex:1 1 140px;min-width:0">Due date<input class="inp" id="portalParentInvoiceDue" type="date" style="width:100%" /></label>' +
      '</div>' +
      '<div id="portalParentInvoiceLaFields" hidden style="display:none;flex-wrap:wrap;gap:8px">' +
      '<label style="flex:1 1 140px;min-width:0">Client Id<input class="inp" id="portalParentInvoiceClientId" placeholder="Usually contact id" style="width:100%" /></label>' +
      '<label style="flex:1 1 180px;min-width:0">PO (required for LA)<input class="inp" id="portalParentInvoicePo" placeholder="Purchase order — changes each time" style="width:100%" /></label>' +
      '</div>' +
      '<p class="muted" id="portalParentInvoiceLaHint" hidden style="margin:0;max-width:48rem;overflow-wrap:break-word">LA funded invoices are created <strong>manually</strong> here (Client Id + PO). They stay <strong>office-only</strong> — parents see the booking, not the invoice (LA pays).</p>' +
      '<label style="min-width:0">Description<textarea class="inp" id="portalParentInvoiceDesc" rows="3" placeholder="Structured activity support…" style="width:100%;max-width:36rem;min-height:4.5rem"></textarea></label>' +
      '<label style="min-width:0">Invoice Reference (term label)<input class="inp" id="portalParentInvoiceRef" placeholder="e.g. Summer term 25/26" style="width:100%;max-width:28rem" /></label>' +
      '<p class="muted" style="margin:0 0 8px;max-width:48rem;overflow-wrap:break-word">PDF/Xero <strong>Reference</strong> = term. Parents use the <strong>participant name</strong> as the Tide bank payment reference. Put name + service in the description.</p>' +
      '<label style="min-width:0">Invoice # (optional — auto INV-P-####)<input class="inp" id="portalParentInvoiceNumber" style="width:100%;max-width:16rem" /></label>' +
      '<label style="min-width:0">Notes (optional)<input class="inp" id="portalParentInvoiceNotes" style="width:100%;max-width:28rem" /></label>' +
      '<div><button type="submit" class="btn btn--primary btn--sm">Create &amp; share</button></div>' +
      '</form>' +
      '<details style="margin:0">' +
      '<summary class="muted" style="cursor:pointer;font-weight:600">Or upload a Xero / office PDF</summary>' +
      '<form id="portalParentInvoiceUploadForm" class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px;margin-top:10px">' +
      '<label style="min-width:0">Xero Invoice ID (GUID, optional sync)<input class="inp" id="portalParentInvoiceXeroId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Title (optional)<input class="inp" id="portalParentInvoiceTitle" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">GoCardless URL (optional)<input class="inp" id="portalParentInvoiceGcUrl" type="url" placeholder="https://…" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Payment Link URL (rare)<input class="inp" id="portalParentInvoicePlUrl" type="url" placeholder="https://…" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Payment Link surcharge note<input class="inp" id="portalParentInvoicePlNote" placeholder="e.g. +2.5% card fee" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">PDF<input class="inp" id="portalParentInvoiceFile" type="file" accept="application/pdf,.pdf" style="width:100%;max-width:28rem" /></label>' +
      '<div><button type="submit" class="btn btn--sec btn--sm">Upload &amp; share PDF</button></div>' +
      '</form></details>' +
      '</div></div>'
    );
  }

  function reenrolmentsEmbedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Re-enrolments &amp; shared invoices</h3>' +
      '<span class="pp-inv-acc__pay-chip pp-inv-acc__pay-chip--other" id="portalParentInvoicesMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Track instalments after re-enrolment. Use <strong>Year / Term</strong> filters to switch booked totals. Rows are sorted by re-enrol date. LA sheet clients appear as office auto even without a family invoice. Day Centre places start 1 Sept (no half-term; Christmas closed). <strong>Push paid to Xero</strong> sends only <em>paid</em> Portal INV-Ps (creates the ACCREC <em>awaiting payment</em> — mark Paid + reconcile in Xero). Unpaid drafts stay in Portal until you mark paid. <a href="/admin_finance_guide.html" target="_blank" rel="noopener">Finance guide (EN/ES)</a>.</p>' +
      '<div class="toolbar" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<span class="muted" style="font-size:12px;font-weight:700">Amount</span>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-amount="year">Year 26/27</button>' +
      '<button type="button" class="btn btn--sm" data-inv-amount="autumn">Autumn</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-amount="spring">Spring</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-amount="summer">Summer</button>' +
      '</div>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-inv-filter="all">All</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="la_auto">Auto re-enrolled</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="ready">Shared</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="unpaid">Ready unpaid</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="paid">Paid</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="pending">Pending confirmation</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="buffer_low">Buffer low</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="xero_unsynced">Paid not in Xero</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="hidden">Hidden</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentInvoicesRefreshEmbed">Refresh</button>' +
      '<button type="button" class="btn btn--sm btn--primary" id="portalParentInvoicesPushXero" title="Creates ACCREC in Xero for paid Portal invoices (awaiting payment)">Push paid to Xero</button>' +
      '<button type="button" class="btn btn--sm" id="portalParentInvoicesExportXero">Export to Xero CSV</button>' +
      '</div>' +
      '<details style="margin:0 0 14px;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:10px;max-width:100%;min-width:0">' +
      '<summary style="cursor:pointer;font-weight:700">Match Tide bank CSV</summary>' +
      '<p class="muted" style="margin:8px 0 10px;max-width:48rem;overflow-wrap:break-word">Export inbound payments from Tide → upload here. Portal suggests INV-P matches by reference + amount. <strong>Confirm</strong> marks paid and creates the Xero ACCREC if missing (awaiting payment). Mark Paid + reconcile the bank line in Xero.</p>' +
      '<div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<input class="inp" id="portalTideMatchFile" type="file" accept=".csv,text/csv,text/plain" style="max-width:20rem;min-width:0" />' +
      '<button type="button" class="btn btn--sm btn--primary" id="portalTideMatchUpload">Upload &amp; score</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" id="portalTideMatchRefresh">Refresh matches</button>' +
      '</div>' +
      '<div id="portalTideMatchHost"><p class="muted">Loading…</p></div>' +
      '</details>' +
      '<div id="portalParentInvoicesHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindCreateEmbed() {
    bindUploadForm();
  }

  function bindListEmbed() {
    state.filter = 'all';
    state.amountPeriod = 'autumn';
    bindTideMatchPanel();
    var host = global.document.getElementById('portalParentInvoicesHost');
    var refresh = global.document.getElementById('portalParentInvoicesRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(host);
        void refreshTideAndInvoices();
      });
    }
    var exportBtn = global.document.getElementById('portalParentInvoicesExportXero');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        void exportUnsyncedXeroCsv();
      });
    }
    var pushBtn = global.document.getElementById('portalParentInvoicesPushXero');
    if (pushBtn) {
      pushBtn.addEventListener('click', function () {
        void pushUnsyncedToXero();
      });
    }
    global.document.querySelectorAll('.toolbar [data-inv-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setInvoiceFilter(btn.getAttribute('data-inv-filter') || 'all');
        void renderHost(global.document.getElementById('portalParentInvoicesHost'));
      });
    });
    global.document.querySelectorAll('.toolbar [data-inv-amount]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setAmountPeriod(btn.getAttribute('data-inv-amount') || 'autumn');
        void renderHost(global.document.getElementById('portalParentInvoicesHost'));
      });
    });
    setAmountPeriod(state.amountPeriod);
    void renderHost(host);
  }

  function bindEmbed() {
    bindCreateEmbed();
    bindListEmbed();
  }

  function embedHtml() {
    return createInvoiceEmbedHtml() + reenrolmentsEmbedHtml();
  }

  global.PortalParentInvoices = {
    configure: configure,
    embedHtml: embedHtml,
    createInvoiceEmbedHtml: createInvoiceEmbedHtml,
    reenrolmentsEmbedHtml: reenrolmentsEmbedHtml,
    bindEmbed: bindEmbed,
    bindCreateEmbed: bindCreateEmbed,
    bindListEmbed: bindListEmbed
  };
})(typeof window !== 'undefined' ? window : globalThis);
