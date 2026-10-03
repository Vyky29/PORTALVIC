/* 30 minutes after the feedback API reminder, open WhatsApp Business on this computer.
   Does not send through the API. One click opens the chat with the text ready. */
(function (global) {
  var OPENED_KEY = "portalFeedbackBizWaOpened";

  function openedSet() {
    try {
      var raw = JSON.parse(global.localStorage.getItem(OPENED_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_e) {
      return [];
    }
  }

  function markOpened(id) {
    var list = openedSet();
    if (list.indexOf(id) < 0) list.push(id);
    try {
      global.localStorage.setItem(OPENED_KEY, JSON.stringify(list.slice(-40)));
    } catch (_e) {}
  }

  function digits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function paint(rows) {
    var opened = openedSet();
    var due = (rows || []).filter(function (r) {
      return r && opened.indexOf(r.id) < 0 && digits(r.staff_phone);
    });
    var box = document.getElementById("portalFeedbackBizWaBanner");
    if (!due.length) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "portalFeedbackBizWaBanner";
      box.setAttribute("role", "status");
      box.style.cssText = [
        "position:fixed",
        "z-index:22000",
        "left:16px",
        "right:16px",
        "bottom:16px",
        "max-width:36rem",
        "margin:0 auto",
        "box-sizing:border-box",
        "background:#ecfdf3",
        "border:1px solid #86efac",
        "border-radius:14px",
        "padding:12px 14px",
        "box-shadow:0 8px 24px rgba(15,23,42,.12)",
        "font:600 14px/1.45 system-ui,sans-serif",
        "color:#14532d",
        "min-width:0"
      ].join(";");
      document.body.appendChild(box);
    }
    box.textContent = "";
    var title = document.createElement("div");
    title.textContent = "Feedback is still open 30 minutes after the API message. Send it on WhatsApp Business. This does not go through the API.";
    title.style.cssText = "margin:0 0 8px;overflow-wrap:anywhere";
    box.appendChild(title);
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;min-width:0";
    due.forEach(function (r) {
      var btn = document.createElement("button");
      btn.type = "button";
      var who = String(r.staff_display_name || r.staff_username || "Staff");
      btn.textContent = "Open WhatsApp Business - " + who;
      btn.style.cssText = [
        "box-sizing:border-box",
        "max-width:100%",
        "min-width:0",
        "padding:8px 12px",
        "border-radius:999px",
        "border:0",
        "background:#128C7E",
        "color:#fff",
        "font:700 13px/1.2 system-ui,sans-serif",
        "cursor:pointer",
        "overflow-wrap:anywhere"
      ].join(";");
      btn.addEventListener("click", function () {
        var phone = digits(r.staff_phone);
        var text = String(r.body_text || "");
        var url = "https://web.whatsapp.com/send?phone=" + phone + (text ? "&text=" + encodeURIComponent(text) : "");
        global.open(url, "_blank", "noopener,noreferrer");
        markOpened(r.id);
        paint(rows);
      });
      row.appendChild(btn);
    });
    box.appendChild(row);
  }

  function resolveClient() {
    try {
      if (typeof global.getSchedSupabaseClient === "function") {
        var direct = global.getSchedSupabaseClient();
        if (direct && typeof direct.from === "function") return direct;
      }
    } catch (_direct) {}
    try {
      if (typeof global.portalAdminGetSupabaseClient === "function") {
        var bridged = global.portalAdminGetSupabaseClient();
        if (bridged && typeof bridged.from === "function") return bridged;
      }
    } catch (_bridge) {}
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client && typeof box.client.from === "function" ? box.client : null;
  }

  async function tick() {
    var client = resolveClient();
    if (!client) return;
    var since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    var res = await client
      .from("portal_staff_notify_log")
      .select("id, staff_display_name, staff_username, staff_phone, body_text")
      .eq("kind", "feedback_biz_wa")
      .eq("whatsapp_status", "business_pending")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8);
    if (!res || res.error || !res.data) return;
    paint(res.data);
  }

  function start() {
    tick();
    global.setTimeout(tick, 4000);
    global.setTimeout(tick, 9000);
    global.setInterval(tick, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      global.setTimeout(start, 1500);
    });
  } else {
    global.setTimeout(start, 1500);
  }
})(window);
