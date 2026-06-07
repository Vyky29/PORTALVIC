/**
 * Internal DM — photo and document attachments (Storage bucket portal-dm-media).
 * Requires migration 20260605170000_portal_dm_image_file_attachments.sql on Portal Supabase.
 */
(function (global) {
  "use strict";

  var BUCKET = "portal-dm-media";
  var MAX_BYTES = 15 * 1024 * 1024;
  var SIGNED_URL_SEC = 3600;
  var IMAGE_TYPES = /^image\//i;
  var DOC_TYPES =
    /^(application\/pdf|application\/msword|application\/vnd\.|text\/plain)/i;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function msgType(m) {
    return String((m && m.message_type) || "text").toLowerCase();
  }

  function isImageMsg(m) {
    return msgType(m) === "image";
  }

  function isFileMsg(m) {
    return msgType(m) === "file";
  }

  function extForFile(file, messageType) {
    var name = String((file && file.name) || "").trim();
    var dot = name.lastIndexOf(".");
    if (dot > 0) return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    var mime = String((file && file.type) || "").toLowerCase();
    if (messageType === "image") {
      if (mime.indexOf("png") >= 0) return "png";
      if (mime.indexOf("webp") >= 0) return "webp";
      if (mime.indexOf("gif") >= 0) return "gif";
      return "jpg";
    }
    if (mime.indexOf("pdf") >= 0) return "pdf";
    if (mime.indexOf("word") >= 0) return "docx";
    if (mime.indexOf("sheet") >= 0 || mime.indexOf("excel") >= 0) return "xlsx";
    if (mime.indexOf("plain") >= 0) return "txt";
    return "bin";
  }

  function injectStyles() {
    if (document.getElementById("portal-dm-attach-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-dm-attach-styles";
    st.textContent =
      ".portal-dm-attach-btn{flex-shrink:0;width:44px;height:44px;border-radius:50%;border:1px solid var(--line,#e2e8f0);background:var(--surface,#fff);color:var(--ink,#0f172a);font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}" +
      ".portal-dm-attach-btn:hover{background:#f8fafc}" +
      ".portal-dm-attach-btn:disabled{opacity:.5;cursor:not-allowed}" +
      ".portal-dm-attach-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}" +
      ".portal-dm-img-msg{max-width:min(100%,280px);min-width:0}" +
      ".portal-dm-img-msg img{display:block;max-width:100%;height:auto;border-radius:12px;cursor:pointer}" +
      ".portal-dm-file-msg{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 8px;border-radius:10px;background:rgba(15,23,42,.06)}" +
      ".portal-dm-file-msg a{color:inherit;font-weight:700;text-decoration:underline;min-width:0;overflow-wrap:anywhere}" +
      ".portal-dm-attach-caption{margin-top:6px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:break-word}";
    document.head.appendChild(st);
  }

  async function signedUrl(client, path) {
    if (!client || !path) return "";
    var res = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SEC);
    if (res.error || !res.data || !res.data.signedUrl) return "";
    return res.data.signedUrl;
  }

  function fileLabel(m) {
    var cap = String((m && m.body) || "").trim();
    if (cap) return cap;
    var path = String((m && m.audio_storage_path) || "");
    var bits = path.split("/");
    return bits[bits.length - 1] || "Document";
  }

  async function fillMessageBody(host, m, client, escFn) {
    escFn = escFn || esc;
    host.innerHTML = "";
    var path = String((m && m.audio_storage_path) || "").trim();
    if (isImageMsg(m)) {
      var url = path ? await signedUrl(client, path) : "";
      var wrap = document.createElement("div");
      wrap.className = "portal-dm-img-msg";
      if (url) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = "Photo attachment";
        img.loading = "lazy";
        img.addEventListener("click", function () {
          try {
            window.open(url, "_blank", "noopener");
          } catch (_) {}
        });
        wrap.appendChild(img);
      } else {
        wrap.innerHTML =
          '<p class="muted" style="margin:0;font-size:12px">Photo (unavailable)</p>';
      }
      host.appendChild(wrap);
      var cap = String((m && m.body) || "").trim();
      if (cap) {
        var capEl = document.createElement("div");
        capEl.className = "portal-dm-attach-caption";
        capEl.textContent = cap;
        host.appendChild(capEl);
      }
      return;
    }
    if (isFileMsg(m)) {
      var urlF = path ? await signedUrl(client, path) : "";
      var label = escFn(fileLabel(m));
      var row = document.createElement("div");
      row.className = "portal-dm-file-msg";
      row.innerHTML =
        '<span aria-hidden="true">📎</span>' +
        (urlF
          ? '<a href="' + escFn(urlF) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>"
          : "<span>" + label + "</span>");
      host.appendChild(row);
      return;
    }
    var text = document.createElement("div");
    text.style.whiteSpace = "pre-wrap";
    text.style.minWidth = "0";
    text.style.overflowWrap = "break-word";
    text.textContent = String((m && m.body) || "");
    host.appendChild(text);
  }

  async function sendAttachment(opts) {
    opts = opts || {};
    var client = opts.client;
    var file = opts.file;
    if (!client || !file) throw new Error("Attachment not available.");
    if (file.size > MAX_BYTES) throw new Error("File is too large (max 15 MB).");
    var mime = String(file.type || "application/octet-stream").split(";")[0];
    var isImage = IMAGE_TYPES.test(mime);
    var isDoc = isImage || DOC_TYPES.test(mime);
    if (!isDoc) throw new Error("Use a photo or PDF/Word/Excel/text document.");

    var messageType = isImage ? "image" : "file";
    var msgId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "f" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
    var ext = extForFile(file, messageType);
    var caption = String(opts.caption || "").trim();
    var path = "";
    var row = {
      id: msgId,
      message_type: messageType,
      body: caption || (messageType === "file" ? String(file.name || "Document").trim() : null),
      audio_storage_path: "",
      audio_mime: mime,
      duration_ms: null,
    };

    if (opts.kind === "group") {
      var gid = String(opts.groupId || "").trim();
      if (!gid) throw new Error("No group selected.");
      path = "group/" + gid + "/" + msgId + "." + ext;
      row.group_id = gid;
      row.author_id = String(opts.authorId || "").trim();
      if (!row.author_id) throw new Error("Not signed in.");
    } else {
      var tid = String(opts.threadId || "").trim();
      if (!tid) throw new Error("No conversation selected.");
      path = "thread/" + tid + "/" + msgId + "." + ext;
      row.thread_id = tid;
    }
    row.audio_storage_path = path;

    var up = await client.storage.from(BUCKET).upload(path, file, {
      contentType: mime,
      upsert: false,
    });
    if (up.error) throw up.error;

    var table =
      opts.kind === "group" ? "portal_ceo_group_message" : "portal_staff_dm_messages";
    var ins = await client.from(table).insert([row]).select("id");
    if (ins.error) throw ins.error;
    return { id: msgId, path: path };
  }

  function ensureComposeRow(textarea) {
    if (!textarea || !textarea.parentNode) return null;
    injectStyles();
    var parent = textarea.parentNode;
    if (!parent.classList.contains("portal-dm-compose-row")) {
      var row = document.createElement("div");
      row.className = "portal-dm-compose-row";
      parent.insertBefore(row, textarea);
      row.appendChild(textarea);
      parent = row;
    }
    return parent;
  }

  function attachFilePickers(opts) {
    opts = opts || {};
    injectStyles();
    var textarea =
      typeof opts.textareaId === "string"
        ? document.getElementById(opts.textareaId)
        : opts.textarea;
    if (!textarea || textarea.dataset.portalDmAttachBound === "1") return;
    textarea.dataset.portalDmAttachBound = "1";
    var row = ensureComposeRow(textarea);
    if (!row) return;

    var actions = row.querySelector(".portal-dm-attach-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "portal-dm-attach-actions";
      row.insertBefore(actions, textarea);
    }

    var photoInp = document.createElement("input");
    photoInp.type = "file";
    photoInp.accept = "image/*";
    photoInp.hidden = true;
    photoInp.id = (opts.photoInputId || opts.textareaId || "dm") + "PhotoInp";
    row.appendChild(photoInp);

    var docInp = document.createElement("input");
    docInp.type = "file";
    docInp.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf";
    docInp.hidden = true;
    docInp.id = (opts.docInputId || opts.textareaId || "dm") + "DocInp";
    row.appendChild(docInp);

    function addBtn(id, label, title, onClick) {
      var existing = document.getElementById(id);
      if (existing) return existing;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = id;
      btn.className = "portal-dm-attach-btn";
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", onClick);
      actions.appendChild(btn);
      return btn;
    }

    var photoBtn = addBtn(
      opts.photoBtnId || "portalDmPhotoBtn",
      "🖼",
      "Send photo",
      function () {
        photoInp.click();
      }
    );
    var docBtn = addBtn(
      opts.docBtnId || "portalDmDocBtn",
      "📎",
      "Send document",
      function () {
        docInp.click();
      }
    );

    function onPick(inp) {
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0];
        inp.value = "";
        if (!file) return;
        void (async function () {
          if (typeof opts.getContext !== "function") return;
          var ctx = opts.getContext();
          if (!ctx || !ctx.client) {
            if (opts.onError) opts.onError("Not signed in.");
            return;
          }
          if (!ctx.threadId && !ctx.groupId) {
            if (opts.onError) opts.onError("Open a conversation first.");
            return;
          }
          photoBtn.disabled = true;
          docBtn.disabled = true;
          try {
            await sendAttachment({
              client: ctx.client,
              file: file,
              caption: textarea ? String(textarea.value || "").trim() : "",
              threadId: ctx.threadId,
              groupId: ctx.groupId,
              kind: ctx.groupId ? "group" : "thread",
              authorId: ctx.authorId,
            });
            if (textarea) textarea.value = "";
            if (typeof opts.onSent === "function") await opts.onSent();
          } catch (e) {
            if (opts.onError) opts.onError(String((e && e.message) || e || "Upload failed."));
          } finally {
            photoBtn.disabled = false;
            docBtn.disabled = false;
          }
        })();
      });
    }
    onPick(photoInp);
    onPick(docInp);
  }

  global.portalDmAttachments = {
    BUCKET: BUCKET,
    isImageMsg: isImageMsg,
    isFileMsg: isFileMsg,
    fillMessageBody: fillMessageBody,
    sendAttachment: sendAttachment,
    attachFilePickers: attachFilePickers,
  };
})(typeof window !== "undefined" ? window : globalThis);
