/**
 * CFK-style Order detail — bridge Programme payments + funding into Ops comms "View Order".
 * Uses window.CLIENTS_PAYMENTS_PORTAL_SOURCE (xlsx export and/or live client_payments).
 */
(function (global) {
  "use strict";

  function payRowsSource() {
    var src = global.CLIENTS_PAYMENTS_PORTAL_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function parseMoney(v) {
    if (v == null || v === "" || v === "—" || v === "-") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    var n = parseFloat(String(v).replace(/[£,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
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

  function parseSessionCount(label) {
    var t = String(label || "").trim();
    if (!t || t === "—") return null;
    var m = t.match(/(\d+)/);
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

  function serviceCardFromPayRow(pr, invRef, idx) {
    var tot = parseMoney(pr.tot) || 0;
    var paid = paidAmountForRow(pr);
    var inv = String(pr.inv || invRef || "").trim() || invRef || "—";
    var ref =
      String(pr.payId || "").trim() ||
      inv.replace(/\s+/g, "-").toUpperCase() + "-" + String(idx);
    return {
      bookingRef: ref,
      programme: programmeFromService(pr.service),
      schedule: scheduleFromService(pr.service),
      venue: "—",
      sessionCount: parseSessionCount(pr.sessionsLabel) || 0,
      sessionDates: [],
      amount: tot,
      paid: paid,
      payId: pr.payId || null,
      fund: String(pr.fund || "").trim(),
      payMethod: String(pr.payMethod || "").trim(),
      periodNote: String(pr.periodNote || "").trim(),
      vat: String(pr.vat || "").trim(),
      costLabel: String(pr.costLabel || "").trim(),
      sheet: String(pr.sheet || "").trim(),
      live: !!pr.payId,
    };
  }

  function buildPackFromPayRows(rows, invRef) {
    if (!rows || !rows.length) return null;
    var parentName = String(rows[0].parent || "").trim() || "Carer";
    var services = rows.map(function (r, i) {
      return serviceCardFromPayRow(r, invRef, i);
    });
    return {
      parentName: parentName,
      services: services,
      source: rows[0].payId ? "client_payments" : "export",
      invRef: String(invRef || "").trim(),
    };
  }

  function resolvePack(orderRef, mockDemoByRef) {
    var key = String(orderRef || "").trim();
    if (!key) return null;
    var liveRows = payRowsForInvRef(key);
    if (liveRows.length) {
      var pack = buildPackFromPayRows(liveRows, key);
      if (pack) return pack;
    }
    if (mockDemoByRef && mockDemoByRef[key]) return Object.assign({ source: "demo" }, mockDemoByRef[key]);
    return null;
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
      typeof opts.getClient === "function" ? opts.getClient : function () {
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
  };
})(typeof window !== "undefined" ? window : globalThis);
