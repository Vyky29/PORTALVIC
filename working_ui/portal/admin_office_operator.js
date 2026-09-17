/**
 * Office Operator (phase 1) — tool router on Office help.
 * Calls portal-admin-office-operator; PIN reveal needs Confirm.
 */
(function (global) {
  "use strict";

  var FN = "portal-admin-office-operator";
  var DEFAULT_URL = "https://cklpnwhlqsulpmkipmqb.supabase.co";
  var DEFAULT_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function baseUrl() {
    var u =
      (global.SUPABASE_URL && String(global.SUPABASE_URL).trim()) ||
      DEFAULT_URL;
    return String(u).replace(/\/$/, "");
  }

  function anonKey() {
    return (
      (global.SUPABASE_ANON_KEY && String(global.SUPABASE_ANON_KEY).trim()) ||
      DEFAULT_ANON
    );
  }

  function accessToken() {
    if (typeof global.portalAdminResolveAccessToken === "function") {
      var t = global.portalAdminResolveAccessToken();
      if (t) return t;
    }
    try {
      var stores = [global.localStorage, global.sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var store = stores[s];
        if (!store) continue;
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
          var raw = store.getItem(k);
          if (!raw) continue;
          var data = JSON.parse(raw);
          var sess = data && data.access_token ? data : data && data.currentSession;
          if (sess && sess.access_token) return String(sess.access_token);
        }
      }
    } catch (_) {}
    return "";
  }

  function callTool(payload) {
    var token = accessToken();
    if (!token) {
      return Promise.resolve({
        ok: false,
        error: "not_signed_in",
        message: "Sign in on the admin portal first, then reopen Office help.",
      });
    }
    return fetch(baseUrl() + "/functions/v1/" + FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: anonKey(),
      },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!j) j = {};
        if (!res.ok && j.ok !== true) {
          j.ok = false;
          j.http_status = res.status;
          if (!j.message) j.message = j.error || "Request failed (" + res.status + ")";
        }
        return j;
      });
    });
  }

  function detectIntent(raw) {
    var q = String(raw || "").trim();
    var n = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!n) return { kind: "empty" };

    if (
      /mandate|gocardless|direct payment|direct debit|authoris|authoriz|no han autoriz|sin mandato|pending mandate|havent authorised|haven't authorised/.test(
        n,
      )
    ) {
      return { kind: "list_pending_mandates" };
    }

    var pinMatch = n.match(
      /(?:pin|acceso|access|login|portal)\s+(?:for|de|del|para)\s+(.+)$/,
    );
    if (pinMatch && pinMatch[1]) {
      return { kind: "lookup_family_access", query: pinMatch[1].trim() };
    }
    if (/^(?:pin|parent pin|portal pin|family pin)\b/.test(n)) {
      var rest = q.replace(/^(?:pin|parent pin|portal pin|family pin)\s*(?:for|de|del|para)?\s*/i, "");
      return { kind: "lookup_family_access", query: rest || q };
    }
    if (/\b(pin|acceso parent|parent portal)\b/.test(n) && n.split(/\s+/).length >= 2) {
      return {
        kind: "lookup_family_access",
        query: q
          .replace(/\b(parent portal|portal|pin|acceso|access|login|for|de|del|para)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim(),
      };
    }

    if (
      /^(catalog|tools)\b/.test(n) ||
      /what can (you|the operator)|que puedes|qué puedes|operator tools|what can the operator/.test(n)
    ) {
      return { kind: "catalog" };
    }

    return { kind: "guide", query: q };
  }

  function renderFamilies(list) {
    if (!list || !list.length) {
      return '<p class="oh-bot__miss">None found.</p>';
    }
    return (
      '<div class="oh-op-list">' +
      list
        .map(function (f) {
          var kids = Array.isArray(f.children) ? f.children.join(", ") : "";
          var inv = Array.isArray(f.invoices) ? f.invoices.join(", ") : "";
          return (
            '<div class="oh-op-card">' +
            '<div class="oh-op-card__t">' +
            esc(f.parent || "") +
            (kids ? " · " + esc(kids) : "") +
            "</div>" +
            '<div class="oh-op-card__s">Status: ' +
            esc(f.mandate_status || "missing") +
            (inv ? " · Invoices: " + esc(inv) : "") +
            (f.mobile ? " · " + esc(f.mobile) : "") +
            "</div>" +
            (f.parent_person_id
              ? '<button type="button" class="oh-op-mini" data-oh-op-pin-search="' +
                esc(f.parent || kids || f.parent_person_id) +
                '">Find portal access</button>'
              : "") +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderMatches(matches) {
    if (!matches || !matches.length) {
      return '<p class="oh-bot__miss">No matching family. Try another name spelling.</p>';
    }
    return (
      '<div class="oh-op-list">' +
      matches
        .map(function (m) {
          var kids = Array.isArray(m.children) ? m.children.join(", ") : "";
          return (
            '<div class="oh-op-card">' +
            '<div class="oh-op-card__t">' +
            esc(m.parent || "") +
            (kids ? " · " + esc(kids) : "") +
            "</div>" +
            '<div class="oh-op-card__s">' +
            esc(m.email || "") +
            (m.mobile ? " · " + esc(m.mobile) : "") +
            " · PIN hidden</div>" +
            '<button type="button" class="oh-bot__open" data-oh-op-confirm-pin="' +
            esc(m.parent_person_id) +
            '" data-oh-op-family="' +
            esc(m.parent || "") +
            '" data-oh-op-kids="' +
            esc(kids) +
            '">Review before Operator acts</button>' +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderToolResult(j) {
    if (!j || j.ok === false) {
      return (
        '<p class="oh-bot__miss">' +
        esc((j && (j.message || j.error)) || "Operator request failed.") +
        (j && j.error === "not_signed_in"
          ? ' <a href="/login.html">Sign in</a>'
          : "") +
        "</p>"
      );
    }

    if (j.tool === "catalog") {
      var tools = Array.isArray(j.tools) ? j.tools : [];
      return (
        '<p class="oh-bot__title">Operator tools (phase 1)</p>' +
        '<ul class="oh-tips" style="list-style:disc;padding-left:18px;background:transparent;border:0;margin:0">' +
        tools
          .map(function (t) {
            return (
              "<li><strong>" +
              esc(t.title) +
              "</strong> — " +
              esc(t.how || "") +
              "</li>"
            );
          })
          .join("") +
        "</ul>" +
        (Array.isArray(j.never_alone) && j.never_alone.length
          ? '<p class="oh-bot__sum" style="margin-top:10px">Not allowed alone yet: ' +
            esc(j.never_alone.join("; ")) +
            ".</p>"
          : "")
      );
    }

    if (j.tool === "list_pending_mandates") {
      var script = j.phone_script || {};
      var steps = Array.isArray(script.steps) ? script.steps : [];
      var demoHtml = "";
      if (typeof global.PortalOfficeHelpRenderDemos === "function") {
        demoHtml = global.PortalOfficeHelpRenderDemos([
          {
            demo: "parent_gc_setup",
            caption: "Parent portal invoice card — blinking Set up Direct Payment.",
          },
        ]);
      }
      return (
        '<p class="oh-bot__title">Direct Payment — mandate not authorised</p>' +
        '<p class="oh-bot__sum">' +
        esc(String(j.count || 0)) +
        " famil" +
        (j.count === 1 ? "y" : "ies") +
        " with open GoCardless invoices and no live mandate.</p>" +
        demoHtml +
        renderFamilies(j.families) +
        (steps.length
          ? '<div class="oh-tips" style="margin-top:12px"><h3>' +
            esc(script.title || "Phone script") +
            "</h3><ol style=\"margin:0;padding-left:18px\">" +
            steps
              .map(function (s) {
                return "<li>" + esc(s) + "</li>";
              })
              .join("") +
            "</ol>" +
            (script.note ? "<p style=\"margin:8px 0 0\">" + esc(script.note) + "</p>" : "") +
            "</div>"
          : "") +
        '<div class="oh-bot__actions"><button type="button" class="oh-bot__open" data-oh-open-cat="money" data-oh-open-lesson="gocardless_mandate">Open full mandate lesson</button></div>'
      );
    }

    if (j.tool === "lookup_family_access") {
      if (j.confirmed && j.family) {
        var f = j.family;
        var pinDemo = "";
        if (typeof global.PortalOfficeHelpRenderDemos === "function") {
          pinDemo = global.PortalOfficeHelpRenderDemos([
            {
              demo: "pin_confirm",
              caption: "PIN only shows after Confirm reveal — copy into WhatsApp yourself.",
            },
          ]);
        }
        return (
          '<p class="oh-bot__title">Parent portal access (revealed)</p>' +
          '<p class="oh-bot__sum">' +
          esc(f.parent || "") +
          (f.children && f.children.length ? " · " + esc(f.children.join(", ")) : "") +
          "</p>" +
          pinDemo +
          '<p class="oh-bot__where"><strong>URL:</strong> ' +
          esc(f.portal_url || "https://www.clubsensational.org/parent") +
          "<br><strong>Login names:</strong> " +
          esc(f.login_names || "") +
          "<br><strong>PIN:</strong> <code>" +
          esc(f.pin || "") +
          "</code></p>" +
          (j.whatsapp_hint
            ? '<p class="oh-bot__sum">' + esc(j.whatsapp_hint) + "</p>"
            : "") +
          '<p class="oh-bot__miss">Copy into WhatsApp yourself — operator does not send messages.</p>'
        );
      }
      var matchDemo = "";
      if (typeof global.PortalOfficeHelpRenderDemos === "function") {
        matchDemo = global.PortalOfficeHelpRenderDemos([
          {
            demo: "pin_confirm",
            caption: "Orange Final check before Operator reveals the PIN.",
          },
        ]);
      }
      return (
        '<p class="oh-bot__title">Parent portal access</p>' +
        '<p class="oh-bot__sum">' +
        esc(j.confirm_message || "Review before Operator acts — then Confirm on the orange screen.") +
        "</p>" +
        matchDemo +
        renderMatches(j.matches)
      );
    }

    return '<p class="oh-bot__miss">Unexpected operator response.</p>';
  }

  function runOperator(raw, opts) {
    opts = opts || {};
    var intent = opts.intent || detectIntent(raw);
    if (intent.kind === "empty") {
      return Promise.resolve({
        html: '<p class="oh-bot__miss">Ask who needs a Direct Payment mandate, or parent portal PIN for a name.</p>',
        handled: true,
      });
    }
    if (intent.kind === "guide") {
      return Promise.resolve({ handled: false, query: intent.query || raw });
    }

    var payload = { tool: intent.kind };
    if (intent.kind === "lookup_family_access") {
      payload.query = intent.query || raw;
      if (intent.parent_person_id) payload.parent_person_id = intent.parent_person_id;
      if (intent.confirm) payload.confirm = true;
    }

    return callTool(payload).then(function (j) {
      return { handled: true, html: renderToolResult(j), json: j };
    });
  }

  global.PortalOfficeOperator = {
    detectIntent: detectIntent,
    run: runOperator,
    callTool: callTool,
    renderToolResult: renderToolResult,
  };
})(typeof window !== "undefined" ? window : globalThis);
