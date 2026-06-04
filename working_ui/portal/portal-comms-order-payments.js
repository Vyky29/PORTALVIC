/**

 * CFK-style Order detail — bridge Programme payments + funding into Ops comms "View Order".

 * Uses window.CLIENTS_PAYMENTS_PORTAL_SOURCE (xlsx export and/or live client_payments).

 */

(function (global) {

  "use strict";



  var liveEnricher = null;



  function payRowsSource() {

    var src = global.CLIENTS_PAYMENTS_PORTAL_SOURCE;

    return src && Array.isArray(src.rows) ? src.rows : [];

  }



  function ppRowsSource() {

    var src = global.PARTICIPANTS_PARENTS_PORTAL_SOURCE;

    return src && Array.isArray(src.rows) ? src.rows : [];

  }



  function parseMoney(v) {

    if (v == null || v === "" || v === "—" || v === "-") return null;

    if (typeof v === "number" && Number.isFinite(v)) return v;

    var n = parseFloat(String(v).replace(/[£,\s]/g, ""));

    return Number.isFinite(n) ? n : null;

  }



  function normalizePersonName(s) {

    return String(s || "")

      .trim()

      .toLowerCase()

      .replace(/\s+/g, " ");

  }



  function normalizeInvRef(ref) {

    return String(ref || "")

      .trim()

      .toLowerCase()

      .replace(/\s+/g, " ");

  }



  function invRefTokens(ref) {

    var n = normalizeInvRef(ref);

    if (!n || n === "—" || n === "-") return [];

    return n

      .split(/[·•,;/]+/)

      .map(function (t) {

        return t.trim();

      })

      .filter(Boolean);

  }



  function rowMatchesInvRef(row, wantNorm, wantTokens) {

    var tokens = invRefTokens(row && row.inv);

    if (!tokens.length) return false;

    if (wantTokens.length > 1) {

      return wantTokens.every(function (t) {

        return tokens.indexOf(t) >= 0;

      });

    }

    var w = wantNorm || wantTokens[0];

    if (!w) return false;

    for (var i = 0; i < tokens.length; i++) {

      if (tokens[i] === w) return true;

      if (tokens[i].indexOf(w) >= 0 || w.indexOf(tokens[i]) >= 0) return true;

    }

    return false;

  }



  function payRowsForInvRef(invRef) {

    var wantNorm = normalizeInvRef(invRef);

    var wantTokens = invRefTokens(invRef);

    if (!wantNorm && !wantTokens.length) return [];

    var rows = payRowsSource();

    return rows.filter(function (r) {

      return rowMatchesInvRef(r, wantNorm, wantTokens);

    });

  }



  function childDisplayFromPp(pp) {

    if (!pp) return "";

    if (pp.childDisplay != null && String(pp.childDisplay).trim()) return String(pp.childDisplay).trim();

    return (String(pp.childFirstName || "").trim() + " " + String(pp.childLastName || "").trim()).trim();

  }



  function ppRowForPayRow(pr) {

    var rows = ppRowsSource();

    if (!rows.length || !pr) return null;

    var pax = String(pr.pax || "").trim();

    var parent = String(pr.parent || "").trim();

    if (!pax) return null;

    var wantChild = normalizePersonName(pax);

    var wantParent = parent && parent !== "—" ? normalizePersonName(parent) : "";

    var byChild = [];

    var i;

    for (i = 0; i < rows.length; i++) {

      if (normalizePersonName(childDisplayFromPp(rows[i])) === wantChild) byChild.push(rows[i]);

    }

    if (!byChild.length) return null;

    if (!wantParent) return byChild[0];

    for (i = 0; i < byChild.length; i++) {

      if (normalizePersonName(byChild[i].parentDisplay) === wantParent) return byChild[i];

    }

    if (byChild.length === 1) return byChild[0];

    return byChild[0];

  }



  function parseSessionCount(label) {

    var t = String(label || "").trim();

    if (!t || t === "—") return null;

    var m = t.match(/(\d+)\s*\/\s*(\d+)/);

    if (m) return parseInt(m[2], 10) || parseInt(m[1], 10);

    m = t.match(/(\d+)/);

    return m ? parseInt(m[1], 10) : null;

  }



  function programmeFromService(raw) {

    var svc = String(raw || "").trim() || "—";

    var prog = svc.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

    return prog || svc;

  }



  function scheduleFromService(raw) {

    var svc = String(raw || "");

    var m = svc.match(/\(([^)]+)\)/);

    return m && m[1] ? String(m[1]).trim() : "—";

  }



  function paidAmountForRow(pr) {

    var paid = parseMoney(pr.paid);

    if (paid != null) return paid;

    var st = String(pr.st || "").toLowerCase();

    var tot = parseMoney(pr.tot);

    if (st.indexOf("paid") === 0 && tot != null) return tot;

    return 0;

  }



  /** Split "Mar/Apr: 650 · May: 256" into separate billing lines when 2+ instalments. */

  function parsePeriodNoteInstallments(periodNote, tot, paid) {

    var raw = String(periodNote || "").trim();

    if (!raw || raw === "—") return null;

    var parts = raw.split(/\s*·\s*/).map(function (s) {

      return String(s || "").trim();

    }).filter(Boolean);

    var lines = [];

    var re = /^([A-Za-z][A-Za-z0-9\/]*)\s*:\s*(?:£)?\s*([\d.,]+)/i;

    var i, m, amt;

    for (i = 0; i < parts.length; i++) {

      m = parts[i].match(re);

      if (!m) continue;

      amt = parseMoney(m[2]);

      if (amt == null) continue;

      lines.push({

        label: String(m[1]).trim(),

        amount: amt,

        segment: parts[i],

      });

    }

    if (lines.length < 2) return null;

    var sum = 0;

    for (i = 0; i < lines.length; i++) sum += lines[i].amount;

    if (tot != null && tot > 0 && Math.abs(sum - tot) > 2) {

      var scale = tot / sum;

      for (i = 0; i < lines.length; i++) lines[i].amount = Math.round(lines[i].amount * scale * 100) / 100;

    }

    var remainingPaid = paid != null ? paid : 0;

    for (i = 0; i < lines.length; i++) {

      var lineAmt = lines[i].amount;

      var linePaid = Math.min(Math.max(0, remainingPaid), lineAmt);

      remainingPaid -= linePaid;

      lines[i].paid = linePaid;

      lines[i].balance = Math.max(0, lineAmt - linePaid);

    }

    return lines;

  }



  function serviceCardFromPayRow(pr, invRef, idx, installment) {

    var tot = parseMoney(pr.tot) || 0;

    var paid = paidAmountForRow(pr);

    var inv = String(pr.inv || invRef || "").trim() || invRef || "—";

    var ref =

      String(pr.payId || "").trim() ||

      inv.replace(/\s+/g, "-").toUpperCase() + "-" + String(idx);

    var inst = installment || null;

    var amount = inst ? inst.amount : tot;

    var linePaid = inst ? inst.paid : paid;

    var periodNote = inst

      ? String(inst.segment || inst.label || "").trim()

      : String(pr.periodNote || "").trim();

    return {

      bookingRef: inst ? ref + "-" + String(inst.label || idx).replace(/\s+/g, "") : ref,

      programme: programmeFromService(pr.service),

      schedule: scheduleFromService(pr.service),

      venue: "—",

      sessionCount: parseSessionCount(pr.sessionsLabel) || 0,

      sessionDates: [],

      amount: amount,

      paid: linePaid,

      payId: pr.payId || null,

      fund: String(pr.fund || "").trim(),

      payMethod: String(pr.payMethod || "").trim(),

      periodNote: periodNote,

      installmentLabel: inst ? String(inst.label || "").trim() : "",

      isInstallmentLine: !!inst,

      installmentGroupKey: inst ? String(pr.payId || inv || ref) : "",

      vat: String(pr.vat || "").trim(),

      costLabel: String(pr.costLabel || "").trim(),

      sheet: String(pr.sheet || "").trim(),

      live: !!pr.payId,

      pax: String(pr.pax || "").trim(),

      parent: String(pr.parent || "").trim(),

      sessionsLabel: String(pr.sessionsLabel || "").trim(),

      sourcePayRow: pr,

    };

  }



  function expandServicesWithInstallments(services) {

    var out = [];

    var i, svc, pr, inst, j, lines;

    for (i = 0; i < services.length; i++) {

      svc = services[i];

      pr = svc.sourcePayRow;

      if (!pr) {

        out.push(svc);

        continue;

      }

      lines = parsePeriodNoteInstallments(

        pr.periodNote,

        parseMoney(pr.tot),

        paidAmountForRow(pr),

      );

      if (!lines) {

        out.push(svc);

        continue;

      }

      for (j = 0; j < lines.length; j++) {

        out.push(serviceCardFromPayRow(pr, svc.bookingRef, i + "-" + j, lines[j]));

      }

    }

    return out;

  }



  function buildPackFromPayRows(rows, invRef) {

    if (!rows || !rows.length) return null;

    var parentName = String(rows[0].parent || "").trim() || "Carer";

    var services = rows.map(function (r, i) {

      return serviceCardFromPayRow(r, invRef, i, null);

    });

    services = expandServicesWithInstallments(services);

    return {

      parentName: parentName,

      services: services,

      source: rows[0].payId ? "client_payments" : "export",

      invRef: String(invRef || "").trim(),

    };

  }



  function applyEnricher(pack) {

    if (!pack || !liveEnricher) return pack;

    try {

      var next = liveEnricher(pack);

      return next || pack;

    } catch (_e) {

      return pack;

    }

  }



  function resolvePack(orderRef, mockDemoByRef) {

    var key = String(orderRef || "").trim();

    if (!key) return null;

    var liveRows = payRowsForInvRef(key);

    if (liveRows.length) {

      var pack = buildPackFromPayRows(liveRows, key);

      if (pack) return applyEnricher(pack);

    }

    if (mockDemoByRef && mockDemoByRef[key]) return Object.assign({ source: "demo" }, mockDemoByRef[key]);

    return null;

  }



  function setLiveEnricher(fn) {

    liveEnricher = typeof fn === "function" ? fn : null;

  }



  function applyPaymentToExportRow(payId, newPaid, newStatus) {

    var rows = payRowsSource();

    for (var i = 0; i < rows.length; i++) {

      if (rows[i].payId === payId) {

        rows[i].paid = newPaid;

        var tot = parseMoney(rows[i].tot);

        if (tot != null) {

          rows[i].out = Math.max(0, tot - newPaid);

          if (rows[i].out <= 0.02) rows[i].st = "Paid";

          else rows[i].st = newStatus || "Outstanding";

        }

        break;

      }

    }

  }



  function recordPayment(opts) {

    opts = opts || {};

    var payId = String(opts.payId || "").trim();

    var amount = parseMoney(opts.amount);

    if (!payId || amount == null || amount <= 0) {

      return Promise.resolve({ ok: false, reason: "invalid" });

    }

    var getClient =

      typeof opts.getClient === "function"

        ? opts.getClient

        : function () {

            var box = global.__PORTAL_SUPABASE__;

            return box && box.client ? box.client : null;

          };

    var client = getClient();

    if (!client || !client.from) {

      return Promise.resolve({ ok: false, reason: "no-client" });

    }

    return client

      .from("client_payments")

      .select("id, amount, payment_status, data")

      .eq("id", payId)

      .maybeSingle()

      .then(function (res) {

        if (res.error) throw res.error;

        var row = res.data;

        if (!row) return { ok: false, reason: "not-found" };

        var data = row.data && typeof row.data === "object" ? Object.assign({}, row.data) : {};

        var prevPaid = parseMoney(data.Paid || data.paid || data["Amount paid"]) || 0;

        var newPaid = Math.round((prevPaid + amount) * 100) / 100;

        data.Paid = String(newPaid);

        data.paid = String(newPaid);

        var tot = parseMoney(row.amount);

        var status = String(row.payment_status || "");

        if (tot != null && newPaid >= tot - 0.02) status = "Paid";

        else if (!status || status.toLowerCase().indexOf("paid") === 0) status = "Outstanding";

        return client

          .from("client_payments")

          .update({ data: data, payment_status: status })

          .eq("id", payId)

          .select()

          .then(function (up) {

            if (up.error) throw up.error;

            if (!up.data || !up.data.length) return { ok: false, reason: "rls" };

            applyPaymentToExportRow(payId, newPaid, status);

            try {

              if (global.dispatchEvent && typeof CustomEvent === "function") {

                global.dispatchEvent(

                  new CustomEvent("portal:payments-updated", { detail: { id: payId } }),

                );

              }

            } catch (_e) {}

            return { ok: true, paid: newPaid, status: status };

          });

      });

  }



  global.PortalCommsOrderPayments = {

    normalizeInvRef: normalizeInvRef,

    payRowsForInvRef: payRowsForInvRef,

    buildPackFromPayRows: buildPackFromPayRows,

    resolvePack: resolvePack,

    recordPayment: recordPayment,

    parseMoney: parseMoney,

    parsePeriodNoteInstallments: parsePeriodNoteInstallments,

    ppRowForPayRow: ppRowForPayRow,

    setLiveEnricher: setLiveEnricher,

  };

})(typeof window !== "undefined" ? window : globalThis);


