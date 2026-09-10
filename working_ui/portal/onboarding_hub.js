/**
 * Onboarding hub — photo, docs, job, health for hire applicants.
 */
(function (global) {
  "use strict";

  function supabaseUrl() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.url) return String(box.url).replace(/\/$/, "");
    } catch (_) {}
    return "https://cklpnwhlqsulpmkipmqb.supabase.co";
  }

  function anonKey() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.anonKey) return String(box.anonKey);
    } catch (_) {}
    return "";
  }

  async function authToken() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      if (!client || !client.auth || typeof client.auth.getSession !== "function") return "";
      var res = await client.auth.getSession();
      return (res && res.data && res.data.session && res.data.session.access_token) || "";
    } catch (_) {
      return "";
    }
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("read_failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  async function edgePost(path, body) {
    var token = await authToken();
    if (!token) throw new Error("not_signed_in");
    var res = await fetch(supabaseUrl() + "/functions/v1/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: anonKey(),
      },
      body: JSON.stringify(body || {}),
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !json.ok) {
      var err = new Error(json.error || "request_failed");
      err.detail = json;
      throw err;
    }
    return json;
  }

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isErr);
  }

  function renderDocChips(counts) {
    var host = global.document.getElementById("obHubDocChips");
    if (!host) return;
    var labels = [
      ["passport", "Passport"],
      ["checklist", "Checklist"],
      ["certificate", "Certificate"],
      ["firstaid", "First aid"],
      ["safeguarding", "Safeguarding"],
    ];
    host.innerHTML = labels
      .map(function (pair) {
        var n = (counts && counts[pair[0]]) || 0;
        var cls = n > 0 ? "ob-hub-chip is-done" : "ob-hub-chip";
        return (
          '<span class="' +
          cls +
          '">' +
          pair[1] +
          (n > 0 ? " (" + n + ")" : "") +
          "</span>"
        );
      })
      .join("");
  }

  async function refreshDocChips() {
    try {
      var res = await edgePost("portal-staff-onboarding-doc-upload", { action: "list" });
      renderDocChips(res.counts || {});
    } catch (e) {
      console.warn("[onboarding hub] doc list", e);
    }
  }

  async function refreshPhotoPreview() {
    var img = global.document.getElementById("obHubPhotoPreview");
    var frame = global.document.getElementById("obHubPhotoFrame");
    if (!img) return;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var meta =
        (box.session && box.session.user && box.session.user.user_metadata) || {};
      var url = String(meta.avatar_url || (box.staff_profile && box.staff_profile.avatar_url) || "").trim();
      if (url) {
        img.src = url;
        img.alt = "Your portal photo";
        img.hidden = false;
        if (frame) frame.classList.add("has-photo");
      }
    } catch (_) {}
  }

  function bindFilePickName(input, nameEl, onLocalPreview) {
    if (!input || !nameEl) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      nameEl.textContent = file ? file.name : nameEl.getAttribute("data-empty") || "No file chosen";
      if (typeof onLocalPreview === "function") onLocalPreview(file || null);
    });
  }

  function bindAccordions() {
    var root = global.document.getElementById("obHubAccordions");
    if (!root) return;
    root.querySelectorAll("[data-ob-hub-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-ob-hub-toggle");
        var panel = id && global.document.getElementById(id);
        if (!panel) return;
        var open = panel.hasAttribute("hidden");
        panel.toggleAttribute("hidden", !open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
    var hash = String((global.location && global.location.hash) || "").replace(/^#/, "");
    if (hash) {
      var map = {
        photo: "obHubPanelPhoto",
        docs: "obHubPanelDocs",
        documents: "obHubPanelDocs",
        job: "obHubPanelJob",
        health: "obHubPanelHealth",
      };
      var panelId = map[hash.toLowerCase()];
      if (panelId) {
        var p = global.document.getElementById(panelId);
        var t = root.querySelector('[data-ob-hub-toggle="' + panelId + '"]');
        if (p) p.removeAttribute("hidden");
        if (t) t.setAttribute("aria-expanded", "true");
        try {
          p.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_) {}
      }
    }
  }

  async function initPhoto() {
    var input = global.document.getElementById("obHubPhotoInput");
    var status = global.document.getElementById("obHubPhotoStatus");
    var btn = global.document.getElementById("obHubPhotoUpload");
    var nameEl = global.document.getElementById("obHubPhotoFileName");
    var frame = global.document.getElementById("obHubPhotoFrame");
    if (!input || !btn) return;
    if (nameEl) nameEl.setAttribute("data-empty", "No file chosen");
    bindFilePickName(input, nameEl, function (file) {
      var img = global.document.getElementById("obHubPhotoPreview");
      if (!img || !file) return;
      try {
        var url = URL.createObjectURL(file);
        img.src = url;
        img.alt = "Photo preview";
        img.hidden = false;
        if (frame) frame.classList.add("has-photo");
      } catch (_) {}
    });
    btn.addEventListener("click", async function () {
      var file = input.files && input.files[0];
      if (!file) {
        setStatus(status, "Choose a photo first.", true);
        return;
      }
      setStatus(status, "Uploading photo…");
      try {
        var mod = await import("/portal/auth-handler.js?v=20260908-onboarding-hub");
        var up = await mod.uploadStaffAvatar(file);
        var img = global.document.getElementById("obHubPhotoPreview");
        if (img && up && up.publicUrl) {
          img.src = up.publicUrl;
          img.alt = "Your portal photo";
          img.hidden = false;
          if (frame) frame.classList.add("has-photo");
        }
        try {
          var box = global.__PORTAL_SUPABASE__;
          if (box && box.client && up && up.publicUrl) {
            await box.client.from("staff_profiles").update({ avatar_url: up.publicUrl }).eq(
              "id",
              box.session && box.session.user && box.session.user.id
            );
          }
        } catch (_) {}
        setStatus(status, "Photo saved. Parents and staff can use this avatar once you start.");
      } catch (e) {
        console.warn("[onboarding hub] photo", e);
        setStatus(status, "Photo upload failed. Try a smaller JPG/PNG.", true);
      }
    });
  }

  async function initDocs() {
    var form = global.document.getElementById("obHubDocForm");
    var status = global.document.getElementById("obHubDocStatus");
    if (!form) return;
    var fileEl = form.querySelector('[name="doc_file"]');
    var nameEl = global.document.getElementById("obHubDocFileName");
    if (nameEl) nameEl.setAttribute("data-empty", "PDF, photo or Word / no file chosen");
    bindFilePickName(fileEl, nameEl);
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var typeEl = form.querySelector('[name="doc_type"]');
      var fileEl = form.querySelector('[name="doc_file"]');
      var docType = typeEl && typeEl.value;
      var file = fileEl && fileEl.files && fileEl.files[0];
      if (!docType || !file) {
        setStatus(status, "Choose a document type and file.", true);
        return;
      }
      setStatus(status, "Uploading…");
      try {
        var dataUrl = await fileToBase64(file);
        await edgePost("portal-staff-onboarding-doc-upload", {
          action: "upload",
          doc_type: docType,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          content_base64: dataUrl,
        });
        if (fileEl) fileEl.value = "";
        setStatus(status, "Uploaded. Admin Onboarding will show this document.");
        await refreshDocChips();
      } catch (e) {
        console.warn("[onboarding hub] doc upload", e);
        setStatus(status, "Upload failed. Try again or use a smaller file.", true);
      }
    });
  }

  async function initJob() {
    var form = global.document.getElementById("jobForm");
    var statusEl = global.document.getElementById("jobStatus");
    if (!form || typeof portalJobFormBind !== "function") return;
    function showStatus(msg, isErr) {
      setStatus(statusEl, msg, isErr);
    }
    portalOnboardingFormInitJobOptions(form);
    portalJobFormBind(form);
    portalJobFormPrefillFromProfile(form);
    try {
      var res = await portalOnboardingFormLoadJob();
      if (res && res.draft && res.draft.payload) portalJobFormFill(form, res.draft.payload);
    } catch (e) {
      console.warn("[onboarding hub] job load", e);
    }
    var draftBtn = global.document.getElementById("jobSaveDraft");
    if (draftBtn) {
      draftBtn.addEventListener("click", async function () {
        showStatus("Saving…");
        try {
          var saved = await portalOnboardingFormSaveJob(portalJobFormReadPayload(form), {
            submit: false,
          });
          showStatus(
            typeof portalOnboardingFormSaveStatusMessage === "function"
              ? portalOnboardingFormSaveStatusMessage(saved && saved.source, "draft")
              : "Draft saved."
          );
        } catch (_) {
          showStatus("Save failed. Try again.", true);
        }
      });
    }
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var msg = portalJobFormValidate(form, { submit: true });
      if (msg) {
        showStatus(msg, true);
        return;
      }
      showStatus("Submitting…");
      try {
        var submitted = await portalOnboardingFormSaveJob(portalJobFormReadPayload(form), {
          submit: true,
        });
        showStatus(
          typeof portalOnboardingFormSaveStatusMessage === "function"
            ? portalOnboardingFormSaveStatusMessage(submitted && submitted.source, "submit")
            : "Application submitted."
        );
      } catch (_) {
        showStatus("Submit failed. Try again.", true);
      }
    });
  }

  async function initHealth() {
    var form = global.document.getElementById("healthForm");
    var statusEl = global.document.getElementById("healthStatus");
    if (!form || typeof portalHealthFormBind !== "function") return;
    function showStatus(msg, isErr) {
      setStatus(statusEl, msg, isErr);
    }
    portalOnboardingFormInitHealthOptions(form);
    portalHealthFormBind(form);
    portalHealthFormPrefillFromProfile(form);
    try {
      var res = await portalOnboardingFormLoadHealth();
      if (res && res.draft && res.draft.payload) portalHealthFormFill(form, res.draft.payload);
    } catch (e) {
      console.warn("[onboarding hub] health load", e);
    }
    var draftBtn = global.document.getElementById("healthSaveDraft");
    if (draftBtn) {
      draftBtn.addEventListener("click", async function () {
        showStatus("Saving…");
        try {
          var saved = await portalOnboardingFormSaveHealth(portalHealthFormReadPayload(form), {
            submit: false,
          });
          showStatus(
            typeof portalOnboardingFormSaveStatusMessage === "function"
              ? portalOnboardingFormSaveStatusMessage(saved && saved.source, "draft")
              : "Draft saved."
          );
        } catch (_) {
          showStatus("Save failed. Try again.", true);
        }
      });
    }
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var msg = portalHealthFormValidate(form, { submit: true });
      if (msg) {
        showStatus(msg, true);
        return;
      }
      showStatus("Submitting…");
      try {
        var submitted = await portalOnboardingFormSaveHealth(portalHealthFormReadPayload(form), {
          submit: true,
        });
        showStatus(
          typeof portalOnboardingFormSaveStatusMessage === "function"
            ? portalOnboardingFormSaveStatusMessage(submitted && submitted.source, "submit")
            : "Questionnaire submitted."
        );
      } catch (_) {
        showStatus("Submit failed. Try again.", true);
      }
    });
  }

  global.portalOnboardingHubBoot = async function portalOnboardingHubBoot() {
    bindAccordions();
    var sessionEl = global.document.getElementById("obFormSession");
    var token = await portalOnboardingFormEnsureSession();
    if (!token) {
      if (sessionEl) {
        sessionEl.hidden = false;
        sessionEl.classList.add("is-error");
        sessionEl.textContent = "Not signed in — redirecting to login…";
      }
      return;
    }
    if (sessionEl) {
      var who = portalOnboardingFormSessionLabel();
      sessionEl.hidden = false;
      sessionEl.classList.remove("is-error");
      sessionEl.textContent = who ? "Connected as " + who : "Connected";
    }
    if (typeof portalOnboardingFormApplyBackLink === "function") {
      portalOnboardingFormApplyBackLink();
    }
    await refreshPhotoPreview();
    await initPhoto();
    await initDocs();
    await refreshDocChips();
    await initJob();
    await initHealth();
  };
})(typeof window !== "undefined" ? window : globalThis);
