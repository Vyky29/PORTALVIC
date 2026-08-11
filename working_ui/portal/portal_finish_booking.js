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
    if (qs("demo") === "1") {
      return demoApi(action, extra || {});
    }
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

  var demoState = {
    status: "pending",
    funding_code: null,
    booking_scope: null,
    pay_plan: null,
  };

  function demoPayload() {
    var unit = 50;
    var termSessions = 14;
    var remaining = 14;
    var termTotal = unit * termSessions;
    var payable = unit * remaining;
    function quote(plan) {
      if (plan === "own_way") {
        var own = unit * 2 + 50;
        return {
          remaining_sessions: remaining,
          programme_total_gbp: own,
          invoice_total_gbp: own,
          first_due_gbp: own,
          first_due_date: new Date().toISOString().slice(0, 10),
          schedule: [{ amount_gbp: own, due_date: new Date().toISOString().slice(0, 10), status: "pending" }],
          payment_method_hint: "bank_transfer",
        };
      }
      var first =
        plan === "gocardless_monthly"
          ? Math.round((payable / 3) * 100) / 100 + 1.5
          : plan === "flexi_bank"
            ? Math.round((payable / 2) * 100) / 100
            : payable;
      return {
        remaining_sessions: remaining,
        programme_total_gbp: payable,
        invoice_total_gbp: plan === "gocardless_monthly" ? payable + 4.5 : payable,
        first_due_gbp: first,
        first_due_date: new Date().toISOString().slice(0, 10),
        schedule: [{ amount_gbp: first, due_date: new Date().toISOString().slice(0, 10), status: "pending" }],
        payment_method_hint: plan === "gocardless_monthly" ? "gocardless" : "bank_transfer",
      };
    }
    return {
      ok: true,
      status: demoState.status,
      funding_code: demoState.funding_code,
      booking_scope: demoState.booking_scope,
      pay_plan: demoState.pay_plan,
      participant_name: "Mhd Malaz Bouz Alasal (demo)",
      parent_name: "Ahmad Bouz Alasal",
      slot: {
        service_name: "Aquatic Activity",
        venue: "Acton",
        day: "Wednesday",
        time: "4.00 – 4.30",
        slot_id: "demo-aquatic-acton-wed",
      },
      term: "autumn",
      term_label: "Autumn",
      unit_price_gbp: unit,
      pricing: {
        unit_price_gbp: unit,
        term: "autumn",
        term_label: "Autumn",
        term_sessions: termSessions,
        term_total_gbp: termTotal,
        remaining_sessions: remaining,
        payable_term_gbp: payable,
      },
      quotes: {
        gocardless_monthly: quote("gocardless_monthly"),
        flexi_bank: quote("flexi_bank"),
        one_off_bank: quote("one_off_bank"),
        own_way: quote("own_way"),
        trial_one_off: {
          remaining_sessions: 1,
          programme_total_gbp: unit,
          invoice_total_gbp: unit,
          first_due_gbp: unit,
          first_due_date: new Date().toISOString().slice(0, 10),
          schedule: [
            {
              amount_gbp: unit,
              due_date: new Date().toISOString().slice(0, 10),
              status: "pending",
            },
          ],
          payment_method_hint: "bank_transfer",
          is_trial: true,
        },
      },
      invoice:
        demoState.status === "awaiting_payment" || demoState.status === "completed"
          ? {
              id: "demo-inv",
              invoice_number: "INV-P-DEMO",
              amount_gbp:
                demoState.booking_scope === "trial_session"
                  ? unit
                  : (demoState.pay_plan && quote(demoState.pay_plan).invoice_total_gbp) || payable,
              amount_paid_gbp: 0,
              payment_status: "unpaid",
              payment_schedule: [
                {
                  amount_gbp:
                    demoState.booking_scope === "trial_session"
                      ? unit
                      : (demoState.pay_plan && quote(demoState.pay_plan).first_due_gbp) || payable,
                  due_date: new Date().toISOString().slice(0, 10),
                  status: "pending",
                },
              ],
              payment_method_hint:
                demoState.pay_plan === "gocardless_monthly" ? "gocardless" : "bank_transfer",
              gocardless_url:
                demoState.pay_plan === "gocardless_monthly" ? "https://example.com/gocardless-demo" : null,
              due_date: new Date().toISOString().slice(0, 10),
            }
          : null,
      bank: {
        payee_name: "clubSENsational (demo)",
        sort_code: "00-00-00",
        account_number: "00000000",
      },
      transfer_reference: "MALAZ-DEMO",
      gocardless_url:
        demoState.pay_plan === "gocardless_monthly" ? "https://example.com/gocardless-demo" : null,
      booking_kind: demoState.booking_scope === "trial_session" ? "trial" : "term",
      is_trial_intent: demoState.booking_scope === "trial_session",
      completed: demoState.status === "completed",
    };
  }

  function demoApi(action, extra) {
    if (action === "load") {
      return Promise.resolve(demoPayload());
    }
    if (action === "save_choices") {
      if (extra.funding_code) demoState.funding_code = extra.funding_code;
      if (extra.booking_scope) demoState.booking_scope = extra.booking_scope;
      if (extra.pay_plan) {
        demoState.pay_plan = extra.pay_plan;
        demoState.status = "choices_saved";
      } else if (extra.booking_scope) {
        demoState.status = "scope_saved";
      } else {
        demoState.status = "funding_saved";
      }
      return Promise.resolve({
        ok: true,
        status: demoState.status,
        funding_code: demoState.funding_code,
        booking_scope: demoState.booking_scope,
        pay_plan: demoState.pay_plan,
      });
    }
    if (action === "create_invoice") {
      demoState.funding_code = extra.funding_code || demoState.funding_code;
      demoState.booking_scope = extra.booking_scope || demoState.booking_scope;
      demoState.pay_plan = extra.pay_plan || demoState.pay_plan;
      demoState.status = "awaiting_payment";
      var p = demoPayload();
      return Promise.resolve({
        ok: true,
        invoice: p.invoice,
        bank: p.bank,
        transfer_reference: p.transfer_reference,
        gocardless_url: p.gocardless_url,
      });
    }
    if (action === "confirm_paid") {
      demoState.status = "completed";
      return Promise.resolve({ ok: true, status: "completed", completed: true });
    }
    return Promise.reject(new Error("demo_unknown_action"));
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
    var p = data.pricing || {};
    var unit = p.unit_price_gbp != null ? p.unit_price_gbp : data.unit_price_gbp;
    var termSessions = p.term_sessions;
    var termTotal = p.term_total_gbp;
    var remaining = p.remaining_sessions;
    var payable = p.payable_term_gbp;
    var termLabel = p.term_label || data.term_label || data.term || "Term";

    var priceRows = "";
    if (unit != null || termSessions != null || termTotal != null) {
      priceRows =
        '<div class="card-inner" style="margin-top:10px">' +
        "<div><strong>Price per session</strong> " +
        esc(money(unit)) +
        "</div>" +
        "<div><strong>Sessions this term</strong> " +
        esc(String(termSessions != null ? termSessions : "—")) +
        " · " +
        esc(String(termLabel)) +
        "</div>" +
        "<div><strong>Price per term</strong> " +
        esc(money(termTotal)) +
        "</div>";
      if (
        remaining != null &&
        termSessions != null &&
        Number(remaining) !== Number(termSessions)
      ) {
        priceRows +=
          '<div class="muted" style="margin-top:6px">Payable from today: ' +
          esc(String(remaining)) +
          " sessions · " +
          esc(money(payable)) +
          "</div>";
      }
      priceRows += "</div>";
    }

    host.innerHTML =
      "<strong>" +
      esc(data.participant_name || "Participant") +
      "</strong>" +
      '<div class="muted" style="margin-top:6px;overflow-wrap:break-word">' +
      esc(
        [s.service_name, s.venue, s.day, s.time].filter(Boolean).join(" · ") ||
          "Accepted place",
      ) +
      "</div>" +
      priceRows;
  }

  function quoteBlurb(data, plan) {
    var q = (data.quotes && data.quotes[plan]) || null;
    if (!q) return "";
    if (plan === "own_way") {
      return (
        money(q.first_due_gbp) +
        " due now (2 sessions prepaid + £50 admin · top up as you go)"
      );
    }
    if (plan === "trial_one_off" || q.is_trial) {
      return money(q.first_due_gbp) + " due now (1 trial session)";
    }
    return (
      money(q.first_due_gbp) +
      " due first (" +
      esc(String(q.remaining_sessions || "—")) +
      " sessions · total " +
      money(q.invoice_total_gbp) +
      ")"
    );
  }

  function preselectScope(data) {
    var preferred =
      data.booking_scope ||
      (data.is_trial_intent || data.booking_kind === "trial"
        ? "trial_session"
        : "");
    if (!preferred) return;
    var input = document.querySelector(
      'input[name="booking_scope"][value="' + preferred + '"]',
    );
    if (input) input.checked = true;
  }

  function startTrialPayNow(data, notice) {
    var funding = data.funding_code || "privately_funded";
    data.booking_scope = "trial_session";
    data.pay_plan = "one_off_bank";
    showNotice(notice, "Creating trial invoice…", "");
    return api("save_choices", {
      funding_code: funding,
      booking_scope: "trial_session",
      pay_plan: "one_off_bank",
    })
      .then(function () {
        return api("create_invoice", {
          funding_code: funding,
          booking_scope: "trial_session",
          pay_plan: "one_off_bank",
        });
      })
      .then(function (out) {
        data.invoice = out.invoice || data.invoice;
        data.bank = out.bank || data.bank;
        data.status = "awaiting_payment";
        showInvoice(data);
        showNotice(
          notice,
          "Trial invoice ready — pay now to confirm your session.",
          "ok",
        );
      });
  }

  function setStep(name) {
    ["fbStepFunding", "fbStepScope", "fbStepPay", "fbStepInvoice", "fbStepDone"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
      },
    );
    var show = document.getElementById(name);
    if (show) show.hidden = false;
  }

  function showPayChannel(data) {
    var channelBox = document.getElementById("fbPayChannelBox");
    var planBox = document.getElementById("fbPayPlanBox");
    if (channelBox) channelBox.hidden = false;
    if (planBox) planBox.hidden = true;
    var own = document.getElementById("fbOwnWayChannel");
    if (own) {
      own.hidden = data.funding_code === "la_direct_payments";
      if (own.hidden) {
        var checked = document.querySelector('input[name="pay_channel"]:checked');
        if (checked && checked.value === "own_way") {
          var bank = document.querySelector('input[name="pay_channel"][value="bank_transfer"]');
          if (bank) bank.checked = true;
        }
      }
    }
  }

  function plansForChannel(channel) {
    if (channel === "gocardless") {
      return [
        {
          value: "gocardless_monthly",
          title: "GoCardless monthly",
          hint:
            "First payment on booking day, then the 1st of each remaining month this term. £1.50 per instalment.",
        },
      ];
    }
    if (channel === "own_way") {
      return [
        {
          value: "own_way",
          title: "Own way — 2 sessions prepaid + £50 / term",
          hint:
            "Pay the minimum now to hold the place. Keep 2 sessions prepaid and top up as you go. Not a full-term invoice up front.",
        },
      ];
    }
    return [
      {
        value: "one_off_bank",
        title: "One-off payment (whole term)",
        hint: "Pay the full term amount now by bank transfer.",
      },
      {
        value: "flexi_bank",
        title: "Flexi (2 payments this term)",
        hint: "Half now, half later this term — fixed due dates, bank transfer.",
      },
    ];
  }

  function showPayPlans(data, channel) {
    var channelBox = document.getElementById("fbPayChannelBox");
    var planBox = document.getElementById("fbPayPlanBox");
    var intro = document.getElementById("fbPayPlanIntro");
    var host = document.getElementById("fbPayPlanChoices");
    if (channelBox) channelBox.hidden = true;
    if (planBox) planBox.hidden = false;
    data.pay_channel = channel;
    if (intro) {
      intro.textContent =
        channel === "bank_transfer"
          ? "Bank transfer — choose one-off or flexi:"
          : channel === "gocardless"
            ? "GoCardless — choose your collection plan:"
            : "Own way — confirm the prepaid minimum:";
    }
    if (!host) return;
    host.innerHTML = plansForChannel(channel)
      .map(function (p, i) {
        return (
          '<label class="choice">' +
          '<input type="radio" name="pay_plan" value="' +
          esc(p.value) +
          '"' +
          (i === 0 ? " checked" : "") +
          " />" +
          "<strong>" +
          esc(p.title) +
          "</strong>" +
          '<span class="hint">' +
          esc(p.hint) +
          (quoteBlurb(data, p.value) ? " · " + quoteBlurb(data, p.value) : "") +
          "</span>" +
          "</label>"
        );
      })
      .join("");
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

    if (
      (data.status === "scope_saved" || data.status === "choices_saved") &&
      data.funding_code &&
      data.booking_scope
    ) {
      if (data.booking_scope === "trial_session") {
        void startTrialPayNow(data, notice).catch(function (err) {
          showNotice(notice, err.message || "Could not create trial invoice.", "error");
          setStep("fbStepScope");
          preselectScope(data);
        });
      } else {
        setStep("fbStepPay");
        showPayChannel(data);
      }
    } else if (data.status === "funding_saved" && data.funding_code) {
      setStep("fbStepScope");
      preselectScope(data);
    } else {
      setStep("fbStepFunding");
    }

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
        showNotice(notice, "Saving…", "");
        void api("save_choices", { funding_code: funding })
          .then(function () {
            setStep("fbStepScope");
            preselectScope(data);
            showNotice(notice, "", "");
          })
          .catch(function (err) {
            showNotice(notice, err.message || "Could not save funding.", "error");
          });
      };
    }

    var scopeForm = document.getElementById("fbScopeForm");
    if (scopeForm) {
      preselectScope(data);
      scopeForm.onsubmit = function (ev) {
        ev.preventDefault();
        var scope = (scopeForm.querySelector('input[name="booking_scope"]:checked') || {})
          .value;
        var funding = data.funding_code || "privately_funded";
        if (!scope) {
          showNotice(notice, "Please choose booking length.", "error");
          return;
        }
        data.booking_scope = scope;
        if (scope === "trial_session") {
          void startTrialPayNow(data, notice).catch(function (err) {
            showNotice(notice, err.message || "Could not create trial invoice.", "error");
          });
          return;
        }
        showNotice(notice, "Saving…", "");
        void api("save_choices", {
          funding_code: funding,
          booking_scope: scope,
        })
          .then(function () {
            setStep("fbStepPay");
            showPayChannel(data);
            showNotice(notice, "", "");
          })
          .catch(function (err) {
            showNotice(notice, err.message || "Could not save booking length.", "error");
          });
      };
    }

    var channelNext = document.getElementById("fbPayChannelNext");
    if (channelNext) {
      channelNext.onclick = function () {
        var channel = (
          document.querySelector('input[name="pay_channel"]:checked') || {}
        ).value;
        if (!channel) {
          showNotice(notice, "Please choose a payment method.", "error");
          return;
        }
        if (channel === "own_way" && data.funding_code === "la_direct_payments") {
          showNotice(notice, "Own way is not available with LA funds.", "error");
          return;
        }
        showPayPlans(data, channel);
        showNotice(notice, "", "");
      };
    }
    var planBack = document.getElementById("fbPayPlanBack");
    if (planBack) {
      planBack.onclick = function () {
        showPayChannel(data);
        showNotice(notice, "", "");
      };
    }

    var payForm = document.getElementById("fbPayForm");
    if (payForm) {
      payForm.onsubmit = function (ev) {
        ev.preventDefault();
        var plan = (payForm.querySelector('input[name="pay_plan"]:checked') || {}).value;
        var funding = data.funding_code || "privately_funded";
        var scope = data.booking_scope;
        if (!scope) {
          showNotice(notice, "Please choose booking length first.", "error");
          setStep("fbStepScope");
          return;
        }
        if (!plan) {
          showNotice(notice, "Please choose a payment plan.", "error");
          return;
        }
        showNotice(notice, "Creating your invoice…", "");
        void api("save_choices", {
          funding_code: funding,
          booking_scope: scope,
          pay_plan: plan,
        })
          .then(function () {
            return api("create_invoice", {
              funding_code: funding,
              booking_scope: scope,
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

  function updatePayHints(_data) {
    /* Plan hints are rendered inside showPayPlans. */
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
    if (qs("demo") === "1") {
      showNotice(notice, "Demo mode — click through the full flow (no real booking).", "ok");
      void api("load")
        .then(function (data) {
          bind(data);
        })
        .catch(function (err) {
          showNotice(notice, err.message || "Demo failed.", "error");
        });
      return;
    }
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
