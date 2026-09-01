/**
 * Admin Uniform Stock Control — H&R stock matrix, stock in, issue, return, ledger.
 * Linked to staff Uniform records via uniform-* Edge Functions.
 */
(function (global) {
  "use strict";

  var SIZES = ["S", "M", "L", "XL", "XXL"];

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function (m) {
      try {
        console.log("[uniform]", m);
      } catch (_) {}
    },
  };

  var state = {
    loading: false,
    data: null,
    staffFilter: "",
    tab: "matrix",
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function client() {
    return cfg.getClient();
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "") ||
      "https://cklpnwhlqsulpmkipmqb.supabase.co";
  }

  async function portalAuthToken() {
    var sb = client();
    if (!sb || !sb.auth) return null;
    var sessResp = await sb.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  async function edgePost(path, body) {
    var token = await portalAuthToken();
    if (!token) return { ok: false, error: "session_expired" };
    var res = await fetch(supabaseBase() + "/functions/v1/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: String(cfg.getAnonKey() || ""),
      },
      body: body == null ? "{}" : JSON.stringify(body),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || j.ok === false) {
      return {
        ok: false,
        error: (j && (j.error || j.message)) || "request_failed_" + res.status,
        status: res.status,
      };
    }
    return j;
  }

  function toast(msg, kind) {
    cfg.toast(msg, kind);
  }

  function itemOptionsHtml(items, selectedId) {
    var list = items || [];
    return list
      .map(function (it) {
        var sel = String(it.id) === String(selectedId) ? " selected" : "";
        return (
          '<option value="' +
          esc(it.id) +
          '"' +
          sel +
          ">" +
          esc(it.name) +
          " (" +
          esc(it.category) +
          ")</option>"
        );
      })
      .join("");
  }

  function sizeOptionsHtml(selected) {
    return SIZES.map(function (sz) {
      var sel = sz === selected ? " selected" : "";
      return '<option value="' + sz + '"' + sel + ">" + sz + "</option>";
    }).join("");
  }

  function staffOptionsHtml(dir, selectedId) {
    var list = dir || [];
    return (
      '<option value="">Select staff</option>' +
      list
        .map(function (s) {
          var sel = String(s.id) === String(selectedId) ? " selected" : "";
          var label =
            (s.full_name || s.username || "Staff") +
            (s.username ? " (" + s.username + ")" : "");
          return (
            '<option value="' +
            esc(s.id) +
            '"' +
            sel +
            ">" +
            esc(label) +
            "</option>"
          );
        })
        .join("")
    );
  }

  function matrixByItem(matrix, items) {
    var by = {};
    (items || []).forEach(function (it) {
      by[it.id] = { item: it, sizes: {} };
    });
    (matrix || []).forEach(function (row) {
      if (!by[row.item_id]) {
        by[row.item_id] = {
          item: {
            id: row.item_id,
            name: row.name,
            sku_code: row.sku_code,
            category: row.category,
          },
          sizes: {},
        };
      }
      by[row.item_id].sizes[row.size] = row;
    });
    return Object.keys(by).map(function (id) {
      return by[id];
    });
  }

  function renderMatrix(data) {
    var groups = matrixByItem(data.matrix, data.items);
    var html =
      '<div class="uniform-matrix" style="overflow-x:auto;min-width:0">';
    groups.forEach(function (g) {
      var it = g.item;
      html +=
        '<div class="card" style="margin:0 0 14px;padding:12px;border:1px solid #e6ecf4;border-radius:12px;min-width:0">' +
        "<h3 style=\"margin:0 0 8px;font-size:15px;color:#0b2a5b;overflow-wrap:break-word\">" +
        esc(it.name) +
        ' <span style="font-weight:500;color:#62758a;font-size:12px">' +
        esc(it.category) +
        "</span></h3>" +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:420px">' +
        "<thead><tr>" +
        '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Size</th>' +
        '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Opening</th>' +
        '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Stock in</th>' +
        '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Pre-out</th>' +
        '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Issued (open)</th>' +
        '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Current</th>' +
        "</tr></thead><tbody>";
      SIZES.forEach(function (sz) {
        var row = g.sizes[sz] || {
          opening_qty: 0,
          stock_in_qty: 0,
          pre_portal_out_qty: 0,
          issued_open_qty: 0,
          current_qty: 0,
        };
        /* Hide empty sizes (e.g. manager polo S/XXL with no stock ever). */
        var allZero =
          Number(row.opening_qty || 0) === 0 &&
          Number(row.stock_in_qty || 0) === 0 &&
          Number(row.pre_portal_out_qty || 0) === 0 &&
          Number(row.issued_open_qty || 0) === 0 &&
          Number(row.current_qty || 0) === 0;
        if (allZero) return;
        html +=
          "<tr>" +
          '<td style="padding:6px;border-bottom:1px solid #f1f5f9">' +
          sz +
          "</td>" +
          '<td style="padding:6px;text-align:right;border-bottom:1px solid #f1f5f9">' +
          row.opening_qty +
          "</td>" +
          '<td style="padding:6px;text-align:right;border-bottom:1px solid #f1f5f9">' +
          row.stock_in_qty +
          "</td>" +
          '<td style="padding:6px;text-align:right;border-bottom:1px solid #f1f5f9">' +
          row.pre_portal_out_qty +
          "</td>" +
          '<td style="padding:6px;text-align:right;border-bottom:1px solid #f1f5f9">' +
          row.issued_open_qty +
          "</td>" +
          '<td style="padding:6px;text-align:right;border-bottom:1px solid #f1f5f9;font-weight:700">' +
          row.current_qty +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";
    });
    html += "</div>";
    return html;
  }

  function renderForms(data) {
    var actor = data.actor || {};
    if (!actor.can_issue) {
      return (
        '<div class="card" style="padding:12px;border:1px solid #e6ecf4;border-radius:12px;min-width:0">' +
        "<p style=\"margin:0;font-size:13px;color:#62758a;overflow-wrap:break-word\">Stock matrix and ledger stay visible for office. Only <strong>Berta, Roberto, Michelle or John</strong> can stock in, issue or return uniform.</p></div>"
      );
    }
    var actorName = actor.full_name || "";
    var openReqs = (data.requests || []).filter(function (r) {
      return r.status === "open";
    });
    var reqHtml =
      openReqs.length === 0
        ? '<p style="color:#62758a;font-size:13px">No open staff requests.</p>'
        : openReqs
            .map(function (r) {
              return (
                '<div style="border:1px solid #e6ecf4;border-radius:8px;padding:8px;margin:0 0 6px;min-width:0;font-size:12px;overflow-wrap:break-word">' +
                "<strong>" +
                esc(r.staff_name || "Staff") +
                "</strong> — " +
                esc(r.request_type) +
                " · " +
                esc(r.item_name || "item") +
                " " +
                esc(r.size || "?") +
                " x" +
                esc(String(r.qty)) +
                (r.reason ? " · " + esc(r.reason) : "") +
                "</div>"
              );
            })
            .join("");
    return (
      '<div class="card" style="padding:12px;border:1px solid #e6ecf4;border-radius:12px;margin:0 0 14px;min-width:0">' +
      "<h3 style=\"margin:0 0 8px;font-size:14px;color:#0b2a5b\">Open staff requests</h3>" +
      reqHtml +
      "</div>" +
      '<div class="uniform-forms" style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));min-width:0">' +
      '<div class="card" style="padding:12px;border:1px solid #e6ecf4;border-radius:12px;min-width:0">' +
      "<h3 style=\"margin:0 0 8px;font-size:14px;color:#0b2a5b\">Stock in</h3>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Item</label>' +
      '<select id="ufStockItem" style="width:100%;margin-bottom:8px;min-width:0">' +
      itemOptionsHtml(data.items) +
      "</select>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Size</label>' +
      '<select id="ufStockSize" style="width:100%;margin-bottom:8px">' +
      sizeOptionsHtml("M") +
      "</select>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Qty</label>' +
      '<input id="ufStockQty" type="number" min="1" max="500" value="1" style="width:100%;margin-bottom:8px;box-sizing:border-box" />' +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Note</label>' +
      '<input id="ufStockNote" type="text" placeholder="Delivery / PO" style="width:100%;margin-bottom:10px;box-sizing:border-box" />' +
      '<button type="button" class="btn" id="ufStockInBtn">Add stock</button>' +
      "</div>" +
      '<div class="card" style="padding:12px;border:1px solid #e6ecf4;border-radius:12px;min-width:0">' +
      "<h3 style=\"margin:0 0 8px;font-size:14px;color:#0b2a5b\">Issue to employee</h3>" +
      '<p style="margin:0 0 8px;font-size:12px;color:#62758a;overflow-wrap:break-word" id="ufKitHint">' +
      esc(
        (data.allocation_policy &&
          "Day Centre/Bespoke: " +
            data.allocation_policy.day_centre_bespoke +
            ". Support zero-hours: " +
            data.allocation_policy.support_zero_hours +
            ". Swimming: " +
            data.allocation_policy.swimming) ||
          "Select staff to see recommended kit.",
      ) +
      "</p>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Staff</label>' +
      '<select id="ufIssueStaff" style="width:100%;margin-bottom:8px;min-width:0">' +
      staffOptionsHtml(data.staff_directory) +
      "</select>" +
      '<div id="ufStaffKitBox" style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e6ecf4;font-size:12px;color:#0b2a5b;overflow-wrap:break-word">Select a staff member to see their kit offer.</div>' +
      '<button type="button" class="btn btn--sec" id="ufIssueKitBtn" style="margin-bottom:10px;width:100%">Issue recommended kit (same size)</button>' +
      '<div class="grid2" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="flex:1;min-width:80px"><label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">T-shirt size</label>' +
      '<select id="ufIssueSize" style="width:100%">' +
      sizeOptionsHtml("M") +
      "</select></div>" +
      '<div style="flex:1;min-width:80px"><label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Sweat size</label>' +
      '<select id="ufIssueSizeSweat" style="width:100%">' +
      sizeOptionsHtml("M") +
      "</select></div></div>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Or single-line issue — Item</label>' +
      '<select id="ufIssueItem" style="width:100%;margin-bottom:8px;min-width:0">' +
      itemOptionsHtml(data.items, tshirtId(data.items)) +
      "</select>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="flex:1;min-width:80px"><label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Qty</label>' +
      '<input id="ufIssueQty" type="number" min="1" max="20" value="2" style="width:100%;box-sizing:border-box" /></div></div>' +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Type</label>' +
      '<select id="ufIssueType" style="width:100%;margin-bottom:8px">' +
      '<option value="initial">Initial</option>' +
      '<option value="replacement">Replacement</option>' +
      '<option value="size_change">Size change</option>' +
      '<option value="correction">Correction</option>' +
      "</select>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Reason</label>' +
      '<input id="ufIssueReason" type="text" placeholder="Optional / required for replacement" style="width:100%;margin-bottom:8px;box-sizing:border-box" />' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px;min-width:0">' +
      '<input type="checkbox" id="ufIssueCharge" /> £5 replacement charge applies</label>' +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Issuer typed name</label>' +
      '<input id="ufIssuerAck" type="text" value="' +
      esc(actorName) +
      '" style="width:100%;margin-bottom:8px;box-sizing:border-box" />' +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Staff typed name (optional now)</label>' +
      '<input id="ufStaffAck" type="text" placeholder="Leave blank — staff confirms on their Uniform page" style="width:100%;margin-bottom:10px;box-sizing:border-box" />' +
      '<button type="button" class="btn" id="ufIssueBtn">Issue uniform</button>' +
      "</div>" +
      '<div class="card" style="padding:12px;border:1px solid #e6ecf4;border-radius:12px;min-width:0">' +
      "<h3 style=\"margin:0 0 8px;font-size:14px;color:#0b2a5b\">Return</h3>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Open issue line</label>' +
      '<select id="ufReturnIssue" style="width:100%;margin-bottom:8px;min-width:0">' +
      openIssueOptions(data.issues) +
      "</select>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Disposition</label>' +
      '<select id="ufReturnDisp" style="width:100%;margin-bottom:8px">' +
      '<option value="restock">Restock (add back to current)</option>' +
      '<option value="scrap">Scrap (record only, no stock)</option>' +
      "</select>" +
      '<label style="display:block;font-size:12px;color:#62758a;margin-bottom:4px">Note</label>' +
      '<input id="ufReturnNote" type="text" style="width:100%;margin-bottom:10px;box-sizing:border-box" />' +
      '<button type="button" class="btn btn--sec" id="ufReturnBtn">Process return</button>' +
      "</div></div>"
    );
  }

  function tshirtId(items) {
    var hit = (items || []).find(function (i) {
      return i.sku_code === "STAFF_GREY_TSHIRT";
    });
    return hit ? hit.id : "";
  }

  function openIssueOptions(issues) {
    var open = (issues || []).filter(function (i) {
      return i.status === "issued";
    });
    if (!open.length) {
      return '<option value="">No open issues</option>';
    }
    return (
      '<option value="">Select issued line</option>' +
      open
        .map(function (i) {
          var label =
            (i.staff_name || "Staff") +
            " — " +
            (i.item_name || "") +
            " " +
            i.size +
            " x" +
            i.qty;
          return (
            '<option value="' + esc(i.id) + '">' + esc(label) + "</option>"
          );
        })
        .join("")
    );
  }

  function renderLedger(data) {
    var rows = data.movements || [];
    if (!rows.length) {
      return (
        '<p style="color:#62758a">No movements for this filter. Pick <strong>All staff</strong> to see stock-in and pre-portal seed rows, or choose a person to see only their issues/returns.</p>'
      );
    }
    var html =
      '<p style="margin:0 0 10px;font-size:12px;color:#62758a;overflow-wrap:break-word">' +
      "<strong>Staff</strong> = who received / returned the kit. " +
      "<strong>By</strong> = who recorded the movement (issuer). " +
      "Seed rows (<code>pre_portal_stock_out</code>) have no staff name — they were stock already out before the portal.</p>" +
      '<div style="overflow-x:auto;min-width:0"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px">' +
      "<thead><tr>" +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">When</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Staff</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Item</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Size</th>' +
      '<th style="text-align:right;padding:6px;border-bottom:1px solid #e6ecf4">Delta</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Reason</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">By</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid #e6ecf4">Note</th>' +
      "</tr></thead><tbody>";
    rows.forEach(function (m) {
      var staffLabel =
        m.staff_name ||
        m.staff_username ||
        (m.reason === "pre_portal_stock_out" || m.reason === "stock_in"
          ? "—"
          : "—");
      var byLabel = m.issuer_name || m.actor_name || "—";
      html +=
        "<tr>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;white-space:nowrap">' +
        esc(String(m.created_at || "").replace("T", " ").slice(0, 16)) +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;min-width:0;overflow-wrap:break-word;font-weight:600;color:#0b2a5b">' +
        esc(staffLabel) +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;min-width:0;overflow-wrap:break-word">' +
        esc(m.item_name || "") +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9">' +
        esc(m.size) +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' +
        (m.delta > 0 ? "+" : "") +
        m.delta +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9">' +
        esc(m.reason) +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;min-width:0;overflow-wrap:break-word">' +
        esc(byLabel) +
        "</td>" +
        '<td style="padding:6px;border-bottom:1px solid #f1f5f9;min-width:0;overflow-wrap:break-word">' +
        esc(m.note || "") +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function renderIssues(data) {
    var rows = data.issues || [];
    if (!rows.length) {
      return '<p style="color:#62758a">No issue lines for this filter.</p>';
    }
    var html = '<div style="display:grid;gap:8px;min-width:0">';
    rows.forEach(function (i) {
      html +=
        '<div style="border:1px solid #e6ecf4;border-radius:10px;padding:10px;min-width:0">' +
        '<div style="font-weight:700;color:#0b2a5b;overflow-wrap:break-word">' +
        esc(i.staff_name || i.staff_username || "Staff") +
        " — " +
        esc(i.item_name || "") +
        " " +
        esc(i.size) +
        " x" +
        i.qty +
        "</div>" +
        '<div style="font-size:12px;color:#62758a;margin-top:4px;overflow-wrap:break-word">' +
        esc(i.issue_type) +
        " · " +
        esc(i.status) +
        " · " +
        esc(String(i.issued_at || "").slice(0, 10)) +
        (i.charge_applies ? " · £" + esc(String(i.charge_gbp)) + " charge" : "") +
        "</div>" +
        '<div style="font-size:12px;color:#475569;margin-top:4px;overflow-wrap:break-word">Staff ack: ' +
        esc(i.staff_ack_name || "pending") +
        (i.staff_ack_at ? " @ " + esc(String(i.staff_ack_at).slice(0, 16)) : "") +
        " · Issuer: " +
        esc(i.issuer_ack_name || "—") +
        (i.issuer_ack_at ? " @ " + esc(String(i.issuer_ack_at).slice(0, 16)) : "") +
        "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function render(root) {
    var data = state.data;
    if (state.loading && !data) {
      root.innerHTML = '<p style="color:#62758a">Loading uniform stock…</p>';
      return;
    }
    if (!data) {
      root.innerHTML =
        '<p style="color:#b91c1c">Could not load uniform stock. Check session and Edge Functions.</p>';
      return;
    }
    var t = data.totals || {};
    var banner = data.seed_banner || {};
    var html =
      '<div class="uniform-admin" style="min-width:0">' +
      '<div style="margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#eef6fb;border:1px solid #c5d9ea;color:#0b2a5b;font-size:13px;overflow-wrap:break-word">' +
      "<strong>Seed baseline:</strong> Opening " +
      esc(String(banner.opening != null ? banner.opening : 130)) +
      " / Out " +
      esc(String(banner.stock_out != null ? banner.stock_out : 17)) +
      " / Current " +
      esc(String(banner.current != null ? banner.current : 113)) +
      ". Live now — Opening " +
      t.opening +
      ", Current " +
      t.current +
      ", Stock in " +
      t.stock_in +
      ", Open issued " +
      t.issued_open +
      "." +
      (data.allocation_policy
        ? "<br><strong>Allocation:</strong> Day Centre/Bespoke " +
          esc(data.allocation_policy.day_centre_bespoke) +
          "; support zero-hours " +
          esc(data.allocation_policy.support_zero_hours) +
          "; swimming " +
          esc(data.allocation_policy.swimming) +
          "."
        : "") +
      "</div>" +
      '<div class="toolbar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">' +
      '<button type="button" class="btn btn--sm' +
      (state.tab === "matrix" ? "" : " btn--sec") +
      '" data-uf-tab="matrix">Stock matrix</button>' +
      '<button type="button" class="btn btn--sm' +
      (state.tab === "actions" ? "" : " btn--sec") +
      '" data-uf-tab="actions">Stock in / Issue / Return</button>' +
      '<button type="button" class="btn btn--sm' +
      (state.tab === "ledger" ? "" : " btn--sec") +
      '" data-uf-tab="ledger">Ledger</button>' +
      '<button type="button" class="btn btn--sm' +
      (state.tab === "issues" ? "" : " btn--sec") +
      '" data-uf-tab="issues">Staff issues</button>' +
      '<label for="ufStaffFilter" style="font-size:12px;color:#62758a;margin:0">Filter staff</label>' +
      '<select id="ufStaffFilter" aria-label="Filter by staff" style="min-width:0;max-width:220px;flex:1">' +
      '<option value="">All staff</option>' +
      staffOptionsHtml(data.staff_directory, state.staffFilter).replace(
        '<option value="">Select staff</option>',
        "",
      ) +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="ufRefresh">Refresh</button>' +
      "</div>" +
      '<p style="margin:0 0 12px;font-size:12px;color:#62758a;overflow-wrap:break-word">' +
      "<strong>Tabs:</strong> Matrix = live qty by size. Actions = stock in / issue / return. " +
      "Ledger = every stock movement. Staff issues = per-person issued lines + signatures. " +
      "<strong>Filter staff</strong> narrows Ledger + Staff issues (+ Actions return list) to that person.</p>" +
      '<div id="ufPanel">';

    if (state.tab === "matrix") html += renderMatrix(data);
    else if (state.tab === "actions") html += renderForms(data);
    else if (state.tab === "ledger") html += renderLedger(data);
    else html += renderIssues(data);

    html += "</div></div>";
    root.innerHTML = html;
    bind(root);
  }

  function bind(root) {
    root.querySelectorAll("[data-uf-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.tab = btn.getAttribute("data-uf-tab") || "matrix";
        render(root);
      });
    });
    var filter = root.querySelector("#ufStaffFilter");
    if (filter) {
      filter.addEventListener("change", function () {
        state.staffFilter = filter.value || "";
        load(root);
      });
    }
    var refresh = root.querySelector("#ufRefresh");
    if (refresh) {
      refresh.addEventListener("click", function () {
        load(root);
      });
    }
    var stockBtn = root.querySelector("#ufStockInBtn");
    if (stockBtn) {
      stockBtn.addEventListener("click", function () {
        stockBtn.disabled = true;
        edgePost("uniform-stock-in", {
          item_id: (root.querySelector("#ufStockItem") || {}).value,
          size: (root.querySelector("#ufStockSize") || {}).value,
          qty: Number((root.querySelector("#ufStockQty") || {}).value || 0),
          note: (root.querySelector("#ufStockNote") || {}).value,
        }).then(function (res) {
          stockBtn.disabled = false;
          if (!res.ok) {
            toast(res.error || "Stock in failed", "err");
            return;
          }
          toast("Stock in saved. Current: " + res.current_qty, "ok");
          load(root);
        });
      });
    }
    var issueBtn = root.querySelector("#ufIssueBtn");
    if (issueBtn) {
      issueBtn.addEventListener("click", function () {
        var charge = !!(root.querySelector("#ufIssueCharge") || {}).checked;
        var staffAck = String(
          (root.querySelector("#ufStaffAck") || {}).value || "",
        ).trim();
        issueBtn.disabled = true;
        edgePost("uniform-issue", {
          staff_profile_id: (root.querySelector("#ufIssueStaff") || {}).value,
          item_id: (root.querySelector("#ufIssueItem") || {}).value,
          size: (root.querySelector("#ufIssueSize") || {}).value,
          qty: Number((root.querySelector("#ufIssueQty") || {}).value || 1),
          issue_type: (root.querySelector("#ufIssueType") || {}).value,
          reason: (root.querySelector("#ufIssueReason") || {}).value,
          charge_applies: charge,
          charge_gbp: charge ? 5 : 0,
          issuer_ack_name: (root.querySelector("#ufIssuerAck") || {}).value,
          staff_ack_name: staffAck || undefined,
          staff_ack_now: !!staffAck,
        }).then(function (res) {
          issueBtn.disabled = false;
          if (!res.ok) {
            toast(res.error || "Issue failed", "err");
            return;
          }
          toast("Issued. Stock now " + res.current_qty, "ok");
          load(root);
        });
      });
    }

    function refreshStaffKitHint() {
      var sel = root.querySelector("#ufIssueStaff");
      var box = root.querySelector("#ufStaffKitBox");
      var kitBtn = root.querySelector("#ufIssueKitBtn");
      if (!sel || !box || !state.data) return;
      var id = sel.value || "";
      var hit = (state.data.staff_directory || []).find(function (s) {
        return String(s.id) === String(id);
      });
      if (!hit) {
        box.textContent = "Select a staff member to see their kit offer.";
        if (kitBtn) kitBtn.disabled = true;
        return;
      }
      box.textContent =
        (hit.full_name || hit.username || "Staff") +
        ": " +
        (hit.kit_label || "—") +
        " — " +
        (hit.kit_summary || "No auto kit") +
        (hit.kit_swimming_note ? " (" + hit.kit_swimming_note + ")" : "");
      if (kitBtn) {
        kitBtn.disabled = !(hit.kit_lines && hit.kit_lines.length);
      }
      var qtyEl = root.querySelector("#ufIssueQty");
      if (qtyEl && hit.kit_lines && hit.kit_lines[0]) {
        qtyEl.value = String(hit.kit_lines[0].qty || 1);
      }
    }

    var staffSel = root.querySelector("#ufIssueStaff");
    if (staffSel) {
      staffSel.addEventListener("change", refreshStaffKitHint);
      refreshStaffKitHint();
    }

    var kitBtn = root.querySelector("#ufIssueKitBtn");
    if (kitBtn) {
      kitBtn.addEventListener("click", function () {
        var staffAck = String(
          (root.querySelector("#ufStaffAck") || {}).value || "",
        ).trim();
        kitBtn.disabled = true;
        edgePost("uniform-issue", {
          action: "issue_recommended_kit",
          staff_profile_id: (root.querySelector("#ufIssueStaff") || {}).value,
          size: (root.querySelector("#ufIssueSize") || {}).value,
          size_sweat: (root.querySelector("#ufIssueSizeSweat") || {}).value,
          issuer_ack_name: (root.querySelector("#ufIssuerAck") || {}).value,
          staff_ack_name: staffAck || undefined,
          staff_ack_now: !!staffAck,
        }).then(function (res) {
          kitBtn.disabled = false;
          if (!res.ok) {
            toast(res.error || "Recommended kit issue failed", "err");
            return;
          }
          toast("Recommended kit issued (" + (res.count || 0) + " lines).", "ok");
          load(root);
        });
      });
    }
    var returnBtn = root.querySelector("#ufReturnBtn");
    if (returnBtn) {
      returnBtn.addEventListener("click", function () {
        returnBtn.disabled = true;
        edgePost("uniform-return", {
          issue_id: (root.querySelector("#ufReturnIssue") || {}).value,
          disposition: (root.querySelector("#ufReturnDisp") || {}).value,
          note: (root.querySelector("#ufReturnNote") || {}).value,
        }).then(function (res) {
          returnBtn.disabled = false;
          if (!res.ok) {
            toast(res.error || "Return failed", "err");
            return;
          }
          toast("Return recorded.", "ok");
          load(root);
        });
      });
    }
  }

  function load(root) {
    state.loading = true;
    render(root);
    var body = { mode: "admin" };
    if (state.staffFilter) body.staff_profile_id = state.staffFilter;
    edgePost("uniform-load", body).then(function (res) {
      state.loading = false;
      if (!res.ok) {
        state.data = null;
        toast(res.error || "Load failed", "err");
        render(root);
        return;
      }
      state.data = res;
      render(root);
    });
  }

  function mount(el) {
    if (!el) return;
    state.tab = "matrix";
    state.staffFilter = "";
    load(el);
  }

  global.AdminUniform = {
    configure: configure,
    mount: mount,
  };
})(typeof window !== "undefined" ? window : globalThis);
