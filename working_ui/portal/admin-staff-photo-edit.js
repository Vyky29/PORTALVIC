/**
 * Office editor: original onboarding photo -> grey background, face centered.
 * Saves display.png, which admin, staff and parent portals show.
 */
(function (global) {
  "use strict";

  var SIZE = 640;
  var GREY = "#b7b7b7";
  var segmenterPromise = null;

  function injectStyle() {
    if (document.getElementById("obPhotoEditStyle")) return;
    var css =
      ".ob-photo-edit{position:fixed;inset:0;z-index:21000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:auto}" +
      ".ob-photo-edit__card{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:16px;box-shadow:0 18px 50px rgba(15,23,42,.25);min-width:0;max-height:100%;overflow:auto;pointer-events:auto}" +
      ".ob-photo-edit__card h3{margin:0 0 6px;font-size:16px;color:#0f2747;overflow-wrap:anywhere}" +
      ".ob-photo-edit__card p{margin:0 0 10px;font-size:13px;color:#334155;line-height:1.45;overflow-wrap:break-word}" +
      ".ob-photo-edit__stage{display:flex;justify-content:center;margin:0 0 10px}" +
      ".ob-photo-edit__stage canvas{width:220px;height:220px;border-radius:999px;background:#b7b7b7;display:block}" +
      ".ob-photo-edit__status{min-height:2.6em}" +
      ".ob-photo-edit__range{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#0f2747;margin:0 0 8px}" +
      ".ob-photo-edit__range input{flex:1;min-width:0}" +
      ".ob-photo-edit__actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
      ".ob-photo-edit__btn,.ob-photo-edit__link{font-size:12px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none}" +
      ".ob-photo-edit__btn--pri{color:#fff;background:#0f2747;border-color:#0f2747}" +
      ".ob-photo-edit__btn:disabled{opacity:.45;cursor:not-allowed}";
    var st = document.createElement("style");
    st.id = "obPhotoEditStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadImage(url) {
    return fetch(url, { mode: "cors", credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error("Could not open the original photo.");
        return res.blob();
      })
      .then(function (blob) {
        var obj = URL.createObjectURL(blob);
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            resolve({ img: img, revoke: function () { URL.revokeObjectURL(obj); } });
          };
          img.onerror = function () {
            URL.revokeObjectURL(obj);
            reject(new Error("Could not read that photo."));
          };
          img.src = obj;
        });
      });
  }

  function segmenter() {
    if (segmenterPromise) return segmenterPromise;
    segmenterPromise = import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs"
    ).then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
      ).then(function (fileset) {
        return vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
            delegate: "CPU"
          },
          runningMode: "IMAGE",
          outputCategoryMask: true
        });
      });
    });
    return segmenterPromise;
  }

  function maskFromResult(result, width, height) {
    var mask = result && result.categoryMask;
    if (!mask || typeof mask.getAsUint8Array !== "function") return null;
    var data = mask.getAsUint8Array();
    var mw = mask.width || width;
    var mh = mask.height || height;
    var small = document.createElement("canvas");
    small.width = mw;
    small.height = mh;
    var sctx = small.getContext("2d");
    if (!sctx) return null;
    var pixels = sctx.createImageData(mw, mh);
    var i;
    for (i = 0; i < data.length; i++) {
      var on = data[i] > 0 ? 255 : 0;
      pixels.data[i * 4] = 255;
      pixels.data[i * 4 + 1] = 255;
      pixels.data[i * 4 + 2] = 255;
      pixels.data[i * 4 + 3] = on;
    }
    sctx.putImageData(pixels, 0, 0);
    var full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    var fctx = full.getContext("2d");
    if (!fctx) return null;
    fctx.drawImage(small, 0, 0, width, height);
    return full;
  }

  function maskLooksInverted(maskCanvas) {
    var ctx = maskCanvas.getContext("2d");
    if (!ctx) return false;
    var w = maskCanvas.width;
    var h = maskCanvas.height;
    var pixels = ctx.getImageData(0, 0, w, h).data;
    function alpha(x, y) {
      var px = Math.max(0, Math.min(w - 1, x | 0));
      var py = Math.max(0, Math.min(h - 1, y | 0));
      return pixels[(py * w + px) * 4 + 3];
    }
    var center = alpha(w / 2, h * 0.4);
    var corner = (alpha(4, 4) + alpha(w - 5, 4) + alpha(4, h - 5) + alpha(w - 5, h - 5)) / 4;
    return corner > 80 && center < 40;
  }

  function invertMask(maskCanvas) {
    var ctx = maskCanvas.getContext("2d");
    if (!ctx) return;
    var frame = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    var i;
    for (i = 3; i < frame.data.length; i += 4) {
      frame.data[i] = 255 - frame.data[i];
    }
    ctx.putImageData(frame, 0, 0);
  }

  function personBox(maskCanvas) {
    var ctx = maskCanvas.getContext("2d");
    if (!ctx) return null;
    var w = maskCanvas.width;
    var h = maskCanvas.height;
    var pixels = ctx.getImageData(0, 0, w, h).data;
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var found = false;
    var y;
    var x;
    for (y = 0; y < h; y += 2) {
      for (x = 0; x < w; x += 2) {
        if (pixels[(y * w + x) * 4 + 3] > 40) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  function paint(state) {
    var canvas = state.canvas;
    var ctx = canvas.getContext("2d");
    if (!ctx || !state.img) return;
    ctx.fillStyle = GREY;
    ctx.fillRect(0, 0, SIZE, SIZE);
    var img = state.img;
    var box = state.mask ? personBox(state.mask) : null;
    var faceX = img.naturalWidth / 2;
    var faceY = img.naturalHeight * 0.38;
    var span = Math.max(img.naturalWidth, img.naturalHeight);
    if (box) {
      faceX = box.x + box.w / 2;
      faceY = box.y + box.h * 0.28;
      span = Math.max(box.w, box.h * 0.62);
    }
    var scale = (SIZE * 0.78 / span) * state.zoom;
    var person = document.createElement("canvas");
    person.width = img.naturalWidth;
    person.height = img.naturalHeight;
    var pctx = person.getContext("2d");
    if (!pctx) return;
    pctx.drawImage(img, 0, 0);
    if (state.mask) {
      pctx.globalCompositeOperation = "destination-in";
      pctx.filter = "blur(0.6px)";
      pctx.drawImage(state.mask, 0, 0);
      pctx.filter = "none";
    }
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2 + state.nudgeY);
    ctx.scale(scale, scale);
    ctx.translate(-faceX, -faceY);
    ctx.drawImage(person, 0, 0);
    ctx.restore();
  }

  function open(opts) {
    opts = opts || {};
    var originalUrl = String(opts.originalUrl || "").trim();
    var staffId = String(opts.staffId || "").trim();
    var name = String(opts.name || "Hire").trim();
    if (!originalUrl || !staffId) return;
    injectStyle();
    var existing = document.getElementById("obPhotoEditModal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "obPhotoEditModal";
    modal.className = "ob-photo-edit";
    modal.innerHTML =
      '<div class="ob-photo-edit__card" role="dialog" aria-modal="true" aria-label="Edit display photo">' +
      "<h3>" + esc(name) + "</h3>" +
      "<p>Original stays. Clean removes the background, puts the grey, and centers the face. Save is the photo families see.</p>" +
      '<div class="ob-photo-edit__stage"><canvas id="obPhotoEditCanvas" width="640" height="640"></canvas></div>' +
      '<p class="ob-photo-edit__status" id="obPhotoEditStatus">Opening the original…</p>' +
      '<label class="ob-photo-edit__range">Zoom <input id="obPhotoEditZoom" type="range" min="70" max="160" value="100" /></label>' +
      '<label class="ob-photo-edit__range">Move face <input id="obPhotoEditNudge" type="range" min="-120" max="120" value="0" /></label>' +
      '<div class="ob-photo-edit__actions">' +
      '<a class="ob-photo-edit__link" href="' + esc(originalUrl) + '" target="_blank" rel="noopener noreferrer">Open original</a>' +
      '<button type="button" class="ob-photo-edit__btn" id="obPhotoEditClean">Clean background</button>' +
      '<button type="button" class="ob-photo-edit__btn ob-photo-edit__btn--pri" id="obPhotoEditSave" disabled>Save display photo</button>' +
      '<button type="button" class="ob-photo-edit__btn" id="obPhotoEditClose">Close</button>' +
      "</div></div>";
    document.body.appendChild(modal);

    var state = {
      img: null,
      mask: null,
      zoom: 1,
      nudgeY: 0,
      canvas: modal.querySelector("#obPhotoEditCanvas"),
      revoke: null
    };
    var status = modal.querySelector("#obPhotoEditStatus");
    var saveBtn = modal.querySelector("#obPhotoEditSave");

    function setStatus(text) {
      if (status) status.textContent = text;
    }

    function close() {
      if (state.revoke) state.revoke();
      modal.remove();
    }

    modal.querySelector("#obPhotoEditClose").addEventListener("click", close);
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) close();
    });
    modal.querySelector("#obPhotoEditZoom").addEventListener("input", function (ev) {
      state.zoom = Number(ev.target.value || 100) / 100;
      paint(state);
    });
    modal.querySelector("#obPhotoEditNudge").addEventListener("input", function (ev) {
      state.nudgeY = Number(ev.target.value || 0);
      paint(state);
    });
    modal.querySelector("#obPhotoEditClean").addEventListener("click", function () {
      if (!state.img) return;
      setStatus("Removing the background…");
      segmenter()
        .then(function (seg) {
          var result = seg.segment(state.img);
          state.mask = maskFromResult(result, state.img.naturalWidth, state.img.naturalHeight);
          if (result && typeof result.close === "function") result.close();
          if (!state.mask) throw new Error("No person found in that photo.");
          if (maskLooksInverted(state.mask)) invertMask(state.mask);
          paint(state);
          setStatus("Background is grey and the face is centered. Nudge it, then save.");
          if (saveBtn) saveBtn.disabled = false;
        })
        .catch(function (err) {
          segmenterPromise = null;
          setStatus((err && err.message) || "Could not clean the background. Try again.");
        });
    });
    saveBtn.addEventListener("click", function () {
      if (!state.mask) {
        setStatus("Clean the background before saving.");
        return;
      }
      saveBtn.disabled = true;
      setStatus("Saving the display photo…");
      var data = state.canvas.toDataURL("image/png");
      Promise.resolve(opts.save(staffId, data))
        .then(function () {
          setStatus("Saved. Admin, staff and parent portals use this photo.");
          if (typeof opts.onSaved === "function") opts.onSaved();
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          setStatus((err && err.message) || "Could not save the display photo.");
        });
    });

    loadImage(originalUrl)
      .then(function (loaded) {
        state.img = loaded.img;
        state.revoke = loaded.revoke;
        paint(state);
        setStatus("Clean the background, then save. The original stays.");
      })
      .catch(function (err) {
        setStatus((err && err.message) || "Could not open the original photo.");
      });
  }

  global.PortalStaffPhotoEdit = { open: open };
})(typeof window !== "undefined" ? window : this);
