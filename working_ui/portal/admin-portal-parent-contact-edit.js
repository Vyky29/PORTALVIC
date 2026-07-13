/**
 * Admin — edit participant Registration (summary) contact fields.
 */
(function (global) {
  "use strict";

  var STORE_KEY = "portalAdminPaxContactEdits_v1";
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

  /** Merge saved edits onto a participants-parents portal export row. */
  function applyOverrideToPortalRow(row) {
    if (!row) return row;
    var cid = String(row.contactId || "").trim();
    if (!cid) return row;
    var ov = getOverride(cid);
    if (!ov) return row;
    var out = Object.assign({}, row);
    if (ov.parentDisplay != null) out.parentDisplay = ov.parentDisplay;
    if (ov.mobile != null) out.mobile = ov.mobile;
    if (ov.email != null) out.username = ov.email;
    if (ov.addressLine1 != null) out.addressLine1 = ov.addressLine1;
    if (ov.addressLine2 != null) out.addressLine2 = ov.addressLine2;
    if (ov.city != null) out.city = ov.city;
    if (ov.postcode != null) out.postcode = ov.postcode;
    if (ov.registrationDisplay != null) out.createdDisplay = ov.registrationDisplay;
    if (ov.fundingLabel != null) out._adminFundingLabel = ov.fundingLabel;
    if (ov.paymentMethodLabel != null) out._adminPaymentMethodLabel = ov.paymentMethodLabel;
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
    else if (
      ov.addressLine1 != null ||
      ov.city != null ||
      ov.postcode != null
    ) {
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
    return { ok: true, contact: j.contact };
  }

  function parseAddressParts(addressFull) {
    var raw = String(addressFull || "").trim();
    if (!raw || raw === "—") {
      return { line1: "", line2: "", city: "", postcode: "" };
    }
    var parts = raw.split(",").map(function (x) {
      return String(x || "").trim();
    }).filter(Boolean);
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
    var fund = String(displayFunding != null ? displayFunding : r.fundingRoute || "").trim();
    var pay = String(displayPay != null ? displayPay : r.paymentMethod || "").trim();
    if (fund === "—") fund = "";
    if (pay === "—") pay = "";
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
        '<input class="inp" id="paxEditFunding" style="max-width:100%;box-sizing:border-box" value="' +
        esc(fund) +
        '" />' +
        '<label class="muted" style="display:block;margin-top:10px">Payment method</label>' +
        '<input class="inp" id="paxEditPay" style="max-width:100%;box-sizing:border-box" value="' +
        esc(pay) +
        '" />' +
        '<p id="paxEditErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px"></p>' +
        "</div>" +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="paxEditCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="paxEditSave">Save</button>' +
        "</div>"
    );

    var cancel = global.document.getElementById("paxEditCancel");
    var save = global.document.getElementById("paxEditSave");
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
        var fields = {
          parentDisplay: parentDisplay,
          mobile: String((global.document.getElementById("paxEditPhone") || {}).value || "").trim(),
          email: String((global.document.getElementById("paxEditEmail") || {}).value || "").trim(),
          addressLine1: String((global.document.getElementById("paxEditAddr1") || {}).value || "").trim(),
          addressLine2: String((global.document.getElementById("paxEditAddr2") || {}).value || "").trim(),
          city: String((global.document.getElementById("paxEditCity") || {}).value || "").trim(),
          postcode: String((global.document.getElementById("paxEditPostcode") || {}).value || "").trim(),
          registrationDisplay: regDisp,
          fundingLabel: String((global.document.getElementById("paxEditFunding") || {}).value || "").trim(),
          paymentMethodLabel: String((global.document.getElementById("paxEditPay") || {}).value || "").trim(),
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
          fields.registrationDisplay = isoToUk(remote.contact.registration_date) || fields.registrationDisplay;
        }
        setOverride(cid, fields);
        if (typeof cfg.closeModal === "function") cfg.closeModal();
        cfg.toast("Client information saved", "ok");
        if (typeof cfg.onSaved === "function") cfg.onSaved(cid, fields);
      };
    }
  }

  global.AdminParentContactEdit = {
    configure: configure,
    openEditModal: openEditModal,
    applyOverrideToPortalRow: applyOverrideToPortalRow,
    applyOverrideToPax: applyOverrideToPax,
    getOverride: getOverride,
    contactIdFromPax: contactIdFromPax,
  };
})(typeof window !== "undefined" ? window : globalThis);
