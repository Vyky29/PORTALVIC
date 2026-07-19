/**
 * Admin Payments module — live, editable client re-enrolment payments.
 *
 * Powered by public.client_payments (Portal Supabase, RLS admin/CEO only),
 * seeded from the "SUMMER. Re-enrolments" workbook. Mounted into the admin
 * "Re-enrolment payments" view (#payModuleRoot).
 *
 * UX:
 *  - Totals KPIs: billed / paid / outstanding (respecting group + search).
 *  - Filter by status (All / Outstanding / Paid / Not re-enrolled) and by group
 *    (Private parents / Local authority / Not re-enrolled), plus free-text search.
 *  - Tap a client to open and edit status, amount, names and every field.
 *
 * Edits are saved to Supabase (the workbook was the initial load only).
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: function () { return (global.__PORTAL_SUPABASE__ || {}).client || null; },
    getSupabaseUrl: null,
    getAnonKey: null,
    toast: function (m) { try { console.log("[pay]", m); } catch (_) {} },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    openModal: null,
    closeModal: null,
  };

  // Academic-term buckets for the accordion (Summer 25/26 workbook + Jul crash; Autumn 26/27 re-enrol).
  var TERM_BUCKETS = [
    {
      id: "summer_2526",
      title: "SUMMER TERM 25/26",
      subtitle: "Term sessions · Jul crash courses · May–Jul billing",
    },
    {
      id: "autumn_2627",
      title: "AUTUMN TERM 26/27",
      subtitle: "Re-enrolment 2026-27 · instalments from Sep 2026",
    },
  ];

  /* Sheet = billing channel (filter cards). Columns: Paid + Invoice type. */
  var SHEET_LABELS = {
    "PARENTS": "Family · Private",
    "DIRECT_PAYMENTS": "Family · Direct Payments",
    "LA": "LA / NHS invoice",
    "No re-enroled": "Not re-enrolled",
  };
  var SHEET_ORDER = ["PARENTS", "DIRECT_PAYMENTS", "LA", "No re-enroled"];
  var STATUS_OPTIONS = ["Paid", "Outstanding", "Not paid", "Pending", "Not re-enrolled"];

  /** Who pays / funds the place. */
  var PAID_BY = {
    FUNDS_FROM_LA: "Using Funds from LA",
    PRIVATE_FUNDS: "Using Private Funds",
    FUNDED_BY_LA: "Funded by LA",
    FUNDED_BY_NHS: "Funded by NHS",
  };
  var PAID_BY_OPTIONS = [
    PAID_BY.FUNDS_FROM_LA,
    PAID_BY.PRIVATE_FUNDS,
    PAID_BY.FUNDED_BY_LA,
    PAID_BY.FUNDED_BY_NHS,
  ];

  /** Invoice type shown in Payments — only these labels. */
  var INVOICE_TYPE = {
    NHS_EXEMPT: "NHS (Exempt invoice)",
    LA_EXEMPT: "Local Authority (Exempt invoice)",
    PARENT_20: "Parent (20% included invoice)",
    PARENT_EXEMPT: "Parent (Exempt invoice)",
  };
  var INVOICE_TYPE_OPTIONS = [
    INVOICE_TYPE.NHS_EXEMPT,
    INVOICE_TYPE.LA_EXEMPT,
    INVOICE_TYPE.PARENT_20,
    INVOICE_TYPE.PARENT_EXEMPT,
  ];

  /** Internal route used to classify rows (maps → Paid + Invoice type). */
  var PAYER_ROUTE = {
    FAMILY_PRIVATE: "Using Private Funds",
    FAMILY_DP: "Using Funds from LA",
    LA_INVOICE: "Local Authority (Exempt invoice)",
    NHS_INVOICE: "NHS (Exempt invoice)",
    NEN: "NHS (Exempt invoice)",
  };
  var PAYER_ROUTE_OPTIONS = [
    PAYER_ROUTE.FAMILY_PRIVATE,
    PAYER_ROUTE.FAMILY_DP,
    PAYER_ROUTE.LA_INVOICE,
    PAYER_ROUTE.NHS_INVOICE,
  ];

  /** Canonical selectable values for payment edit fields (keeps wording consistent). */
  var SELECT_CATALOG = {
    sheet: [
      { value: "PARENTS", label: "Family · Private" },
      { value: "DIRECT_PAYMENTS", label: "Family · Direct Payments" },
      { value: "LA", label: "LA / NHS invoice" },
      { value: "No re-enroled", label: "Not re-enrolled" },
    ],
    paid: PAID_BY_OPTIONS.slice(),
    "invoice type": INVOICE_TYPE_OPTIONS.slice(),
    "la/nhs/family": INVOICE_TYPE_OPTIONS.slice(),
    funding: INVOICE_TYPE_OPTIONS.concat(PAID_BY_OPTIONS),
    "funding origin": [
      "Private",
      "Parent Direct Payments",
      "LA-funded",
      "NHS-funded",
      "NEN",
    ],
    "payment method": [
      "Bank Transfer (fixed due dates)",
      "Direct Payment (GoCardless · monthly)",
      "Own arrangement — cannot meet payment dates (+ £50 / term)",
      "1 - Bank Transfer",
      "2 - Bank Transfer",
      "4 - Go Cardless",
      "Own Way (upfront)",
      "Own Way (behind)",
      "LA invoice (BACS)",
      "LA invoice (Care in Finance)",
      "Direct payment (CWD remittance)",
      "NHS invoice (PO)",
      "One-off payment",
    ],
    vat: [
      "Exempt",
      "20% VAT included",
      "Includes 20% VAT (in price)",
      "PF / VAT 20%",
    ],
    funder: INVOICE_TYPE_OPTIONS.slice(),
    payer: [
      PAID_BY.PRIVATE_FUNDS,
      PAID_BY.FUNDS_FROM_LA,
      "Local authority / NHS (pays direct)",
    ],
    term: [
      "SUMMER TERM 25/26",
      "AUTUMN TERM 26/27",
      "Spring term 25/26",
      "Whole Year 25/26",
      "Summer term 2026",
    ],
  };

  /**
   * Standard club services with fixed £ / session.
   * Day Centre: hours vary (separate field) and Total (£) stays free-text / manual.
   */
  var SERVICE_CATALOG = [
    { id: "aq_30", label: "30' Aquatic Activity", durationMin: 30, kind: "Aquatic Activity", costPerSession: 50 },
    { id: "aq_60", label: "60' Aquatic Activity", durationMin: 60, kind: "Aquatic Activity", costPerSession: 100 },
    { id: "aq_90", label: "90' Aquatic Activity", durationMin: 90, kind: "Aquatic Activity", costPerSession: 150 },
    { id: "cl_60", label: "60' Climbing Activity", durationMin: 60, kind: "Climbing Activity", costPerSession: 70 },
    { id: "ph_60", label: "60' Physical Activity", durationMin: 60, kind: "Physical Activity", costPerSession: 70 },
    { id: "mu_90", label: "90' Multi-Activity", durationMin: 90, kind: "Multi-Activity", costPerSession: 120 },
    { id: "day_centre", label: "Day Centre", durationMin: null, kind: "Day Centre", costPerSession: null, hoursSeparate: true },
    { id: "other", label: "Other / custom…", durationMin: null, kind: null, costPerSession: null, custom: true },
  ];

  var SERVICE_DAY_OPTS = [
    { value: "", label: "— Day (optional) —" },
    { value: "Monday", label: "Monday" },
    { value: "Tuesday", label: "Tuesday" },
    { value: "Wednesday", label: "Wednesday" },
    { value: "Thursday", label: "Thursday" },
    { value: "Friday", label: "Friday" },
    { value: "Saturday", label: "Saturday" },
    { value: "Sunday", label: "Sunday" },
  ];

  function catalogById(id) {
    for (var i = 0; i < SERVICE_CATALOG.length; i++) {
      if (SERVICE_CATALOG[i].id === id) return SERVICE_CATALOG[i];
    }
    return null;
  }

  function parseServiceSelection(raw) {
    var s = String(raw || "").trim();
    var out = { id: "other", day: "", hours: "", custom: s };
    if (!s) return out;
    var low = s.toLowerCase().replace(/[’]/g, "'");

    var dayHit = "";
    SERVICE_DAY_OPTS.forEach(function (d) {
      if (!d.value) return;
      var short = d.value.slice(0, 2).toLowerCase();
      var re = new RegExp("\\b" + d.value.toLowerCase() + "\\b|\\(" + short + "\\)|\\b" + short + "\\b", "i");
      if (re.test(low) || low.indexOf(d.value.toLowerCase()) >= 0) dayHit = d.value;
    });
    // Compact day tokens: (Mon)/(Tu)/(Tue)/(Wed)/(Thu)/(Fri)/(Sat)/(Su)/(Sun)
    var compact = low.match(/\((mo|mon|tu|tue|tues|we|wed|th|thu|thur|fri|fr|sa|sat|su|sun)\)/i);
    if (compact) {
      var t = compact[1].toLowerCase();
      if (t.indexOf("mo") === 0) dayHit = "Monday";
      else if (t.indexOf("tu") === 0) dayHit = "Tuesday";
      else if (t.indexOf("we") === 0) dayHit = "Wednesday";
      else if (t.indexOf("th") === 0) dayHit = "Thursday";
      else if (t.indexOf("fr") === 0) dayHit = "Friday";
      else if (t.indexOf("sa") === 0) dayHit = "Saturday";
      else if (t.indexOf("su") === 0) dayHit = "Sunday";
    }
    out.day = dayHit;

    if (/day\s*centre|day\s*center/.test(low)) {
      out.id = "day_centre";
      out.custom = "";
      var hrs = s.match(/(\d{1,2}[:.]\d{2}\s*[–\-—to]+\s*\d{1,2}[:.]\d{2}|\d+h(?:ours?)?|\d+\s*hours?)/i);
      if (hrs) out.hours = hrs[1].replace(/\s+/g, " ").trim();
      return out;
    }

    var mins = null;
    var m = low.match(/(\d+)\s*['′']?\s*(?:min|mins|minutes)?/);
    if (m) mins = Number(m[1]);
    if (/90/.test(low) && (mins == null || mins === 90)) mins = 90;
    else if (/60/.test(low) && (mins == null || mins === 60)) mins = 60;
    else if (/30/.test(low) && (mins == null || mins === 30)) mins = 30;

    var kind = null;
    if (/aquatic|\bsw\b|swim/.test(low)) kind = "Aquatic Activity";
    else if (/climb|\bcl\b/.test(low)) kind = "Climbing Activity";
    else if (/physical|\bfitness\b|\bft\b|\bfn\b/.test(low)) kind = "Physical Activity";
    else if (/multi|s&c|s\s*&\s*c/.test(low)) kind = "Multi-Activity";

    for (var i = 0; i < SERVICE_CATALOG.length; i++) {
      var c = SERVICE_CATALOG[i];
      if (c.custom || c.hoursSeparate) continue;
      if (c.kind === kind && c.durationMin === mins) {
        out.id = c.id;
        out.custom = "";
        return out;
      }
    }
    return out;
  }

  function composeServiceLabel(cat, day, hours, customText) {
    if (!cat) return String(customText || "").trim();
    if (cat.custom) return String(customText || "").trim();
    if (cat.hoursSeparate) {
      var base = "Day Centre";
      var h = String(hours || "").trim();
      return h ? base + " (" + h + ")" : base;
    }
    var label = cat.label;
    var d = String(day || "").trim();
    if (d) label += " (" + d + ")";
    return label;
  }

  /** Workbook multi-service strings: "30' … (Tue) · 30' … (Thu)" (also + / newlines). */
  function splitServiceList(raw) {
    var s = String(raw || "").trim();
    if (!s) return [""];
    if (/[·•]/.test(s)) {
      return s.split(/\s*[·•]\s*/).map(function (p) { return String(p || "").trim(); }).filter(Boolean);
    }
    if (/\s\+\s/.test(s)) {
      return s.split(/\s\+\s/).map(function (p) { return String(p || "").trim(); }).filter(Boolean);
    }
    if (/\s\/\s/.test(s) && /(aquatic|climb|multi|physical|day\s*centre|activity)/i.test(s)) {
      return s.split(/\s\/\s/).map(function (p) { return String(p || "").trim(); }).filter(Boolean);
    }
    if (/\n|;/.test(s)) {
      return s.split(/[\n;]+/).map(function (p) { return String(p || "").trim(); }).filter(Boolean);
    }
    return [s];
  }

  function joinServiceList(labels) {
    return (labels || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" · ");
  }

  function serviceRowHtml(idx, rawPiece, dataObj) {
    dataObj = dataObj || {};
    var parsed = parseServiceSelection(rawPiece);
    if (!parsed.hours && idx === 0) {
      parsed.hours = String(dataObj.Hours || dataObj["Session hours"] || dataObj["Day Centre hours"] || "").trim();
    }
    var cat = catalogById(parsed.id) || catalogById("other");
    var rate = cat && cat.costPerSession != null ? "£" + cat.costPerSession + " / session" : "Varies — set Total (£) manually";
    var opts = SERVICE_CATALOG.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === parsed.id ? " selected" : "") + ">" + esc(c.label) +
        (c.costPerSession != null ? " · £" + c.costPerSession + "/session" : "") +
        "</option>";
    }).join("");
    var dayOpts = SERVICE_DAY_OPTS.map(function (d) {
      return '<option value="' + esc(d.value) + '"' + (d.value === parsed.day ? " selected" : "") + ">" + esc(d.label) + "</option>";
    }).join("");
    var showHours = !!(cat && cat.hoursSeparate);
    var showCustom = !!(cat && cat.custom);
    var showDay = !showHours && !showCustom;
    var rid = "paySvc" + idx;

    return '<div class="pay-svc-row pay-fields" data-svc-row="' + idx + '">'
      + '<div class="pay-svc-row__head"><span class="pay-svc-row__n">Service ' + (idx + 1) + "</span>"
      + '<button type="button" class="btn btn--ghost btn--sm pay-svc-remove" data-svc-remove="' + idx + '" aria-label="Remove service"' + (idx === 0 ? " hidden" : "") + ">" + icon("x", 14) + " Remove</button></div>"
      + '<div class="pay-field"><label>' + icon("tag", 13) + "<span>Service</span></label>"
      + '<select class="pay-svc-catalog" id="' + rid + 'Catalog">' + opts + "</select></div>"
      + '<div class="pay-field pay-svc-day-wrap" style="' + (showDay ? "" : "display:none") + '"><label>' + icon("calendar", 13) + "<span>Day</span></label>"
      + '<select class="pay-svc-day" id="' + rid + 'Day">' + dayOpts + "</select></div>"
      + '<div class="pay-field pay-svc-hours-wrap" style="' + (showHours ? "" : "display:none") + '"><label>' + icon("calendar", 13) + "<span>Hours (Day Centre)</span></label>"
      + '<input type="text" class="pay-svc-hours" id="' + rid + 'Hours" placeholder="e.g. 11:00–16:00 or 5h" value="' + esc(parsed.hours) + '" /></div>'
      + '<div class="pay-field pay-svc-custom-wrap" style="' + (showCustom ? "" : "display:none") + '"><label>' + icon("tag", 13) + "<span>Custom service</span></label>"
      + '<input type="text" class="pay-svc-custom" id="' + rid + 'Custom" value="' + esc(parsed.custom || (showCustom ? rawPiece : "")) + '" placeholder="Type the full service label" /></div>'
      + '<div class="pay-field"><label>' + icon("coins", 13) + "<span>Cost / session</span></label>"
      + '<input type="text" class="pay-svc-rate" readonly value="' + esc(rate) + '" /></div>'
      + "</div>";
  }

  function serviceEditHtml(svcKey, rawService, dataObj) {
    dataObj = dataObj || {};
    var parts = splitServiceList(rawService);
    if (!parts.length) parts = [""];
    var rows = parts.map(function (p, i) { return serviceRowHtml(i, p, dataObj); }).join("");
    var initialLabels = parts.map(function (p) {
      var parsed = parseServiceSelection(p);
      var cat = catalogById(parsed.id) || catalogById("other");
      return composeServiceLabel(cat, parsed.day, parsed.hours, parsed.custom || p);
    });
    var costs = [];
    var hoursParts = [];
    parts.forEach(function (p, i) {
      var parsed = parseServiceSelection(p);
      if (!parsed.hours && i === 0) {
        parsed.hours = String(dataObj.Hours || dataObj["Session hours"] || dataObj["Day Centre hours"] || "").trim();
      }
      var cat = catalogById(parsed.id) || catalogById("other");
      if (cat && cat.costPerSession != null) costs.push(String(cat.costPerSession));
      if (cat && cat.hoursSeparate && parsed.hours) hoursParts.push(parsed.hours);
    });
    return '<div id="payServiceEdit" data-svc-key="' + esc(svcKey) + '">'
      + '<div id="paySvcRows">' + rows + "</div>"
      + '<div class="pay-svc-actions">'
      + '<button type="button" class="btn btn--ghost btn--sm" id="paySvcAdd">+ Add service</button>'
      + '<span class="muted pay-svc-hint" id="paySvcSumHint"></span>'
      + "</div>"
      + '<input type="hidden" data-data="' + esc(svcKey) + '" id="paySvcHidden" value="' + esc(joinServiceList(initialLabels)) + '" />'
      + '<input type="hidden" data-data="Hours" id="paySvcHoursHidden" value="' + esc(hoursParts.join(" · ")) + '" />'
      + '<input type="hidden" data-data="Cost / session" id="paySvcCostHidden" value="' + esc(costs.join(" · ")) + '" />'
      + "</div>";
  }

  function wireServiceEdit(root) {
    var box = root.querySelector("#payServiceEdit");
    if (!box) return;
    var rowsHost = box.querySelector("#paySvcRows");
    var hidden = box.querySelector("#paySvcHidden");
    var hoursHidden = box.querySelector("#paySvcHoursHidden");
    var costHidden = box.querySelector("#paySvcCostHidden");
    var hint = box.querySelector("#paySvcSumHint");
    var addBtn = box.querySelector("#paySvcAdd");
    var nextIdx = rowsHost ? rowsHost.querySelectorAll("[data-svc-row]").length : 0;

    function renumberRows() {
      if (!rowsHost) return;
      var rows = rowsHost.querySelectorAll("[data-svc-row]");
      rows.forEach(function (row, i) {
        row.setAttribute("data-svc-row", String(i));
        var n = row.querySelector(".pay-svc-row__n");
        if (n) n.textContent = "Service " + (i + 1);
        var rm = row.querySelector("[data-svc-remove]");
        if (rm) {
          rm.setAttribute("data-svc-remove", String(i));
          rm.hidden = rows.length <= 1;
        }
      });
    }

    function sync() {
      if (!rowsHost) return;
      var labels = [];
      var costs = [];
      var hoursParts = [];
      var rateSum = 0;
      var rateN = 0;
      rowsHost.querySelectorAll("[data-svc-row]").forEach(function (row) {
        var catEl = row.querySelector(".pay-svc-catalog");
        var dayEl = row.querySelector(".pay-svc-day");
        var hoursEl = row.querySelector(".pay-svc-hours");
        var customEl = row.querySelector(".pay-svc-custom");
        var rateEl = row.querySelector(".pay-svc-rate");
        var dayWrap = row.querySelector(".pay-svc-day-wrap");
        var hoursWrap = row.querySelector(".pay-svc-hours-wrap");
        var customWrap = row.querySelector(".pay-svc-custom-wrap");
        var cat = catalogById(catEl && catEl.value) || catalogById("other");
        var isDc = !!(cat && cat.hoursSeparate);
        var isCustom = !!(cat && cat.custom);
        if (dayWrap) dayWrap.style.display = !isDc && !isCustom ? "" : "none";
        if (hoursWrap) hoursWrap.style.display = isDc ? "" : "none";
        if (customWrap) customWrap.style.display = isCustom ? "" : "none";
        var day = dayEl ? dayEl.value : "";
        var hours = hoursEl ? String(hoursEl.value || "").trim() : "";
        var custom = customEl ? String(customEl.value || "").trim() : "";
        var label = composeServiceLabel(cat, day, hours, custom);
        if (label) labels.push(label);
        if (cat && cat.costPerSession != null) {
          costs.push(String(cat.costPerSession));
          rateSum += Number(cat.costPerSession) || 0;
          rateN++;
        }
        if (isDc && hours) hoursParts.push(hours);
        if (rateEl) {
          rateEl.value = cat && cat.costPerSession != null
            ? "£" + cat.costPerSession + " / session"
            : "Varies — set Total (£) manually";
        }
      });
      if (hidden) hidden.value = joinServiceList(labels);
      if (hoursHidden) hoursHidden.value = hoursParts.join(" · ");
      if (costHidden) costHidden.value = costs.join(" · ");
      if (hint) {
        hint.textContent = rateN
          ? (labels.length > 1
            ? "Session rates: £" + rateSum + " combined (" + rateN + " priced)"
            : "Session rate: £" + rateSum)
          : "";
      }
      var costInp = root.querySelector('[data-data="Cost"]');
      if (costInp && rateN) {
        var cur = String(costInp.value || "").trim();
        if (!cur || /^\d+(\.\d+)?$/.test(cur) || /^£?\s*\d+(\.\d+)?(\s*[·+]\s*\d+(\.\d+)?)*\s*(\/\s*session)?$/i.test(cur)) {
          costInp.value = costs.join(" · ");
        }
      }
      renumberRows();
    }

    function bindRow(row) {
      if (!row) return;
      var catEl = row.querySelector(".pay-svc-catalog");
      var dayEl = row.querySelector(".pay-svc-day");
      var hoursEl = row.querySelector(".pay-svc-hours");
      var customEl = row.querySelector(".pay-svc-custom");
      if (catEl) catEl.addEventListener("change", sync);
      if (dayEl) dayEl.addEventListener("change", sync);
      if (hoursEl) hoursEl.addEventListener("input", sync);
      if (customEl) customEl.addEventListener("input", sync);
      var rm = row.querySelector("[data-svc-remove]");
      if (rm) {
        rm.addEventListener("click", function () {
          var all = rowsHost.querySelectorAll("[data-svc-row]");
          if (all.length <= 1) return;
          row.parentNode.removeChild(row);
          sync();
        });
      }
    }

    if (rowsHost) {
      rowsHost.querySelectorAll("[data-svc-row]").forEach(bindRow);
    }
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var wrap = document.createElement("div");
        wrap.innerHTML = serviceRowHtml(nextIdx++, "", {});
        var row = wrap.firstChild;
        if (!row || !rowsHost) return;
        rowsHost.appendChild(row);
        bindRow(row);
        sync();
        var cat = row.querySelector(".pay-svc-catalog");
        if (cat && typeof cat.focus === "function") cat.focus();
      });
    }
    sync();
  }

  function normalizeSelectKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ");
  }

  function selectOptionsFor(fieldName, currentValue) {
    var key = normalizeSelectKey(fieldName);
    if (key === "la" || key === "la nhs family" || key === "funder" || key === "invoice type") key = "invoice type";
    if (key === "paid" || key === "paid by") key = "paid";
    var list = SELECT_CATALOG[key];
    if (!list || !list.length) return null;
    var v = currentValue == null ? "" : String(currentValue).trim();
    var opts = list.map(function (o) {
      if (o && typeof o === "object") return { value: String(o.value), label: String(o.label) };
      return { value: String(o), label: String(o) };
    });
    if (v) {
      var hit = opts.some(function (o) { return o.value === v || o.label === v; });
      if (!hit) opts.unshift({ value: v, label: v + " (current)" });
    }
    return opts;
  }

  function selectHtml(attrs, options, currentValue) {
    var v = currentValue == null ? "" : String(currentValue).trim();
    var html = "<select " + attrs + ">";
    html += '<option value="">— Select —</option>';
    (options || []).forEach(function (o) {
      var sel = o.value === v || o.label === v ? " selected" : "";
      html += '<option value="' + esc(o.value) + '"' + sel + ">" + esc(o.label) + "</option>";
    });
    return html + "</select>";
  }

  /** Parent pays with LA Direct Payments / personal budget — not an LA/NHS invoice to the club. */
  function isParentDirectPaymentsLabel(raw) {
    var low = String(raw || "").toLowerCase();
    if (!low) return false;
    if (/parent\s*[·•\-]\s*direct payment|direct payments?\s*\(la money\)/.test(low)) return true;
    if (/using money from la/.test(low) && /direct payment/.test(low)) return true;
    if (/using funds from la/.test(low) && /direct payment/.test(low)) return true;
    if (/la_direct_payments|parent_direct_payments/.test(low)) return true;
    if (/direct payment/.test(low) && /ehcp|care package|personal budget/.test(low)) return true;
    return false;
  }

  /** Generic umbrella from contacts / API — not a real NHS funder. */
  function isGenericLaNhsUmbrella(raw) {
    var low = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!low) return false;
    return /^(la\s*\/\s*nhs|la\/nhs|la\s*&\s*nhs)(\s*(funds?|invoice|exempt))?$/.test(low)
      || low === "la / nhs funds"
      || low === "la/nhs funds";
  }

  /** Explicit NHS / SBS / ILA / NEN funder (not the "LA / NHS" umbrella). */
  function isExplicitNhsFunder(raw) {
    var low = String(raw || "").toLowerCase();
    if (!low || isGenericLaNhsUmbrella(low)) return false;
    if (/funded by nhs|nhs \(exempt|nhs \(invoice|nhs invoice|\bnnen\b|\bnen\b|\bsbs\b|\bila\b|people places/.test(low)) {
      return true;
    }
    if (/\bnhs\s*[·•\-]/.test(low)) return true;
    if (/\bnhs\b/.test(low) && !/\blocal authority\b/.test(low)) return true;
    return false;
  }

  /**
   * Known day-centre / bespoke NHS clients (user rule).
   * Tinashe is day-aware: Fridays NHS, Mon/Wed LA.
   */
  function curatedNhsRouteForParticipant(r) {
    var name = String((r && r.client_name) || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!name) return "";
    if (/^ikram\b/.test(name)) return "NHS_INVOICE";
    if (/^emanuel\b|^emmanuel\b/.test(name)) return "NHS_INVOICE";
    if (/^timi\b/.test(name)) return "NHS_INVOICE";
    if (/^fadi\b/.test(name)) return "NHS_INVOICE";
    if (!/^tinashe\b/.test(name)) return "";
    var d = (r && r.data) || {};
    var funder = String(d.Funder || d.Funding || "").toLowerCase();
    var paid = String(d.Paid || d["Paid by"] || "").toLowerCase();
    var parent = String(r.parent_name || "").toLowerCase();
    var svc = String(rawServiceText(r) || "").toLowerCase();
    if (
      isExplicitNhsFunder(funder)
      || isExplicitNhsFunder(paid)
      || /nhs\s*[·•]|nhs invoice|people places|\bila\b/.test(funder + " " + parent)
    ) {
      return "NHS_INVOICE";
    }
    if (/ealing|cwd|direct payment|funded by la|local authority \(exempt/.test(funder + " " + paid + " " + parent)) {
      return "LA_INVOICE";
    }
    var hasFri = /\bfri/.test(svc);
    var hasMonWed = /\bmon|\bwed/.test(svc);
    if (hasFri && !hasMonWed) return "NHS_INVOICE";
    if (hasMonWed && !hasFri) return "LA_INVOICE";
    return "LA_INVOICE";
  }

  /** LA/NHS invoices the club (Care in Finance, CWD, BACS, borough / NHS PO). */
  function isLaInvoiceFundingLabel(raw) {
    var low = String(raw || "").toLowerCase();
    if (!low || isParentDirectPaymentsLabel(low) || isGenericLaNhsUmbrella(low)) return false;
    return /ealing|hammer|fulham|h\s*&\s*f|lbhf|kensington|rbkc|westminster|brent|nhs|care in finance|\bcwd\b|la invoice|local authority|purchase order|\bpo\b/.test(low);
  }

  function fundingHintFromPaymentData(d) {
    d = d || {};
    var keys = ["Funder", "Funding", "Fund", "fund", "funding", "Funding route", "funding_label"];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  /**
   * Group for the Payments table:
   *  PARENTS — private family funds
   *  DIRECT_PAYMENTS — funded via parent-held LA Direct Payments (family still pays us)
   *  LA — Local authority / NHS invoice (funder in charge)
   */
  function classifyPayGroup(opts) {
    opts = opts || {};
    var hint = String(opts.payment_method_hint || "").toLowerCase();
    var vat = String(opts.vat_mode || "").toLowerCase();
    var label = String(opts.funding_label || "").trim();
    var sheet = String(opts.sheet || "").trim();
    var sheetUp = sheet.toUpperCase();

    if (hint === "la_funded") return "LA";
    if (isParentDirectPaymentsLabel(label)) return "DIRECT_PAYMENTS";
    if (isLaInvoiceFundingLabel(label)) return "LA";

    /* Re-enrolment: VAT exempt without la_funded = LA Direct Payments route (not private VAT). */
    if (opts._reenrol && vat === "exempt" && hint !== "la_funded") {
      return "DIRECT_PAYMENTS";
    }

    if (sheetUp === "DIRECT_PAYMENTS" || sheet === "DIRECT_PAYMENTS") return "DIRECT_PAYMENTS";
    if (sheetUp === "LA" || sheet === "LA") return "LA";
    if (sheetUp === "NO RE-ENROLED" || sheet === "No re-enroled") return "No re-enroled";
    return "PARENTS";
  }

  var state = {
    rootEl: null,
    rows: [],
    reenrolRows: [],      // synthetic rows from portal_parent_invoice_share (created_via reenrolment)
    mode: "payments",     // payments | orders | participants (same data, different framing)
    statusFilter: "active", // active (re-enrolled) | all | outstanding | paid | notreenrolled
    sheetFilter: "",      // "" = all groups, else sheet name
    paidFilterByTerm: {}, // termBucketId -> Paid value ("" = all)
    termOpenById: {}, // termBucketId -> boolean (persist accordion open across re-renders)
    focusTermId: "", // after Paid chip click, keep this term open + in view
    query: "",
  };

  function esc(s) { return deps.esc(s); }
  function labelFor(sheet) { return SHEET_LABELS[sheet] || sheet; }

  var ICONS = {
    billed: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    paid: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    out: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    priv: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    fund: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 21 8 3 8"/>',
    clients: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    field: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    dots: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  };

  // Field-grouping for the detail screen: each raw spreadsheet key is sorted into
  // the first group whose pattern matches (order matters), the rest go to "Other".
  var FIELD_GROUPS = [
    { label: "Money & billing", ico: "coins", rx: /(cost|total|vat|amount|price|fee|balance|deposit|owed|\bpaid\b|invoice|charge|payment|funding|gbp|£)/i },
    { label: "Dates & period", ico: "calendar", rx: /(month|date|period|term|start|end|week|\bday\b|year|time)/i },
    { label: "Sessions & counts", ico: "list", rx: /(session|hours?|qty|quantity|count|number|ratio)/i },
    { label: "People & contact", ico: "users", rx: /(name|parent|client|carer|email|phone|contact|guardian|address)/i },
  ];

  function groupedFieldsHtml(d, skipKey) {
    var skip = {};
    skip[String(skipKey || "")] = true;
    ["Hours", "Session hours", "Day Centre hours", "Cost / session"].forEach(function (k) { skip[k] = true; });
    var keys = Object.keys(d).filter(function (k) { return !skip[k]; });
    if (!keys.length) return '<p class="pay-empty">No extra fields.</p>';
    var used = {};
    var html = "";
    FIELD_GROUPS.forEach(function (g) {
      var inGroup = keys.filter(function (k) { return !used[k] && g.rx.test(k); });
      if (!inGroup.length) return;
      inGroup.forEach(function (k) { used[k] = true; });
      html += '<div class="pay-subh">' + icon(g.ico, 13) + "<span>" + esc(g.label) + "</span></div>"
        + '<div class="pay-fields">'
        + inGroup.map(function (k) { return field(k, k, d[k], "data", g.ico); }).join("")
        + "</div>";
    });
    var other = keys.filter(function (k) { return !used[k]; });
    if (other.length) {
      html += '<div class="pay-subh">' + icon("dots", 13) + "<span>Other</span></div>"
        + '<div class="pay-fields">'
        + other.map(function (k) { return field(k, k, d[k], "data", "field"); }).join("")
        + "</div>";
    }
    return html;
  }
  function icon(name, px) {
    var p = ICONS[name] || "";
    var s = px || 18;
    return '<svg class="pay-ico" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  function money(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "—";
    return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function category(r) {
    var s = String(r.payment_status || "").toLowerCase();
    if (s.indexOf("re-enrol") >= 0 || s.indexOf("reenrol") >= 0) return "notreenrolled";
    if (s.indexOf("paid") === 0) return "paid"; // "Paid"
    return "outstanding"; // Outstanding / Not paid / Pending / blank
  }

  function injectStyleOnce() {
    var css = [
      ".pay-wrap{min-width:0}",
      ".pay-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 12px}",
      ".pay-kpi{display:flex;align-items:center;justify-content:center;gap:12px;border-radius:14px;padding:14px 16px;border:1px solid transparent}",
      ".pay-kpi__ico{flex:0 0 auto;width:38px;height:38px;border-radius:11px;display:grid;place-items:center}",
      ".pay-kpi__txt{min-width:0;text-align:center}",
      ".pay-kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}",
      ".pay-kpi span{font-size:12px;text-transform:uppercase;letter-spacing:.03em;font-weight:700}",
      ".pay-kpi--billed{background:#eff6ff;border-color:#bfdbfe}",
      ".pay-kpi--billed .pay-kpi__ico{background:#dbeafe;color:#1d4ed8}",
      ".pay-kpi--billed span{color:#1e40af}",
      ".pay-kpi--billed b{color:#1e3a8a}",
      ".pay-kpi--paid{background:#ecfdf5;border-color:#a7f3d0}",
      ".pay-kpi--paid .pay-kpi__ico{background:#d1fae5;color:#047857}",
      ".pay-kpi--paid span{color:#047857}",
      ".pay-kpi--paid b{color:#166534}",
      ".pay-kpi--out{background:#fef2f2;border-color:#fecaca}",
      ".pay-kpi--out .pay-kpi__ico{background:#fee2e2;color:#b91c1c}",
      ".pay-kpi--out span{color:#b91c1c}",
      ".pay-kpi--out b{color:#991b1b}",
      ".pay-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:0 0 14px}",
      ".pay-grp{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;min-width:0}",
      ".pay-grp__h{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 12px;min-width:0}",
      ".pay-grp__ico{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#eef2f7;color:#334155}",
      ".pay-grp--priv .pay-grp__ico{background:#eff6ff;color:#2d84b3}",
      ".pay-grp--dp .pay-grp__ico{background:#ecfdf5;color:#047857}",
      ".pay-grp--fund .pay-grp__ico{background:#f1ecfb;color:#7c3aed}",
      ".pay-grp__head-txt{min-width:0;text-align:center}",
      ".pay-grp__t{display:block;font-size:14px;font-weight:800;color:#0f172a;overflow-wrap:break-word}",
      ".pay-grp__sub{display:block;font-size:11px;color:#94a3b8;font-weight:700}",
      ".pay-grp__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".pay-grp__stat{min-width:0;text-align:center}",
      ".pay-grp__stat span{display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;font-weight:700}",
      ".pay-grp__stat b{font-size:17px;color:#0f172a;font-variant-numeric:tabular-nums;overflow-wrap:break-word}",
      ".pay-grp__stat--paid b{color:#15803d}",
      ".pay-grp__stat--out b{color:#b91c1c}",
      ".pay-ico{display:block}",
      ".pay-card-h h3{display:flex;align-items:center;gap:8px}",
      ".pay-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px;min-width:0}",
      ".pay-seg{display:inline-flex;border:1px solid #c3d0e0;border-radius:10px;overflow:hidden}",
      ".pay-seg button{font:inherit;font-weight:700;font-size:13px;border:0;background:#fff;color:#334155;padding:9px 13px;cursor:pointer}",
      ".pay-seg button[aria-pressed=true]{background:#2d84b3;color:#fff}",
      ".pay-sel{font:inherit;font-size:13px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".pay-search{flex:1;min-width:160px;font:inherit;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".pay-chip-filters{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;margin:0 0 12px}",
      ".pay-chip-filters--term{margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid #eef2f7}",
      ".pay-chip-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}",
      ".pay-chip-row__lab{flex:0 0 auto;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-right:2px}",
      ".pay-chip{display:inline-flex;align-items:center;justify-content:center;max-width:100%;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.25;border:1px solid transparent;overflow-wrap:anywhere;text-align:center}",
      ".pay-chip--btn{font:inherit;cursor:pointer;background:#fff;color:#475569;border-color:#e2e8f0}",
      ".pay-chip--btn:hover{border-color:#94a3b8}",
      ".pay-chip--btn[aria-pressed=true]{box-shadow:0 0 0 2px rgba(45,132,179,.25)}",
      ".pay-chip--funds-la{background:#ecfdf5;color:#047857;border-color:#a7f3d0}",
      ".pay-chip--private{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}",
      ".pay-chip--funded-la{background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe}",
      ".pay-chip--funded-nhs{background:#ecfeff;color:#0e7490;border-color:#a5f3fc}",
      ".pay-chip--inv-parent-ex{background:#f0fdf4;color:#166534;border-color:#bbf7d0}",
      ".pay-chip--inv-parent-20{background:#fff7ed;color:#c2410c;border-color:#fed7aa}",
      ".pay-chip--inv-la{background:#faf5ff;color:#7c3aed;border-color:#e9d5ff}",
      ".pay-chip--inv-nhs{background:#f0f9ff;color:#0369a1;border-color:#bae6fd}",
      ".pay-chip--muted{background:#f1f5f9;color:#64748b;border-color:#e2e8f0}",
      ".pay-tbl td .pay-chip{white-space:normal}",
      ".pay-svc-2line{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;max-width:100%}",
      ".pay-svc-2line__a{font-weight:700;color:#0f172a;overflow-wrap:break-word}",
      ".pay-svc-2line__b{font-size:12px;font-weight:600;color:#64748b;overflow-wrap:break-word}",
      ".pay-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.05);overflow:hidden}",
      ".pay-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid #eef2f7}",
      ".pay-card-h h3{margin:0;font-size:15px;color:#0f172a}",
      ".pay-tbl-wrap{overflow-x:auto;min-width:0}",
      ".pay-tbl__idx{width:2.5rem;color:#94a3b8;font-variant-numeric:tabular-nums}",
      ".pay-tbl thead th.pay-tbl__idx{color:#94a3b8;font-weight:700}",
      ".pay-tbl{width:100%;border-collapse:collapse;font-size:14px}",
      ".pay-tbl th,.pay-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:center;vertical-align:middle;overflow-wrap:break-word;max-width:260px}",
      ".pay-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".pay-tbl tbody tr{cursor:pointer}",
      ".pay-tbl tbody tr:hover{background:#f8fafc}",
      ".pay-tbl td.num{text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".pay-name{font-weight:700;color:#0f172a}",
      ".pay-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}",
      ".pay-pill--paid{background:#e7f6ee;color:#15803d}",
      ".pay-pill--out{background:#fef2f2;color:#b91c1c}",
      ".pay-pill--na{background:#eef2f7;color:#475569}",
      ".pay-empty{color:#64748b;padding:18px;text-align:center;font-size:14px}",
      ".pay-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
      ".pay-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".pay-field label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".pay-field label .pay-ico{flex:0 0 auto;color:#94a3b8}",
      ".pay-field input,.pay-field select,.pay-field textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;width:100%}",
      ".pay-field textarea{min-height:60px;resize:vertical}",
      // Full-screen client detail
      ".pay-screen{position:fixed;inset:0;z-index:2147483000;background:#f1f5f9;display:flex;flex-direction:column}",
      ".pay-screen__head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff;border-bottom:1px solid #e2e8f0}",
      ".pay-screen__ico{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#eff6ff;color:#2d84b3}",
      ".pay-screen__ttl{min-width:0;flex:1}",
      ".pay-screen__ttl h2{margin:0;font-size:20px;color:#0f172a;overflow-wrap:break-word}",
      ".pay-screen__ttl .pay-screen__sub{font-size:13px;color:#64748b;font-weight:700}",
      ".pay-screen__x{flex:0 0 auto;width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;display:grid;place-items:center}",
      ".pay-screen__x:hover{background:#f1f5f9}",
      ".pay-screen__body{flex:1 1 auto;overflow-y:auto;padding:20px;min-height:0}",
      ".pay-screen__inner{max-width:1100px;margin:0 auto}",
      ".pay-sect{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 16px}",
      ".pay-sect__h{display:flex;align-items:center;gap:9px;margin:0 0 14px;font-size:15px;font-weight:800;color:#0f172a}",
      ".pay-sect__h .pay-ico{flex:0 0 auto;color:#2d84b3}",
      ".pay-subh{display:flex;align-items:center;gap:7px;margin:16px 0 8px;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em}",
      ".pay-subh:first-child{margin-top:0}",
      ".pay-subh .pay-ico{flex:0 0 auto;color:#94a3b8}",
      ".pay-screen__foot{flex:0 0 auto;display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;background:#fff;border-top:1px solid #e2e8f0}",
      ".pay-screen__foot .pay-msg{flex:1;align-self:center;font-size:13px;color:#64748b;margin:0}",
      "@media(max-width:560px){.pay-screen__body{padding:14px}.pay-screen__ttl h2{font-size:17px}}",
      ".pay-term-stack{display:flex;flex-direction:column;gap:12px}",
      ".pay-term-acc{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;min-width:0;box-shadow:0 1px 3px rgba(15,23,42,.05)}",
      ".pay-term-acc__sum{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;list-style:none;font-weight:800;color:#0f172a;background:#f8fafc;border-bottom:1px solid transparent;min-width:0}",
      ".pay-term-acc[open]>.pay-term-acc__sum{border-bottom-color:#eef2f7}",
      ".pay-term-acc__sum::-webkit-details-marker{display:none}",
      ".pay-term-acc__title{display:block;font-size:16px;letter-spacing:.04em;min-width:0;overflow-wrap:break-word}",
      ".pay-term-acc__body{padding:14px 16px;min-width:0}",
      ".pay-term-acc__body .pay-kpis{margin-bottom:12px}",
      ".pay-term-acc__body .pay-groups{margin-bottom:14px}",
      ".pay-term-acc__body .pay-card-h{margin:0 0 10px}",
      ".pay-term-acc__sub{display:block;font-size:12px;font-weight:700;color:#64748b;margin-top:2px;overflow-wrap:break-word;letter-spacing:0;text-transform:none}",
      ".pay-term-acc__meta{flex:0 1 auto;display:grid;grid-template-columns:auto auto;gap:8px;align-items:center;justify-content:end;min-width:0;max-width:100%}",
      ".pay-term-acc__chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.2;border:1px solid transparent;overflow-wrap:anywhere;white-space:nowrap}",
      ".pay-term-acc__chip b{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}",
      ".pay-term-acc__chip--orders{background:#f1f5f9;color:#334155;border-color:#e2e8f0}",
      ".pay-term-acc__chip--due{background:#fef2f2;color:#b91c1c;border-color:#fecaca}",
      ".pay-term-acc__chip--ok{background:#ecfdf5;color:#047857;border-color:#a7f3d0}",
      ".pay-tbl-caption{display:grid;grid-template-columns:auto auto;gap:8px;align-items:center;justify-content:end;min-width:0;flex:0 1 auto}",
      ".pay-tbl-caption .pay-term-acc__chip{justify-content:center}",
      "@media(max-width:560px){.pay-term-acc__meta,.pay-tbl-caption{grid-template-columns:1fr;justify-content:stretch}.pay-term-acc__chip{justify-content:center;white-space:normal}}",
      ".pay-term-acc .pay-tbl-wrap{border-radius:0}",
      ".pay-term-acc .pay-tbl thead th{background:#fff}",
      ".pay-term-acc__sum::after{content:'';width:8px;height:8px;border-right:2px solid #94a3b8;border-bottom:2px solid #94a3b8;transform:rotate(45deg);transition:transform .15s;flex:0 0 auto}",
      ".pay-term-acc[open]>.pay-term-acc__sum::after{transform:rotate(-135deg)}",
      ".pay-svc-row{margin:0 0 12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;min-width:0}",
      ".pay-svc-row__head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;min-width:0}",
      ".pay-svc-row__n{font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em}",
      ".pay-svc-row .pay-svc-remove{flex:0 0 auto}",
      ".pay-svc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:4px 0 0;min-width:0}",
      ".pay-svc-hint{font-size:12px;overflow-wrap:break-word;min-width:0}",
    ].join("\n");
    var st = document.getElementById("adminPayStyle");
    if (!st) {
      st = document.createElement("style");
      st.id = "adminPayStyle";
      document.head.appendChild(st);
    }
    st.textContent = css;
  }

  function pillFor(r) {
    var c = category(r);
    var label = r.payment_status || (c === "paid" ? "Paid" : "Outstanding");
    var cls = c === "paid" ? "pay-pill--paid" : (c === "notreenrolled" ? "pay-pill--na" : "pay-pill--out");
    return '<span class="pay-pill ' + cls + '">' + esc(label) + "</span>";
  }

  function paidChipClass(label) {
    if (label === PAID_BY.FUNDS_FROM_LA) return "pay-chip--funds-la";
    if (label === PAID_BY.PRIVATE_FUNDS) return "pay-chip--private";
    if (label === PAID_BY.FUNDED_BY_LA) return "pay-chip--funded-la";
    if (label === PAID_BY.FUNDED_BY_NHS) return "pay-chip--funded-nhs";
    return "pay-chip--muted";
  }

  function invoiceChipClass(label) {
    if (label === INVOICE_TYPE.PARENT_EXEMPT) return "pay-chip--inv-parent-ex";
    if (label === INVOICE_TYPE.PARENT_20) return "pay-chip--inv-parent-20";
    if (label === INVOICE_TYPE.LA_EXEMPT) return "pay-chip--inv-la";
    if (label === INVOICE_TYPE.NHS_EXEMPT) return "pay-chip--inv-nhs";
    return "pay-chip--muted";
  }

  function paidChipHtml(label) {
    if (!label) return '<span class="pay-chip pay-chip--muted">—</span>';
    return '<span class="pay-chip ' + paidChipClass(label) + '">' + esc(label) + "</span>";
  }

  function invoiceChipHtml(label) {
    if (!label) return '<span class="pay-chip pay-chip--muted">—</span>';
    return '<span class="pay-chip ' + invoiceChipClass(label) + '">' + esc(label) + "</span>";
  }

  function filterChipBtn(kind, value, label, active, toneCls, termId) {
    var pressed = active ? "true" : "false";
    var cls = "pay-chip pay-chip--btn " + (active ? toneCls : "pay-chip--muted");
    var termAttr = termId ? ' data-pay-chip-term="' + esc(termId) + '"' : "";
    return '<button type="button" class="' + cls + '" data-pay-chip-kind="' + esc(kind) + '" data-pay-chip-value="' + esc(value) + '"' + termAttr + ' aria-pressed="' + pressed + '">' + esc(label) + "</button>";
  }

  function paidFilterForTerm(termId) {
    var map = state.paidFilterByTerm || {};
    return map[termId] || "";
  }

  function captureTermOpenState(root) {
    if (!root) return;
    if (!state.termOpenById) state.termOpenById = {};
    root.querySelectorAll("details.pay-term-acc[data-pay-term]").forEach(function (el) {
      var id = el.getAttribute("data-pay-term");
      if (id) state.termOpenById[id] = !!el.open;
    });
  }

  /** Admin workspace scrolls, not window — restore that or filters jump to Summer. */
  function paymentsScrollParent(fromEl) {
    var el = fromEl;
    while (el && el !== document.body && el !== document.documentElement) {
      var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
      var oy = st ? st.overflowY : "";
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
        return el;
      }
      el = el.parentElement;
    }
    return document.getElementById("workspace") || document.scrollingElement || document.documentElement;
  }

  function capturePaymentsScroll(root) {
    var sc = paymentsScrollParent(root);
    return { el: sc, top: sc ? sc.scrollTop : 0, winY: window.scrollY || 0 };
  }

  function restorePaymentsScroll(saved) {
    if (!saved) return;
    if (saved.el) {
      try { saved.el.scrollTop = saved.top; } catch (_) {}
    }
    try { window.scrollTo(0, saved.winY || 0); } catch (_) {}
  }

  /**
   * Remember open/closed across re-renders.
   * First paint: keep Summer collapsed, Autumn open (filter chips live in Autumn).
   */
  function termDetailsOpenAttr(termId) {
    var map = state.termOpenById || {};
    if (Object.prototype.hasOwnProperty.call(map, termId)) {
      return map[termId] ? " open" : "";
    }
    if (termId === "autumn_2627") return " open";
    return "";
  }

  function paidFilterChipsHtml(termId) {
    var cur = paidFilterForTerm(termId);
    var html = '<div class="pay-chip-filters pay-chip-filters--term" role="group" aria-label="Paid filter for this term">'
      + '<div class="pay-chip-row">'
      + '<span class="pay-chip-row__lab">Paid</span>'
      + filterChipBtn("paid", "", "All", !cur, "pay-chip--muted", termId);
    PAID_BY_OPTIONS.forEach(function (l) {
      html += filterChipBtn("paid", l, l, cur === l, paidChipClass(l), termId);
    });
    html += "</div></div>";
    return html;
  }

  function applyPaidFilter(rows, termId) {
    var paid = paidFilterForTerm(termId);
    if (!paid) return rows || [];
    return (rows || []).filter(function (r) { return paidByFor(r) === paid; });
  }

  function allRows() {
    return (state.rows || []).concat(state.reenrolRows || []);
  }

  function supabaseBase() {
    if (typeof deps.getSupabaseUrl === "function") {
      return String(deps.getSupabaseUrl() || "").replace(/\/$/, "");
    }
    var c = deps.getClient();
    return c && c.supabaseUrl ? String(c.supabaseUrl).replace(/\/$/, "") : "";
  }

  function anonKey() {
    if (typeof deps.getAnonKey === "function") return String(deps.getAnonKey() || "");
    return typeof global.SUPABASE_ANON_KEY === "string" ? global.SUPABASE_ANON_KEY : "";
  }

  function portalAuthToken() {
    var client = deps.getClient();
    if (!client || !client.auth) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      return session && session.access_token ? session.access_token : null;
    });
  }

  function normalizeTermLabel(raw) {
    var s = String(raw || "").trim();
    if (!s || s === "—" || s === "-") return "SUMMER TERM 25/26";
    if (/summer\s*term\s*2026/i.test(s)) return "SUMMER TERM 25/26";
    if (/summer\s*term\s*25\s*\/\s*26/i.test(s)) return "SUMMER TERM 25/26";
    if (/autumn\s*term\s*26/i.test(s) || /26\s*\/\s*27/.test(s)) return "AUTUMN TERM 26/27";
    return s;
  }

  function termBucketFor(r) {
    if (r && r._termBucket) return r._termBucket;
    var svc = String(serviceFor(r) || "").toLowerCase();
    var term = String(termFor(r) || "").toLowerCase();
    var blob = svc + " " + term + " " + JSON.stringify((r && r.data) || {});
    if (/autumn.*26|26\/27|2026-27|reenrol/.test(blob)) return "autumn_2627";
    return "summer_2526";
  }

  function sortPaymentRows(a, b) {
    var s = String(a.sheet).localeCompare(String(b.sheet));
    if (s) return s;
    return String(a.client_name || "").localeCompare(String(b.client_name || ""));
  }

  function groupRowsByTermBucket(rows) {
    var map = {};
    TERM_BUCKETS.forEach(function (b) { map[b.id] = []; });
    rows.forEach(function (r) {
      var bid = termBucketFor(r);
      if (!map[bid]) map[bid] = [];
      map[bid].push(r);
    });
    return TERM_BUCKETS.map(function (b) {
      return { bucket: b, rows: (map[b.id] || []).slice().sort(sortPaymentRows) };
    }).filter(function (g) { return g.rows.length > 0; });
  }

  function termOrdersMetaParts(rows) {
    rows = rows || [];
    var out = 0;
    var outN = 0;
    rows.forEach(function (r) {
      if (category(r) === "outstanding") {
        out += Number(r.amount) || 0;
        outN++;
      }
    });
    return {
      n: rows.length,
      unit: rows.length === 1 ? "order" : "orders",
      due: out,
      dueN: outN,
    };
  }

  function termAccordionMetaHtml(group) {
    var m = termOrdersMetaParts(group.rows);
    var html = '<span class="pay-term-acc__meta" title="Payment lines in this term (one client can have several)">'
      + '<span class="pay-term-acc__chip pay-term-acc__chip--orders"><b>' + m.n + "</b> " + m.unit + "</span>";
    if (m.dueN) {
      html += '<span class="pay-term-acc__chip pay-term-acc__chip--due"><b>' + money(m.due) + "</b> due</span>";
    } else {
      html += '<span class="pay-term-acc__chip pay-term-acc__chip--ok"><b>£0</b> due</span>';
    }
    html += "</span>";
    return html;
  }

  function tableOrdersCaptionHtml(rows) {
    var m = termOrdersMetaParts(rows);
    var html = '<div class="pay-tbl-caption" title="Payment lines in this term (one client can have several)">'
      + '<span class="pay-term-acc__chip pay-term-acc__chip--orders"><b>' + m.n + "</b> " + m.unit + "</span>";
    if (m.dueN) {
      html += '<span class="pay-term-acc__chip pay-term-acc__chip--due"><b>' + money(m.due) + "</b> due</span>";
    } else {
      html += '<span class="pay-term-acc__chip pay-term-acc__chip--ok"><b>£0</b> due</span>';
    }
    html += "</div>";
    return html;
  }

  /** Support ratio chip: default 1to1; Ikram/Fadi/Timi = 2to1; Tinashe = 3to1. */
  function supportRatioFor(r) {
    var name = String((r && r.client_name) || "").toLowerCase();
    if (/\btinashe\b/.test(name)) return "3to1";
    if (
      /\bikram\b/.test(name) ||
      /\bfadi\b/.test(name) ||
      /\btimi\b/.test(name) ||
      /oluwatimilehin/.test(name)
    ) {
      return "2to1";
    }
    return "1to1";
  }

  function supportCellHtml(r) {
    return '<span class="pay-chip pay-chip--muted">' + esc(supportRatioFor(r)) + "</span>";
  }

  function paymentsTableBodyHtml(rows) {
    var colClient = state.mode === "orders" ? "Participant" : "Client";
    if (!rows.length) {
      return '<div class="pay-tbl-wrap"><table class="pay-tbl"><tbody>'
        + '<tr><td colspan="10" class="pay-empty">No records in this term.</td></tr></tbody></table></div>';
    }
    var html = '<div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th class="num pay-tbl__idx">#</th><th>' + colClient
      + '</th><th>Paid</th><th>Invoice type</th><th>Support</th><th>Service</th><th>Term</th><th>Parent</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var attr = r._synthetic
        ? ' data-pay-reenrol="' + esc(r._contactId || r.id) + '"'
        : ' data-pay-id="' + esc(r.id) + '"';
      html += "<tr" + attr + ">"
        + '<td class="num pay-tbl__idx">' + (i + 1) + "</td>"
        + '<td class="pay-name">' + esc(r.client_name || "—") + "</td>"
        + "<td>" + paidChipHtml(paidByFor(r)) + "</td>"
        + "<td>" + invoiceChipHtml(invoiceTypeFor(r)) + "</td>"
        + "<td>" + supportCellHtml(r) + "</td>"
        + "<td>" + serviceCellHtml(r) + "</td>"
        + "<td>" + esc(termFor(r)) + "</td>"
        + "<td>" + esc(parentPersonFor(r)) + "</td>"
        + '<td class="num">' + money(r.amount) + "</td>"
        + "<td>" + pillFor(r) + "</td></tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function tallyRows(rows) {
    var billed = 0, paid = 0, outstanding = 0, paidN = 0, outN = 0, naN = 0;
    var grp = {
      PARENTS: { billed: 0, paid: 0, out: 0, n: 0 },
      DIRECT_PAYMENTS: { billed: 0, paid: 0, out: 0, n: 0 },
      LA: { billed: 0, paid: 0, out: 0, n: 0 },
    };
    (rows || []).forEach(function (r) {
      var a = Number(r.amount) || 0;
      var c = category(r);
      if (c !== "notreenrolled") billed += a;
      if (c === "paid") { paid += a; paidN++; }
      else if (c === "outstanding") { outstanding += a; outN++; }
      else if (c === "notreenrolled") naN++;
      var g = grp[r.sheet];
      if (g && c !== "notreenrolled") {
        g.billed += a; g.n++;
        if (c === "paid") g.paid += a; else g.out += a;
      }
    });
    return { billed: billed, paid: paid, outstanding: outstanding, paidN: paidN, outN: outN, naN: naN, grp: grp };
  }

  function termSummaryBlockHtml(scopedRows, visibleRows, termId) {
    var t = tallyRows(scopedRows);
    var html = '<div class="pay-term-acc__body">';
    html += paidFilterChipsHtml(termId);
    html += '<div class="pay-kpis">'
      + kpiCard("billed", "pay-kpi--billed", "Billed", money(t.billed))
      + kpiCard("paid", "pay-kpi--paid", "Paid", money(t.paid))
      + kpiCard("out", "pay-kpi--out", "Outstanding", money(t.outstanding))
      + "</div>";
    if (state.mode === "payments") {
      html += '<div class="pay-groups">'
        + grpCard("priv", "pay-grp--priv", labelFor("PARENTS"), t.grp.PARENTS)
        + grpCard("fund", "pay-grp--dp", labelFor("DIRECT_PAYMENTS"), t.grp.DIRECT_PAYMENTS)
        + grpCard("fund", "pay-grp--fund", labelFor("LA"), t.grp.LA)
        + "</div>";
    }
    html += '<div class="pay-card-h" style="display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;flex-wrap:wrap">'
      + '<h3 style="margin:0;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px;min-width:0">'
      + icon("clients", 17) + "Participants</h3>"
      + tableOrdersCaptionHtml(scopedRows)
      + "</div>";
    html += paymentsTableBodyHtml(visibleRows.slice().sort(sortPaymentRows));
    html += "</div>";
    return html;
  }

  function termAccordionHtml(visible) {
    var baseGrouped = groupRowsByTermBucket(baseRows());
    var html = '<div class="pay-term-stack">';
    var any = false;
    baseGrouped.forEach(function (sg) {
      if (!sg.rows.length) return;
      var termId = sg.bucket.id;
      var scoped = applyPaidFilter(sg.rows, termId);
      if (!scoped.length && paidFilterForTerm(termId)) {
        /* Still show the term so the Paid filter can be cleared. */
      } else if (!scoped.length) {
        return;
      }
      any = true;
      var vis = scoped.filter(statusMatch);
      html += '<details class="pay-term-acc"' + termDetailsOpenAttr(termId) + ' data-pay-term="' + esc(termId) + '">'
        + '<summary class="pay-term-acc__sum">'
        + '<span><span class="pay-term-acc__title">' + esc(sg.bucket.title) + "</span>"
        + '<span class="pay-term-acc__sub">' + esc(sg.bucket.subtitle) + "</span></span>"
        + termAccordionMetaHtml({ rows: scoped })
        + "</summary>"
        + termSummaryBlockHtml(scoped, vis, termId)
        + "</details>";
    });
    if (!any) {
      return '<div class="pay-card"><div class="pay-empty">No records match this filter.</div></div>';
    }
    html += "</div>";
    return html;
  }

  function baseRows() {
    // Rows matching the group + search (Paid filter is per-term, applied later).
    var q = state.query;
    return allRows().filter(function (r) {
      if (state.sheetFilter && r.sheet !== state.sheetFilter) return false;
      if (!q) return true;
      if (String(r.client_name || "").toLowerCase().indexOf(q) >= 0) return true;
      if (String(r.parent_name || "").toLowerCase().indexOf(q) >= 0) return true;
      var d = r.data || {};
      for (var k in d) { if (String(d[k]).toLowerCase().indexOf(q) >= 0) return true; }
      return false;
    });
  }

  function statusMatch(r) {
    if (state.statusFilter === "all") return true;
    // "Active" = currently re-enrolled (everyone except the Not re-enrolled list).
    if (state.statusFilter === "active") return category(r) !== "notreenrolled";
    return category(r) === state.statusFilter;
  }

  function isPlaceholderServiceLabel(s) {
    var t = String(s || "").trim();
    if (!t || t === "-" || t === "—") return true;
    return /re-?enrolment\s*2026|booked place 2026|la office auto/i.test(t);
  }

  function serviceFor(r) {
    var parts = serviceDisplayParts(r);
    if (!parts.line1 || parts.line1 === "—" || isPlaceholderServiceLabel(parts.line1)) return "—";
    return parts.line2 ? parts.line1 + " " + parts.line2 : parts.line1;
  }

  function serviceCellHtml(r) {
    var parts = serviceDisplayParts(r);
    if (!parts.line1 || parts.line1 === "—" || isPlaceholderServiceLabel(parts.line1)) return "—";
    if (!parts.line2) return esc(parts.line1);
    return '<span class="pay-svc-2line">'
      + '<span class="pay-svc-2line__a">' + esc(parts.line1) + "</span>"
      + '<span class="pay-svc-2line__b">' + esc(parts.line2) + "</span>"
      + "</span>";
  }

  function rawServiceText(r) {
    var d = r.data || {};
    var keys = ["Services", "Service", "Programme", "Programmes", "Activity"];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim() && String(v).trim() !== "-") {
        var s = String(v).trim();
        if (!isPlaceholderServiceLabel(s)) return s;
      }
    }
    return "";
  }

  /** Real programme labels from invoice booked_slots / line_items (never "Re-enrolment…"). */
  function serviceLabelsFromInvoice(inv) {
    var out = [];
    var seen = Object.create(null);
    function add(raw) {
      var s = String(raw || "").trim();
      if (!s || isPlaceholderServiceLabel(s) || seen[s]) return;
      if (/^credits?$/i.test(s)) return;
      if (/^structured activity support/i.test(s)) return;
      seen[s] = 1;
      out.push(s);
    }
    (Array.isArray(inv && inv.booked_slots) ? inv.booked_slots : []).forEach(function (slot) {
      add(slot && (slot.label || slot.service));
    });
    (Array.isArray(inv && inv.line_items) ? inv.line_items : []).forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var desc = String(it.description || "").trim();
      var detail = String(it.detail || "").trim();
      if (/^credits?$/i.test(desc)) return;
      if (desc && detail) add(desc + " · " + detail);
      else add(desc || detail);
    });
    add(inv && inv.booked_service_raw);
    if (!out.length && inv && inv.line_description) {
      String(inv.line_description)
        .split(/\n+/)
        .map(function (p) { return String(p || "").trim(); })
        .filter(Boolean)
        .forEach(function (p) {
          if (/^structured activity support/i.test(p)) return;
          /* "Aquatic Activity 30' (Wednesday 6 to 6.30 pm · Acton) — GBP 700.00" */
          var cut = p.replace(/\s*[—–-]\s*GBP\s*[\d,.]+.*$/i, "").trim();
          add(cut || p);
        });
    }
    return out;
  }

  function mergeServiceLabelsIntoRow(row, inv) {
    if (!row._serviceParts) row._serviceParts = Object.create(null);
    serviceLabelsFromInvoice(inv).forEach(function (s) {
      row._serviceParts[s] = 1;
    });
    var list = Object.keys(row._serviceParts);
    row.data = row.data || {};
    row.data.Services = list.length ? list.join(" · ") : "";
  }

  function expandDayRangeLabel(raw) {
    var map = {
      mon: "Monday", monday: "Monday",
      tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
      wed: "Wednesday", wednesday: "Wednesday",
      thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
      fri: "Friday", friday: "Friday",
      sat: "Saturday", saturday: "Saturday",
      sun: "Sunday", sunday: "Sunday",
    };
    function fullDay(tok) {
      var t = String(tok || "").trim().toLowerCase().replace(/\./g, "");
      if (map[t]) return map[t];
      /* Only use 3-letter prefix for bare day tokens (not "mon–wed"). */
      if (/^[a-z]{3,9}$/.test(t)) {
        var k3 = t.slice(0, 3);
        if (map[k3]) return map[k3];
      }
      return String(tok || "").trim();
    }
    function onePart(part) {
      var p = String(part || "").trim();
      var range = p.match(/^([A-Za-z.]+)\s*(?:[–\-—]|\s+to\s+)\s*([A-Za-z.]+)$/i);
      if (range) return fullDay(range[1]) + "-" + fullDay(range[2]);
      return fullDay(p) || p;
    }
    var s = String(raw || "").trim();
    /* "Mon–Wed & Fri" / "Mon, Wed & Fri" — expand each side; keep ranges intact. */
    var amp = s.split(/\s*(?:&|,| and )\s*/i).map(function (x) { return x.trim(); }).filter(Boolean);
    if (amp.length > 1) {
      return amp.map(onePart).join(" & ");
    }
    return onePart(s) || s;
  }

  function serviceDisplayParts(r) {
    var raw = rawServiceText(r);
    if (!raw) return { line1: "—", line2: "" };
    return normalizeServiceParts(raw);
  }

  /**
   * Display-only service label.
   * Legacy "60' 2:1 Bespoke 2h30 (Mon–Fri)" → "2h30' Day Centre" + "(Monday-Friday)".
   */
  function normalizeServiceParts(raw) {
    var s = String(raw || "").trim();
    if (!s) return { line1: "", line2: "" };

    var hoursDay = null;
    /* "60' 2:1 Bespoke 2h30 (Mon–Fri)" — hours after Bespoke are the real Day Centre length */
    var bes = s.match(
      /^(?:\d+\s*['′']?\s*)?(?:\d+\s*:\s*\d+\s+)?Bespoke\s+(\d+)\s*h\s*(\d{2})?\b(?:\s*\(([^)]+)\))?\s*$/i
    );
    if (bes) hoursDay = { h: bes[1], mm: bes[2] || "", days: bes[3] || "" };

    /* "1:1 Day Centre 5h (Mon, Wed & Fri)" / "2:1 Day Centre 5h (…)" — hours after Day Centre */
    if (!hoursDay) {
      var dc = s.match(
        /^(?:\d+\s*['′']?\s*)?(?:\d+\s*:\s*\d+\s+)?Day\s*Centre\s+(\d+)\s*h\s*(\d{2})?\b(?:\s*\(([^)]+)\))?\s*$/i
      );
      if (dc) hoursDay = { h: dc[1], mm: dc[2] || "", days: dc[3] || "" };
    }

    /* Already modern: "2h30' Day Centre …" or "2h' 2:1 Day Centre (Mon & Fri)" */
    if (!hoursDay) {
      var modern = s.match(
        /^(\d+)\s*h\s*(\d{2})?'?\s*(?:\d+\s*:\s*\d+\s+)?Day\s*Centre\b(?:\s*\(([^)]+)\))?\s*$/i
      );
      if (modern) hoursDay = { h: modern[1], mm: modern[2] || "", days: modern[3] || "" };
    }

    if (hoursDay) {
      var hrs = hoursDay.h + "h" + hoursDay.mm + "'";
      return {
        line1: hrs + " Day Centre",
        line2: hoursDay.days ? "(" + expandDayRangeLabel(hoursDay.days) + ")" : "",
      };
    }

    s = normalizeServiceDisplay(s);
    return { line1: s, line2: "" };
  }

  /** Display-only: legacy workbook codes → current service names. */
  function normalizeServiceDisplay(raw) {
    var s = String(raw || "").trim();
    if (!s) return s;
    s = s.replace(/\bS\s*&\s*C\b/gi, "Multi-Activity");
    s = s.replace(/\bSW\b/g, "Aquatic Activity");
    s = s.replace(/\bCL\b/g, "Climbing Activity");
    s = s.replace(/\bFT\b/g, "Physical Activity");
    s = s.replace(/\bFIT\b/g, "Physical Activity");
    s = s.replace(/\bBS\b/g, "Bespoke");
    /* "30' Aquatic (Sat)" → "30' Aquatic Activity (Sat)" */
    s = s.replace(/(\d+\s*['′']?\s*)Aquatic\b(?!\s+Activity)/gi, "$1Aquatic Activity");
    s = s.replace(/(\d+\s*['′']?\s*)Multi\b(?!-Activity)/gi, "$1Multi-Activity");
    return s;
  }

  function termFor(r) {
    var d = r.data || {};
    var keys = ["Term", "term", "Terms"];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim() && String(v).trim() !== "-") return normalizeTermLabel(String(v).trim());
    }
    return "SUMMER TERM 25/26";
  }

  /**
   * Internal route: FAMILY_PRIVATE | FAMILY_DP | LA_INVOICE | NHS_INVOICE | NEN.
   * Display uses paidByFor() + invoiceTypeFor().
   *
   * Important: contact/API umbrella "LA / NHS" is NOT NHS — default those to LA
   * unless the funder is explicitly NHS/SBS/ILA, or the participant is on the
   * curated NHS list (Ikram, Emanuel, Timi, Fadi; Tinashe Fridays).
   */
  function payerRouteFor(r) {
    if (!r) return "";
    var sheet = String(r.sheet || "").trim();
    var d = r.data || {};
    var fundingLabel = String(r._fundingLabel || "").trim();
    if (isGenericLaNhsUmbrella(fundingLabel)) fundingLabel = "";
    var raw = String(
      d["Invoice type"] || d["LA/NHS/FAMILY"] || d.Funder || d.Funding || fundingLabel || ""
    ).trim();
    if (isGenericLaNhsUmbrella(raw)) raw = String(d["Invoice type"] || d.Paid || "").trim() || "";
    var paidRaw = String(d.Paid || d["Paid by"] || "").trim();
    if (!raw && !paidRaw) {
      var pn = String(r.parent_name || "");
      var ix = pn.indexOf("\u00b7");
      if (ix > 0) raw = pn.slice(0, ix).trim();
    }
    var origin = String(d["Funding origin"] || d["Funding Origin"] || "").trim();
    var hint = String(r._paymentMethodHint || "").toLowerCase();
    var blob = (raw + " " + paidRaw + " " + origin + " " + sheet + " " + String(r.parent_name || "")).toLowerCase();

    if (paidRaw === PAID_BY.FUNDED_BY_NHS || raw === INVOICE_TYPE.NHS_EXEMPT || raw === PAYER_ROUTE.NHS_INVOICE || raw === "NHS (invoice)") {
      return "NHS_INVOICE";
    }

    /* Curated NHS names beat a stale "Funded by LA" Paid chip (e.g. Timi). */
    var curated = curatedNhsRouteForParticipant(r);
    if (curated === "NHS_INVOICE") return "NHS_INVOICE";

    if (paidRaw === PAID_BY.FUNDED_BY_LA || raw === INVOICE_TYPE.LA_EXEMPT || raw === PAYER_ROUTE.LA_INVOICE || raw === "Local Authority (invoice)") {
      return "LA_INVOICE";
    }

    if (curated) return curated;

    if (
      raw === INVOICE_TYPE.PARENT_EXEMPT ||
      paidRaw === PAID_BY.FUNDS_FROM_LA ||
      raw === PAYER_ROUTE.FAMILY_DP ||
      /using funds from la/i.test(raw) ||
      /ehcp|care package/i.test(raw)
    ) {
      if (!isExplicitNhsFunder(blob) && !/local authority \(exempt|local authority \(invoice/i.test(blob)) {
        return "FAMILY_DP";
      }
    }
    if (
      raw === INVOICE_TYPE.PARENT_20 ||
      paidRaw === PAID_BY.PRIVATE_FUNDS ||
      raw === PAYER_ROUTE.FAMILY_PRIVATE
    ) {
      return "FAMILY_PRIVATE";
    }

    if (/\bnen\b/i.test(raw) || /\bnen\b/.test(blob)) return "NEN";

    if (
      sheet === "DIRECT_PAYMENTS" ||
      isParentDirectPaymentsLabel(raw) ||
      isParentDirectPaymentsLabel(origin) ||
      (/direct payments?/i.test(blob) && !/invoice|pays direct|nhs invoice/i.test(blob))
    ) {
      return "FAMILY_DP";
    }

    if (
      sheet === "PARENTS" ||
      /using private funds|private \(parents\)|private funds|^private$/i.test(raw) ||
      (/^private$/i.test(origin) && hint !== "la_funded")
    ) {
      return "FAMILY_PRIVATE";
    }

    /* Explicit NHS before LA sheet default — never treat umbrella "LA / NHS" as NHS. */
    if (isExplicitNhsFunder(raw) || isExplicitNhsFunder(paidRaw) || isExplicitNhsFunder(origin) || isExplicitNhsFunder(blob)) {
      return "NHS_INVOICE";
    }

    if (
      sheet === "LA" ||
      hint === "la_funded" ||
      /la funded|local authority|la invoice|care in finance|\bcwd\b/i.test(blob) ||
      isLaInvoiceFundingLabel(raw) ||
      isGenericLaNhsUmbrella(String(r._fundingLabel || ""))
    ) {
      return "LA_INVOICE";
    }

    if (sheet === "DIRECT_PAYMENTS") return "FAMILY_DP";
    if (sheet === "LA") return "LA_INVOICE";
    if (sheet === "PARENTS") return "FAMILY_PRIVATE";
    return "";
  }

  /** Paid column. */
  function paidByFor(r) {
    var route = payerRouteFor(r);
    if (route === "FAMILY_DP") return PAID_BY.FUNDS_FROM_LA;
    if (route === "FAMILY_PRIVATE") return PAID_BY.PRIVATE_FUNDS;
    if (route === "LA_INVOICE") return PAID_BY.FUNDED_BY_LA;
    if (route === "NHS_INVOICE" || route === "NEN") return PAID_BY.FUNDED_BY_NHS;
    return "";
  }

  /** Invoice type column. */
  function invoiceTypeFor(r) {
    var route = payerRouteFor(r);
    if (route === "FAMILY_DP") return INVOICE_TYPE.PARENT_EXEMPT;
    if (route === "FAMILY_PRIVATE") return INVOICE_TYPE.PARENT_20;
    if (route === "LA_INVOICE") return INVOICE_TYPE.LA_EXEMPT;
    if (route === "NHS_INVOICE" || route === "NEN") return INVOICE_TYPE.NHS_EXEMPT;
    return "";
  }

  // Parent / contact name only (strip any "Funder ·" prefix).
  function parentPersonFor(r) {
    var pn = String(r.parent_name || "").trim();
    var ix = pn.indexOf("\u00b7"); // "·"
    if (ix >= 0) return pn.slice(ix + 1).trim() || "—";
    return pn || "—";
  }

  function render() {
    var root = state.rootEl;
    if (!root) return;
    var savedScroll = capturePaymentsScroll(root);
    var focusTerm = String(state.focusTermId || "").trim();
    captureTermOpenState(root);
    if (focusTerm) {
      if (!state.termOpenById) state.termOpenById = {};
      state.termOpenById[focusTerm] = true;
    }

    var scoped = baseRows();
    var visible = scoped.filter(statusMatch);
    var totals = tallyRows(scoped);
    var paidN = totals.paidN, outN = totals.outN, naN = totals.naN;

    var html = '<div class="pay-wrap">';

    var sheetOpts = '<option value="">All groups</option>';
    SHEET_ORDER.forEach(function (s) {
      if (allRows().some(function (r) { return r.sheet === s; })) {
        sheetOpts += '<option value="' + esc(s) + '"' + (state.sheetFilter === s ? " selected" : "") + ">" + esc(labelFor(s)) + "</option>";
      }
    });

    html += '<div class="pay-bar">'
      + '<div class="pay-seg" role="group" aria-label="Status filter">'
      + seg("active", "Active (" + (paidN + outN) + ")") + seg("outstanding", "Outstanding (" + outN + ")") + seg("paid", "Paid (" + paidN + ")") + seg("notreenrolled", "Not re-enrolled (" + naN + ")") + seg("all", "All")
      + '</div>'
      + '<select class="pay-sel" id="paySheet">' + sheetOpts + '</select>'
      + '<input type="search" class="pay-search" id="paySearch" placeholder="Search client, parent…" value="' + esc(state.query) + '" />'
      + '</div>';

    if (state.mode === "participants") {
      html += participantsTableHtml(visible);
    } else {
      html += termAccordionHtml(visible);
    }
    html += "</div>";

    root.innerHTML = html;
    bindRoot(root);

    if (focusTerm) {
      state.focusTermId = "";
      var focusEl = root.querySelector('details.pay-term-acc[data-pay-term="' + focusTerm + '"]');
      if (focusEl) focusEl.open = true;
    }
    /* Restore workspace scroll — do not scrollIntoView (that jumps to Summer). */
    restorePaymentsScroll(savedScroll);
    requestAnimationFrame(function () {
      restorePaymentsScroll(savedScroll);
    });
  }

  function seg(id, label) {
    return '<button type="button" data-pay-status="' + id + '" aria-pressed="' + (state.statusFilter === id) + '">' + label + "</button>";
  }

  function participantsRowsBodyHtml(rows) {
    var byName = {};
    var order = [];
    rows.forEach(function (r) {
      var nameKey = String(r.client_name || "").toLowerCase().trim() || ("id:" + r.id);
      /* Keep LA vs NHS orders separate (Tinashe Mon/Wed vs Fri). */
      var route = paidByFor(r) || invoiceTypeFor(r) || "x";
      var key = nameKey + "|" + route;
      if (!byName[key]) {
        byName[key] = { name: r.client_name || "—", sheet: r.sheet, services: {}, orders: [], total: 0, anyOut: false };
        order.push(key);
      }
      var g = byName[key];
      g.orders.push(r);
      var svc = serviceFor(r);
      if (svc && svc !== "—") g.services[svc] = 1;
      g.total += Number(r.amount) || 0;
      if (category(r) === "outstanding") g.anyOut = true;
    });
    var people = order.map(function (k) { return byName[k]; }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    if (!people.length) {
      return tableOrdersCaptionHtml(rows)
        + '<div class="pay-tbl-wrap"><table class="pay-tbl"><tbody>'
        + '<tr><td colspan="9" class="pay-empty">No participants in this term.</td></tr></tbody></table></div>';
    }
    var html = tableOrdersCaptionHtml(rows)
      + '<div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th class="num pay-tbl__idx">#</th><th>Client</th><th>Paid</th><th>Invoice type</th><th>Support</th><th>Service(s)</th><th class="num">Orders</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>';
    people.forEach(function (g, i) {
      var svcList = Object.keys(g.services).filter(function (s) {
        return s && !isPlaceholderServiceLabel(s);
      });
      var svcTxt = svcList.length ? svcList.join(" · ") : "—";
      var pill = g.anyOut
        ? '<span class="pay-pill pay-pill--out">Outstanding</span>'
        : '<span class="pay-pill pay-pill--paid">Paid</span>';
      var first = g.orders[0];
      var rowAttr;
      if (first && first._synthetic) {
        rowAttr = 'data-pay-reenrol="' + esc(first._contactId || first.id) + '"';
      } else if (g.orders.length > 1) {
        rowAttr = 'data-pay-orders="' + esc(g.orders.map(function (o) { return o.id; }).join(",")) + '" data-pay-pname="' + esc(g.name) + '"';
      } else {
        rowAttr = 'data-pay-id="' + esc(g.orders[0].id) + '"';
      }
      html += "<tr " + rowAttr + ">"
        + '<td class="num pay-tbl__idx">' + (i + 1) + "</td>"
        + '<td class="pay-name">' + esc(g.name) + "</td>"
        + "<td>" + paidChipHtml(paidByFor(first)) + "</td>"
        + "<td>" + invoiceChipHtml(invoiceTypeFor(first)) + "</td>"
        + "<td>" + supportCellHtml(first) + "</td>"
        + "<td>" + esc(svcTxt) + "</td>"
        + '<td class="num">' + g.orders.length + "</td>"
        + '<td class="num">' + money(g.total) + "</td>"
        + "<td>" + pill + "</td></tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  // Aggregate orders into one row per participant (used by Participants view).
  function participantsTableHtml(rows) {
    var baseGrouped = groupRowsByTermBucket(baseRows());
    var totalPeople = 0;
    var htmlBlocks = [];
    baseGrouped.forEach(function (g) {
      if (!g.rows.length) return;
      var termId = g.bucket.id;
      var paidScoped = applyPaidFilter(g.rows, termId);
      var scoped = paidScoped.filter(statusMatch);
      if (!paidScoped.length && !paidFilterForTerm(termId)) return;
      var keys = {};
      scoped.forEach(function (r) {
        var k = String(r.client_name || "").toLowerCase().trim() || ("id:" + r.id);
        keys[k] = 1;
      });
      totalPeople += Object.keys(keys).length;
      htmlBlocks.push(
        '<details class="pay-term-acc"' + termDetailsOpenAttr(termId) + ' data-pay-term="' + esc(termId) + '">'
        + '<summary class="pay-term-acc__sum">'
        + '<span><span class="pay-term-acc__title">' + esc(g.bucket.title) + "</span>"
        + '<span class="pay-term-acc__sub">' + esc(g.bucket.subtitle) + "</span></span>"
        + termAccordionMetaHtml({ rows: paidScoped })
        + "</summary>"
        + '<div class="pay-term-acc__body">'
        + paidFilterChipsHtml(termId)
        + participantsRowsBodyHtml(scoped)
        + "</div></details>"
      );
    });
    if (!htmlBlocks.length) {
      return '<div class="pay-card"><div class="pay-empty">No participants match this filter.</div></div>';
    }
    var html = '<div class="pay-card-h" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;min-width:0">'
      + "<h3 style=\"margin:0;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px\">"
      + icon("clients", 17) + "Participants</h3>"
      + '<span style="font-size:12px;color:#64748b;flex:0 0 auto">' + totalPeople + " shown</span></div>";
    html += '<div class="pay-term-stack">' + htmlBlocks.join("") + "</div>";
    return html;
  }

  function kpiCard(ico, cls, label, value) {
    return '<div class="pay-kpi ' + cls + '">'
      + '<span class="pay-kpi__ico">' + icon(ico, 20) + '</span>'
      + '<span class="pay-kpi__txt"><span>' + esc(label) + '</span><b>' + value + '</b></span>'
      + '</div>';
  }

  function grpCard(ico, cls, title, g) {
    return '<div class="pay-grp ' + cls + '">'
      + '<div class="pay-grp__h">'
      + '<span class="pay-grp__ico">' + icon(ico, 18) + '</span>'
      + '<span class="pay-grp__head-txt">'
      + '<span class="pay-grp__t">' + esc(title) + '</span>'
      + '<span class="pay-grp__sub">' + g.n + ' client' + (g.n === 1 ? "" : "s") + ' · re-enrolled</span>'
      + '</span></div>'
      + '<div class="pay-grp__stats">'
      + '<div class="pay-grp__stat"><span>Billed</span><b>' + money(g.billed) + '</b></div>'
      + '<div class="pay-grp__stat pay-grp__stat--paid"><span>Received</span><b>' + money(g.paid) + '</b></div>'
      + '<div class="pay-grp__stat pay-grp__stat--out"><span>Outstanding</span><b>' + money(g.out) + '</b></div>'
      + '</div></div>';
  }

  function bindRoot(root) {
    root.querySelectorAll("[data-pay-status]").forEach(function (b) {
      b.addEventListener("click", function () { state.statusFilter = b.getAttribute("data-pay-status"); render(); });
    });
    var sh = root.querySelector("#paySheet");
    if (sh) sh.addEventListener("change", function () { state.sheetFilter = sh.value; render(); });
    root.querySelectorAll("[data-pay-chip-kind]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var kind = b.getAttribute("data-pay-chip-kind");
        var val = b.getAttribute("data-pay-chip-value") || "";
        var termId = b.getAttribute("data-pay-chip-term") || "";
        if (kind === "paid") {
          if (!state.paidFilterByTerm) state.paidFilterByTerm = {};
          if (termId) state.paidFilterByTerm[termId] = val;
          if (termId) state.focusTermId = termId;
        }
        render();
      });
    });
    root.querySelectorAll("details.pay-term-acc[data-pay-term]").forEach(function (el) {
      el.addEventListener("toggle", function () {
        var id = el.getAttribute("data-pay-term");
        if (!id) return;
        if (!state.termOpenById) state.termOpenById = {};
        state.termOpenById[id] = !!el.open;
      });
    });
    var s = root.querySelector("#paySearch");
    if (s) {
      s.addEventListener("input", function () {
        state.query = String(s.value || "").trim().toLowerCase();
        var pos = s.selectionStart;
        render();
        var s2 = state.rootEl.querySelector("#paySearch");
        if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} }
      });
    }
    root.querySelectorAll("[data-pay-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-pay-id")); });
    });
    root.querySelectorAll("[data-pay-reenrol]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        deps.toast("Autumn re-enrolment instalments — open Family invoices above for this family.");
      });
    });
    root.querySelectorAll("[data-pay-orders]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var ids = String(tr.getAttribute("data-pay-orders") || "").split(",").filter(Boolean);
        openParticipantOrders(tr.getAttribute("data-pay-pname"), ids);
      });
    });
  }

  // Intermediate screen: a participant's full list of orders. Tap one to open
  // its editable record (same detail + audit as everywhere else).
  function openParticipantOrders(name, ids) {
    var orders = ids
      .map(function (id) { return allRows().filter(function (x) { return String(x.id) === String(id); })[0]; })
      .filter(Boolean);
    if (!orders.length) return;
    if (orders.length === 1) { openDetail(orders[0].id); return; }

    var rowsHtml = orders
      .slice()
      .sort(function (a, b) { return String(serviceFor(a)).localeCompare(String(serviceFor(b))); })
      .map(function (r) {
        return '<tr data-pay-open="' + esc(r.id) + '">'
          + '<td>' + serviceCellHtml(r) + '</td>'
          + '<td>' + esc(termFor(r)) + '</td>'
          + '<td>' + esc(r.parent_name || "") + '</td>'
          + '<td class="num">' + money(r.amount) + '</td>'
          + '<td>' + pillFor(r) + '</td></tr>';
      }).join("");

    closeScreen();
    var screen = document.createElement("div");
    screen.id = "payScreen";
    screen.className = "pay-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.innerHTML =
      '<div class="pay-screen__head">'
      + '<span class="pay-screen__ico">' + icon("users", 22) + '</span>'
      + '<div class="pay-screen__ttl"><h2>' + esc(name || "Participant") + '</h2>'
      + '<span class="pay-screen__sub">' + icon("list", 12) + " " + orders.length + ' orders · ' + esc(labelFor(orders[0].sheet)) + '</span></div>'
      + '<button type="button" class="pay-screen__x" id="payClose" aria-label="Close">' + icon("x", 20) + '</button>'
      + '</div>'
      + '<div class="pay-screen__body"><div class="pay-screen__inner">'
      + '<p class="muted" style="margin:0 0 12px;font-size:13px">Tap an order to open and edit its full record.</p>'
      + '<div class="pay-card"><div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th>Service</th><th>Term</th><th>Parent / LA</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>'
      + rowsHtml
      + '</tbody></table></div></div>'
      + '</div></div>'
      + '<div class="pay-screen__foot"><p class="pay-msg"></p>'
      + '<button type="button" class="btn btn--ghost" id="payCancel">Close</button></div>';
    document.body.appendChild(screen);
    state.prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    state.escHandler = function (e) { if (e.key === "Escape") closeScreen(); };
    document.addEventListener("keydown", state.escHandler);

    var x = screen.querySelector("#payClose");
    if (x) x.addEventListener("click", function () { closeScreen(); });
    var c = screen.querySelector("#payCancel");
    if (c) c.addEventListener("click", function () { closeScreen(); });
    screen.querySelectorAll("[data-pay-open]").forEach(function (tr) {
      tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-pay-open")); });
    });
  }

  function field(name, label, value, type, ico) {
    var v = value == null ? "" : String(value);
    var control;
    if (type === "status") {
      var opts = STATUS_OPTIONS.slice();
      if (v && opts.indexOf(v) < 0) opts.unshift(v);
      control = '<select data-prop="payment_status">' + opts.map(function (o) {
        return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select>";
    } else if (type === "amount") {
      control = '<input type="number" step="0.01" data-prop="amount" value="' + esc(v) + '" />';
    } else if (type === "sheet") {
      control = selectHtml('data-prop="sheet" id="payEditSheet"', selectOptionsFor("sheet", v), v);
    } else if (type === "prop") {
      var propOpts = selectOptionsFor(name, v);
      control = propOpts
        ? selectHtml('data-prop="' + esc(name) + '"', propOpts, v)
        : '<input type="text" data-prop="' + esc(name) + '" value="' + esc(v) + '" />';
    } else {
      var dataOpts = selectOptionsFor(name, v);
      if (dataOpts) {
        control = selectHtml('data-data="' + esc(name) + '"', dataOpts, v);
      } else {
        var long = v.length > 48;
        control = long
          ? '<textarea data-data="' + esc(name) + '">' + esc(v) + "</textarea>"
          : '<input type="text" data-data="' + esc(name) + '" value="' + esc(v) + '" />';
      }
    }
    var lab = (ico ? icon(ico, 13) : icon("field", 13)) + "<span>" + esc(label) + "</span>";
    return '<div class="pay-field"><label>' + lab + "</label>" + control + "</div>";
  }

  function closeScreen() {
    if (state.escHandler) { document.removeEventListener("keydown", state.escHandler); state.escHandler = null; }
    var el = document.getElementById("payScreen");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.documentElement.style.overflow = state.prevHtmlOverflow || "";
  }

  function openDetail(id) {
    var r = allRows().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    if (r._synthetic) {
      deps.toast("Autumn re-enrolment instalments — open Family invoices above for this family.");
      return;
    }
    var d = r.data || {};

    // Resolve which data key actually holds the booked service, so editing
    // writes back to the right key (avoids creating a duplicate "Services").
    var svcKey = ["Services", "Service", "Programme", "Programmes", "Activity"].filter(function (k) {
      return d[k] != null && String(d[k]).trim();
    })[0] || "Services";

    var top = '<div class="pay-fields">'
      + field("client_name", "Client name", r.client_name, "prop", "user")
      + field("parent_name", "Parent / LA", r.parent_name, "prop", "users")
      + field(null, "Group", r.sheet, "sheet", "fund")
      + field(null, "Status", r.payment_status, "status", "flag")
      + field(null, "Total (£)", r.amount, "amount", "coins")
      + "</div>"
      + '<div style="margin-top:12px;min-width:0">'
      + '<p class="muted" style="margin:0 0 8px;font-size:12px;max-width:48rem;overflow-wrap:break-word">Pick standard services (session rate is fixed). Use <strong>+ Add service</strong> when the client has more than one (saved as “A · B”, same as the workbook). For <strong>Day Centre</strong>, set hours separately — Total (£) stays manual.</p>'
      + serviceEditHtml(svcKey, d[svcKey] || "", d)
      + "</div>";

    // Service is shown prominently above, so skip its key here; the rest are
    // grouped by type (money, dates, sessions, people, other) for readability.
    var dataFields = groupedFieldsHtml(d, svcKey);

    closeScreen();
    var screen = document.createElement("div");
    screen.id = "payScreen";
    screen.className = "pay-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.innerHTML =
      '<div class="pay-screen__head">'
      + '<span class="pay-screen__ico">' + icon("user", 22) + '</span>'
      + '<div class="pay-screen__ttl"><h2>' + esc(r.client_name || "Client") + '</h2>'
      + '<span class="pay-screen__sub" id="payEditGroupLabel">' + icon("fund", 12) + " " + esc(labelFor(r.sheet)) + '</span></div>'
      + '<button type="button" class="pay-screen__x" id="payClose" aria-label="Close">' + icon("x", 20) + '</button>'
      + '</div>'
      + '<div class="pay-screen__body"><div class="pay-screen__inner">'
      + '<section class="pay-sect"><div class="pay-sect__h">' + icon("clients", 17) + 'Key details</div>' + top + '</section>'
      + '<section class="pay-sect"><div class="pay-sect__h">' + icon("list", 17) + 'All spreadsheet fields</div>'
      + '<p class="muted" style="margin:0 0 12px;font-size:12px;max-width:48rem;overflow-wrap:break-word">Where possible, use the dropdowns (Funding, Payer, Payment method, VAT, Funder, Term, Group, Service) so everyone picks the same wording.</p>'
      + dataFields + '</section>'
      + '</div></div>'
      + '<div class="pay-screen__foot">'
      + '<p id="payMsg" class="pay-msg"></p>'
      + '<button type="button" class="btn btn--ghost" id="payCancel">Close</button>'
      + '<button type="button" class="btn btn--pri" id="paySave">Save changes</button>'
      + '</div>';
    document.body.appendChild(screen);
    state.prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    state.escHandler = function (e) { if (e.key === "Escape") closeScreen(); };
    document.addEventListener("keydown", state.escHandler);

    var mr = screen;
    wireServiceEdit(mr);
    var sheetEl = mr.querySelector("#payEditSheet");
    if (sheetEl) {
      sheetEl.addEventListener("change", function () {
        var lab = mr.querySelector("#payEditGroupLabel");
        if (lab) lab.innerHTML = icon("fund", 12) + " " + esc(labelFor(sheetEl.value));
      });
    }
    var closeX = mr.querySelector("#payClose");
    if (closeX) closeX.addEventListener("click", function () { closeScreen(); });
    var cancel = mr.querySelector("#payCancel");
    if (cancel) cancel.addEventListener("click", function () { closeScreen(); });
    var save = mr.querySelector("#paySave");
    if (save) save.addEventListener("click", function () { saveDetail(r, mr, save); });
  }

  function saveDetail(r, mr, saveBtn) {
    var client = deps.getClient();
    var msg = mr.querySelector("#payMsg");
    if (!client) { if (msg) msg.textContent = "Supabase not connected yet — sign in as admin and retry."; return; }

    // Snapshot before the write so we can log a readable diff afterwards.
    var logLabels = { client_name: "Client name", parent_name: "Parent / LA", payment_status: "Status", amount: "Total (£)", sheet: "Group" };
    var oldFlat = Object.assign({ client_name: r.client_name, parent_name: r.parent_name, payment_status: r.payment_status, amount: r.amount, sheet: r.sheet }, r.data || {});

    var patch = {};
    mr.querySelectorAll("[data-prop]").forEach(function (inp) {
      var p = inp.getAttribute("data-prop");
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (p === "amount") patch.amount = v === "" ? null : Number(v);
      else patch[p] = v === "" ? null : v;
    });
    var newData = {};
    mr.querySelectorAll("[data-data]").forEach(function (inp) {
      var k = inp.getAttribute("data-data");
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (v !== "") newData[k] = v;
    });
    /* Keep Paid / Invoice type / Funding aligned with Group. */
    if (patch.sheet === "PARENTS") {
      newData.Paid = PAID_BY.PRIVATE_FUNDS;
      newData["Invoice type"] = INVOICE_TYPE.PARENT_20;
      newData.Funding = INVOICE_TYPE.PARENT_20;
      newData.Funder = INVOICE_TYPE.PARENT_20;
      if (!newData.Payer || /local authority|nhs \(pays|direct payments|funds from la/i.test(String(newData.Payer))) {
        newData.Payer = PAID_BY.PRIVATE_FUNDS;
      }
      newData["Funding origin"] = "Private";
      if (newData["Funding Origin"] != null) delete newData["Funding Origin"];
    } else if (patch.sheet === "DIRECT_PAYMENTS") {
      newData.Paid = PAID_BY.FUNDS_FROM_LA;
      newData["Invoice type"] = INVOICE_TYPE.PARENT_EXEMPT;
      newData.Funding = INVOICE_TYPE.PARENT_EXEMPT;
      newData.Funder = INVOICE_TYPE.PARENT_EXEMPT;
      newData.Payer = PAID_BY.FUNDS_FROM_LA;
      newData["Funding origin"] = "Parent Direct Payments";
      if (newData["Funding Origin"] != null) delete newData["Funding Origin"];
      if (!newData.VAT || /20%|pf|0\.2/i.test(String(newData.VAT))) newData.VAT = "Exempt";
    } else if (patch.sheet === "LA") {
      var route = String(newData["Invoice type"] || newData.Funder || newData.Funding || "").trim();
      if (route !== INVOICE_TYPE.NHS_EXEMPT && route !== INVOICE_TYPE.LA_EXEMPT) {
        route = isExplicitNhsFunder(route) || /\bnen\b/i.test(route)
          ? INVOICE_TYPE.NHS_EXEMPT
          : INVOICE_TYPE.LA_EXEMPT;
      }
      delete newData.Paid;
      if (route === INVOICE_TYPE.NHS_EXEMPT) newData.Paid = PAID_BY.FUNDED_BY_NHS;
      else newData.Paid = PAID_BY.FUNDED_BY_LA;
      newData["Invoice type"] = route;
      newData.Funding = route;
      newData.Funder = route;
      newData.Payer = "Local authority / NHS (pays direct)";
      newData["Funding origin"] = route === INVOICE_TYPE.NHS_EXEMPT ? "NHS-funded" : "LA-funded";
      if (newData["Funding Origin"] != null) delete newData["Funding Origin"];
      if (!newData.VAT || /20%|pf|0\.2/i.test(String(newData.VAT))) newData.VAT = "Exempt";
    }
    if (newData.VAT === "EXCEMP") newData.VAT = "Exempt";
    patch.data = newData;

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
    if (msg) msg.textContent = "";

    // .select() returns the row(s) actually written. If RLS / the current session
    // blocks the update, Supabase reports NO error but writes 0 rows — so we must
    // check the returned rows rather than trusting a missing error.
    client.from("client_payments").update(patch).eq("id", r.id).select().then(function (res) {
      if (res.error) throw res.error;
      var saved = (res.data && res.data.length) ? res.data[0] : null;
      if (!saved) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
        if (msg) msg.textContent = "Not saved: no row was updated. You are likely not signed in as an admin (RLS blocks the change). Sign in to the admin dashboard and retry.";
        return;
      }
      // Audit log: record who changed what (readable field diff).
      if (global.PortalChangeLog) {
        var newFlat = Object.assign({ client_name: saved.client_name, parent_name: saved.parent_name, payment_status: saved.payment_status, amount: saved.amount }, saved.data || {});
        var df = global.PortalChangeLog.diff(oldFlat, newFlat, logLabels);
        if (df) global.PortalChangeLog.record({ area: "Payments", entity: saved.client_name || r.client_name, action: "update", summary: df.summary, details: { changes: df.changes, group: labelFor(r.sheet) }, source: "reenrol_payments" });
      }
      // Sync the in-memory row with exactly what the database stored.
      Object.keys(saved).forEach(function (k) { r[k] = saved[k]; });
      deps.toast("Saved.");
      // Let other views (Orders/Participants catalogues fed from client_payments)
      // refresh their money columns after an edit.
      try {
        if (global.dispatchEvent && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("portal:payments-updated", { detail: { id: saved.id } }));
        }
      } catch (_e) {}
      closeScreen();
      render();
    }).catch(function (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
      if (msg) msg.textContent = "Could not save: " + ((err && err.message) || err);
    });
  }

  function configure(opts) {
    opts = opts || {};
    ["getClient", "getSupabaseUrl", "getAnonKey", "toast", "esc", "openModal", "closeModal"].forEach(function (k) {
      if (typeof opts[k] === "function") deps[k] = opts[k];
    });
  }

  function loadFundingLabelsByContact(client, contactIds) {
    var ids = (contactIds || []).filter(Boolean);
    var uniq = [];
    var seen = {};
    ids.forEach(function (id) {
      var k = String(id).trim();
      if (!k || seen[k]) return;
      seen[k] = true;
      uniq.push(k);
    });
    if (!client) return Promise.resolve({});
    var map = {};
    function ingest(rows) {
      (rows || []).forEach(function (row) {
        if (!row || !row.contact_id) return;
        map[String(row.contact_id)] = {
          funding_label: String(row.funding_label || "").trim(),
          payment_method_label: String(row.payment_method_label || "").trim(),
          child_display: String(row.child_display || "").trim(),
        };
      });
    }
    var labeled = client
      .from("portal_parent_contacts")
      .select("contact_id, funding_label, payment_method_label, child_display")
      .not("funding_label", "is", null)
      .neq("funding_label", "")
      .limit(500)
      .then(function (res) {
        if (!res.error) ingest(res.data);
      })
      .catch(function () {});

    function page(from) {
      var chunk = uniq.slice(from, from + 80);
      if (!chunk.length) return Promise.resolve(map);
      return client
        .from("portal_parent_contacts")
        .select("contact_id, funding_label, payment_method_label, child_display")
        .in("contact_id", chunk)
        .then(function (res) {
          if (res.error) throw res.error;
          ingest(res.data);
          return page(from + 80);
        });
    }
    return labeled.then(function () {
      return page(0);
    }).catch(function () { return map; });
  }

  function applyPayGroupClassification(payments, reenrol, fundingByContact) {
    fundingByContact = fundingByContact || {};
    var byChildName = {};
    Object.keys(fundingByContact).forEach(function (cid) {
      var info = fundingByContact[cid];
      var name = String((info && info.child_display) || "").trim().toLowerCase();
      if (name) byChildName[name] = info;
    });

    /* Index LA payment funders by normalized client name for autumn enrichment. */
    var payFunderByNorm = {};
    (payments || []).forEach(function (r) {
      if (String(r.sheet || "").toUpperCase() !== "LA") return;
      var nk = String(r.client_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!nk) return;
      var fund = fundingHintFromPaymentData(r.data) || String((r.data && r.data.Paid) || "").trim();
      if (!fund || isGenericLaNhsUmbrella(fund)) return;
      if (!payFunderByNorm[nk]) payFunderByNorm[nk] = [];
      payFunderByNorm[nk].push({ fund: fund, row: r });
    });

    function enrichFromPayments(r) {
      if (r.data && (r.data.Funder || r.data.Paid || r.data["Invoice type"])) return;
      var nk = String(r.client_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!nk) return;
      var hits = payFunderByNorm[nk];
      if (!hits) {
        var first = nk.split(" ")[0];
        Object.keys(payFunderByNorm).forEach(function (k) {
          if (hits) return;
          if (k === nk || k.indexOf(first) === 0 || nk.indexOf(k) === 0) hits = payFunderByNorm[k];
        });
      }
      if (!hits || !hits.length) return;
      /* Prefer NHS hit for curated NHS names; else first. */
      var pick = hits[0];
      var curated = curatedNhsRouteForParticipant(r);
      if (curated === "NHS_INVOICE") {
        for (var i = 0; i < hits.length; i++) {
          if (isExplicitNhsFunder(hits[i].fund) || /funded by nhs|nhs \(exempt/i.test(hits[i].fund)) {
            pick = hits[i];
            break;
          }
        }
      }
      r._fundingLabel = pick.fund;
      if (!r.data) r.data = {};
      if (!r.data.Funder) r.data.Funder = pick.fund;
      var src = pick.row && pick.row.data;
      if (src) {
        if (src.Paid && !r.data.Paid) r.data.Paid = src.Paid;
        if (src["Invoice type"] && !r.data["Invoice type"]) r.data["Invoice type"] = src["Invoice type"];
        if (src.Services && !r.data.Services) r.data.Services = src.Services;
        if (pick.row.parent_name && !r.parent_name) r.parent_name = pick.row.parent_name;
      }
    }

    (reenrol || []).forEach(function (r) {
      enrichFromPayments(r);
      var cid = String(r._contactId || "").trim();
      var info = cid ? fundingByContact[cid] : null;
      /* Prefer invoice / row funder over contact umbrella "LA / NHS". */
      var fromRow = String(r._fundingLabel || "").trim();
      var fromContact = String((info && info.funding_label) || "").trim();
      var label = fromRow;
      if (!label || isGenericLaNhsUmbrella(label)) {
        if (fromContact && !isGenericLaNhsUmbrella(fromContact)) label = fromContact;
        else if (fromRow) label = fromRow;
        else label = fromContact;
      }
      if (isGenericLaNhsUmbrella(label)) label = "";
      r._fundingLabel = label;
      if (label && r.data && !r.data.Funder) r.data.Funder = label;
      r.sheet = classifyPayGroup({
        sheet: r.sheet,
        payment_method_hint: r._paymentMethodHint,
        vat_mode: r._vatMode,
        funding_label: label || "Local Authority",
        _reenrol: true,
      });
    });

    (payments || []).forEach(function (r) {
      var fromData = fundingHintFromPaymentData(r.data);
      var nameKey = String(r.client_name || "").trim().toLowerCase();
      var info = nameKey ? byChildName[nameKey] : null;
      var fromContact = String((info && info.funding_label) || "").trim();
      var label = fromData || "";
      if (!label || isGenericLaNhsUmbrella(label)) {
        if (fromContact && !isGenericLaNhsUmbrella(fromContact)) label = fromContact;
        else label = fromData || fromContact || r._fundingLabel || "";
      }
      if (isGenericLaNhsUmbrella(label)) label = "";
      r._fundingLabel = label;
      r.sheet = classifyPayGroup({
        sheet: r.sheet,
        funding_label: label,
        _reenrol: false,
      });
    });
  }

  function isAutumnReenrolInvoice(inv) {
    var via = String((inv && inv.created_via) || "");
    // Family re-enrol INV-Ps + LA office-auto booked places (no family INV-P yet).
    return via === "reenrolment" || via === "la_office_auto";
  }

  function isLaManagedAutumnCandidate(inv) {
    if (!inv) return false;
    if (String(inv.created_via || "") === "la_office_auto") return true;
    if (inv.is_la_office_auto === true) return true;
    return String(inv.funding_category || "") === "la_managed";
  }

  function reenrolInvoiceAmountGbp(inv) {
    var via = String((inv && inv.created_via) || "");
    /* Instalments keep amount_gbp; LA office-auto / booked-place rows use term totals. */
    if (via === "reenrolment") {
      return Number(inv && inv.amount_gbp) || 0;
    }
    var n = Number(inv && inv.amount_selected_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_term_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_autumn_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.amount_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_annual_gbp);
    return n > 0 ? n : 0;
  }

  function laBookedAutumnAmountGbp(inv) {
    var n = Number(inv && inv.amount_selected_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_term_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_autumn_gbp);
    if (n > 0) return n;
    n = Number(inv && inv.booked_annual_gbp);
    return n > 0 ? n : 0;
  }

  function buildAutumnReenrolAggRow(inv, opts) {
    opts = opts || {};
    var cid = String(inv.contact_id || "").trim();
    var via = String(inv.created_via || "");
    var isLaAuto = via === "la_office_auto" || opts.forceLa === true;
    var hint = String(inv.payment_method_hint || "").toLowerCase();
    var vat = String(inv.vat_mode || "").toLowerCase();
    if (isLaAuto || String(inv.funding_category || "") === "la_managed") {
      hint = "la_funded";
      vat = vat || "exempt";
    }
    var row = {
      id: (isLaAuto ? "la-auto-" : "reenrol-") + cid,
      _contactId: cid,
      _paymentMethodHint: hint,
      _vatMode: vat,
      _fundingLabel: String(inv.funding_label || "").trim(),
      sheet: classifyPayGroup({
        payment_method_hint: hint,
        vat_mode: vat,
        funding_label: inv.funding_label,
        _reenrol: true,
      }),
      client_name: inv.participant_display || inv.related_client || cid,
      parent_name: inv.parent_display || "",
      payment_status: "Outstanding",
      amount: 0,
      amount_billed: 0,
      amount_out: 0,
      data: {
        Term: "AUTUMN TERM 26/27",
        Services: "",
        Funder: inv.funding_label || "",
      },
      _serviceParts: Object.create(null),
      _termBucket: "autumn_2627",
      _synthetic: true,
      _reenrol: true,
      _laOfficeAuto: isLaAuto,
      _invoiceIds: [],
    };
    mergeServiceLabelsIntoRow(row, inv);
    return row;
  }

  function loadReenrolRows() {
    var base = supabaseBase();
    var key = anonKey();
    if (!base || !key) return Promise.resolve([]);
    return portalAuthToken().then(function (token) {
      if (!token) return [];
      return fetch(base + "/functions/v1/portal-admin-parent-invoices-list", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_status: "all",
          payment_status: "all",
          billing_amount: "autumn",
          limit: 400,
        }),
      }).then(function (res) { return res.json().then(function (j) { return { res: res, j: j }; }); })
        .then(function (pack) {
          if (!pack.res.ok || !pack.j || !pack.j.ok) return [];
          var allInvs = pack.j.invoices || [];
          var invs = allInvs.filter(isAutumnReenrolInvoice);
          var agg = {};
          invs.forEach(function (inv) {
            var cid = String(inv.contact_id || "").trim();
            if (!cid) return;
            var via = String(inv.created_via || "");
            var isLaAuto = via === "la_office_auto";
            if (!agg[cid]) {
              agg[cid] = buildAutumnReenrolAggRow(inv, { forceLa: isLaAuto });
            }
            var row = agg[cid];
            mergeServiceLabelsIntoRow(row, inv);
            /* Prefer la_office_auto row identity if both somehow appear. */
            if (isLaAuto) {
              row.id = "la-auto-" + cid;
              row._laOfficeAuto = true;
              row._paymentMethodHint = "la_funded";
              if (!row._fundingLabel && inv.funding_label) {
                row._fundingLabel = String(inv.funding_label).trim();
                row.data.Funder = row._fundingLabel;
              }
            }
            var amt = reenrolInvoiceAmountGbp(inv);
            var st = String(inv.payment_status || "").toLowerCase();
            row.amount_billed += amt;
            if (inv.id) row._invoiceIds.push(inv.id);
            var hint = String(inv.payment_method_hint || "").toLowerCase();
            var vat = String(inv.vat_mode || "").toLowerCase();
            if (hint === "la_funded" || isLaAuto) row._paymentMethodHint = "la_funded";
            if (vat === "exempt" && row._vatMode !== "exempt") row._vatMode = vat;
            if (st === "paid") {
              // keep Paid unless another instalment is open
            } else if (st !== "void") {
              row.amount_out += amt;
              row.payment_status = "Outstanding";
            }
          });

          /*
           * LA sheet clients already re-enrolled for 2026/27 may only appear as
           * funding_category=la_managed on existing shares (API skips synthetic
           * la_office_auto when any INV-P exists). Still show them under Autumn.
           */
          allInvs.forEach(function (inv) {
            if (!isLaManagedAutumnCandidate(inv)) return;
            var cid = String(inv.contact_id || "").trim();
            if (!cid || agg[cid]) return;
            var amt = laBookedAutumnAmountGbp(inv);
            if (amt <= 0 && !inv.reenrolment_submitted_at && !(inv.booked_slots && inv.booked_slots.length)) {
              return;
            }
            var row = buildAutumnReenrolAggRow(inv, { forceLa: true });
            /* Use booked autumn once — do not sum every historical LA share. */
            row.amount_billed = amt;
            row.amount_out = amt;
            row.amount = amt;
            row.payment_status = amt > 0 ? "Outstanding" : "Paid";
            if (inv.id) row._invoiceIds.push(inv.id);
            agg[cid] = row;
          });

          return Object.keys(agg).map(function (cid) {
            var row = agg[cid];
            row.amount = row.amount_out > 0 ? row.amount_out : row.amount_billed;
            if (row.amount_out <= 0 && row.amount_billed > 0) row.payment_status = "Paid";
            else if (row.amount_out > 0) row.payment_status = "Outstanding";
            row.sheet = classifyPayGroup({
              payment_method_hint: row._paymentMethodHint,
              vat_mode: row._vatMode,
              funding_label: row._fundingLabel,
              _reenrol: true,
            });
            return row;
          });
        }).catch(function () { return []; });
    });
  }

  function loadAllData(client) {
    return Promise.all([loadAll(client), loadReenrolRows()]).then(function (res) {
      var payments = res[0] || [];
      var reenrol = res[1] || [];
      var contactIds = reenrol.map(function (r) { return r._contactId; }).filter(Boolean);
      return loadFundingLabelsByContact(client, contactIds).then(function (fundingByContact) {
        applyPayGroupClassification(payments, reenrol, fundingByContact);
        return { payments: payments, reenrol: reenrol };
      });
    });
  }

  function mount(rootEl, opts) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    // mode: "payments" (default) | "orders" | "participants" — same data, same
    // detail/edit/audit; only the framing of the list differs per related view.
    state.mode = (opts && opts.mode) || "payments";
    rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Loading…</p>';

    var client = deps.getClient();
    if (!client) {
      rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Connecting to Supabase… open this view again in a moment.</p>';
      global.addEventListener && global.addEventListener("portal:supabase-ready", function () {
        if (state.rootEl === rootEl) mount(rootEl, { mode: state.mode });
      }, { once: true });
      return;
    }

    loadAllData(client).then(function (pack) {
      state.rows = pack.payments;
      state.reenrolRows = pack.reenrol;
      if (!state.rows.length && !state.reenrolRows.length) {
        rootEl.innerHTML = '<p class="pay-empty">No payments yet. Run the client_payments migration + seed in Supabase, then reopen this view.</p>';
        return;
      }
      render();
    }).catch(function (err) {
      rootEl.innerHTML = '<p class="pay-empty">Could not load payments: ' + esc((err && err.message) || err) + "</p>";
    });
  }

  function loadAll(client) {
    var pageSize = 1000;
    var all = [];
    function page(from) {
      return client
        .from("client_payments")
        .select("id, sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data")
        .order("sheet", { ascending: true })
        .order("client_name", { ascending: true })
        .range(from, from + pageSize - 1)
        .then(function (res) {
          if (res.error) throw res.error;
          var data = res.data || [];
          all = all.concat(data);
          if (data.length < pageSize) return all;
          return page(from + pageSize);
        });
    }
    return page(0);
  }

  // Ensure rows are in memory (load once if needed), then run cb(true|false).
  function ensureLoaded(cb) {
    if ((state.rows && state.rows.length) || (state.reenrolRows && state.reenrolRows.length)) {
      cb(true);
      return;
    }
    var client = deps.getClient();
    if (!client) { cb(false); return; }
    loadAllData(client).then(function (pack) {
      state.rows = pack.payments;
      state.reenrolRows = pack.reenrol;
      cb(true);
    }).catch(function () { cb(false); });
  }

  // Open the editable full-screen record for a single client_payments id.
  // Inject the screen CSS first: when called from the Orders catalogue the
  // module may not have been mounted yet, so the .pay-screen styles (position
  // fixed + z-index) would otherwise be missing and the overlay renders behind.
  function openRecord(id) {
    injectStyleOnce();
    ensureLoaded(function (ok) { if (ok) openDetail(id); });
  }

  // Open one editable record (1 id) or the intermediate list (several ids) for
  // a participant/family — used by the Orders catalogue "Edit" action.
  function openRecords(name, ids) {
    injectStyleOnce();
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    ensureLoaded(function (ok) {
      if (!ok) return;
      if (ids.length === 1) openDetail(ids[0]);
      else openParticipantOrders(name || "Orders", ids);
    });
  }

  global.AdminPayments = { configure: configure, mount: mount, openRecord: openRecord, openRecords: openRecords };
})(typeof window !== "undefined" ? window : globalThis);
