/**
 * Admin Active: click a participant photo to pan and zoom it.
 * Saves portal_participants.avatar_frame { x, y, zoom }.
 * x/y are percent shift from centre. zoom 1 shows the whole photo.
 */
(function (global) {
  "use strict";

  var overlay = null;
  var state = null;

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "photoFrameSheet";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="photo-frame-sheet__back" data-photo-frame-cancel="1"></div>' +
      '<div class="photo-frame-sheet__card" role="dialog" aria-modal="true" aria-labelledby="photoFrameTitle">' +
      '<h3 id="photoFrameTitle" class="photo-frame-sheet__title">Centre photo</h3>' +
      '<p class="photo-frame-sheet__name" id="photoFrameName"></p>' +
      '<div class="photo-frame-sheet__stage" id="photoFrameStage">' +
      '<img id="photoFrameImg" alt="" draggable="false" />' +
      "</div>" +
      '<p class="photo-frame-sheet__hint">Drag to centre. Zoom 1 shows the whole photo, no crop.</p>' +
      '<label class="photo-frame-sheet__zoom">Zoom <input id="photoFrameZoom" type="range" min="1" max="2.6" step="0.02" value="1" /></label>' +
      '<p class="photo-frame-sheet__status" id="photoFrameStatus"></p>' +
      '<div class="photo-frame-sheet__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="photoFrameReset">Reset</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-photo-frame-cancel="1">Cancel</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="photoFrameSave">Save</button>' +
      "</div></div>";
    document.body.appendChild(overlay);
    var css = document.createElement("style");
    css.textContent =
      "#photoFrameSheet{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;}" +
      "#photoFrameSheet[hidden]{display:none !important;}" +
      ".photo-frame-sheet__back{position:absolute;inset:0;background:rgba(15,23,42,.45);}" +
      ".photo-frame-sheet__card{position:relative;width:min(360px,100%);max-width:100%;background:#fff;border-radius:16px;padding:16px;box-shadow:0 16px 40px rgba(15,23,42,.22);box-sizing:border-box;}" +
      ".photo-frame-sheet__title{margin:0;font-size:16px;}" +
      ".photo-frame-sheet__name{margin:4px 0 12px;font-size:13px;color:#64748b;overflow-wrap:anywhere;}" +
      ".photo-frame-sheet__stage{width:220px;height:220px;max-width:100%;margin:0 auto 12px;border-radius:50%;overflow:hidden;background:#e8f2f8;position:relative;touch-action:none;cursor:grab;}" +
      ".photo-frame-sheet__stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center center;transform-origin:center center;user-select:none;-webkit-user-drag:none;}" +
      ".photo-frame-sheet__hint{margin:0 0 8px;font-size:12px;color:#475569;}" +
      ".photo-frame-sheet__zoom{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin:0 0 8px;}" +
      ".photo-frame-sheet__zoom input{flex:1;min-width:0;}" +
      ".photo-frame-sheet__status{min-height:1.2em;margin:0 0 8px;font-size:12px;color:#b45309;overflow-wrap:anywhere;}" +
      ".photo-frame-sheet__actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}";
    document.head.appendChild(css);

    overlay.addEventListener("click", function (ev) {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-photo-frame-cancel") === "1") closeSheet();
    });
    document.getElementById("photoFrameReset").addEventListener("click", function () {
      if (!state) return;
      state.x = 0;
      state.y = 0;
      state.zoom = 1;
      paint();
    });
    document.getElementById("photoFrameZoom").addEventListener("input", function (ev) {
      if (!state) return;
      state.zoom = clamp(ev.target.value, 1, 2.6);
      paint();
    });
    document.getElementById("photoFrameSave").addEventListener("click", function () {
      void saveFrame();
    });

    var stage = document.getElementById("photoFrameStage");
    var drag = null;
    stage.addEventListener("pointerdown", function (ev) {
      if (!state) return;
      drag = { x: ev.clientX, y: ev.clientY, ox: state.x, oy: state.y };
      stage.setPointerCapture(ev.pointerId);
      stage.style.cursor = "grabbing";
    });
    stage.addEventListener("pointermove", function (ev) {
      if (!drag || !state) return;
      var rect = stage.getBoundingClientRect();
      var w = rect.width || 1;
      var h = rect.height || 1;
      state.x = clamp(drag.ox + ((ev.clientX - drag.x) / w) * 100, -80, 80);
      state.y = clamp(drag.oy + ((ev.clientY - drag.y) / h) * 100, -80, 80);
      paint();
    });
    function endDrag() {
      drag = null;
      stage.style.cursor = "grab";
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    return overlay;
  }

  function paint() {
    if (!state) return;
    var img = document.getElementById("photoFrameImg");
    var zoom = document.getElementById("photoFrameZoom");
    if (img) {
      img.style.transform =
        "translate(" + state.x + "%, " + state.y + "%) scale(" + state.zoom + ")";
    }
    if (zoom && String(zoom.value) !== String(state.zoom)) zoom.value = String(state.zoom);
  }

  function closeSheet() {
    if (overlay) overlay.hidden = true;
    state = null;
  }

  function openSheet(span) {
    var img = span.querySelector("img");
    if (!img) return;
    ensureOverlay();
    var contact = String(span.getAttribute("data-photo-contact") || "").replace(/^pp-/i, "").trim();
    var name = String(span.getAttribute("data-photo-name") || "").trim();
    var saved =
      typeof global.portalLookupParticipantPhotoFrame === "function"
        ? global.portalLookupParticipantPhotoFrame(contact, name)
        : null;
    state = {
      contact: contact,
      name: name,
      src: img.getAttribute("src") || img.src || "",
      x: saved ? saved.x : 0,
      y: saved ? saved.y : 0,
      zoom: saved ? saved.zoom : 1,
    };
    document.getElementById("photoFrameName").textContent = name || "Participant";
    document.getElementById("photoFrameStatus").textContent = contact ? "" : "No contact id on this photo, so Save cannot store it.";
    var preview = document.getElementById("photoFrameImg");
    preview.src = state.src;
    overlay.hidden = false;
    paint();
  }

  function paintLive() {
    if (!state || typeof global.portalRegisterParticipantPhotoFrame !== "function") return;
    global.portalRegisterParticipantPhotoFrame(state.contact, state.name, {
      x: state.x,
      y: state.y,
      zoom: state.zoom,
    });
    document.querySelectorAll("[data-photo-adjust] img, [data-photo-name] img").forEach(function (img) {
      var wrap = img.closest("[data-photo-name], [data-photo-adjust]");
      if (!wrap) return;
      var cid = String(wrap.getAttribute("data-photo-contact") || "").replace(/^pp-/i, "");
      var nm = String(wrap.getAttribute("data-photo-name") || "");
      if (state.contact && cid && cid !== state.contact) return;
      if (!cid && nm && nm !== state.name) return;
      if (typeof global.portalApplyParticipantPhotoFrame === "function") {
        global.portalApplyParticipantPhotoFrame(img, nm || state.name, cid || state.contact, img.getAttribute("src") || "");
      }
    });
  }

  async function saveFrame() {
    var status = document.getElementById("photoFrameStatus");
    if (!state || !state.contact) {
      if (status) status.textContent = "No contact id on this photo.";
      return;
    }
    var box = global.__PORTAL_SUPABASE__;
    var sb = box && box.client;
    if (!sb || typeof sb.from !== "function") {
      if (status) status.textContent = "Not signed in, so this stays on this browser only.";
      paintLive();
      closeSheet();
      return;
    }
    var frame = {
      x: Math.round(state.x * 10) / 10,
      y: Math.round(state.y * 10) / 10,
      zoom: Math.round(state.zoom * 100) / 100,
    };
    if (status) status.textContent = "Saving...";
    var res = await sb
      .from("portal_participants")
      .update({ avatar_frame: frame, updated_at: new Date().toISOString() })
      .eq("contact_id", state.contact);
    if (res && res.error) {
      if (status) status.textContent = "Could not save. " + String(res.error.message || "Try again.");
      return;
    }
    paintLive();
    closeSheet();
  }

  document.addEventListener("click", function (ev) {
    var span = ev.target && ev.target.closest ? ev.target.closest("[data-photo-adjust]") : null;
    if (!span) return;
    ev.preventDefault();
    ev.stopPropagation();
    openSheet(span);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && overlay && !overlay.hidden) closeSheet();
  });
})(typeof window !== "undefined" ? window : globalThis);
