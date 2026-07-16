/**
 * Admin — edit participant Registration (summary) contact fields.
 */
(function (global) {
  "use strict";

  var STORE_KEY = "portalAdminPaxContactEdits_v1";

  var FUNDING_SOURCE_OPTS = [
    { value: "privately_funded", label: "Using private funds" },
    { value: "la_nhs", label: "Using money from LA" },
  ];
  var FUNDER_DETAIL_OPTS = [
    { value: "parent_direct_payments", label: "Parent · Direct Payments (LA money)" },
    { value: "ealing_children", label: "Ealing · Children" },
    { value: "ealing_adult", label: "Ealing · Adult" },
    { value: "hf_children", label: "Hammersmith & Fulham · Children" },
    { value: "hf_adult", label: "Hammersmith & Fulham · Adult" },
    { value: "kensington_chelsea", label: "Kensington & Chelsea" },
    { value: "westminster", label: "Westminster" },
    { value: "brent", label: "Brent" },
    { value: "nhs_north_west", label: "NHS North West" },
    { value: "nhs_ila", label: "NHS ILA" },
  ];
  var PAY_PRIVATE_OPTS = [
    "Bank Transfer (fixed due dates)",
    "Direct Payment (GoCardless · monthly)",
    "Own arrangement — cannot meet payment dates (+ £50 / term)",
  ];
  var FUNDER_PAY = {
    parent_direct_payments: PAY_PRIVATE_OPTS.slice(),
    ealing_children: [
      "Direct payment (CWD) · monthly arrears · real 38-wk invoice (paid over 52 wks)",
      "Care in Finance · monthly arrears · real 38-wk invoice (paid over 52 wks)",
    ],
    ealing_adult: [
      "Care in Finance · monthly arrears · real 38-wk invoice (paid over 52 wks)",
      "Direct payment (CWD) · monthly arrears · real 38-wk invoice (paid over 52 wks)",
    ],
    hf_children: ["LA invoice (BACS) · monthly arrears · draft year + term · real monthly"],
    hf_adult: ["LA invoice (BACS) · monthly arrears · draft year + term · real monthly"],
    kensington_chelsea: ["LA invoice (BACS) · monthly arrears · draft year + term · real monthly"],
    westminster: ["LA invoice (BACS) · monthly arrears · draft year + term · real monthly"],
    brent: ["LA invoice (BACS) · monthly arrears · draft year + term · real monthly"],
    nhs_north_west: ["NHS invoice (PO) · monthly arrears · draft year + term · original monthly"],
    nhs_ila: ["NHS invoice (PO) · monthly arrears · draft term · original monthly"],
  };

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    openModal: null,
    closeModal: null,
    onSaved: null,
  };

  function configure(options) {
    if (!options) return;
    Object.keys(options).forEach(function (k) {
      if (options[k] != null) cfg[k] = options[k];
    });
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function loadStore() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      var j = raw ? JSON.parse(raw) : {};
      return j && typeof j === "object" ? j : {};
    } catch (_e) {
      return {};
    }
  }

  function saveStore(map) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(map || {}));
    } catch (_e) {}
  }

  function contactIdFromPax(p) {
    var id = String((p && p.id) || "").trim();
    if (id.indexOf("pp-") === 0) return id.slice(3);
    return id;
  }

  function isoToUk(iso) {
    var s = String(iso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function ukToIso(uk) {
    var s = String(uk || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!m) return "";
    return m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
  }

  function getOverride(contactId) {
    var map = loadStore();
    return map[String(contactId || "")] || null;
  }

  function setOverride(contactId, patch) {
    var map = loadStore();
    map[String(contactId)] = Object.assign({}, map[String(contactId)] || {}, patch || {}, {
      _savedAt: Date.now(),
    });
    saveStore(map);
  }

  function funderDetailLabel(code) {
    for (var i = 0; i < FUNDER_DETAIL_OPTS.length; i++) {
      if (FUNDER_DETAIL_OPTS[i].value === code) return FUNDER_DETAIL_OPTS[i].label;
    }
    return "";
  }

  function composeFundingLabel(source, detail) {
    if (source === "privately_funded") return "Using private funds";
    if (source === "la_nhs") {
      var det = funderDetailLabel(detail);
      return det ? "Using money from LA · " + det : "Using money from LA";
    }
    return "";
  }

  function parseFundingLabel(raw) {
    var s = String(raw || "").trim();
    if (!s || s === "—") return { source: "", detail: "" };
    var low = s.toLowerCase();
    if (/private/.test(low) && !/direct payment|la money|using money from la/.test(low)) {
      return { source: "privately_funded", detail: "" };
    }
    if (/using money from la|la\/nhs|local authority|nhs|direct payment|cwd|care in finance|bacs/.test(low)) {
      var detail = "";
      for (var i = 0; i < FUNDER_DETAIL_OPTS.length; i++) {
        var lab = FUNDER_DETAIL_OPTS[i].label.toLowerCase();
        var bits = lab.split("·").map(function (x) {
          return x.trim();
        });
        var hit = bits.every(function (b) {
          return !b || low.indexOf(b) >= 0;
        });
        if (hit || low.indexOf(lab) >= 0) {
          detail = FUNDER_DETAIL_OPTS[i].value;
          break;
        }
      }
      if (!detail) {
        if (/ealing/.test(low) && /adult/.test(low)) detail = "ealing_adult";
        else if (/ealing/.test(low)) detail = "ealing_children";
        else if (/hammer|h&f|h\s*&\s*f|fulham/.test(low) && /adult/.test(low)) detail = "hf_adult";
        else if (/hammer|h&f|fulham/.test(low)) detail = "hf_children";
        else if (/kensington|rbkc/.test(low)) detail = "kensington_chelsea";
        else if (/westminster/.test(low)) detail = "westminster";
        else if (/brent/.test(low)) detail = "brent";
        else if (/ila/.test(low)) detail = "nhs_ila";
        else if (/nhs/.test(low)) detail = "nhs_north_west";
        else if (/direct payment/.test(low)) detail = "parent_direct_payments";
      }
      return { source: "la_nhs", detail: detail };
    }
    if (/using private funds/.test(low)) return { source: "privately_funded", detail: "" };
    return { source: "", detail: "" };
  }

  function payOptsFor(source, detail) {
    if (source !== "la_nhs") return PAY_PRIVATE_OPTS.slice();
    if (detail === "parent_direct_payments") return PAY_PRIVATE_OPTS.slice();
    var opts = FUNDER_PAY[detail];
    return opts && opts.length ? opts.slice() : PAY_PRIVATE_OPTS.slice();
  }

  function selectOptsHtml(opts, selected, placeholder) {
    var html = '<option value="">' + esc(placeholder || "— Select —") + "</option>";
    var found = false;
    (opts || []).forEach(function (o) {
      var v = typeof o === "string" ? o : o.value;
      var lab = typeof o === "string" ? o : o.label;
      var sel = String(selected || "") === String(v);
      if (sel) found = true;
      html +=
        '<option value="' +
        esc(v) +
        '"' +
        (sel ? " selected" : "") +
        ">" +
        esc(lab) +
        "</option>";
    });
    if (selected && !found) {
      html +=
        '<option value="' +
        esc(selected) +
        '" selected>' +
        esc(selected) +
        " (current)</option>";
    }
    return html;
  }

  /** Merge saved edits onto a participants-parents portal export row. */
  function applyOverrideToPortalRow(row) {
    if (!row) return row;
    var cid = String(row.contactId || row.contact_id || "").trim();
    if (!cid) return row;
    var ov = getOverride(cid);
    if (!ov) return row;
    var out = Object.assign({}, row);
    if (ov.parentDisplay != null) {
      out.parentDisplay = ov.parentDisplay;
      var parts = String(ov.parentDisplay || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (parts.length) {
        out.parentFirstName = parts[0];
        out.parentLastName = parts.slice(1).join(" ");
      }
    }
    if (ov.mobile != null) out.mobile = ov.mobile;
    if (ov.email != null) out.username = ov.email;
    if (ov.addressLine1 != null) out.addressLine1 = ov.addressLine1;
    if (ov.addressLine2 != null) out.addressLine2 = ov.addressLine2;
    if (ov.city != null) out.city = ov.city;
    if (ov.postcode != null) out.postcode = ov.postcode;
    if (ov.registrationDisplay != null) out.createdDisplay = ov.registrationDisplay;
    if (ov.fundingLabel != null) {
      out.fundingLabel = ov.fundingLabel;
      out._adminFundingLabel = ov.fundingLabel;
    }
    if (ov.paymentMethodLabel != null) {
      out.paymentMethodLabel = ov.paymentMethodLabel;
      out._adminPaymentMethodLabel = ov.paymentMethodLabel;
    }
    return out;
  }

  /** Apply funding/payment overrides onto built Pax object. */
  function applyOverrideToPax(p) {
    if (!p) return p;
    var cid = contactIdFromPax(p);
    var ov = getOverride(cid);
    if (!ov) return p;
    if (!p.reg) p.reg = {};
    if (ov.parentDisplay != null) {
      p.parentDisplay = ov.parentDisplay;
      p.reg.carer = ov.parentDisplay;
    }
    if (ov.mobile != null) p.reg.phone = ov.mobile || "—";
    if (ov.email != null) p.reg.email = ov.email || "—";
    if (ov.addressFull != null) p.addressFull = ov.addressFull;
    else if (ov.addressLine1 != null || ov.city != null || ov.postcode != null) {
      p.addressFull = [ov.addressLine1, ov.addressLine2, ov.city, ov.postcode]
        .map(function (x) {
          return String(x || "").trim();
        })
        .filter(Boolean)
        .join(", ");
    }
    if (ov.registrationDisplay != null) p.reg.formReceived = ov.registrationDisplay || "—";
    if (ov.fundingLabel != null) {
      p.reg.fundingRoute = ov.fundingLabel || "—";
      p._adminFundingLabel = ov.fundingLabel || "";
    }
    if (ov.paymentMethodLabel != null) {
      p.reg.paymentMethod = ov.paymentMethodLabel || "—";
      p._adminPaymentMethodLabel = ov.paymentMethodLabel || "";
    }
    p._adminContactEdited = true;
    return p;
  }

  /** Merge a live portal_parent_contacts row into the static export map. */
  function mergeLiveContactIntoPortalRow(row, live) {
    if (!row || !live) return row;
    var out = Object.assign({}, row);
    if (live.parent_display) {
      out.parentDisplay = String(live.parent_display).trim();
      if (live.parent_first_name) out.parentFirstName = String(live.parent_first_name).trim();
      if (live.parent_last_name) out.parentLastName = String(live.parent_last_name).trim();
    }
    if (live.mobile != null && String(live.mobile).trim()) out.mobile = String(live.mobile).trim();
    if (live.email != null && String(live.email).trim()) out.username = String(live.email).trim();
    if (live.address_line1 != null) out.addressLine1 = String(live.address_line1 || "").trim() || out.addressLine1;
    if (live.address_line2 != null) out.addressLine2 = String(live.address_line2 || "").trim() || out.addressLine2;
    if (live.city != null) out.city = String(live.city || "").trim() || out.city;
    if (live.postcode != null) out.postcode = String(live.postcode || "").trim() || out.postcode;
    if (live.registration_date) {
      out.createdIso = String(live.registration_date).slice(0, 10);
      out.createdDisplay = isoToUk(live.registration_date) || out.createdDisplay;
    }
    if (live.funding_label != null && String(live.funding_label).trim()) {
      out.fundingLabel = String(live.funding_label).trim();
      out._adminFundingLabel = out.fundingLabel;
    }
    if (live.payment_method_label != null && String(live.payment_method_label).trim()) {
      out.paymentMethodLabel = String(live.payment_method_label).trim();
      out._adminPaymentMethodLabel = out.paymentMethodLabel;
    }
    return out;
  }

  function applyLiveContactToParentsSource(contactId, live) {
    var cid = String(contactId || "").trim();
    if (!cid || !live) return;
    var src = global.PARTICIPANTS_PARENTS_PORTAL_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].contactId || "").trim() === cid) {
        var merged = mergeLiveContactIntoPortalRow(rows[i], live);
        Object.keys(merged).forEach(function (k) {
          rows[i][k] = merged[k];
        });
        break;
      }
    }
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  async function saveRemote(contactId, fields) {
    var token = await portalAuthToken();
    if (!token) return { ok: false, error: "session_expired" };
    var base = String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
    var anon = String(cfg.getAnonKey() || "");
    if (!base || !anon) return { ok: false, error: "missing_config" };
    var res = await fetch(base + "/functions/v1/portal-admin-parent-contact-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: anon,
      },
      body: JSON.stringify({
        contact_id: contactId,
        parent_display: fields.parentDisplay,
        mobile: fields.mobile,
        email: fields.email,
        address_line1: fields.addressLine1,
        address_line2: fields.addressLine2,
        city: fields.city,
        postcode: fields.postcode,
        registration_date: fields.registrationDisplay,
        funding_label: fields.fundingLabel,
        payment_method_label: fields.paymentMethodLabel,
      }),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return {
        ok: false,
        error: (j && j.error) || "save_failed",
        message: (j && j.message) || "",
      };
    }
    return {
      ok: true,
      contact: j.contact,
      previous_mobile: j.previous_mobile || null,
    };
  }

  function parseAddressParts(addressFull) {
    var raw = String(addressFull || "").trim();
    if (!raw || raw === "—") {
      return { line1: "", line2: "", city: "", postcode: "" };
    }
    var parts = raw
      .split(",")
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean);
    var postcode = "";
    var city = "";
    var line1 = "";
    var line2 = "";
    if (parts.length) {
      var last = parts[parts.length - 1];
      if (/^[A-Z]{1,2}\d/i.test(last) || /\d/.test(last)) {
        postcode = last;
        parts = parts.slice(0, -1);
      }
    }
    if (parts.length) {
      city = parts[parts.length - 1];
      parts = parts.slice(0, -1);
    }
    line1 = parts[0] || "";
    line2 = parts.slice(1).join(", ");
    return { line1: line1, line2: line2, city: city, postcode: postcode };
  }

  function refreshFundingUi() {
    var srcEl = global.document.getElementById("paxEditFundingSource");
    var detWrap = global.document.getElementById("paxEditFunderWrap");
    var detEl = global.document.getElementById("paxEditFunderDetail");
    var payEl = global.document.getElementById("paxEditPay");
    if (!srcEl || !payEl) return;
    var source = String(srcEl.value || "").trim();
    var detail = detEl ? String(detEl.value || "").trim() : "";
    if (detWrap) detWrap.style.display = source === "la_nhs" ? "block" : "none";
    var curPay = String(payEl.value || "").trim();
    payEl.innerHTML = selectOptsHtml(payOptsFor(source, detail), curPay, "— Select payment method —");
  }

  function openEditModal(pax, displayFunding, displayPay) {
    if (typeof cfg.openModal !== "function") {
      cfg.toast("Edit modal unavailable", "warn");
      return;
    }
    var cid = contactIdFromPax(pax);
    if (!cid) {
      cfg.toast("Missing contact id for this participant", "warn");
      return;
    }
    var r = (pax && pax.reg) || {};
    var addr = parseAddressParts(pax && pax.addressFull);
    var fund = String(
      displayFunding != null
        ? displayFunding
        : pax._adminFundingLabel || r.fundingRoute || ""
    ).trim();
    var pay = String(
      displayPay != null
        ? displayPay
        : pax._adminPaymentMethodLabel || r.paymentMethod || ""
    ).trim();
    if (fund === "—") fund = "";
    if (pay === "—") pay = "";
    var parsed = parseFundingLabel(fund);
    var regDate = String(r.formReceived || "").trim();
    if (regDate === "—") regDate = "";

    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Edit client information</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Participant: <strong>' +
        esc(pax.name || "—") +
        "</strong> · " +
        esc(cid) +
        "</p>" +
        '<label class="muted">Carer / parent</label>' +
        '<input class="inp" id="paxEditCarer" style="max-width:100%;box-sizing:border-box" value="' +
        esc(r.carer === "—" ? "" : r.carer || "") +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Phone</label>' +
        '<input class="inp" id="paxEditPhone" style="max-width:100%;box-sizing:border-box" value="' +
        esc(r.phone === "—" ? "" : r.phone || "") +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Email</label>' +
        '<input class="inp" id="paxEditEmail" style="max-width:100%;box-sizing:border-box" value="' +
        esc(r.email === "—" ? "" : r.email || "") +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Address line 1</label>' +
        '<input class="inp" id="paxEditAddr1" style="max-width:100%;box-sizing:border-box" value="' +
        esc(addr.line1) +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Address line 2</label>' +
        '<input class="inp" id="paxEditAddr2" style="max-width:100%;box-sizing:border-box" value="' +
        esc(addr.line2) +
        '" />' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;min-width:0">' +
        '<div style="min-width:0"><label class="muted">City</label><input class="inp" id="paxEditCity" style="max-width:100%;box-sizing:border-box" value="' +
        esc(addr.city) +
        '" /></div>' +
        '<div style="min-width:0"><label class="muted">Postcode</label><input class="inp" id="paxEditPostcode" style="max-width:100%;box-sizing:border-box" value="' +
        esc(addr.postcode) +
        '" /></div></div>' +
        '<label class="muted" style="display:block;margin-top:10px">Registration date <span class="muted" style="font-weight:400">(DD/MM/YYYY)</span></label>' +
        '<input class="inp" id="paxEditRegDate" style="max-width:100%;box-sizing:border-box" placeholder="07/07/2026" value="' +
        esc(regDate) +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Funding</label>' +
        '<select class="inp" id="paxEditFundingSource" style="max-width:100%;box-sizing:border-box">' +
        selectOptsHtml(FUNDING_SOURCE_OPTS, parsed.source, "— Private or LA —") +
        "</select>" +
        '<div id="paxEditFunderWrap" style="margin-top:10px;display:' +
        (parsed.source === "la_nhs" ? "block" : "none") +
        ';min-width:0">' +
        '<label class="muted">LA / NHS funder</label>' +
        '<select class="inp" id="paxEditFunderDetail" style="max-width:100%;box-sizing:border-box">' +
        selectOptsHtml(FUNDER_DETAIL_OPTS, parsed.detail, "— Ealing / H&F / RBKC / … —") +
        "</select></div>" +
        '<label class="muted" style="display:block;margin-top:10px">Payment method</label>' +
        '<select class="inp" id="paxEditPay" style="max-width:100%;box-sizing:border-box">' +
        selectOptsHtml(payOptsFor(parsed.source, parsed.detail), pay, "— Select payment method —") +
        "</select>" +
        '<p id="paxEditErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px"></p>' +
        "</div>" +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="paxEditCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="paxEditSave">Save</button>' +
        "</div>"
    );

    var cancel = global.document.getElementById("paxEditCancel");
    var save = global.document.getElementById("paxEditSave");
    var srcEl = global.document.getElementById("paxEditFundingSource");
    var detEl = global.document.getElementById("paxEditFunderDetail");
    if (srcEl) srcEl.onchange = refreshFundingUi;
    if (detEl) detEl.onchange = refreshFundingUi;
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === "function") cfg.closeModal();
      };
    }
    if (save) {
      save.onclick = async function () {
        var errEl = global.document.getElementById("paxEditErr");
        function showErr(msg) {
          if (!errEl) return;
          errEl.style.display = "block";
          errEl.textContent = msg;
        }
        var parentDisplay = String(
          (global.document.getElementById("paxEditCarer") || {}).value || ""
        ).trim();
        if (!parentDisplay) {
          showErr("Carer / parent is required.");
          return;
        }
        var regDisp = String(
          (global.document.getElementById("paxEditRegDate") || {}).value || ""
        ).trim();
        if (regDisp && !ukToIso(regDisp) && !/^\d{4}-\d{2}-\d{2}$/.test(regDisp)) {
          showErr("Registration date must be DD/MM/YYYY.");
          return;
        }
        var fundSrc = String(
          (global.document.getElementById("paxEditFundingSource") || {}).value || ""
        ).trim();
        var fundDet = String(
          (global.document.getElementById("paxEditFunderDetail") || {}).value || ""
        ).trim();
        if (fundSrc === "la_nhs" && !fundDet) {
          showErr("Select the LA / NHS funder.");
          return;
        }
        var fundingLabel = composeFundingLabel(fundSrc, fundDet);
        var fields = {
          parentDisplay: parentDisplay,
          mobile: String((global.document.getElementById("paxEditPhone") || {}).value || "").trim(),
          email: String((global.document.getElementById("paxEditEmail") || {}).value || "").trim(),
          addressLine1: String((global.document.getElementById("paxEditAddr1") || {}).value || "").trim(),
          addressLine2: String((global.document.getElementById("paxEditAddr2") || {}).value || "").trim(),
          city: String((global.document.getElementById("paxEditCity") || {}).value || "").trim(),
          postcode: String((global.document.getElementById("paxEditPostcode") || {}).value || "").trim(),
          registrationDisplay: regDisp,
          fundingLabel: fundingLabel,
          paymentMethodLabel: String(
            (global.document.getElementById("paxEditPay") || {}).value || ""
          ).trim(),
        };
        fields.addressFull = [fields.addressLine1, fields.addressLine2, fields.city, fields.postcode]
          .filter(Boolean)
          .join(", ");
        save.disabled = true;
        var remote = await saveRemote(cid, fields);
        if (!remote.ok) {
          save.disabled = false;
          showErr(
            "Could not save to Portal: " +
              (remote.message || remote.error || "unknown") +
              ". Check you are signed in as admin/CEO."
          );
          return;
        }
        if (remote.contact && remote.contact.registration_date) {
          fields.registrationDisplay =
            isoToUk(remote.contact.registration_date) || fields.registrationDisplay;
        }
        if (remote.contact && remote.contact.mobile != null) {
          fields.mobile = String(remote.contact.mobile || "").trim();
        }
        if (remote.contact && remote.contact.parent_display) {
          fields.parentDisplay = String(remote.contact.parent_display).trim() || fields.parentDisplay;
        }
        if (remote.contact && remote.contact.funding_label != null) {
          fields.fundingLabel = String(remote.contact.funding_label || "").trim() || fields.fundingLabel;
        }
        if (remote.contact && remote.contact.payment_method_label != null) {
          fields.paymentMethodLabel =
            String(remote.contact.payment_method_label || "").trim() || fields.paymentMethodLabel;
        }
        setOverride(cid, fields);
        applyLiveContactToParentsSource(cid, remote.contact);
        if (typeof cfg.closeModal === "function") cfg.closeModal();
        cfg.toast("Client information saved", "ok");
        if (typeof cfg.onSaved === "function") {
          cfg.onSaved(cid, fields, {
            previousMobile: remote.previous_mobile || null,
            contact: remote.contact || null,
          });
        }
      };
    }
  }

  global.AdminParentContactEdit = {
    configure: configure,
    openEditModal: openEditModal,
    applyOverrideToPortalRow: applyOverrideToPortalRow,
    applyOverrideToPax: applyOverrideToPax,
    mergeLiveContactIntoPortalRow: mergeLiveContactIntoPortalRow,
    applyLiveContactToParentsSource: applyLiveContactToParentsSource,
    getOverride: getOverride,
    contactIdFromPax: contactIdFromPax,
  };
})(typeof window !== "undefined" ? window : globalThis);
