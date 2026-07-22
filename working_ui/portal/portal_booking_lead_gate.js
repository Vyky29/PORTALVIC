/**
 * Booking Portal access gate — "Tell us who is looking" + email OTP.
 * Unlocks availability / Book after a verified lead session.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "clubsens_booking_lead_session_v1";
  var PRIVACY_VERSION = "2026-07-v1";
  var PREVIEW_MS = 5000;
  var state = {
    unlocked: false,
    lead: null,
    token: "",
    pendingEmail: "",
    timer: null,
  };

  function cfg() {
    var staticCfg = global.__PORTAL_STATIC__ || {};
    return {
      url: String(staticCfg.supabaseUrl || global.SUPABASE_URL || "").replace(/\/$/, ""),
      anon: String(staticCfg.supabaseAnonKey || global.SUPABASE_ANON_KEY || "").trim(),
    };
  }

  function loadStored() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.token) return null;
      if (j.expiresAt && Number(j.expiresAt) < Date.now()) {
        global.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return j;
    } catch (_e) {
      return null;
    }
  }

  function saveStored(token, expiresAt, lead) {
    state.token = String(token || "");
    state.lead = lead || null;
    try {
      global.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: state.token,
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : Date.now() + 14 * 86400000,
          lead: lead
            ? {
                first_name: lead.first_name,
                email: lead.email,
                mobile: lead.mobile,
              }
            : null,
        })
      );
    } catch (_e) {
      /* ignore */
    }
  }

  function clearStored() {
    state.token = "";
    state.lead = null;
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  async function api(path, body, headers) {
    var c = cfg();
    if (!c.url || !c.anon) throw new Error("missing_config");
    var res = await fetch(c.url + "/functions/v1/" + path, {
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.anon,
          apikey: c.anon,
        },
        headers || {}
      ),
      body: JSON.stringify(body || {}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    return { res: res, data: data };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setLocked(locked) {
    document.documentElement.classList.toggle("booking-gated", !!locked);
    document.body.classList.toggle("booking-gated", !!locked);
    state.unlocked = !locked;
  }

  function showModal(show) {
    var gate = $("bookingLeadGate");
    if (!gate) return;
    gate.hidden = !show;
    gate.setAttribute("aria-hidden", show ? "false" : "true");
    document.documentElement.classList.toggle("booking-gate-open", !!show);
    document.body.classList.toggle("booking-gate-open", !!show);
    if (show) {
      try {
        document.body.style.overflow = "hidden";
      } catch (_e) {
        /* ignore */
      }
    } else {
      try {
        document.body.style.overflow = "";
      } catch (_e2) {
        /* ignore */
      }
    }
  }

  function showStep(step) {
    var details = $("bookingLeadStepDetails");
    var otp = $("bookingLeadStepOtp");
    if (details) details.hidden = step !== "details";
    if (otp) otp.hidden = step !== "otp";
  }

  function setMsg(elId, text, isError) {
    var el = $(elId);
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("booking-gate__msg--error", !!isError);
    el.hidden = !text;
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = !!busy;
    if (label) btn.textContent = label;
  }

  async function validateSession() {
    var stored = loadStored();
    if (!stored || !stored.token) return false;
    try {
      var out = await api(
        "portal-booking-lead-session",
        { booking_status: "exploring_services" },
        { "x-booking-lead-session": stored.token }
      );
      if (out.res.ok && out.data && out.data.ok && out.data.lead) {
        saveStored(stored.token, out.data.expires_at || stored.expiresAt, out.data.lead);
        return true;
      }
    } catch (_e) {
      /* ignore */
    }
    clearStored();
    return false;
  }

  function unlock() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    setLocked(false);
    showModal(false);
  }

  function openGate() {
    setLocked(true);
    showStep("details");
    showModal(true);
    var first = $("bookingLeadFirstName");
    if (first) {
      try {
        first.focus();
      } catch (_e) {
        /* ignore */
      }
    }
  }

  async function submitDetails(ev) {
    if (ev) ev.preventDefault();
    var firstName = String(($("bookingLeadFirstName") && $("bookingLeadFirstName").value) || "").trim();
    var email = String(($("bookingLeadEmail") && $("bookingLeadEmail").value) || "").trim();
    var mobile = String(($("bookingLeadMobile") && $("bookingLeadMobile").value) || "").trim();
    var privacy = !!( $("bookingLeadPrivacy") && $("bookingLeadPrivacy").checked );
    var marketing = !!( $("bookingLeadMarketing") && $("bookingLeadMarketing").checked );
    var btn = $("bookingLeadSendCode");

    setMsg("bookingLeadDetailsMsg", "", false);
    if (firstName.length < 2) {
      setMsg("bookingLeadDetailsMsg", "Please enter your first name.", true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg("bookingLeadDetailsMsg", "Please enter a valid email address.", true);
      return;
    }
    if (mobile.replace(/\D/g, "").length < 10) {
      setMsg("bookingLeadDetailsMsg", "Please enter a valid mobile number.", true);
      return;
    }
    if (!privacy) {
      setMsg("bookingLeadDetailsMsg", "Please accept the Privacy Notice to continue.", true);
      return;
    }

    setBusy(btn, true, "Sending code…");
    try {
      var out = await api("portal-booking-lead-otp-request", {
        first_name: firstName,
        email: email,
        mobile: mobile,
        privacy_accepted: true,
        marketing_consent: marketing,
        privacy_notice_version: PRIVACY_VERSION,
        first_page_visited: (global.location && global.location.pathname) || "/bookingportal",
      });
      if (!out.res.ok || !out.data || !out.data.ok) {
        var err = (out.data && out.data.error) || "send_failed";
        var human =
          err === "privacy_required"
            ? "Please accept the Privacy Notice to continue."
            : err === "email_invalid"
              ? "Please enter a valid email address."
              : err === "mobile_invalid"
                ? "Please enter a valid mobile number."
                : "We couldn’t send a code just now. Please try again.";
        setMsg("bookingLeadDetailsMsg", human, true);
        setBusy(btn, false, "Send access code");
        return;
      }
      state.pendingEmail = email;
      var hint = (out.data && out.data.email_hint) || email;
      var otpHint = $("bookingLeadOtpHint");
      if (otpHint) {
        otpHint.textContent = "We sent a 6-digit code to " + hint + ". Enter it below to explore availability.";
      }
      showStep("otp");
      var codeEl = $("bookingLeadCode");
      if (codeEl) {
        codeEl.value = "";
        try {
          codeEl.focus();
        } catch (_e2) {
          /* ignore */
        }
      }
      setMsg("bookingLeadOtpMsg", "", false);
    } catch (_e3) {
      setMsg("bookingLeadDetailsMsg", "Network error — please try again.", true);
    }
    setBusy(btn, false, "Send access code");
  }

  async function submitOtp(ev) {
    if (ev) ev.preventDefault();
    var email =
      state.pendingEmail ||
      String(($("bookingLeadEmail") && $("bookingLeadEmail").value) || "").trim();
    var code = String(($("bookingLeadCode") && $("bookingLeadCode").value) || "").trim();
    var btn = $("bookingLeadVerify");
    setMsg("bookingLeadOtpMsg", "", false);
    if (!/^\d{4,8}$/.test(code)) {
      setMsg("bookingLeadOtpMsg", "Enter the code from your email.", true);
      return;
    }
    setBusy(btn, true, "Checking…");
    try {
      var out = await api("portal-booking-lead-otp-verify", { email: email, code: code });
      if (!out.res.ok || !out.data || !out.data.ok || !out.data.session_token) {
        var err = (out.data && out.data.error) || "invalid";
        var human =
          err === "expired"
            ? "That code has expired. Go back and request a new one."
            : err === "too_many_attempts"
              ? "Too many attempts. Request a new code."
              : "That code didn’t match. Please try again.";
        setMsg("bookingLeadOtpMsg", human, true);
        setBusy(btn, false, "Unlock booking");
        return;
      }
      saveStored(out.data.session_token, out.data.expires_at, out.data.lead);
      unlock();
    } catch (_e) {
      setMsg("bookingLeadOtpMsg", "Network error — please try again.", true);
    }
    setBusy(btn, false, "Unlock booking");
  }

  function wireUi() {
    var detailsForm = $("bookingLeadDetailsForm");
    var otpForm = $("bookingLeadOtpForm");
    var backBtn = $("bookingLeadBack");
    var resendBtn = $("bookingLeadResend");
    if (detailsForm) detailsForm.addEventListener("submit", submitDetails);
    if (otpForm) otpForm.addEventListener("submit", submitOtp);
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        showStep("details");
        setMsg("bookingLeadOtpMsg", "", false);
      });
    }
    if (resendBtn) {
      resendBtn.addEventListener("click", function () {
        showStep("details");
        submitDetails();
      });
    }
    var gate = $("bookingLeadGate");
    if (gate) {
      gate.addEventListener("click", function (e) {
        // Non-dismissible: ignore backdrop clicks.
        e.stopPropagation();
      });
    }
  }

  function guardClicks(root) {
    if (!root) return;
    root.addEventListener(
      "click",
      function (e) {
        if (state.unlocked) return;
        var t = e.target && e.target.closest
          ? e.target.closest("[data-book], [data-enquire], [data-dc-enquire], .btn--book, .btn--wait")
          : null;
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        openGate();
      },
      true
    );
  }

  async function pingActivity(payload) {
    if (!state.token && !loadStored()) return;
    var stored = loadStored();
    var tok = state.token || (stored && stored.token) || "";
    if (!tok) return;
    try {
      await api("portal-booking-lead-session", payload || {}, {
        "x-booking-lead-session": tok,
      });
    } catch (_e) {
      /* ignore */
    }
  }

  function getLeadForPrefill() {
    if (state.lead) return state.lead;
    var stored = loadStored();
    return (stored && stored.lead) || null;
  }

  async function boot() {
    wireUi();
    setLocked(true);
    showModal(false);

    var ok = await validateSession();
    if (ok) {
      unlock();
      return;
    }

    // Preview window: browse look & feel, no booking yet.
    state.timer = setTimeout(function () {
      if (!state.unlocked) openGate();
    }, PREVIEW_MS);
  }

  var apiPublic = {
    boot: boot,
    guardClicks: guardClicks,
    pingActivity: pingActivity,
    getLeadForPrefill: getLeadForPrefill,
    getSessionToken: function () {
      var s = loadStored();
      return (s && s.token) || state.token || "";
    },
    isUnlocked: function () {
      return !!state.unlocked;
    },
    openGate: openGate,
    privacyVersion: PRIVACY_VERSION,
    validateSession: validateSession,
  };

  global.PortalBookingLeadGate = apiPublic;
})(typeof window !== "undefined" ? window : globalThis);
