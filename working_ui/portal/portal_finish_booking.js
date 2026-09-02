/**
 * Parent finish-booking page (magic link after registration submit or admin resend).
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

  function isLocalHost() {
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (_e) {
      return false;
    }
  }

  /** Interactive walkthrough without a live Accept token. */
  function isDemoMode() {
    if (qs("demo") === "1") return true;
    // Local preview: open finish page without ?t= → auto demo so office can click through.
    if (isLocalHost() && !qs("t")) return true;
    return false;
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
    if (isDemoMode()) {
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
    // Mid-term join now (after 1 Sept): e.g. first Wednesday still ahead → 13 remaining.
    var remaining = 13;
    var today = new Date().toISOString().slice(0, 10);
    var termTotal = unit * termSessions;
    var payable = unit * remaining;
    function round2(n) {
      return Math.round(n * 100) / 100;
    }
    function quote(plan) {
      if (plan === "own_way") {
        var own = unit * 2 + 50;
        return {
          remaining_sessions: remaining,
          programme_total_gbp: own,
          invoice_total_gbp: own,
          first_due_gbp: own,
          first_due_date: today,
          schedule: [
            {
              amount_gbp: own,
              due_date: today,
              status: "pending",
              collect_via: "bank_transfer",
            },
          ],
          payment_method_hint: "bank_transfer",
          pro_rata_from: today,
        };
      }
      if (plan === "gocardless_monthly") {
        // After month 1st: bank remainder now + Oct/Nov/Dec on the 1st (equal split + £1.50 GC fee).
        var base = round2(payable / 4);
        var lastBase = round2(payable - base * 3);
        var schedule = [
          {
            seq: 1,
            label: "September 2026 remainder · bank transfer (due on booking day)",
            amount_gbp: base,
            due_date: today,
            status: "pending",
            collect_via: "bank_transfer",
          },
          {
            seq: 2,
            label: "Payment · October 2026 · GoCardless (1st)",
            amount_gbp: round2(base + 1.5),
            due_date: "2026-10-01",
            status: "pending",
            collect_via: "gocardless",
          },
          {
            seq: 3,
            label: "Payment · November 2026 · GoCardless (1st)",
            amount_gbp: round2(base + 1.5),
            due_date: "2026-11-01",
            status: "pending",
            collect_via: "gocardless",
          },
          {
            seq: 4,
            label: "Payment · December 2026 · GoCardless (1st)",
            amount_gbp: round2(lastBase + 1.5),
            due_date: "2026-12-01",
            status: "pending",
            collect_via: "gocardless",
          },
        ];
        var invTotal = round2(schedule.reduce(function (s, r) {
          return s + r.amount_gbp;
        }, 0));
        return {
          remaining_sessions: remaining,
          programme_total_gbp: payable,
          invoice_total_gbp: invTotal,
          first_due_gbp: schedule[0].amount_gbp,
          first_due_date: today,
          schedule: schedule,
          payment_method_hint: "gocardless",
          pro_rata_from: today,
        };
      }
      if (plan === "flexi_bank") {
        var half = round2(payable / 2);
        var half2 = round2(payable - half);
        return {
          remaining_sessions: remaining,
          programme_total_gbp: payable,
          invoice_total_gbp: payable,
          first_due_gbp: half,
          first_due_date: today,
          schedule: [
            {
              label: "Autumn term · 1st half",
              amount_gbp: half,
              due_date: today,
              status: "pending",
              collect_via: "bank_transfer",
            },
            {
              label: "Autumn term · 2nd half",
              amount_gbp: half2,
              due_date: "2026-10-26",
              status: "pending",
              collect_via: "bank_transfer",
            },
          ],
          payment_method_hint: "bank_transfer",
          pro_rata_from: today,
        };
      }
      return {
        remaining_sessions: remaining,
        programme_total_gbp: payable,
        invoice_total_gbp: payable,
        first_due_gbp: payable,
        first_due_date: today,
        schedule: [
          {
            amount_gbp: payable,
            due_date: today,
            status: "pending",
            collect_via: "bank_transfer",
          },
        ],
        payment_method_hint: "bank_transfer",
        pro_rata_from: today,
      };
    }
    var activeQuote =
      demoState.pay_plan && quote(demoState.pay_plan)
        ? quote(demoState.pay_plan)
        : null;
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
          first_due_date: today,
          schedule: [
            {
              amount_gbp: unit,
              due_date: today,
              status: "pending",
            },
          ],
          payment_method_hint: "stripe",
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
                  : (activeQuote && activeQuote.invoice_total_gbp) || payable,
              amount_paid_gbp: 0,
              payment_status: "unpaid",
              payment_schedule:
                demoState.booking_scope === "trial_session"
                  ? [
                      {
                        amount_gbp: unit,
                        due_date: today,
                        status: "pending",
                      },
                    ]
                  : (activeQuote && activeQuote.schedule) || [
                      {
                        amount_gbp: payable,
                        due_date: today,
                        status: "pending",
                      },
                    ],
              payment_method_hint:
                demoState.pay_plan === "gocardless_monthly"
                  ? "gocardless"
                  : demoState.pay_plan === "stripe_instant"
                    ? "stripe"
                    : "bank_transfer",
              gocardless_url:
                demoState.pay_plan === "gocardless_monthly"
                  ? "https://example.com/gocardless-demo"
                  : null,
              due_date: today,
            }
          : null,
      bank:
        demoState.pay_plan === "stripe_instant"
          ? null
          : {
              payee_name: "clubSENsational (demo)",
              sort_code: "00-00-00",
              account_number: "00000000",
            },
      transfer_reference:
        demoState.pay_plan === "stripe_instant" ? null : "MALAZ-DEMO",
      gocardless_url:
        demoState.pay_plan === "gocardless_monthly" ? "https://example.com/gocardless-demo" : null,
      checkout_url:
        demoState.pay_plan === "stripe_instant"
          ? "https://example.com/stripe-checkout-demo"
          : null,
      stripe_checkout:
        demoState.pay_plan === "stripe_instant"
          ? {
              checkout_url: "https://example.com/stripe-checkout-demo",
              charge_gbp: round2(unit * 1.029 + 0.2),
              fee_gbp: round2(unit * 0.029 + 0.2),
            }
          : null,
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
      var stripeTrial = demoState.pay_plan === "stripe_instant";
      return Promise.resolve({
        ok: true,
        invoice: p.invoice,
        bank: stripeTrial ? null : p.bank,
        transfer_reference: stripeTrial ? null : p.transfer_reference,
        gocardless_url: p.gocardless_url,
        checkout_url: p.checkout_url || null,
        stripe_checkout: p.stripe_checkout || null,
        pay_hold_minutes: 30,
        pay_hold_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
    if (action === "confirm_paid") {
      demoState.status = "awaiting_office_payment";
      return Promise.resolve({
        ok: true,
        completed: false,
        awaiting_office: true,
        status: "awaiting_office_payment",
        message:
          "Thanks — payment reported. The office will confirm it and then send your Parent Portal PIN.",
      });
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
    var rem =
      q.remaining_sessions != null
        ? String(q.remaining_sessions) + " remaining sessions"
        : "remaining sessions";
    if (plan === "gocardless_monthly") {
      var firstVia =
        (q.schedule &&
          q.schedule[0] &&
          String(q.schedule[0].collect_via || "").toLowerCase()) ||
        "";
      if (firstVia === "bank_transfer" || firstVia === "bank") {
        return (
          "Today " +
          money(q.first_due_gbp) +
          " by bank · then GoCardless on later 1sts (" +
          rem +
          " · term " +
          money(q.invoice_total_gbp) +
          ")"
        );
      }
    }
    return (
      money(q.first_due_gbp) +
      " due first (" +
      rem +
      " · total " +
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

  function startTrialWithPlan(data, notice, plan) {
    var funding = data.funding_code || "privately_funded";
    var payPlan = plan === "one_off_bank" ? "one_off_bank" : "stripe_instant";
    data.booking_scope = "trial_session";
    data.pay_plan = payPlan;
    showNotice(
      notice,
      payPlan === "one_off_bank"
        ? "Preparing bank transfer details…"
        : "Preparing card / Apple Pay…",
      "",
    );
    return api("save_choices", {
      funding_code: funding,
      booking_scope: "trial_session",
      pay_plan: payPlan,
    })
      .then(function () {
        return api("create_invoice", {
          funding_code: funding,
          booking_scope: "trial_session",
          pay_plan: payPlan,
        });
      })
      .then(function (out) {
        data.invoice = out.invoice || data.invoice;
        data.bank = out.bank || data.bank;
        data.transfer_reference = out.transfer_reference || data.transfer_reference;
        data.checkout_url =
          out.checkout_url ||
          (out.stripe_checkout && out.stripe_checkout.checkout_url) ||
          null;
        data.stripe_checkout = out.stripe_checkout || null;
        data.pay_hold_minutes = out.pay_hold_minutes;
        data.pay_hold_expires_at = out.pay_hold_expires_at;
        data.status = "awaiting_payment";
        showInvoice(data);
        if (payPlan === "stripe_instant" && data.checkout_url && !isDemoMode()) {
          global.location.href = data.checkout_url;
          return;
        }
        showNotice(
          notice,
          payPlan === "one_off_bank"
            ? "Trial invoice ready — transfer within 30 minutes, then email or WhatsApp the office (photo welcome)."
            : "Trial ready — pay now with card or Apple Pay to confirm your session.",
          "ok",
        );
      });
  }

  function showTrialPayChannel(data) {
    var channelBox = document.getElementById("fbPayChannelBox");
    var planBox = document.getElementById("fbPayPlanBox");
    if (channelBox) channelBox.hidden = false;
    if (planBox) planBox.hidden = true;
    var intro = document.querySelector("#fbStepPay > .muted");
    if (intro) {
      intro.textContent =
        "Trial session — choose how to pay. Your place is held for 30 minutes.";
    }
    var bank = document.querySelector('input[name="pay_channel"][value="bank_transfer"]');
    var gc = document.querySelector('input[name="pay_channel"][value="gocardless"]');
    var own = document.getElementById("fbOwnWayChannel");
    var stripeLabel = document.getElementById("fbTrialStripeChannel");
    if (own) own.hidden = true;
    if (gc) {
      var gcChoice = gc.closest("label");
      if (gcChoice) gcChoice.hidden = true;
    }
    if (bank) {
      bank.checked = false;
      var bankHint = bank.closest("label") && bank.closest("label").querySelector(".hint");
      if (bankHint) {
        bankHint.innerHTML =
          "Pay <strong>£" +
          esc(
            String(
              (data.pricing && data.pricing.trial_session_gbp) ||
                data.unit_price_gbp ||
                "—",
            ),
          ) +
          "</strong> by bank transfer within <strong>30 minutes</strong>. Then email or WhatsApp the office (photo/screenshot of the transfer welcome) so they can confirm.";
      }
    }
    if (!stripeLabel) {
      var host = document.getElementById("fbPayChannelBox");
      if (host && bank) {
        var lbl = document.createElement("label");
        lbl.className = "choice";
        lbl.id = "fbTrialStripeChannel";
        lbl.innerHTML =
          '<input type="radio" name="pay_channel" value="stripe_instant" checked />' +
          "<strong>Card / Apple Pay</strong>" +
          '<span class="hint">Pay now (small card fee so we receive the session price in full). Confirms the trial when payment succeeds.</span>';
        host.insertBefore(lbl, bank.closest("label"));
      }
    } else {
      stripeLabel.hidden = false;
      var stripeInput = stripeLabel.querySelector('input[name="pay_channel"]');
      if (stripeInput) stripeInput.checked = true;
    }
  }

  function restoreTermPayChannel() {
    var intro = document.querySelector("#fbStepPay > .muted");
    if (intro) {
      intro.textContent =
        "First choose how you pay. Then pick the plan for that method.";
    }
    var gc = document.querySelector('input[name="pay_channel"][value="gocardless"]');
    if (gc) {
      var gcChoice = gc.closest("label");
      if (gcChoice) gcChoice.hidden = false;
    }
    var stripeLabel = document.getElementById("fbTrialStripeChannel");
    if (stripeLabel) stripeLabel.hidden = true;
    var bank = document.querySelector('input[name="pay_channel"][value="bank_transfer"]');
    if (bank) {
      bank.checked = true;
      var bankHint = bank.closest("label") && bank.closest("label").querySelector(".hint");
      if (bankHint) {
        bankHint.innerHTML =
          "You must pay the first amount within <strong>30 minutes</strong> or the place goes live again. After you transfer, email or WhatsApp the office (photo/screenshot welcome) so they can confirm.";
      }
    }
  }

  function setStep(name) {
    ["fbStepFunding", "fbStepScope", "fbStepPay", "fbStepInvoice", "fbStepAwaitingOffice", "fbStepDone"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
      },
    );
    var show = document.getElementById(name);
    if (show) show.hidden = false;
  }

  function showPayChannel(data) {
    if (data.booking_scope === "trial_session") {
      showTrialPayChannel(data);
      return;
    }
    restoreTermPayChannel();
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

  function formatUkShortDate(iso) {
    var s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var parts = s.split("-").map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  /** Pay-hold expiry for parents: today + time only (no calendar date). */
  function formatHoldExpiryTime(iso) {
    var s = String(iso || "").trim();
    if (!s) return "";
    var m = s.match(/T(\d{2}:\d{2})/);
    if (m) return "today " + m[1] + " UTC";
    var d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      var hh = String(d.getUTCHours()).padStart(2, "0");
      var mm = String(d.getUTCMinutes()).padStart(2, "0");
      return "today " + hh + ":" + mm + " UTC";
    }
    return "";
  }

  function plansForChannel(channel, data) {
    if (channel === "gocardless") {
      var gcQ = (data && data.quotes && data.quotes.gocardless_monthly) || null;
      var gcFirstVia =
        (gcQ &&
          gcQ.schedule &&
          gcQ.schedule[0] &&
          String(gcQ.schedule[0].collect_via || "").toLowerCase()) ||
        "";
      var gcBankNow =
        gcFirstVia === "bank_transfer" || gcFirstVia === "bank";
      return [
        {
          value: "gocardless_monthly",
          title: "GoCardless monthly",
          hint: gcBankNow
            ? "Only remaining sessions are billed. Today: pay this month by bank transfer, tell the office, then set up GoCardless. Later months collect on the 1st with every family (£1.50 per Direct Debit)."
            : "Only remaining sessions are billed. Set up Direct Debit now — collections on the 1st each month with every family (£1.50 per instalment).",
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
    var flexiQ = (data && data.quotes && data.quotes.flexi_bank) || null;
    var flexiDue = flexiQ && flexiQ.first_due_date ? String(flexiQ.first_due_date).slice(0, 10) : "";
    var today = new Date().toISOString().slice(0, 10);
    var flexiHint =
      flexiDue && flexiDue <= today
        ? "First half due now (the fixed term due date has already passed), second half mid-term — bank transfer."
        : flexiDue
          ? "First half due " +
            formatUkShortDate(flexiDue) +
            ", second half mid-term — bank transfer."
          : "Two instalments this term by bank transfer (first on the term due date, or now if that date has passed).";
    return [
      {
        value: "one_off_bank",
        title: "One-off payment (whole term)",
        hint: "Pay the full term amount now by bank transfer.",
      },
      {
        value: "flexi_bank",
        title: "Flexi (2 payments this term)",
        hint: flexiHint,
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
    host.innerHTML = plansForChannel(channel, data)
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
    if (data.status === "awaiting_office_payment") {
      setStep("fbStepAwaitingOffice");
      showNotice(
        notice,
        "Thanks — once the office confirms your transfer, your Parent Portal PIN is sent by email / WhatsApp.",
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
        if (data.pay_plan === "stripe_instant" || data.pay_plan === "one_off_bank") {
          if (data.invoice) {
            showInvoice(data);
          } else {
            setStep("fbStepPay");
            showPayChannel(data);
          }
        } else {
          setStep("fbStepPay");
          showPayChannel(data);
        }
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
        if (data.booking_scope === "trial_session") {
          var trialPlan =
            channel === "bank_transfer" || channel === "one_off_bank"
              ? "one_off_bank"
              : "stripe_instant";
          void startTrialWithPlan(data, notice, trialPlan).catch(function (err) {
            showNotice(notice, err.message || "Could not create trial invoice.", "error");
          });
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
            data.pay_hold_minutes = out.pay_hold_minutes;
            data.pay_hold_expires_at = out.pay_hold_expires_at;
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
    var checkoutUrl =
      data.checkout_url ||
      (data.stripe_checkout && data.stripe_checkout.checkout_url) ||
      "";
    var isTrial =
      data.booking_scope === "trial_session" ||
      data.pay_plan === "stripe_instant" ||
      (data.quotes && data.quotes.trial_one_off && data.quotes.trial_one_off.is_trial);
    var isTrialBank =
      isTrial &&
      data.pay_plan !== "stripe_instant" &&
      inv.payment_method_hint !== "stripe" &&
      (data.pay_plan === "one_off_bank" ||
        inv.payment_method_hint === "bank_transfer" ||
        (!checkoutUrl && data.bank));
    var isTrialStripe =
      isTrial &&
      !isTrialBank &&
      (data.pay_plan === "stripe_instant" ||
        checkoutUrl ||
        inv.payment_method_hint === "stripe");
    var firstVia = String((first && first.collect_via) || "").toLowerCase();
    var gcBankFirst =
      data.pay_plan === "gocardless_monthly" &&
      (firstVia === "bank_transfer" ||
        firstVia === "bank" ||
        /bank transfer/i.test(String((first && first.label) || "")));
    var html =
      '<p style="margin:0 0 8px"><strong>Invoice ' +
      esc(inv.invoice_number || "") +
      "</strong></p>" +
      '<p class="muted" style="margin:0 0 12px;overflow-wrap:break-word">First amount due: <strong>' +
      esc(money(firstAmt)) +
      "</strong>" +
      (gcBankFirst
        ? " <span>(Step 1: bank transfer today · Step 2: GoCardless)</span>"
        : "") +
      "</p>";

    if (
      gcUrl &&
      !gcBankFirst &&
      (data.pay_plan === "gocardless_monthly" || inv.payment_method_hint === "gocardless")
    ) {
      if (isDemoMode()) {
        html +=
          '<button type="button" class="btn btn--pri" id="fbConfirmPaid">Demo: I’ve paid — report to office</button>' +
          '<p class="muted" style="margin:10px 0 0">PIN is only sent after office confirms payment (not on this click).</p>';
      } else {
        var firstDueIso = first && first.due_date ? String(first.due_date).slice(0, 10) : "";
        var firstDueLabel = formatUkShortDate(firstDueIso) || "the 1st";
        html +=
          '<a class="btn btn--pri" href="' +
          esc(gcUrl) +
          '">Set up GoCardless</a>' +
          '<p class="muted" style="margin:10px 0 0;overflow-wrap:break-word">Direct Debit collections are on the <strong>1st of each month</strong> (same day as other families). First collection: <strong>' +
          esc(firstDueLabel) +
          "</strong>. After it clears, the office can confirm and we send your Parent Portal PIN.</p>";
      }
    } else if (isTrialStripe) {
      var holdMin =
        Number(data.pay_hold_minutes) ||
        (data.choices_json && Number(data.choices_json.pay_hold_minutes)) ||
        30;
      var holdExp =
        data.pay_hold_expires_at ||
        (data.choices_json && data.choices_json.pay_hold_expires_at) ||
        "";
      var holdLine = holdExp
        ? "Your place is held until <strong>" +
          esc(formatHoldExpiryTime(holdExp) || "the deadline") +
          "</strong> while you pay. If payment is not completed in time, the slot goes back on the Booking Portal."
        : "Pay now with card or Apple Pay. If payment is not completed in time, the slot is not booked.";
      var chargeNote =
        data.stripe_checkout && data.stripe_checkout.charge_gbp
          ? '<p class="muted" style="margin:0 0 10px">Total charged (incl. card fee): <strong>' +
            esc(money(data.stripe_checkout.charge_gbp)) +
            "</strong> — so we receive " +
            esc(money(firstAmt)) +
            " in full.</p>"
          : "";
      if (isDemoMode()) {
        html +=
          chargeNote +
          '<p class="notice notice--error" style="margin:0 0 12px" role="status">' +
          holdLine +
          "</p>" +
          '<a class="btn btn--pri" href="' +
          esc(checkoutUrl || "#") +
          '">Pay with card / Apple Pay</a>' +
          '<p class="muted" style="margin:10px 0 8px">Demo: Stripe checkout (no real charge). Or mark paid below.</p>' +
          '<button type="button" class="btn" id="fbConfirmPaid">Demo: paid with card</button>';
      } else if (checkoutUrl) {
        html +=
          chargeNote +
          '<p class="notice notice--error" style="margin:0 0 12px" role="status">' +
          holdLine +
          "</p>" +
          '<a class="btn btn--pri" id="fbStripePay" href="' +
          esc(checkoutUrl) +
          '">Pay with card / Apple Pay</a>' +
          '<p class="muted" style="margin:10px 0 0">Secure payment via Stripe. Your trial is confirmed only after payment succeeds.</p>';
      } else {
        html +=
          chargeNote +
          '<p class="notice notice--error" style="margin:0 0 12px" role="status">' +
          holdLine +
          "</p>" +
          '<button type="button" class="btn btn--pri" id="fbStripeRetry">Pay with card / Apple Pay</button>';
      }
    } else {
      var holdMin =
        Number(data.pay_hold_minutes) ||
        (data.choices_json && Number(data.choices_json.pay_hold_minutes)) ||
        30;
      var holdExp =
        data.pay_hold_expires_at ||
        (data.choices_json && data.choices_json.pay_hold_expires_at) ||
        "";
      var holdLine = holdExp
        ? "Place held until <strong>" +
          esc(formatHoldExpiryTime(holdExp) || "the deadline") +
          "</strong> (" +
          esc(String(holdMin)) +
          " minutes). If unpaid by then, the seat returns to the Booking Portal."
        : "Place held for <strong>" +
          esc(String(holdMin)) +
          " minutes</strong> only. If unpaid by then, the seat returns to the Booking Portal.";
      var paidMsg =
        "Hi, I have paid for " +
        (data.participant_name || "my child") +
        " (" +
        (inv.invoice_number || "") +
        "). Amount: £" +
        (firstAmt != null ? firstAmt : "") +
        ". Reference: " +
        (data.transfer_reference || data.participant_name || "") +
        ". Thank you.";
      var mailSub = encodeURIComponent(
        "Payment made — " + (data.participant_name || inv.invoice_number || "booking"),
      );
      var mailBody = encodeURIComponent(
        "Hi,\n\nI have paid the first instalment for " +
          (data.participant_name || "my child") +
          " (" +
          (inv.invoice_number || "") +
          ").\nAmount: £" +
          (firstAmt != null ? firstAmt : "") +
          "\nReference: " +
          (data.transfer_reference || data.participant_name || "") +
          "\n\n(I can attach a photo/screenshot of the transfer if helpful.)\n\nThanks",
      );
      var waHref =
        "https://wa.me/447592558671?text=" + encodeURIComponent(paidMsg);
      var step1Title = gcBankFirst
        ? '<p style="margin:0 0 8px;font-weight:800;color:var(--ink);overflow-wrap:break-word">Step 1 — Bank transfer today + tell the office</p>'
        : "";
      html +=
        step1Title +
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
        '<p class="notice notice--error" style="margin:0 0 12px" role="status">' +
        holdLine +
        "</p>" +
        '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">After you transfer, <strong>WhatsApp or email the office</strong> saying you have paid' +
        (isTrialBank ? " (include reference + amount)" : "") +
        ". A photo/screenshot is helpful but optional.</p>" +
        '<p style="margin:0 0 8px;display:flex;flex-wrap:wrap;gap:8px">' +
        '<a class="btn btn--pri" href="' +
        esc(waHref) +
        '" target="_blank" rel="noopener noreferrer" style="width:auto;flex:1 1 140px">WhatsApp the office</a>' +
        '<a class="btn btn--office" href="mailto:info@clubsensational.org?subject=' +
        mailSub +
        "&body=" +
        mailBody +
        '" style="width:auto;flex:1 1 140px">EMAIL THE OFFICE</a>' +
        "</p>";
      if (gcBankFirst && gcUrl) {
        html +=
          '<div style="margin:18px 0 0;padding-top:14px;border-top:1px solid var(--line);min-width:0">' +
          '<p style="margin:0 0 6px;font-weight:800;color:var(--ink);overflow-wrap:break-word">Step 2 — Set up GoCardless</p>' +
          '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">After Step 1, set up Direct Debit so later months collect on the <strong>1st</strong> with every family.</p>' +
          '<a class="btn btn--pri" href="' +
          esc(gcUrl) +
          '"' +
          (isDemoMode() ? ' target="_blank" rel="noopener noreferrer"' : "") +
          ">Set up GoCardless</a>" +
          "</div>";
      }
    }
    if (host) host.innerHTML = html;
    var stripeRetry = document.getElementById("fbStripeRetry");
    if (stripeRetry) {
      stripeRetry.onclick = function () {
        showNotice(document.getElementById("fbNotice"), "Opening payment…", "");
        void api("create_stripe_checkout", { booking_scope: "trial_session" })
          .then(function (out) {
            if (out.checkout_url) global.location.href = out.checkout_url;
          })
          .catch(function (err) {
            showNotice(
              document.getElementById("fbNotice"),
              err.message || "Could not start payment.",
              "error",
            );
          });
      };
    }
    // Demo-only: confirm_paid is disabled in production API.
    var confirmPaid = document.getElementById("fbConfirmPaid");
    if (confirmPaid && isDemoMode()) {
      confirmPaid.onclick = function () {
        demoState.status = "awaiting_office_payment";
        setStep("fbStepAwaitingOffice");
        showNotice(
          document.getElementById("fbNotice"),
          "Demo — pretend message sent. Office would confirm, then PIN.",
          "ok",
        );
      };
    }
  }

  function ensureDemoChrome() {
    if (!isDemoMode()) return;
    var page = document.querySelector(".page");
    if (!page || document.getElementById("fbDemoChrome")) return;
    var bar = document.createElement("div");
    bar.id = "fbDemoChrome";
    bar.style.cssText =
      "margin:0 0 14px;padding:12px 14px;border-radius:14px;background:#173247;color:#fff;min-width:0;overflow-wrap:break-word";
    bar.innerHTML =
      "<div style=\"font-weight:800;margin:0 0 4px\">DEMO — Finish booking after Accept</div>" +
      "<div style=\"font-size:.88rem;opacity:.92;margin:0 0 10px\">" +
      "Office accepted the registration → parent opens this link. Choose funding, booking length, payment, then pay. No real invoice." +
      "</div>" +
      '<button type="button" id="fbDemoRestart" class="btn" style="background:#fff;color:#173247;width:auto;min-width:0;padding:8px 14px">Restart from step 1</button>';
    page.insertBefore(bar, page.firstChild);
    var restart = document.getElementById("fbDemoRestart");
    if (restart) {
      restart.onclick = function () {
        try {
          var u = new URL(global.location.href);
          u.searchParams.set("demo", "1");
          u.searchParams.delete("t");
          u.searchParams.delete("gc");
          global.location.href = u.pathname + "?" + u.searchParams.toString();
        } catch (_e) {
          global.location.href = "/parent_finish_booking.html?demo=1";
        }
      };
    }
  }

  function boot() {
    var notice = document.getElementById("fbNotice");
    ensureDemoChrome();
    if (isDemoMode()) {
      showNotice(
        notice,
        "Demo ready — pick each option and Continue to walk the parent flow.",
        "ok",
      );
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
        if (qs("stripe") === "1" && data.status === "awaiting_payment") {
          showNotice(
            notice,
            "Payment received — confirming your trial. If your PIN is not here in a minute, refresh this page.",
            "ok",
          );
        } else if (qs("stripe_cancel") === "1") {
          showNotice(
            notice,
            "Payment was not completed. Your slot is not booked until you pay with card / Apple Pay.",
            "error",
          );
        } else if (qs("gc") === "1" && data.status === "awaiting_payment") {
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
