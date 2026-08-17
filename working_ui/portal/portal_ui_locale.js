/**
 * Portal UI locale — Spanish chrome for Víctor, Raúl, Javier Palankas (roster key `javi`).
 * Everyone else stays English. Exec trio defaults to ES; can flip EN/ES (persisted).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "portal_ui_lang_v1";
  var EXEC_ES_KEYS = { victor: true, raul: true, javi: true };

  var ADMIN_NAV_ES = {
    nav_hub: "Panel",
    dashboard: "Operaciones del día",
    operations_admin: "Admin de operaciones",
    operator: "Centro de control",
    scheduling: "Horarios y coberturas",
    term_roster_edit: "Editar franja del término",
    roster_spreadsheets: "Hojas de referencia",
    absents_refunds: "Ausencias, reembolsos y créditos",
    receptionist: "Recepción",
    leads: "Consultas e ingreso",
    c4k_services: "Servicios",
    orders_all: "Todas",
    comms_bookings: "Avisos de staff y turnos",
    comms_ops: "Comunicaciones ops y registro",
    portal_parent_notify_log: "Mensajes a familias",
    portal_staff_whatsapp: "CS WhatsApp",
    portal_parent_broadcast: "Difusión a familias",
    clients: "Participantes",
    portal_nav_client_services: "Revisión de servicios de cliente",
    c4k_payments: "Pagos de programa (ops)",
    reenrol_payments: "Finance",
    commissioning_terms: "Términos LA / Commissioning",
    invoices: "Finance",
    c4k_sessions: "Resumen de sesiones",
    session_disruptions: "Incidencias de sesión",
    c4k_waitlist: "Lista de espera",
    office_calendar: "Calendario de oficina",
    open_places_2627: "Plazas abiertas → Servicios §3",
    c4k_reviews: "Reviews",
    c4k_reports: "Solicitudes de informe",
    servicecap: "Llenar plazas → Servicios §2",
    portal_activity: "Actividad del portal",
    portal_training_progress: "Formación y preparación",
    portal_push_devices: "Dispositivos push del staff",
    staff_live_map: "Mapa en vivo del staff",
    staff_ghost_teleport: "Teleport al dashboard",
    staffhr: "H&R",
    onboarding: "Onboarding",
    staffhr_contracts: "Contratos laborales",
    staffhr_training_records: "Registros de formación",
    recruitment: "Reclutamiento",
    interviews: "Entrevistas",
    portal_documents: "Documentos",
    day_centre_documents: "Documentos Day Centre",
    portal_payslips: "Nóminas",
    portal_docs_timesheet: "Timesheets",
    portal_docs_expense: "Gastos",
    portal_docs_portalpin: "PINs del portal",
    portal_docs_certificate: "Certificados",
    portal_docs_passport: "Pasaportes",
    portal_docs_checklist: "Checklists",
    portal_docs_firstaid: "Primeros auxilios",
    portal_participant_documents: "Formularios de registro",
    portal_climbing_registrations: "Registros de climbing",
    portal_parent_consents: "Consentimientos de padres",
    policies_portal: "Portal de políticas",
    policies: "Firmas de políticas",
    settings: "Ajustes",
    portal_device_notifications: "Notificaciones del dispositivo",
    logs: "Registro de actividad",
    portal_nav_alerts: "Bandeja de alertas",
    portal_nav_staff: "Dashboard Staff",
    portal_nav_ceo: "Dashboard CEO",
    portal_nav_admin: "Admin de operaciones",
    portal_nav_logout: "Cerrar sesión",
    nav_all_menu: "Menú",
  };

  var ADMIN_HUB_ES = {
    "Roster sheets": "Hojas de roster",
    "Refunds & credits": "Reembolsos y créditos",
    Bookings: "Reservas",
    "Ops payments": "Pagos ops",
    Finance: "Finance",
    "LA Terms": "Términos LA",
    "Office calendar": "Calendario de oficina",
    CONTRACTS: "CONTRATOS",
    "TRAINING RECORDS": "FORMACIÓN",
    Documents: "Documentos",
    "Day Centre docs": "Docs Day Centre",
    Payslips: "Nóminas",
    "Registration forms": "Formularios de registro",
    "Climbing regs": "Regs climbing",
    "Parent consents": "Consentimientos",
  };

  var ADMIN_GROUP_ES = {
    g_operator: "Operador",
    g_c4k: "Servicios y participantes (CFK)",
    g_zoho: "H&R",
    g_supabase: "Documentos",
    g_xero: "Finance",
    g_settings_portal: "Ajustes y dashboards",
  };

  var ADMIN_SUBHEAD_ES = {
    Sessions: "Sesiones",
    Intake: "Ingreso",
    Services: "Servicios",
    Participants: "Participantes",
    Orders: "Pedidos",
    Communications: "Comunicaciones",
    Policies: "Políticas",
    "Day Centre": "Day Centre",
    Workers: "Trabajadores",
    "This app": "Esta app",
    Monitoring: "Monitorización",
    "Other portals": "Otros portales",
    Session: "Sesión",
  };

  var STR_ES = {
    "Staff Portal": "Portal Staff",
    "Your roster, sessions and field tools": "Tu roster, sesiones y herramientas de campo",
    "Lead Portal": "Portal Lead",
    "Lead report, team tools — same as Michelle, John and Berta":
      "Informe lead y herramientas de equipo — igual que Michelle, John y Berta",
    "Admin Portal": "Portal Admin",
    "Day operations, roster, feedback and admin tools":
      "Operaciones del día, roster, feedback y herramientas admin",
    "CEO Portal": "Portal CEO",
    "Strategic snapshot, finance trends and company insights":
      "Snapshot estratégico, finance e insights de la empresa",
    "CEO portal": "Portal CEO",
    "Strategic overview · finance · insights": "Visión estratégica · finance · insights",
    "This dashboard": "Este dashboard",
    "Strategic snapshot": "Snapshot estratégico",
    Finance: "Finance",
    "Company insights": "Insights de la empresa",
    "Parents in portal": "Padres en el portal",
    "Booking Portal visitors": "Visitantes del Booking Portal",
    "Policies & compliance": "Políticas y compliance",
    "Open workspace": "Abrir workspace",
    "Admin (ops)": "Admin (ops)",
    Staff: "Staff",
    "Log out": "Cerrar sesión",
    "Open menu": "Abrir menú",
    "CEO dashboard": "Dashboard CEO",
    "Company insights registry": "Registro de insights",
    "Open company insights registry": "Abrir registro de insights",
    "Parents in Family portal": "Padres en el portal familia",
    "Open parents in portal": "Abrir padres en el portal",
    Participants: "Participantes",
    "Quick menu": "Menú rápido",
    "Open quick menu": "Abrir menú rápido",
    "My participants": "Mis participantes",
    Menu: "Menú",
    "Getting started": "Primeros pasos",
    Guide: "Guía",
    "clubSENsational portal guide": "Guía del portal clubSENsational",
    Profile: "Perfil",
    "Annual profile check-in": "Revisión anual de perfil",
    "Sessions & Participants": "Sesiones y participantes",
    "Participant achievements": "Logros de participantes",
    "Session disruption report": "Incidencia de sesión",
    "Venue Report": "Informe de venue",
    Pickup: "Recogida",
    Timesheets: "Timesheets",
    "Announcements/Reminders": "Anuncios / recordatorios",
    Feedbacks: "Feedbacks",
    "Admin Changes": "Cambios de admin",
    "Team shift changes": "Cambios de turno del equipo",
    Language: "Idioma",
    English: "English",
    Español: "Español",
  };

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function inferStaffKey() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile || null;
      var email =
        (box.session && box.session.user && box.session.user.email) ||
        (global.localStorage && global.localStorage.getItem("portalAuthEmail")) ||
        "";
      if (typeof global.portalInferStaffKey === "function") {
        return clean(global.portalInferStaffKey(profile, email)).toLowerCase();
      }
      var u = clean(profile && profile.username).toLowerCase();
      if (u === "palankas" || u.indexOf("palankas") === 0) return "javi";
      if (u === "javier" && /javier@clubsensational\.org/i.test(String(email))) return "javi";
      return u;
    } catch (_e) {
      return "";
    }
  }

  function isExecSpanishEligible(key) {
    var k = clean(key || inferStaffKey()).toLowerCase();
    return !!EXEC_ES_KEYS[k];
  }

  function getLang() {
    if (!isExecSpanishEligible()) return "en";
    try {
      var pref = clean(global.localStorage && global.localStorage.getItem(STORAGE_KEY)).toLowerCase();
      if (pref === "en" || pref === "es") return pref;
    } catch (_e) {}
    return "es";
  }

  function setLang(lang) {
    var next = clean(lang).toLowerCase() === "en" ? "en" : "es";
    if (!isExecSpanishEligible()) return getLang();
    try {
      global.localStorage.setItem(STORAGE_KEY, next);
    } catch (_e) {}
    applyShell();
    try {
      global.dispatchEvent(
        new CustomEvent("portal:ui-lang-changed", { detail: { lang: next } })
      );
    } catch (_e2) {}
    return next;
  }

  function applyShell() {
    var lang = getLang();
    var html = global.document && global.document.documentElement;
    var body = global.document && global.document.body;
    if (html) {
      html.lang = lang === "es" ? "es" : "en-GB";
      html.setAttribute("data-portal-ui-lang", lang);
    }
    if (body) {
      body.classList.toggle("portal-lang-es", lang === "es");
      body.classList.toggle("portal-lang-en", lang !== "es");
    }
    return lang;
  }

  function t(en) {
    var s = clean(en);
    if (!s || getLang() !== "es") return s;
    return STR_ES[s] || s;
  }

  function tNavItem(id, fallback) {
    var f = clean(fallback);
    if (getLang() !== "es") return f;
    return ADMIN_NAV_ES[clean(id)] || f;
  }

  function tHubLabel(hubOrLabel) {
    var f = clean(hubOrLabel);
    if (getLang() !== "es") return f;
    return ADMIN_HUB_ES[f] || ADMIN_NAV_ES[f] || STR_ES[f] || f;
  }

  function tNavGroup(id, fallback) {
    var f = clean(fallback);
    if (getLang() !== "es") return f;
    return ADMIN_GROUP_ES[clean(id)] || f;
  }

  function tNavSubhead(en) {
    var f = clean(en);
    if (getLang() !== "es") return f;
    return ADMIN_SUBHEAD_ES[f] || f;
  }

  function translateTextNodes(root, map) {
    if (!root || getLang() !== "es") return;
    var pairs = map || STR_ES;
    Object.keys(pairs).forEach(function (en) {
      var es = pairs[en];
      if (!es || es === en) return;
      var walk = root.querySelectorAll ? root.querySelectorAll("*") : [];
      Array.prototype.forEach.call(walk, function (el) {
        if (!el || !el.childNodes) return;
        Array.prototype.forEach.call(el.childNodes, function (node) {
          if (node.nodeType !== 3) return;
          var raw = String(node.nodeValue || "");
          var trimmed = raw.trim();
          if (trimmed === en) {
            node.nodeValue = raw.replace(trimmed, es);
          }
        });
      });
    });
  }

  function applyCeoDom() {
    applyShell();
    if (getLang() !== "es") return;
    var doc = global.document;
    if (!doc) return;
    var map = {
      ".ceo-sidebar-brand > strong": "Portal CEO",
      ".ceo-sidebar-brand > span": "Visión estratégica · finance · insights",
      ".ceo-nav-kicker": null,
      "#ceoStrategicTitle": "Snapshot estratégico",
      "#ceoFinanceTitle": "Finance",
      "#ceoInsightsTitle": "Registro de insights de la empresa",
      "#ceoParentsTitle": "Padres en el portal familia",
      ".ceo-topbar-titles h1": "Dashboard CEO",
      "#ceoLogout": "Cerrar sesión",
      "#portalCeoNavAdmin": "Admin (ops)",
      "#portalCeoNavStaff": "Staff",
      "#portalCeoNavInsights": "Abrir registro de insights",
    };
    var kickers = doc.querySelectorAll(".ceo-nav-kicker");
    if (kickers[0]) kickers[0].textContent = "Este dashboard";
    if (kickers[1]) kickers[1].textContent = "Abrir workspace";

    Object.keys(map).forEach(function (sel) {
      if (map[sel] == null) return;
      var el = doc.querySelector(sel);
      if (el) el.textContent = map[sel];
    });

    var nav = {
      "#ceo-strategic": "Snapshot estratégico",
      "#ceo-finance": "Finance",
      "#ceo-insights": "Insights de la empresa",
    };
    Array.prototype.forEach.call(doc.querySelectorAll("a.ceo-nav-link"), function (a) {
      var href = clean(a.getAttribute("href"));
      var label = nav[href];
      if (!label) {
        if (/ceo_parents_portal/i.test(href)) label = "Padres en el portal";
        else if (/ceo_booking_service_portal/i.test(href)) label = "Visitantes del Booking Portal";
        else if (/policies_portal/i.test(href)) label = "Políticas y compliance";
      }
      if (!label) return;
      var ico = a.querySelector(".ceo-nav-ico");
      a.textContent = "";
      if (ico) a.appendChild(ico);
      a.appendChild(doc.createTextNode(label));
    });

    var leads = doc.querySelectorAll(".ceo-strategic-head p, .ceo-panel__lead");
    if (leads[0]) {
      leads[0].textContent =
        "Cifras en vivo de la base del portal — feedback de sesión, bienestar, staff y finance.";
    }
    if (leads[1]) {
      leads[1].textContent =
        "Ingresos de clientes y nómina del staff mes a mes — vista de todo el año, no solo un término.";
    }
    if (leads[2]) {
      leads[2].textContent =
        "Catálogo completo de formularios y fuentes de datos del portal — se abre en otra pestaña.";
    }
    var parentLead = doc.querySelector("#ceo-parents .ceo-panel__lead");
    if (parentLead) {
      parentLead.textContent =
        "Quién está conectado ahora, qué pantallas abrió y ausencias / mensajes recientes del portal.";
    }
    var parentBtn = doc.querySelector('#ceo-parents a.ceo-ops-team-btn');
    if (parentBtn) parentBtn.textContent = "Abrir padres en el portal";

    var greet = doc.getElementById("ceoGreet");
    if (greet) {
      var box = global.__PORTAL_SUPABASE__ || {};
      var p = box.staff_profile;
      var n = clean((p && (p.full_name || p.username)) || "");
      greet.textContent = n
        ? "Hola, " + n + " — snapshot abajo; cambia de workspace a la izquierda."
        : "Sesión iniciada — snapshot abajo; cambia de workspace a la izquierda.";
    }
  }

  function applyStaffDom() {
    applyShell();
    if (getLang() !== "es") return;
    var doc = global.document;
    if (!doc) return;

    var dockParts = doc.querySelector("#dockParticipantsTile .dock-nav-item__label");
    if (dockParts) dockParts.textContent = "Participantes";
    var dockQm = doc.querySelector("#dockQuickMenuTile .dock-nav-item__label");
    if (dockQm) dockQm.textContent = "Menú rápido";
    var dockPartsBtn = doc.getElementById("dockParticipantsTile");
    if (dockPartsBtn) {
      dockPartsBtn.setAttribute("aria-label", "Mis participantes");
      dockPartsBtn.setAttribute("title", "Participantes");
    }
    var dockQmBtn = doc.getElementById("dockQuickMenuTile");
    if (dockQmBtn) dockQmBtn.setAttribute("aria-label", "Abrir menú rápido");

    var menuTitle = doc.getElementById("portalMenuSheetTitle");
    if (menuTitle) menuTitle.textContent = "Menú";

    var groupTitles = {
      portalQuickMenuGuideGroupTitle: "Primeros pasos",
      portalQuickMenuAdminChangesHeading: "Cambios de admin",
      portalLeadTeamShiftHeading: "Cambios de turno del equipo",
      portalQuickMenuAnnouncementsHeading: "Anuncios / recordatorios",
      portalQuickMenuRemindersHeading: "Feedbacks",
    };
    Object.keys(groupTitles).forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) el.textContent = groupTitles[id];
    });
    Array.prototype.forEach.call(doc.querySelectorAll(".menu-group-title"), function (el) {
      var t0 = clean(el.textContent);
      if (t0 === "Profile") el.textContent = "Perfil";
      if (t0 === "Sessions & Participants" || t0 === "Sessions &amp; Participants") {
        el.textContent = "Sesiones y participantes";
      }
      if (t0 === "Getting started") el.textContent = "Primeros pasos";
    });

    var btnMap = [
      ["#quickMenuPortalGuideTop", "Guía", "Guía del portal clubSENsational"],
      ["#quickMenuSessionParticipants", "Mis participantes", "Tu roster, perfiles y acciones rápidas"],
      ["#quickMenuParticipantAchievements", "Logros de participantes", "Fotos de sesión (solo en la app)"],
      ["#quickMenuSessionDisruption", "Incidencia de sesión", "Ausencia del día o planificada · petición de día libre"],
      ["#quickMenuWorkVenue", "Informe de venue", "Checks de apertura y cierre"],
      ["#quickMenuDropoffPickup", "Recogida", "Abrir panel de entrega"],
      ["#quickMenuWorkTimesheet", "Timesheets", "Periodo de pago 25–24 · verde = listo para pagar"],
      ["#quickMenuAnnualProfileCheckin", "Revisión anual de perfil", "Revisa y confirma tus datos de contacto."],
    ];
    btnMap.forEach(function (row) {
      var btn = doc.querySelector(row[0]);
      if (!btn) return;
      var strong = btn.querySelector(".menu-btn-copy strong");
      var sub = btn.querySelector(".menu-btn-copy .menu-btn-sub");
      if (strong) strong.textContent = row[1];
      if (sub) sub.textContent = row[2];
    });
  }

  function ensureLangToggle(hostSel) {
    if (!isExecSpanishEligible()) return;
    var doc = global.document;
    if (!doc || doc.getElementById("portalUiLangToggle")) return;
    var host =
      (hostSel && doc.querySelector(hostSel)) ||
      doc.querySelector(".ceo-sidebar-foot") ||
      doc.querySelector(".admin-sidebar-foot") ||
      doc.body;
    if (!host) return;
    var wrap = doc.createElement("div");
    wrap.id = "portalUiLangToggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language");
    wrap.style.cssText =
      "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0;min-width:0;";
    var lang = getLang();
    wrap.innerHTML =
      '<span style="font-size:11px;opacity:.75;margin-right:2px">Idioma</span>' +
      '<button type="button" data-portal-lang="es" style="font:inherit;font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:' +
      (lang === "es" ? "rgba(0,0,0,.12)" : "transparent") +
      ';cursor:pointer;min-width:0">ES</button>' +
      '<button type="button" data-portal-lang="en" style="font:inherit;font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:' +
      (lang === "en" ? "rgba(0,0,0,.12)" : "transparent") +
      ';cursor:pointer;min-width:0">EN</button>';
    wrap.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-portal-lang]");
      if (!btn) return;
      setLang(btn.getAttribute("data-portal-lang"));
      global.location.reload();
    });
    host.insertBefore(wrap, host.firstChild);
  }

  function boot(surface) {
    applyShell();
    if (!isExecSpanishEligible()) return getLang();
    if (surface === "ceo") {
      applyCeoDom();
      ensureLangToggle(".ceo-sidebar-foot");
    } else if (surface === "staff") {
      applyStaffDom();
      ensureLangToggle("#menuSheet .sheet-head");
      if (!global.document.getElementById("portalUiLangToggle")) {
        ensureLangToggle("body");
      }
    } else if (surface === "admin") {
      ensureLangToggle(".admin-sidebar-foot");
    }
    return getLang();
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    isExecSpanishEligible: isExecSpanishEligible,
    inferStaffKey: inferStaffKey,
    getLang: getLang,
    setLang: setLang,
    applyShell: applyShell,
    t: t,
    tNavItem: tNavItem,
    tHubLabel: tHubLabel,
    tNavGroup: tNavGroup,
    tNavSubhead: tNavSubhead,
    applyCeoDom: applyCeoDom,
    applyStaffDom: applyStaffDom,
    ensureLangToggle: ensureLangToggle,
    boot: boot,
    translateTextNodes: translateTextNodes,
  };

  global.PortalUiLocale = api;
})(typeof window !== "undefined" ? window : globalThis);
