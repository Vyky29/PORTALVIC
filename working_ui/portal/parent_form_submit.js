/**
 * Submit parent registration PDFs to Portal Supabase (portal-parent-form-submit).
 */
(function (global) {
  "use strict";

  function supabaseBase() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "").trim();
  }

  function friendlySubmitError(err) {
    var raw = String((err && err.message) || err || "").trim();
    var code = raw.toLowerCase();
    if (
      !raw ||
      code === "failed to fetch" ||
      code === "networkerror when attempting to fetch resource." ||
      code.indexOf("network") >= 0 ||
      code.indexOf("load failed") >= 0
    ) {
      return "Could not reach clubSENsational (network). Stay on Wi‑Fi/4G, keep this tab open, and try again.";
    }
    if (code === "missing_photo") {
      return "Please add a participant photo (face or ID), then submit again.";
    }
    if (code === "photo_too_large" || code.indexOf("photo too large") >= 0) {
      return "The photo is too large. Choose a smaller JPEG/PNG (under 8 MB), or take a new photo.";
    }
    if (code === "pdf_too_large") {
      return "The form PDF is too large to upload. Try a smaller participant photo, then submit again.";
    }
    if (code === "invalid_photo_type" || code === "photo_decode_failed") {
      return "That photo format is not supported. Please use a JPEG or PNG (not HEIC if your phone offers a choice).";
    }
    if (code === "pdf_upload_failed" || code === "photo_upload_failed" || code === "save_failed") {
      return "The club server could not store the form (" + raw + "). Please try again in a minute.";
    }
    if (code === "portal configuration missing.") {
      return "This page is missing Portal settings. Refresh and try again, or open family.clubsensational.org/parent/registration.";
    }
    if (code.indexOf("http 5") === 0 || code.indexOf("http 4") === 0) {
      return "Upload failed (" + raw + "). Please try again.";
    }
    return "Could not send your form (" + raw + "). Please try again. A PDF on your phone alone does not mean the club received it.";
  }

  function finishParentSubmit(opts) {
    opts = opts || {};
    var form = opts.formEl;
    var panel = opts.successEl;
    var notice = opts.noticeEl;
    var btn = opts.submitBtn;
    if (form) form.setAttribute("hidden", "hidden");
    if (notice) notice.setAttribute("hidden", "hidden");
    if (panel) {
      panel.removeAttribute("hidden");
      var msg = panel.querySelector("[data-parent-submit-msg]");
      if (msg) {
        msg.textContent =
          opts.message ||
          "Your form was sent to clubSENsational. A PDF copy was saved on your device. You do not need to email us — you can close this page.";
      }
      try {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_e) {}
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Submitted";
    }
  }

  function doFetch(base, key, fd, headers) {
    return fetch(base + "/functions/v1/portal-parent-form-submit", {
      method: "POST",
      headers: headers,
      body: fd,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return { ok: false, error: "bad_response" };
        })
        .then(function (j) {
          if (!res.ok || !j || !j.ok) {
            var err = j && j.error ? String(j.error) : "HTTP " + res.status;
            throw new Error(err);
          }
          return j;
        });
    });
  }

  function submitParentForm(opts) {
    var options = opts || {};
    var pdfBlob = options.pdf;
    if (!(pdfBlob instanceof Blob)) {
      return Promise.reject(new Error("PDF is required."));
    }
    var formType = String(options.form_type || "").trim();
    if (formType !== "climbing_registration" && formType !== "client_registration") {
      return Promise.reject(new Error("Invalid form type."));
    }
    var participantName = String(options.participant_name || "").trim();
    if (!participantName) {
      return Promise.reject(new Error("Participant name is required."));
    }

    var base = supabaseBase();
    var key = anonKey();
    if (!base || !key) {
      return Promise.reject(new Error("Portal configuration missing."));
    }

    function buildFormData() {
      var fd = new FormData();
      fd.append("form_type", formType);
      fd.append("participant_name", participantName);
      if (options.participant_dob) fd.append("participant_dob", String(options.participant_dob));
      if (options.parent_name) fd.append("parent_name", String(options.parent_name));
      if (options.parent_email) fd.append("parent_email", String(options.parent_email));
      if (options.parent_phone) fd.append("parent_phone", String(options.parent_phone));
      if (options.payload) {
        try {
          fd.append("payload", JSON.stringify(options.payload));
        } catch (_e) {
          fd.append("payload", "{}");
        }
      }
      fd.append("pdf", pdfBlob, options.pdf_filename || "registration.pdf");
      if (options.photo instanceof Blob) {
        fd.append("photo", options.photo, options.photo_filename || "participant-photo.jpg");
      }
      try {
        var sessTok =
          (global.PortalBookingServicePresence &&
            typeof global.PortalBookingServicePresence.getToken === "function" &&
            global.PortalBookingServicePresence.getToken()) ||
          "";
        if (sessTok) fd.append("booking_service_session", String(sessTok));
      } catch (_eSess) {
        /* ignore */
      }
      try {
        var leadTok =
          (global.PortalBookingLeadGate &&
            typeof global.PortalBookingLeadGate.getSessionToken === "function" &&
            global.PortalBookingLeadGate.getSessionToken()) ||
          "";
        if (leadTok) fd.append("booking_lead_session", String(leadTok));
      } catch (_eLead) {
        /* ignore */
      }
      return fd;
    }

    // Keep tokens in FormData only (not custom request headers) so CORS preflight
    // stays on authorization/apikey and cannot block submit as a fake "network" error.
    var headers = {
      Authorization: "Bearer " + key,
      apikey: key,
    };

    return doFetch(base, key, buildFormData(), headers)
      .catch(function (err) {
        var msg = String((err && err.message) || err || "").toLowerCase();
        var retryable =
          msg.indexOf("failed to fetch") >= 0 ||
          msg.indexOf("network") >= 0 ||
          msg.indexOf("load failed") >= 0 ||
          msg === "pdf_upload_failed" ||
          msg === "save_failed";
        if (!retryable) throw err;
        return new Promise(function (resolve) {
          setTimeout(resolve, 700);
        }).then(function () {
          return doFetch(base, key, buildFormData(), headers);
        });
      })
      .then(function (j) {
        try {
          if (global.PortalBookingServicePresence) {
            var slotBit = "";
            try {
              var br = options.payload && options.payload.booking_request;
              if (br && br.slot_id) slotBit = String(br.slot_id);
            } catch (_eSlot) {
              /* ignore */
            }
            void global.PortalBookingServicePresence.ping(
              "registration_submit",
              slotBit || (j.slot_held ? "slot_held" : null),
            );
          }
        } catch (_e2) {
          /* ignore */
        }
        return j;
      });
  }

  global.portalSubmitParentForm = submitParentForm;
  global.portalFinishParentSubmit = finishParentSubmit;
  global.portalParentFormFriendlyError = friendlySubmitError;
})(typeof window !== "undefined" ? window : globalThis);
