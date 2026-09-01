/**
 * Existing-client Booking Portal confirm (no full registration form).
 * Page: /parent/booking-confirm → parent_booking_confirm.html
 */
(function (global) {
  "use strict";

  function qs() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (_e) {
      return new URLSearchParams();
    }
  }

  function supabaseBase() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "").trim();
  }

  function leadToken() {
    var q = qs();
    var fromQ = String(q.get("lead_session") || "").trim();
    if (fromQ) {
      try {
        if (global.history && global.history.replaceState) {
          q.delete("lead_session");
          var next =
            global.location.pathname +
            (q.toString() ? "?" + q.toString() : "") +
            (global.location.hash || "");
          global.history.replaceState({}, "", next);
        }
      } catch (_strip) {
        /* ignore */
      }
      try {
        global.localStorage.setItem(
          "clubsens_booking_lead_session_v1",
          JSON.stringify({ token: fromQ, expiresAt: Date.now() + 14 * 86400000 })
        );
      } catch (_ls) {
        /* ignore */
      }
      return fromQ;
    }
    try {
      if (global.PortalBookingLeadGate && typeof global.PortalBookingLeadGate.getSessionToken === "function") {
        return String(global.PortalBookingLeadGate.getSessionToken() || "").trim();
      }
    } catch (_e) {}
    try {
      var raw = global.localStorage.getItem("clubsens_booking_lead_session_v1");
      if (!raw) return "";
      var j = JSON.parse(raw);
      return String((j && j.token) || "").trim();
    } catch (_e2) {
      return "";
    }
  }

  function clearBookingFamilySession() {
    try {
      if (global.PortalBookingLeadGate && typeof global.PortalBookingLeadGate.clearSession === "function") {
        global.PortalBookingLeadGate.clearSession({ clearParentPortal: true });
        return;
      }
    } catch (_e) {}
    try {
      global.localStorage.removeItem("clubsens_booking_lead_session_v1");
      global.localStorage.removeItem("clubsens_parent_portal_session_v1");
      global.sessionStorage.setItem("clubsens_booking_force_gate_v1", "1");
    } catch (_e2) {}
  }

  function showSignedInAs(parentName) {
    var who = document.getElementById("bcWho");
    if (!who) return;
    var name = String(parentName || "").trim() || "an existing family";
    who.hidden = false;
    who.innerHTML =
      "Signed in as <strong>" +
      esc(name) +
      "</strong>. " +
      '<button type="button" id="bcNotYou">Not you? Unlock a different family</button>';
    var btn = document.getElementById("bcNotYou");
    if (btn) {
      btn.addEventListener("click", function () {
        clearBookingFamilySession();
        global.location.href = "/bookingportal?gate=1";
      });
    }
  }

  function bookingRequestFromQuery() {
    var q = qs();
    return {
      from: "bookingportal",
      slot_id: q.get("slot_id") || "",
      service_id: q.get("service") || q.get("service_id") || "",
      service_name: q.get("service_name") || "",
      venue: q.get("venue") || "",
      day: q.get("day") || "",
      time: q.get("time") || "",
      activity: q.get("activity") || q.get("crash_activity") || "",
      booking_mode: q.get("booking_mode") || "",
      week_id: q.get("week_id") || "",
      block_id: q.get("block_id") || "",
      date_iso: q.get("date") || "",
      pack: q.get("pack") || "",
      booking_kind: String(q.get("booking_kind") || "term").toLowerCase() === "trial" ? "trial" : "term",
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slotSummary(br) {
    return [br.service_name, br.venue, br.day, br.time, br.booking_kind === "trial" ? "Trial" : null]
      .filter(Boolean)
      .join(" · ");
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.className = "bc-status" + (kind ? " bc-status--" + kind : "");
  }

  function friendlyError(code) {
    var c = String(code || "").toLowerCase();
    if (c === "photo_required") return "Please add a participant photo, then confirm.";
    if (c === "photo_too_large") return "That photo is too large (max 8 MB). Choose a smaller JPEG/PNG.";
    if (c === "invalid_photo_type") return "Please use a JPEG or PNG photo.";
    if (c === "unauthorized") return "Your booking session expired. Go back to Booking Portal and unlock again.";
    if (c === "not_existing_client") return "This shortcut is for existing families. Use the full registration form.";
    if (c === "no_children_on_file") return "We could not find your child on file. Contact the office or use full registration.";
    if (c === "failed to fetch" || c.indexOf("network") >= 0) {
      return "Network error — stay on Wi‑Fi/4G and try again.";
    }
    return "Could not confirm (" + (code || "error") + "). Please try again.";
  }

  function apiLoad(token) {
    return fetch(supabaseBase() + "/functions/v1/portal-booking-existing-confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-booking-lead-session": token,
      },
      body: JSON.stringify({ action: "load" }),
    }).then(function (res) {
      return res.json().then(function (j) {
        return { res: res, data: j };
      });
    });
  }

  function apiSubmit(token, fd) {
    return fetch(supabaseBase() + "/functions/v1/portal-booking-existing-confirm", {
      method: "POST",
      headers: {
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-booking-lead-session": token,
      },
      body: fd,
    }).then(function (res) {
      return res.json().then(function (j) {
        return { res: res, data: j };
      });
    });
  }

  function boot() {
    var root = document.getElementById("bcRoot");
    if (!root) return;

    var token = leadToken();
    var br = bookingRequestFromQuery();
    var statusEl = document.getElementById("bcStatus");
    var slotEl = document.getElementById("bcSlot");
    var kidsEl = document.getElementById("bcKids");
    var photoWrap = document.getElementById("bcPhotoWrap");
    var photoInput = document.getElementById("bcPhoto");
    var photoHint = document.getElementById("bcPhotoHint");
    var submitBtn = document.getElementById("bcSubmit");
    var doneEl = document.getElementById("bcDone");
    var formEl = document.getElementById("bcForm");
    var fullRegLink = document.getElementById("bcFullReg");

    if (slotEl) slotEl.textContent = slotSummary(br) || "Selected session";

    if (fullRegLink) {
      var q = qs();
      q.set("from", "bookingportal");
      fullRegLink.href = "/parent/registration?" + q.toString();
    }

    if (!br.slot_id) {
      setStatus(statusEl, "Missing session details. Go back to Booking Portal and choose a place again.", "err");
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
    if (!token) {
      setStatus(statusEl, "Please unlock Booking Portal first (family PIN or email code).", "err");
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
    if (!supabaseBase() || !anonKey()) {
      setStatus(statusEl, "Portal settings missing — refresh the page.", "err");
      return;
    }

    setStatus(statusEl, "Loading your family details…", "info");
    if (submitBtn) submitBtn.disabled = true;

    var state = { children: [], selectedId: "", needPhoto: true };

    apiLoad(token)
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          var err = (out.data && out.data.error) || "load_failed";
          if (err === "not_existing_client" || err === "no_children_on_file") {
            global.location.replace("/parent/registration?" + qs().toString());
            return;
          }
          throw new Error(err);
        }
        state.children = out.data.children || [];
        if (!state.children.length) throw new Error("no_children_on_file");
        showSignedInAs(out.data.parent_name || "");

        /* Prefer out-of-class / released child when booking a new place. */
        var prefer =
          state.children.find(function (c) { return c.in_class === false; }) ||
          state.children[0];
        state.selectedId = prefer.contact_id;
        state.needPhoto = !prefer.has_photo;

        kidsEl.innerHTML = state.children
          .map(function (c) {
            var checked = c.contact_id === state.selectedId ? " checked" : "";
            return (
              '<label class="bc-kid">' +
              '<input type="radio" name="bc_kid" value="' +
              esc(c.contact_id) +
              '"' +
              checked +
              " />" +
              '<span><strong>' +
              esc(c.display_name) +
              "</strong>" +
              (c.has_photo
                ? '<span class="bc-muted"> · Photo on file</span>'
                : '<span class="bc-muted"> · Photo needed</span>') +
              "</span></label>"
            );
          })
          .join("");

        function syncPhotoUi() {
          var sel = state.children.find(function (c) {
            return c.contact_id === state.selectedId;
          });
          state.needPhoto = !(sel && sel.has_photo);
          if (photoWrap) photoWrap.hidden = false;
          if (photoInput) photoInput.required = !!state.needPhoto;
          if (photoHint) {
            photoHint.textContent = state.needPhoto
              ? "Add a clear face photo (required — none on file yet)."
              : "Optional — photo already on file. Upload only to replace it.";
          }
        }

        kidsEl.querySelectorAll('input[name="bc_kid"]').forEach(function (inp) {
          inp.addEventListener("change", function () {
            state.selectedId = String(inp.value || "");
            syncPhotoUi();
          });
        });
        syncPhotoUi();
        setStatus(statusEl, "", "");
        if (submitBtn) submitBtn.disabled = false;
      })
      .catch(function (e) {
        setStatus(statusEl, friendlyError(e && e.message), "err");
        if (submitBtn) submitBtn.disabled = true;
      });

    if (formEl) {
      formEl.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!state.selectedId) {
          setStatus(statusEl, "Select which participant this place is for.", "err");
          return;
        }
        if (state.needPhoto && photoInput && !(photoInput.files && photoInput.files.length)) {
          setStatus(statusEl, "Please add a participant photo, then confirm.", "err");
          return;
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Sending…";
        }
        setStatus(statusEl, "Confirming place…", "info");

        var fd = new FormData();
        fd.set("action", "submit");
        fd.set("contact_id", state.selectedId);
        fd.set("booking_request", JSON.stringify(br));
        if (photoInput && photoInput.files && photoInput.files[0]) {
          fd.set("photo", photoInput.files[0], "participant-photo.jpg");
        }

        apiSubmit(token, fd)
          .then(function (out) {
            if (!out.res.ok || !out.data || !out.data.ok) {
              throw new Error((out.data && out.data.error) || "submit_failed");
            }
            if (formEl) formEl.hidden = true;
            if (doneEl) {
              doneEl.hidden = false;
              var name = out.data.participant_name || "your child";
              var finishUrl = out.data.finish_url ? String(out.data.finish_url) : "";
              var msg = doneEl.querySelector("[data-bc-done-msg]");
              if (msg) {
                msg.textContent = finishUrl
                  ? "Thanks — taking you to payment for " +
                    name +
                    " now. Your place is held for 30 minutes while you pay."
                  : "Thanks — we have your place request for " +
                    name +
                    ". Check your email or WhatsApp for the payment link.";
              }
              if (finishUrl) {
                setTimeout(function () {
                  global.location.href = finishUrl;
                }, 1200);
              }
            }
            setStatus(statusEl, "", "");
          })
          .catch(function (e) {
            setStatus(statusEl, friendlyError(e && e.message), "err");
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Confirm place";
            }
          });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
