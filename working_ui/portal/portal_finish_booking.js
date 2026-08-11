/**
 * Parent finish-booking page after admin Accept.
 */
(function (global) {
  "use strict";

  var SUPABASE_URL =
    (global.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(/\/$/, "");
  var ANON = String(global.SUPABASE_ANON_KEY || "").trim();
  if (!ANON) {
    console.error("[finish-booking] missing SUPABASE_ANON_KEY");
  }

  function qs(name) {
    try {
      return new URLSearchParams(global.location.search).get(name) || "";
    } catch (_e) {
      return "";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return "£" + v.toFixed(2);
  }

  async function api(action, extra) {
    var token = qs("t");
    var body = Object.assign({ action: action, token: token }, extra || {});
    var res = await fetch(SUPABASE_URL + "/functions/v1/portal-booking-finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + ANON,
        apikey: ANON,
      },
      body: JSON.stringify(body),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      var err = (j && j.error) || "request_failed";
      var e = new Error(err);
      e.code = err;
      e.payload = j;
      throw e;
    }
    return j;
  }

  function showNotice(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "notice" + (kind === "ok" ? " notice--ok" : kind === "error" ? " notice--error" : "");
  }

  function renderSlot(data) {
    var host = document.getElementById("fbSlot");
    if (!host || !data) return;
    var s = data.slot || {};
    host.innerHTML =
      "<strong>" +
      esc(data.participant_name || "Participant") +
      "</strong>" +
      '<div class="muted" style="margin-top:6px;overflow-wrap:break-word">' +
      esc(
        [s.service_name, s.venue, s.day, s.time].filter(Boolean).join(" · ") ||
          "Accepted place",
      ) +
      "</div>";
  }

  function quoteBlurb(data, plan) {
    var q = (data.quotes && data.quotes[plan]) || null;
    if (!q) return "";
    return (
      money(q.first_due_gbp) +
      " due first (" +
      esc(String(q.remaining_sessions || "—")) +
      " sessions · total " +
      money(q.invoice_total_gbp) +
      ")"
    );
  }

  function setStep(name) {
    ["fbStepFunding", "fbStepPay", "fbStepInvoice", "fbStepDone"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var show = document.getElementById(name);
    if (show) show.hidden = false;
  }

  function bind(data) {
    renderSlot(data);
    var notice = document.getElementById("fbNotice");

    if (data.completed || data.status === "completed") {
      setStep("fbStepDone");
      showNotice(
        notice,
        "Booking complete. Check email / WhatsApp for your Parent Portal PIN.",
        "ok",
      );
      return;
    }
    if (data.status === "awaiting_payment" && data.invoice) {
      showInvoice(data);
      return;
    }

    setStep("fbStepFunding");

    var fundForm = document.getElementById("fbFundingForm");
    if (fundForm) {
      fundForm.onsubmit = function (ev) {
        ev.preventDefault();
        var funding = (fundForm.querySelector('input[name="funding"]:checked') || {}).value;
        if (!funding) {
          showNotice(notice, "Please choose how you fund sessions.", "error");
          return;
        }
        data.funding_code = funding;
        data.pay_plan = null;
        setStep("fbStepPay");
        updatePayHints(data);
        showNotice(notice, "", "");
      };
    }

    var payForm = document.getElementById("fbPayForm");
    if (payForm) {
      payForm.onsubmit = function (ev) {
        ev.preventDefault();
        var plan = (payForm.querySelector('input[name="pay_plan"]:checked') || {}).value;
        var funding = data.funding_code || "privately_funded";
        if (!plan) {
          showNotice(notice, "Please choose a payment method.", "error");
          return;
        }
        showNotice(notice, "Creating your invoice…", "");
        void api("save_choices", {
          funding_code: funding,
          pay_plan: plan,
        })
          .then(function () {
            return api("create_invoice", {
              funding_code: funding,
              pay_plan: plan,
            });
          })
          .then(function (out) {
            data.invoice = out.invoice;
            data.bank = out.bank;
            data.transfer_reference = out.transfer_reference;
            data.gocardless_url = out.gocardless_url;
            data.status = "awaiting_payment";
            data.pay_plan = plan;
            showInvoice(data);
            showNotice(notice, "", "");
          })
          .catch(function (err) {
            showNotice(notice, err.message || "Could not create invoice.", "error");
          });
      };
    }
  }

  function updatePayHints(data) {
    ["gocardless_monthly", "flexi_bank", "one_off_bank"].forEach(function (plan) {
      var el = document.querySelector('[data-plan-hint="' + plan + '"]');
      if (el) el.textContent = quoteBlurb(data, plan);
    });
  }

  function showInvoice(data) {
    setStep("fbStepInvoice");
    updatePayHints(data);
    var inv = data.invoice || {};
    var host = document.getElementById("fbInvoiceBox");
    var first =
      (Array.isArray(inv.payment_schedule) &&
        inv.payment_schedule.find(function (r) {
          return String(r.status || "pending").toLowerCase() !== "paid";
        })) ||
      (inv.payment_schedule && inv.payment_schedule[0]) ||
      null;
    var firstAmt = first && first.amount_gbp != null ? first.amount_gbp : inv.amount_gbp;
    var bank = data.bank || {};
    var gcUrl = data.gocardless_url || inv.gocardless_url || "";
    var html =
      '<p style="margin:0 0 8px"><strong>Invoice ' +
      esc(inv.invoice_number || "") +
      "</strong></p>" +
      '<p class="muted" style="margin:0 0 12px;overflow-wrap:break-word">First amount due: <strong>' +
      esc(money(firstAmt)) +
      "</strong></p>";

    if (gcUrl && (data.pay_plan === "gocardless_monthly" || inv.payment_method_hint === "gocardless")) {
      html +=
        '<a class="btn btn--pri" href="' +
        esc(gcUrl) +
        '">Set up GoCardless</a>' +
        '<p class="muted" style="margin:10px 0 0">After Direct Debit is set up and the first payment clears, we email / WhatsApp your Parent Portal PIN.</p>';
    } else {
      html +=
        '<div class="card-inner" style="margin:0 0 12px">' +
        "<div><strong>Payee</strong> " +
        esc(bank.payee_name || "clubSENsational") +
        "</div>" +
        "<div><strong>Sort code</strong> " +
        esc(bank.sort_code || "—") +
        "</div>" +
        "<div><strong>Account</strong> " +
        esc(bank.account_number || "—") +
        "</div>" +
        "<div><strong>Reference</strong> " +
        esc(data.transfer_reference || data.participant_name || "") +
        "</div>" +
        "</div>" +
        '<button type="button" class="btn btn--pri" id="fbConfirmPaid">I’ve paid the first instalment</button>' +
        '<p class="muted" style="margin:10px 0 0">We will send your Parent Portal PIN by email / WhatsApp once this is recorded.</p>';
    }
    if (host) host.innerHTML = html;

    var btn = document.getElementById("fbConfirmPaid");
    if (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        btn.textContent = "Confirming…";
        void api("confirm_paid", {})
          .then(function () {
            setStep("fbStepDone");
            showNotice(
              document.getElementById("fbNotice"),
              "Payment recorded. Check email / WhatsApp for your PIN.",
              "ok",
            );
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = "I’ve paid the first instalment";
            showNotice(document.getElementById("fbNotice"), err.message || "Failed", "error");
          });
      };
    }
  }

  function boot() {
    var notice = document.getElementById("fbNotice");
    if (!qs("t")) {
      showNotice(notice, "Missing booking link. Open the link from your email or WhatsApp.", "error");
      return;
    }
    showNotice(notice, "Loading…", "");
    void api("load")
      .then(function (data) {
        showNotice(notice, "", "");
        bind(data);
        if (qs("gc") === "1" && data.status === "awaiting_payment") {
          showNotice(
            notice,
            "If GoCardless is complete, refresh in a minute — we will send your PIN when the first payment clears.",
            "ok",
          );
        }
      })
      .catch(function (err) {
        var msg = err.code === "token_expired"
          ? "This link has expired. Ask the office to resend your finish-booking link."
          : err.code === "invalid_token"
            ? "This link is not valid. Ask the office to resend it."
            : err.message || "Could not load booking.";
        showNotice(notice, msg, "error");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
