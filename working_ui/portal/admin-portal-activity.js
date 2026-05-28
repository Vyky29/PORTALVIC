/**
 * Admin Portal Activity — staff visit sessions (login, pages, active-tab time).
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) {
      return String(s == null ? '' : s);
    },
    getClient: function () {
      return null;
    }
  };

  var state = {
    day: '',
    rows: [],
    loading: false
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function londonTodayIso() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date());
      var y = '';
      var m = '';
      var d = '';
      parts.forEach(function (p) {
        if (p.type === 'year') y = p.value;
        if (p.type === 'month') m = p.value;
        if (p.type === 'day') d = p.value;
      });
      if (y && m && d) return y + '-' + m + '-' + d;
    } catch (_e) {}
    return new Date().toISOString().slice(0, 10);
  }

  function formatLondon(iso, withSeconds) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function formatDuration(ms, stillOpen) {
    var n = Number(ms);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (stillOpen && n < 1000) {
      return 'still in app';
    }
    var sec = Math.round(n / 1000);
    if (sec < 60) return sec + 's';
    var min = Math.floor(sec / 60);
    sec = sec % 60;
    if (min < 60) {
      return min + 'm' + (sec ? ' ' + sec + 's' : '');
    }
    var hr = Math.floor(min / 60);
    min = min % 60;
    return hr + 'h ' + min + 'm';
  }

  function pageCount(pages) {
    if (!Array.isArray(pages)) return 0;
    return pages.length;
  }

  function visitSummary(row) {
    var login = formatLondon(row.login_at, true);
    var logout = row.still_open
      ? 'still in app'
      : formatLondon(row.logout_at || row.last_seen_at, true);
    var dur = formatDuration(
      row.still_open
        ? Date.now() - new Date(row.login_at).getTime()
        : row.total_ms || row.active_tab_ms,
      row.still_open
    );
    var pages = pageCount(row.pages);
    return (
      login +
      ' → ' +
      logout +
      ' · ' +
      dur +
      ' · ' +
      pages +
      ' page' +
      (pages === 1 ? '' : 's')
    );
  }

  function renderPagesList(pages) {
    if (!Array.isArray(pages) || !pages.length) {
      return '<p class="portal-activity-detail__empty">No pages recorded.</p>';
    }
    return (
      '<ul class="portal-activity-pages">' +
      pages
        .map(function (p) {
          var label = esc(p.label || p.page || 'page');
          var at = p.at ? formatLondon(p.at, true) : '';
          return (
            '<li><span class="portal-activity-pages__label">' +
            label +
            '</span> <span class="portal-activity-pages__at">' +
            esc(at) +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderSubmits(submits) {
    if (!Array.isArray(submits) || !submits.length) {
      return '<p class="portal-activity-detail__empty">No form submits recorded.</p>';
    }
    return (
      '<ul class="portal-activity-pages">' +
      submits
        .map(function (s) {
          return (
            '<li><span class="portal-activity-pages__label">' +
            esc(s.label || s.action || 'submit') +
            '</span> <span class="portal-activity-pages__at">' +
            esc(s.at ? formatLondon(s.at, true) : '') +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderList(rows) {
    var host = document.getElementById('portalActivityList');
    var countEl = document.getElementById('portalActivityCount');
    if (!host) return;
    if (countEl) {
      countEl.textContent =
        String(rows.length) +
        ' visit' +
        (rows.length === 1 ? '' : 's') +
        ' on ' +
        esc(state.day || londonTodayIso());
    }
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted portal-activity-empty">No visits recorded for this day yet. Staff and leads are tracked when they use the portal dashboards.</p>';
      return;
    }
    host.innerHTML = rows
      .map(function (row, idx) {
        var surface = String(row.staff_surface || 'staff').trim();
        var name = esc(row.staff_display_name || 'Staff');
        var summary = esc(visitSummary(row));
        var activeMs = row.active_tab_ms != null ? row.active_tab_ms : 0;
        var totalMs = row.total_ms != null ? row.total_ms : activeMs;
        return (
          '<details class="portal-activity-visit" data-portal-activity-idx="' +
          idx +
          '">' +
          '<summary class="portal-activity-visit__head">' +
          '<span class="portal-activity-visit__title">' +
          name +
          ' <span class="muted">(' +
          esc(surface) +
          ')</span></span>' +
          '<span class="portal-activity-visit__meta">' +
          summary +
          '</span>' +
          '</summary>' +
          '<div class="portal-activity-visit__body">' +
          '<dl class="portal-activity-detail">' +
          '<div><dt>LOG IN</dt><dd>' +
          esc(formatLondon(row.login_at, true)) +
          '</dd></div>' +
          '<div><dt>LOG OFF</dt><dd>' +
          (row.still_open
            ? '<span class="chip chip--info">Still in app</span>'
            : esc(formatLondon(row.logout_at || row.last_seen_at, true))) +
          '</dd></div>' +
          '<div><dt>TIME ON APP</dt><dd>' +
          esc(formatDuration(activeMs, false)) +
          ' <span class="muted">(active tab)</span></dd></div>' +
          '<div><dt>TOTAL IN APP</dt><dd>' +
          esc(
            formatDuration(
              row.still_open
                ? Date.now() - new Date(row.login_at).getTime()
                : totalMs,
              row.still_open
            )
          ) +
          '</dd></div>' +
          '<div><dt>LAST PAGE</dt><dd>' +
          esc(row.last_page_label || '—') +
          '</dd></div>' +
          '<div><dt>LAST SEEN</dt><dd>' +
          esc(formatLondon(row.last_seen_at, true)) +
          '</dd></div>' +
          '</dl>' +
          '<p class="portal-activity-detail__section-title">PAGES VISITED</p>' +
          renderPagesList(row.pages) +
          '<p class="portal-activity-detail__section-title">BUTTONS SUBMITTED</p>' +
          renderSubmits(row.form_submits) +
          '</div></details>'
        );
      })
      .join('');
    global._portalActivityRows = rows;
  }

  function setStatus(html, isError) {
    var el = document.getElementById('portalActivityStatus');
    if (!el) return;
    el.className = 'portal-forms-status' + (isError ? ' is-error' : '');
    el.innerHTML = html || '';
  }

  async function refresh() {
    var client = cfg.getClient();
    if (!client) {
      setStatus('<strong>Sign in required.</strong> Supabase session not available.', true);
      return;
    }
    var dayInput = document.getElementById('portalActivityDay');
    var day = dayInput && dayInput.value ? String(dayInput.value).trim() : state.day;
    if (!day) day = londonTodayIso();
    state.day = day;
    if (dayInput && dayInput.value !== day) dayInput.value = day;

    var btn = document.getElementById('portalActivityRefresh');
    if (btn) btn.disabled = true;
    state.loading = true;
    setStatus('<strong>Loading…</strong>');

    var res = await client
      .from('portal_staff_visit_sessions')
      .select(
        'id, staff_display_name, staff_surface, login_at, logout_at, last_seen_at, last_page_label, active_tab_ms, total_ms, pages, form_submits, still_open'
      )
      .eq('session_date', day)
      .order('login_at', { ascending: false });

    state.loading = false;
    if (btn) btn.disabled = false;

    if (res.error) {
      var msg = res.error.message || String(res.error);
      if (/does not exist|relation/i.test(msg)) {
        setStatus(
          '<strong>Database not ready.</strong> Run migration <code>20260531140000_portal_staff_visit_sessions.sql</code> on the Portal Supabase project.',
          true
        );
      } else {
        setStatus('<strong>Error</strong> ' + esc(msg), true);
      }
      state.rows = [];
      renderList([]);
      return;
    }

    state.rows = res.data || [];
    setStatus('');
    renderList(state.rows);
  }

  function bindModule() {
    var root = document.getElementById('portalActivityRoot');
    if (!root || root.getAttribute('data-portal-activity-bound') === '1') return;
    root.setAttribute('data-portal-activity-bound', '1');

    var dayInput = document.getElementById('portalActivityDay');
    if (dayInput && !dayInput.value) dayInput.value = londonTodayIso();
    state.day = dayInput ? dayInput.value : londonTodayIso();

    var refreshBtn = document.getElementById('portalActivityRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        void refresh();
      });
    }
    if (dayInput) {
      dayInput.addEventListener('change', function () {
        void refresh();
      });
    }

    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalActivityRoot" class="portal-activity-embed portal-day-ops-embed" data-portal-activity-bound="0">' +
      '<h1 class="page-title">Portal activity</h1>' +
      '<p class="page-intro portal-activity-intro">Login and logout times are UK (London). Time on app uses active tab time while the portal is open. Tap a row to expand.</p>' +
      '<div id="portalActivityStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-activity-toolbar">' +
      '<label class="portal-activity-toolbar__day"><span class="muted">Day</span> ' +
      '<input type="date" class="inp" id="portalActivityDay" />' +
      '</label>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalActivityRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="dashboard">Day operations</button>' +
      '</div>' +
      '<p class="portal-activity-count" id="portalActivityCount">Loading…</p>' +
      '<div id="portalActivityList" class="portal-activity-list" aria-live="polite"></div>' +
      '</div>'
    );
  }

  global.PortalActivity = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh
  };
})(typeof window !== 'undefined' ? window : globalThis);
