/**
 * Booking Portal access:
 * - New visitors browse freely (no OTP). Book → registration form → hold on submit.
 * - Already-with-us: optional email OTP / magic link (lead_session) for recognition + prefill.
 * Parent portal access stays office-activated (not automatic from this gate).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "clubsens_booking_lead_session_v1";
  var PRIVACY_VERSION = "2026-07-v1";
  var state = {
    unlocked: true,
    signedIn: false,
    lead: null,
    token: "",
    pendingEmail: "",
    flow: "returning",
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

  function normalizeLead(lead) {
    if (!lead || typeof lead !== "object") return null;
    var parentName = String(lead.parent_name || lead.first_name || "").trim();
    var email = String(lead.parent_email || lead.email || "").trim();
    var phone = String(lead.parent_phone || lead.mobile || "").trim();
    return {
      id: lead.id || null,
      parent_name: parentName,
      first_name: parentName,
      email: email,
      parent_email: email,
      mobile: phone,
      parent_phone: phone,
      marketing_consent: !!lead.marketing_consent,
      privacy_notice_version: lead.privacy_notice_version || PRIVACY_VERSION,
      booking_status: lead.booking_status || null,
      registration_status: lead.registration_status || null,
      client_status: lead.client_status || null,
      services_viewed: lead.services_viewed || [],
    };
  }

  function saveStored(token, expiresAt, lead) {
    state.token = String(token || "");
    state.lead = normalizeLead(lead);
    try {
      global.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: state.token,
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : Date.now() + 14 * 86400000,
          lead: state.lead
            ? {
                parent_name: state.lead.parent_name,
                email: state.lead.email,
                mobile: state.lead.mobile,
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
    state.signedIn = false;
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  function adoptTokenFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      var tok = String(q.get("lead_session") || "").trim();
      if (!/^[a-f0-9]{32,128}$/i.test(tok)) return false;
      saveStored(tok, null, null);
      q.delete("lead_session");
      var next =
        global.location.pathname + (q.toString() ? "?" + q.toString() : "") + (global.location.hash || "");
      if (global.history && global.history.replaceState) {
        global.history.replaceState({}, "", next);
      }
      return true;
    } catch (_e) {
      return false;
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

  function setBrowseOpen() {
    document.documentElement.classList.remove("booking-gated");
    document.body.classList.remove("booking-gated");
    state.unlocked = true;
  }

  function showModal(show) {
    var gate = $("bookingLeadGate");
    if (!gate) return;
    gate.hidden = !show;
    gate.setAttribute("aria-hidden", show ? "false" : "true");
    document.documentElement.classList.toggle("booking-gate-open", !!show);
    document.body.classList.toggle("booking-gate-open", !!show);
    try {
      document.body.style.overflow = show ? "hidden" : "";
    } catch (_e) {
      /* ignore */
    }
  }

  function showStep(step) {
    var details = $("bookingLeadStepDetails");
    var otp = $("bookingLeadStepOtp");
    if (details) details.hidden = step !== "details";
    if (otp) otp.hidden = step !== "otp";
  }

  function setFlow(flow) {
    state.flow = flow === "new" ? "new" : "returning";
    var ret = $("bookingLeadReturningBlock");
    var neu = $("bookingLeadNewBlock");
    var tabR = $("bookingLeadTabReturning");
    var tabN = $("bookingLeadTabNew");
    if (ret) ret.hidden = state.flow !== "returning";
    if (neu) neu.hidden = state.flow !== "new";
    if (tabR) {
      tabR.classList.toggle("is-active", state.flow === "returning");
      tabR.setAttribute("aria-selected", state.flow === "returning" ? "true" : "false");
    }
    if (tabN) {
      tabN.classList.toggle("is-active", state.flow === "new");
      tabN.setAttribute("aria-selected", state.flow === "new" ? "true" : "false");
    }
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

  function syncSignedInUi() {
    var chip = $("bookingLeadSignedIn");
    var openBtn = $("bookingLeadOpenReturning");
    if (chip) {
      chip.hidden = !state.signedIn;
      if (state.signedIn && state.lead) {
        var label =
          state.lead.parent_name ||
          state.lead.email ||
          "Signed in";
        chip.textContent = "Signed in · " + label;
      }
    }
    if (openBtn) openBtn.hidden = !!state.signedIn;
  }

  async function validateSession(tokenOverride) {
    var stored = loadStored();
    var tok = String(tokenOverride || state.token || (stored && stored.token) || "").trim();
    if (!tok) return false;
    try {
      var out = await api(
        "portal-booking-lead-session",
        { booking_status: "exploring_services" },
        { "x-booking-lead-session": tok }
      );
      if (out.res.ok && out.data && out.data.ok && out.data.lead) {
        saveStored(tok, out.data.expires_at || (stored && stored.expiresAt), out.data.lead);
        state.signedIn = true;
        return true;
      }
    } catch (_e) {
      /* ignore */
    }
    clearStored();
    return false;
  }

  function closeGate() {
    showModal(false);
    setBrowseOpen();
    syncSignedInUi();
  }

  function markSignedIn() {
    state.signedIn = true;
    setBrowseOpen();
    showModal(false);
    syncSignedInUi();
  }

  /**
   * Optional sign-in for families already on file (OTP / magic link).
   * Does not block browsing or Book for new visitors.
   */
  function openGate(opts) {
    opts = opts || {};
    setBrowseOpen();
    showStep("details");
    setFlow(opts.flow === "new" ? "new" : "returning");
    showModal(true);
    var focusEl =
      state.flow === "new"
        ? $("bookingLeadParentName") || $("bookingLeadFirstName")
        : $("bookingLeadReturningEmail");
    if (focusEl) {
      try {
        focusEl.focus();
      } catch (_e) {
        /* ignore */
      }
    }
  }

  function afterOtpSent(email, out, msgId, btn, idleLabel) {
    state.pendingEmail = email;
    var hint = (out.data && out.data.email_hint) || email;
    var otpHint = $("bookingLeadOtpHint");
    if (otpHint) {
      var recog = (out.data && out.data.recognition) || "";
      var prefix =
        recog === "existing_client"
          ? "Welcome back — we recognised your family. "
          : recog === "returning_lead"
            ? "Welcome back. "
            : "";
      otpHint.textContent =
        prefix + "We sent a 6-digit code to " + hint + ". Enter it below to continue.";
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
    setBusy(btn, false, idleLabel);
  }

  async function submitReturning(ev) {
    if (ev) ev.preventDefault();
    var email = String(
      ($("bookingLeadReturningEmail") && $("bookingLeadReturningEmail").value) || ""
    ).trim();
    var phone = String(
      ($("bookingLeadReturningMobile") && $("bookingLeadReturningMobile").value) || ""
    ).trim();
    var privacy = !!(
      $("bookingLeadReturningPrivacy") && $("bookingLeadReturningPrivacy").checked
    );
    var btn = $("bookingLeadReturningSend");

    setMsg("bookingLeadReturningMsg", "", false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg("bookingLeadReturningMsg", "Please enter a valid email address.", true);
      return;
    }
    if (!privacy) {
      setMsg("bookingLeadReturningMsg", "Please accept the Privacy Notice to continue.", true);
      return;
    }

    setBusy(btn, true, "Sending code…");
    try {
      var out = await api("portal-booking-lead-otp-request", {
        flow: "returning",
        parent_email: email,
        parent_phone: phone,
        privacy_accepted: true,
        privacy_notice_version: PRIVACY_VERSION,
        first_page_visited: (global.location && global.location.pathname) || "/bookingportal",
      });
      if (!out.res.ok || !out.data || !out.data.ok) {
        var err = (out.data && out.data.error) || "send_failed";
        var human =
          err === "not_recognised"
            ? "We couldn’t find that email on file. Try your club email, add the phone on file, or continue as a new visitor and Book."
            : err === "privacy_required"
              ? "Please accept the Privacy Notice to continue."
              : err === "email_invalid"
                ? "Please enter a valid email address."
                : err === "mobile_invalid"
                  ? "Add the phone number on your club record, or continue as a new visitor and Book."
                  : "We couldn’t send a code just now. Please try again.";
        setMsg("bookingLeadReturningMsg", human, true);
        setBusy(btn, false, "Send access code");
        return;
      }
      afterOtpSent(email, out, "bookingLeadReturningMsg", btn, "Send access code");
      return;
    } catch (_e3) {
      setMsg("bookingLeadReturningMsg", "Network error — please try again.", true);
    }
    setBusy(btn, false, "Send access code");
  }

  async function submitDetails(ev) {
    if (ev) ev.preventDefault();
    /* New visitors no longer OTP here — close and browse; Book opens registration. */
    closeGate();
  }

  async function submitOtp(ev) {
    if (ev) ev.preventDefault();
    var email =
      state.pendingEmail ||
      String(($("bookingLeadEmail") && $("bookingLeadEmail").value) || "").trim() ||
      String(($("bookingLeadReturningEmail") && $("bookingLeadReturningEmail").value) || "").trim();
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
        setBusy(btn, false, "Continue");
        return;
      }
      saveStored(out.data.session_token, out.data.expires_at, out.data.lead);
      markSignedIn();
    } catch (_e) {
      setMsg("bookingLeadOtpMsg", "Network error — please try again.", true);
    }
    setBusy(btn, false, "Continue");
  }

  function wireUi() {
    if (wireUi._done) return;
    wireUi._done = true;
    var detailsForm = $("bookingLeadDetailsForm");
    var returningForm = $("bookingLeadReturningForm");
    var otpForm = $("bookingLeadOtpForm");
    var backBtn = $("bookingLeadBack");
    var resendBtn = $("bookingLeadResend");
    var tabR = $("bookingLeadTabReturning");
    var tabN = $("bookingLeadTabNew");
    var closeBtn = $("bookingLeadClose");
    var browseBtn = $("bookingLeadBrowseFree");
    var openReturning = $("bookingLeadOpenReturning");
    if (detailsForm) detailsForm.addEventListener("submit", submitDetails);
    if (returningForm) returningForm.addEventListener("submit", submitReturning);
    if (otpForm) otpForm.addEventListener("submit", submitOtp);
    if (tabR) {
      tabR.addEventListener("click", function () {
        setFlow("returning");
      });
    }
    if (tabN) {
      tabN.addEventListener("click", function () {
        setFlow("new");
      });
    }
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        showStep("details");
        setMsg("bookingLeadOtpMsg", "", false);
      });
    }
    if (resendBtn) {
      resendBtn.addEventListener("click", function () {
        showStep("details");
        if (state.flow === "returning") submitReturning();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        closeGate();
      });
    }
    if (browseBtn) {
      browseBtn.addEventListener("click", function () {
        closeGate();
      });
    }
    if (openReturning) {
      openReturning.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        openGate({ flow: "returning" });
      });
    }
    var gate = $("bookingLeadGate");
    if (gate) {
      gate.addEventListener("click", function (e) {
        if (e.target === gate) closeGate();
      });
    }
    setFlow(state.flow || "returning");
  }

  /** Book / enquire are never blocked — kept for API compatibility. */
  function guardClicks(_root) {
    /* no-op: browsing and Book stay open for new visitors */
  }

  async function pingActivity(payload) {
    var stored = loadStored();
    var tok = state.token || (stored && stored.token) || "";
    if (!tok) return;
    try {
      var out = await api("portal-booking-lead-session", payload || {}, {
        "x-booking-lead-session": tok,
      });
      if (out.res.ok && out.data && out.data.lead) {
        saveStored(tok, out.data.expires_at || (stored && stored.expiresAt), out.data.lead);
        state.signedIn = true;
        syncSignedInUi();
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function getLeadForPrefill() {
    if (state.lead) return state.lead;
    var stored = loadStored();
    return normalizeLead(stored && stored.lead);
  }

  function getSessionToken() {
    var s = loadStored();
    return (s && s.token) || state.token || "";
  }

  /**
   * Registration URL handoff: keep same host when possible + pass lead_session
   * so family.clubsensational.org / www can both recover the lead.
   */
  function appendSessionToUrl(url) {
    var tok = getSessionToken();
    if (!tok || !url) return url;
    try {
      var u = new URL(url, global.location && global.location.origin);
      u.searchParams.set("lead_session", tok);
      u.searchParams.set("from", u.searchParams.get("from") || "bookingportal");
      return u.toString();
    } catch (_e) {
      var join = String(url).indexOf("?") >= 0 ? "&" : "?";
      return url + join + "lead_session=" + encodeURIComponent(tok);
    }
  }

  async function boot(opts) {
    opts = opts || {};
    wireUi();
    setBrowseOpen();
    showModal(false);
    adoptTokenFromUrl();

    var ok = await validateSession();
    if (ok) {
      markSignedIn();
      return true;
    }

    /* Optional: force returning gate (e.g. ?sign_in=1) — never auto-lock browse. */
    if (opts.openReturning || opts.skipPreview) {
      openGate({ flow: "returning" });
      return false;
    }
    try {
      var q = new URLSearchParams(global.location.search || "");
      if (q.get("sign_in") === "1" || q.get("returning") === "1") {
        openGate({ flow: "returning" });
      }
    } catch (_e) {
      /* ignore */
    }
    syncSignedInUi();
    return false;
  }

  global.PortalBookingLeadGate = {
    boot: boot,
    guardClicks: guardClicks,
    pingActivity: pingActivity,
    getLeadForPrefill: getLeadForPrefill,
    getSessionToken: getSessionToken,
    appendSessionToUrl: appendSessionToUrl,
    isUnlocked: function () {
      return true;
    },
    isSignedIn: function () {
      return !!state.signedIn;
    },
    openGate: openGate,
    closeGate: closeGate,
    privacyVersion: PRIVACY_VERSION,
    validateSession: validateSession,
    adoptTokenFromUrl: adoptTokenFromUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
