/**
 * Portal UI locale — full Spanish UI for Víctor, Raúl, Javier Palankas (`javi`).
 * Walks the live DOM (text + labels/placeholders/titles) and keeps EN originals so
 * ES/EN can flip without reload. Everyone else stays English.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "portal_ui_lang_v1";
  var EXEC_ES_KEYS = { victor: true, raul: true, javi: true };
  var EXEC_EMAILS = {
    "victor@clubsensational.org": "victor",
    "raul@clubsensational.org": "raul",
    "javier@clubsensational.org": "javi",
    "javi@clubsensational.org": "javi",
  };

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

  /* Large phrase map — longest matches win when replacing inside longer strings. */
  var STR_ES = {
    "Search participants, staff, sessions…": "Buscar participantes, staff, sesiones…",
    "Global search": "Búsqueda global",
    "Family messages — parents WhatsApp": "Mensajes a familias — WhatsApp padres",
    "Family messages (parents)": "Mensajes a familias (padres)",
    "CS WhatsApp — staff": "CS WhatsApp — staff",
    "CS WhatsApp (staff)": "CS WhatsApp (staff)",
    "Switch portal": "Cambiar portal",
    "Open menu": "Abrir menú",
    "Quick mobile navigation": "Navegación rápida móvil",
    "← Office portal": "← Portal oficina",
    "Office portal": "Portal oficina",
    "Slot — Scheduling & Cover": "Franja — Horarios y coberturas",
    "Slot — Scheduling &amp; Cover": "Franja — Horarios y coberturas",
    Participant: "Participante",
    "Device notifications": "Notificaciones del dispositivo",
    "Turn on once per computer and browser (Mac or Windows). Each machine needs its own setup — mobile and desktop are separate.":
      "Actívalo una vez por ordenador y navegador (Mac o Windows). Cada máquina necesita su propia configuración — móvil y escritorio son aparte.",
    Alerts: "Alertas",
    Close: "Cerrar",
    Cancel: "Cancelar",
    Save: "Guardar",
    Confirm: "Confirmar",
    Confirmed: "Confirmado",
    Delete: "Eliminar",
    Edit: "Editar",
    Refresh: "Actualizar",
    Loading: "Cargando",
    "Loading…": "Cargando…",
    "Loading...": "Cargando...",
    Search: "Buscar",
    Filter: "Filtrar",
    Status: "Estado",
    All: "Todos",
    Back: "Volver",
    Next: "Siguiente",
    Submit: "Enviar",
    Open: "Abrir",
    Closed: "Cerrado",
    Active: "Activo",
    Pending: "Pendiente",
    Paid: "Pagado",
    Unpaid: "Impagado",
    Partial: "Parcial",
    Today: "Hoy",
    Yesterday: "Ayer",
    Tomorrow: "Mañana",
    Week: "Semana",
    Month: "Mes",
    Year: "Año",
    Name: "Nombre",
    Email: "Email",
    Phone: "Teléfono",
    Mobile: "Móvil",
    Notes: "Notas",
    Actions: "Acciones",
    Details: "Detalles",
    Overview: "Resumen",
    Settings: "Ajustes",
    Documents: "Documentos",
    Finance: "Finance",
    Dashboard: "Panel",
    "Day operations": "Operaciones del día",
    "Operations admin": "Admin de operaciones",
    "Control centre": "Centro de control",
    "Schedule & Covers": "Horarios y coberturas",
    "Schedule &amp; Covers": "Horarios y coberturas",
    "Edit term slot": "Editar franja del término",
    "Spreadsheet reference": "Hojas de referencia",
    "Absents, refunds & credits": "Ausencias, reembolsos y créditos",
    "Absents, refunds &amp; credits": "Ausencias, reembolsos y créditos",
    "Receptionist hub": "Centro de recepción",
    Receptionist: "Recepción",
    "Enquiries & intake": "Consultas e ingreso",
    "Enquiries &amp; intake": "Consultas e ingreso",
    Services: "Servicios",
    Bookings: "Reservas",
    "Staff & shift notices": "Avisos de staff y turnos",
    "Staff &amp; shift notices": "Avisos de staff y turnos",
    "Ops comms & log": "Comunicaciones ops y registro",
    "Ops comms &amp; log": "Comunicaciones ops y registro",
    "Family messages": "Mensajes a familias",
    "CS WhatsApp": "CS WhatsApp",
    "Family broadcast": "Difusión a familias",
    Participants: "Participantes",
    "Client services review": "Revisión de servicios de cliente",
    "Programme payments (operations)": "Pagos de programa (ops)",
    "LA / Commissioning Terms": "Términos LA / Commissioning",
    "Sessions overview": "Resumen de sesiones",
    "Session disruptions": "Incidencias de sesión",
    "Waiting list": "Lista de espera",
    "Office calendar": "Calendario de oficina",
    Reviews: "Reviews",
    "Report requests": "Solicitudes de informe",
    "Portal activity": "Actividad del portal",
    "Training & readiness": "Formación y preparación",
    "Training &amp; readiness": "Formación y preparación",
    "Staff push devices": "Dispositivos push del staff",
    "Staff live map": "Mapa en vivo del staff",
    "Dashboard teleport": "Teleport al dashboard",
    "H&R": "H&R",
    "H&amp;R": "H&R",
    Onboarding: "Onboarding",
    "Employment contracts": "Contratos laborales",
    "Training records": "Registros de formación",
    Recruitment: "Reclutamiento",
    Interviews: "Entrevistas",
    "Day Centre documents": "Documentos Day Centre",
    Payslips: "Nóminas",
    Timesheets: "Timesheets",
    Expenses: "Gastos",
    "Portal PINs": "PINs del portal",
    Certificates: "Certificados",
    Passports: "Pasaportes",
    Checklists: "Checklists",
    "First aids": "Primeros auxilios",
    "Registration forms": "Formularios de registro",
    "Climbing registrations": "Registros de climbing",
    "Parent consents": "Consentimientos de padres",
    "Policies portal": "Portal de políticas",
    "Policy sign-offs": "Firmas de políticas",
    "Activity log": "Registro de actividad",
    "Alerts inbox": "Bandeja de alertas",
    "Staff dashboard": "Dashboard Staff",
    "CEO dashboard": "Dashboard CEO",
    "Log out": "Cerrar sesión",
    Menu: "Menú",
    Operator: "Operador",
    "Services & Participants (CFK)": "Servicios y participantes (CFK)",
    "Services &amp; Participants (CFK)": "Servicios y participantes (CFK)",
    "Settings & dashboards": "Ajustes y dashboards",
    "Settings &amp; dashboards": "Ajustes y dashboards",
    Sessions: "Sesiones",
    Intake: "Ingreso",
    Orders: "Pedidos",
    Communications: "Comunicaciones",
    Policies: "Políticas",
    Workers: "Trabajadores",
    "This app": "Esta app",
    Monitoring: "Monitorización",
    "Other portals": "Otros portales",
    Session: "Sesión",
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
    "Company insights": "Insights de la empresa",
    "Parents in portal": "Padres en el portal",
    "Booking Portal visitors": "Visitantes del Booking Portal",
    "Policies & compliance": "Políticas y compliance",
    "Policies &amp; compliance": "Políticas y compliance",
    "Open workspace": "Abrir workspace",
    "Admin (ops)": "Admin (ops)",
    Staff: "Staff",
    "Company insights registry": "Registro de insights",
    "Open company insights registry": "Abrir registro de insights",
    "Parents in Family portal": "Padres en el portal familia",
    "Open parents in portal": "Abrir padres en el portal",
    "Quick menu": "Menú rápido",
    "Open quick menu": "Abrir menú rápido",
    "My participants": "Mis participantes",
    "Getting started": "Primeros pasos",
    Guide: "Guía",
    "clubSENsational portal guide": "Guía del portal clubSENsational",
    Profile: "Perfil",
    "Annual profile check-in": "Revisión anual de perfil",
    "Review and confirm your contact details on file.": "Revisa y confirma tus datos de contacto.",
    "Sessions & Participants": "Sesiones y participantes",
    "Sessions &amp; Participants": "Sesiones y participantes",
    "Your roster, profiles and quick actions": "Tu roster, perfiles y acciones rápidas",
    "Participant achievements": "Logros de participantes",
    "Session photos (in-app only)": "Fotos de sesión (solo en la app)",
    "Session disruption report": "Incidencia de sesión",
    "Same-day or planned absence · day off request":
      "Ausencia del día o planificada · petición de día libre",
    "Venue Report": "Informe de venue",
    "Opening and closing checks": "Checks de apertura y cierre",
    Pickup: "Recogida",
    "Open handover panel": "Abrir panel de entrega",
    "Pay period 25–24 · green = ready to pay": "Periodo de pago 25–24 · verde = listo para pagar",
    "Announcements/Reminders": "Anuncios / recordatorios",
    Feedbacks: "Feedbacks",
    "Admin Changes": "Cambios de admin",
    "Team shift changes": "Cambios de turno del equipo",
    Photo: "Foto",
    PickUp: "Recogida",
    Plan: "Plan",
    Stats: "Stats",
    "Home — return to dashboard and close open panels":
      "Inicio — volver al dashboard y cerrar paneles",
    "Open alerts and notifications": "Abrir alertas y notificaciones",
    "Session tools left": "Herramientas de sesión (izq.)",
    "Participant achievements — session photos": "Logros de participantes — fotos de sesión",
    "Session planner": "Planificador de sesión",
    "Session stats overview": "Resumen de stats de sesión",
    Venue: "Venue",
    "Venue report": "Informe de venue",
    "Swim Rev": "Swim Rev",
    "Swimming term review": "Review de término natación",
    Lead: "Lead",
    "Lead feedback report": "Informe lead de feedback",
    "Team Rev": "Team Rev",
    "Team term review for workers on your programme":
      "Review de término del equipo en tu programa",
    "Change your profile photo": "Cambiar tu foto de perfil",
    "Portal WhatsApp": "WhatsApp del portal",
    "Open WhatsApp messages": "Abrir mensajes de WhatsApp",
    "Session tools right": "Herramientas de sesión (dcha.)",
    Language: "Idioma",
    "Add / update potential client": "Añadir / actualizar cliente potencial",
    "Track email, phone, enquiry, activity and status. If status is anything other than Booked, their email joins the marketing outreach list automatically.":
      "Registra email, teléfono, consulta, actividad y estado. Si el estado no es Booked, el email entra solo en la lista de marketing outreach.",
    "Save potential": "Guardar potencial",
    "Parent / carer name": "Nombre del padre / cuidador",
    "Enquiry / notes": "Consulta / notas",
    "Activity (e.g. Aquatic Wed)": "Actividad (p. ej. Aquatic Wed)",
    "Do not read the big lead list as “visitors”.":
      "No leas la lista grande de leads como “visitantes”.",
    "Contact selection": "Selección de contactos",
    "Select all shown": "Seleccionar todos los mostrados",
    "Select viewed services": "Seleccionar quienes vieron servicios",
    "Select existing clients": "Seleccionar clientes existentes",
    Clear: "Limpiar",
    "Copy emails": "Copiar emails",
    "Copy phones": "Copiar teléfonos",
    "Send via Family broadcast": "Enviar por difusión a familias",
    "All track statuses": "Todos los estados de seguimiento",
    "On marketing outreach": "En outreach de marketing",
    "Origin: All": "Origen: Todos",
    "Origin: Office potential clients": "Origen: Clientes potenciales oficina",
    "Origin: Marketing outreach list": "Origen: Lista outreach marketing",
    "Origin: Portal OTP only": "Origen: Solo OTP del portal",
    "Origin: Email interest + outreach": "Origen: Interés email + outreach",
    "All client statuses": "Todos los estados de cliente",
    Prospective: "Prospectivo",
    "Interested in our services": "Interesado en nuestros servicios",
    "Registration submitted": "Registro enviado",
    "Existing clients": "Clientes existentes",
    "Portal visitors": "Visitantes del portal",
    "Portal OTP contacts": "Contactos OTP del portal",
    "Email interest import": "Importación interés email",
    "Shown now": "Mostrados ahora",
    "Real /bookingportal sessions": "Sesiones reales /bookingportal",
    "Asked for a code on the portal": "Pidieron un código en el portal",
    "Not visitors — outreach list": "No son visitantes — lista outreach",
    "Parent / carer": "Padre / cuidador",
    "Email / phone": "Email / teléfono",
    Activity: "Actividad",
    Enquiry: "Consulta",
    "Track status": "Estado de seguimiento",
    "Portal status": "Estado portal",
    Verify: "Verificar",
    Forms: "Formularios",
    Updated: "Actualizado",
    New: "Nuevo",
    "Following up": "En seguimiento",
    Waiting: "En espera",
    "Not booking": "No reserva",
    Booked: "Reservado",
    "On outreach list": "En lista outreach",
    "Will join outreach": "Entrará en outreach",
    "Loading booking leads…": "Cargando leads de booking…",
    "No leads match this filter. Try All origins, Outreach list, or add a potential client above.":
      "Ningún lead coincide con este filtro. Prueba Todos los orígenes, Lista outreach, o añade un cliente potencial arriba.",
    "Signed in — live snapshot below; switch workspace from the left menu.":
      "Sesión iniciada — snapshot abajo; cambia de workspace en el menú izquierdo.",
    "Live figures from the portal database — session feedback, welfare, staff and finance.":
      "Cifras en vivo de la base del portal — feedback de sesión, bienestar, staff y finance.",
    "Client income and staff payroll month by month — whole-year view, not limited to one term.":
      "Ingresos de clientes y nómina del staff mes a mes — vista de todo el año, no solo un término.",
    "Full catalogue of portal forms and data sources — opens in its own tab for readability on any screen.":
      "Catálogo completo de formularios y fuentes de datos del portal — se abre en otra pestaña.",
    "See who is signed in right now, which hub screens they opened, and recent absences / portal messages.":
      "Quién está conectado ahora, qué pantallas abrió y ausencias / mensajes recientes del portal.",
    "Xero / finance": "Xero / finance",
    "Services & capacity": "Servicios y capacidad",
    "Services &amp; capacity": "Servicios y capacidad",
    "Late feedback": "Feedback tarde",
    "Session Feedback": "Feedback de sesión",
    "Reviews (instructor / lead)": "Reviews (instructor / lead)",
    "Report requests (global)": "Solicitudes de informe (global)",
    "Reports & incidents": "Informes e incidencias",
    "Reports &amp; incidents": "Informes e incidencias",
    "Booking Portal leads": "Leads del Booking Portal",
    "Recruitment (Indeed/Web)": "Reclutamiento (Indeed/Web)",
    "All bookings (whole order)": "Todas las reservas (pedido completo)",
    "All clients": "Todos los clientes",
    "All feedbacks": "Todos los feedbacks",
    "All instructors": "Todos los instructores",
    "All orders": "Todos los pedidos",
    "All venues": "Todos los venues",
    "All sites (mock)": "Todos los sites (mock)",
    "Back to Services": "Volver a Servicios",
    "Back to roster": "Volver al roster",
    "Cancel edit": "Cancelar edición",
    "Edit client information": "Editar información del cliente",
    "Open Services": "Abrir Servicios",
    "Open Scheduling for this slot": "Abrir Horarios para esta franja",
    "Open full participant record": "Abrir ficha completa del participante",
    "Open participant": "Abrir participante",
    "Open finance": "Abrir finance",
    "Open leads": "Abrir leads",
    "Pending actions": "Acciones pendientes",
    "Pending parent requests": "Peticiones pendientes de padres",
    "Open / pending": "Abierto / pendiente",
    Register: "Registro",
    "Demo mode": "Modo demo",
    "Roster guide": "Guía de roster",
    "Main navigation": "Navegación principal",
    "CEO portal menu": "Menú portal CEO",
    "Sections on this page": "Secciones de esta página",
    "Open another dashboard": "Abrir otro dashboard",
    Hello: "Hola",
    Yes: "Sí",
    No: "No",
    None: "Ninguno",
    Other: "Otro",
    Required: "Obligatorio",
    Optional: "Opcional",
    Error: "Error",
    Success: "Éxito",
    Warning: "Aviso",
    Info: "Info",
    Send: "Enviar",
    Resend: "Reenviar",
    Download: "Descargar",
    Upload: "Subir",
    Preview: "Vista previa",
    Print: "Imprimir",
    Copy: "Copiar",
    Select: "Seleccionar",
    Selected: "Seleccionado",
    Continue: "Continuar",
    Done: "Hecho",
    Apply: "Aplicar",
    Reset: "Restablecer",
    Remove: "Quitar",
    Add: "Añadir",
    Create: "Crear",
    Update: "Actualizar",
    View: "Ver",
    Hide: "Ocultar",
    Show: "Mostrar",
    More: "Más",
    Less: "Menos",
    "No results": "Sin resultados",
    "Try again": "Reintentar",
    "Are you sure?": "¿Estás seguro?",
    "Something went wrong": "Algo ha fallado",
    "Please wait": "Espera por favor",
    "Not found": "No encontrado",
    "Access denied": "Acceso denegado",
    "Session expired": "Sesión caducada",
    "Sign out": "Cerrar sesión",
    "Sign in": "Iniciar sesión",
  };

  /* Merge large dictionaries shipped in portal_ui_locale_dict.js */
  try {
    var _extra = global.__PORTAL_UI_LOCALE_EXTRA__ || {};
    Object.keys(_extra).forEach(function (k) {
      if (!STR_ES[k]) STR_ES[k] = _extra[k];
    });
  } catch (_mergeExtra) {}
  var WORD_ES = {};
  try {
    WORD_ES = global.__PORTAL_UI_LOCALE_WORDS__ || {};
  } catch (_w) {
    WORD_ES = {};
  }

  var PHRASE_LIST = null;
  var nodeSrc = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var attrSrc = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var observer = null;
  var scheduled = false;
  var translating = false;
  var bootSurface = "";

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function normKey(s) {
    return clean(s).replace(/\s+/g, " ");
  }

  function buildPhraseList() {
    if (PHRASE_LIST) return PHRASE_LIST;
    var keys = Object.keys(STR_ES);
    keys.sort(function (a, b) {
      return b.length - a.length;
    });
    PHRASE_LIST = keys.map(function (en) {
      return { en: en, es: STR_ES[en] };
    });
    return PHRASE_LIST;
  }

  function authEmail() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      return clean(
        (box.session && box.session.user && box.session.user.email) ||
          (global.localStorage && global.localStorage.getItem("portalAuthEmail")) ||
          ""
      ).toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function inferStaffKey() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile || null;
      var email = authEmail();
      if (EXEC_EMAILS[email]) return EXEC_EMAILS[email];
      if (typeof global.portalInferStaffKey === "function") {
        var k = clean(global.portalInferStaffKey(profile, email)).toLowerCase();
        if (k) return k;
      }
      var u = clean(profile && profile.username).toLowerCase();
      if (u === "palankas" || u.indexOf("palankas") === 0) return "javi";
      if (u === "javier" && /javier@clubsensational\.org/i.test(email)) return "javi";
      return u;
    } catch (_e) {
      return "";
    }
  }

  function isExecSpanishEligible(key) {
    var k = clean(key || inferStaffKey()).toLowerCase();
    if (EXEC_ES_KEYS[k]) return true;
    if (EXEC_EMAILS[authEmail()]) return true;
    return false;
  }

  function getStoredPref() {
    try {
      var pref = clean(global.localStorage && global.localStorage.getItem(STORAGE_KEY)).toLowerCase();
      if (pref === "en" || pref === "es") return pref;
    } catch (_e) {}
    return "";
  }

  function getLang() {
    if (!isExecSpanishEligible()) return "en";
    var pref = getStoredPref();
    if (pref) return pref;
    return "es";
  }

  function setLang(lang) {
    var next = clean(lang).toLowerCase() === "en" ? "en" : "es";
    try {
      global.localStorage.setItem(STORAGE_KEY, next);
    } catch (_e) {}
    /* If identity not ready yet but email/username looks exec, still apply. */
    applyShell();
    if (!isExecSpanishEligible() && next === "es") {
      paintToggle();
      return next;
    }
    ensureObserver();
    translateTree(global.document && global.document.body);
    paintToggle();
    try {
      if (typeof global.renderNav === "function") global.renderNav();
    } catch (_rn) {}
    try {
      /* Re-render current admin view so fresh English HTML gets translated */
      if (
        typeof global.portalAdminSetView === "function" &&
        global.document &&
        global.document.getElementById("workspace")
      ) {
        var hash = String((global.location && global.location.hash) || "").replace(/^#/, "");
        if (hash) global.portalAdminSetView(hash);
      }
    } catch (_sv) {}
    try {
      global.dispatchEvent(
        new CustomEvent("portal:ui-lang-changed", { detail: { lang: next } })
      );
    } catch (_e2) {}
    scheduleTranslate();
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

  function translateTokens(s) {
    if (!s || !WORD_ES || !Object.keys(WORD_ES).length) return s;
    var shortOk = {
      no: 1,
      or: 1,
      of: 1,
      to: 1,
      by: 1,
      on: 1,
      in: 1,
      at: 1,
      is: 1,
      be: 1,
      we: 1,
      he: 1,
      me: 1,
      my: 1,
      am: 1,
      do: 1,
      an: 1,
      as: 1,
      if: 1,
      so: 1,
      up: 1,
      all: 1,
      any: 1,
      not: 1,
      new: 1,
      yes: 1,
    };
    return String(s).replace(/[A-Za-zÀ-ÿ']+/g, function (word) {
      var lower = word.toLowerCase();
      if (word.length < 3 && !shortOk[lower]) return word;
      var tr = WORD_ES[lower];
      if (!tr) return word;
      if (word.length > 1 && word === word.toUpperCase()) {
        return String(tr).toUpperCase();
      }
      if (word.charAt(0) === word.charAt(0).toUpperCase()) {
        return String(tr).charAt(0).toUpperCase() + String(tr).slice(1);
      }
      return tr;
    });
  }

  function translatePhrase(raw) {
    var s = normKey(raw);
    if (!s) return raw;
    if (STR_ES[s]) return STR_ES[s];
    if (STR_ES[raw]) return STR_ES[raw];
    /* Case-insensitive exact */
    var lower = s.toLowerCase();
    var list = buildPhraseList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].en.toLowerCase() === lower) return list[i].es;
    }
    /* Longest substring replacements */
    var out = s;
    var changed = false;
    for (var j = 0; j < list.length; j++) {
      var en = list[j].en;
      var es = list[j].es;
      if (!en || en.length < 4) continue;
      if (out.indexOf(en) !== -1) {
        out = out.split(en).join(es);
        changed = true;
      }
    }
    /* Word-level pass for leftover English UI tokens */
    var tok = translateTokens(out);
    if (tok !== out) {
      changed = true;
      out = tok;
    }
    return changed ? out : raw;
  }

  function skipElement(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toUpperCase();
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "SVG" ||
      tag === "PATH" ||
      tag === "TEXTAREA" ||
      tag === "CODE" ||
      tag === "PRE"
    ) {
      return true;
    }
    if (el.isContentEditable) return true;
    if (el.closest && el.closest("[data-portal-no-i18n],.portal-no-i18n,#portalUiLangToggle")) {
      return true;
    }
    return false;
  }

  function rememberNode(node, original) {
    if (!nodeSrc) return;
    if (!nodeSrc.has(node)) nodeSrc.set(node, original);
  }

  function originalOf(node, current) {
    if (nodeSrc && nodeSrc.has(node)) return nodeSrc.get(node);
    return current;
  }

  function applyTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    var parent = node.parentElement || node.parentNode;
    if (parent && skipElement(parent)) return;
    var raw = String(node.nodeValue || "");
    if (!raw || !/\S/.test(raw)) return;
    /* Skip mostly-numeric / codes / emails / urls */
    var trimmed = raw.trim();
    if (/^[\d£$€.,:%+\-/#]+$/.test(trimmed)) return;
    if (/@/.test(trimmed) && trimmed.indexOf(" ") < 0) return;
    if (/^https?:\/\//i.test(trimmed)) return;
    if (/^INV-P-/i.test(trimmed)) return;

    var src = originalOf(node, raw);
    rememberNode(node, src);
    if (getLang() !== "es") {
      if (node.nodeValue !== src) node.nodeValue = src;
      return;
    }
    var lead = src.match(/^\s*/)[0];
    var trail = src.match(/\s*$/)[0];
    var mid = src.slice(lead.length, src.length - trail.length);
    var tr = translatePhrase(mid);
    if (tr !== mid) node.nodeValue = lead + tr + trail;
  }

  function applyAttr(el, attr) {
    if (!el || !el.getAttribute) return;
    var cur = el.getAttribute(attr);
    if (cur == null || cur === "") return;
    var key = attr;
    var bag = attrSrc && attrSrc.get(el);
    if (!bag) {
      bag = {};
      if (attrSrc) attrSrc.set(el, bag);
    }
    if (bag[key] == null) bag[key] = cur;
    var src = bag[key];
    if (getLang() !== "es") {
      if (el.getAttribute(attr) !== src) el.setAttribute(attr, src);
      return;
    }
    var tr = translatePhrase(src);
    if (tr !== src) el.setAttribute(attr, tr);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      applyTextNode(root);
      return;
    }
    if (root.nodeType !== 1) return;
    if (skipElement(root)) return;

    applyAttr(root, "placeholder");
    applyAttr(root, "title");
    applyAttr(root, "aria-label");
    applyAttr(root, "aria-placeholder");
    if (root.tagName === "INPUT" || root.tagName === "BUTTON") {
      var type = String(root.getAttribute("type") || "").toLowerCase();
      if (
        root.tagName === "BUTTON" ||
        type === "button" ||
        type === "submit" ||
        type === "reset"
      ) {
        /* value attribute on submit buttons */
        applyAttr(root, "value");
      }
    }

    var child = root.firstChild;
    while (child) {
      var next = child.nextSibling;
      walk(child);
      child = next;
    }
  }

  function translateTree(root) {
    if (!isExecSpanishEligible()) return;
    if (!root) return;
    translating = true;
    try {
      applyShell();
      walk(root);
    } finally {
      translating = false;
    }
  }

  function scheduleTranslate() {
    if (!isExecSpanishEligible()) return;
    if (scheduled) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      if (translating) return;
      translateTree(global.document && global.document.body);
      paintToggle();
    };
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(function () {
        setTimeout(run, 0);
      });
    } else {
      setTimeout(run, 30);
    }
  }

  function ensureObserver() {
    if (observer || !global.MutationObserver || !global.document || !global.document.body) {
      return;
    }
    observer = new global.MutationObserver(function (mutations) {
      if (translating || getLang() !== "es") return;
      var worth = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList" && (m.addedNodes || []).length) {
          worth = true;
          break;
        }
        if (m.type === "characterData") {
          worth = true;
          break;
        }
      }
      if (worth) scheduleTranslate();
    });
    observer.observe(global.document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function t(en) {
    var s = clean(en);
    if (!s || getLang() !== "es") return s;
    return STR_ES[s] || translatePhrase(s);
  }

  function tNavItem(id, fallback) {
    var f = clean(fallback);
    if (getLang() !== "es") return f;
    return ADMIN_NAV_ES[clean(id)] || STR_ES[f] || f;
  }

  function tHubLabel(hubOrLabel) {
    var f = clean(hubOrLabel);
    if (getLang() !== "es") return f;
    return ADMIN_HUB_ES[f] || ADMIN_NAV_ES[f] || STR_ES[f] || f;
  }

  function tNavGroup(id, fallback) {
    var f = clean(fallback);
    if (getLang() !== "es") return f;
    return ADMIN_GROUP_ES[clean(id)] || STR_ES[f] || f;
  }

  function tNavSubhead(en) {
    var f = clean(en);
    if (getLang() !== "es") return f;
    return ADMIN_SUBHEAD_ES[f] || STR_ES[f] || f;
  }

  function paintToggle() {
    var doc = global.document;
    if (!doc) return;
    var wrap = doc.getElementById("portalUiLangToggle");
    if (!wrap) return;
    if (!isExecSpanishEligible()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var lang = getLang();
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-portal-lang]"), function (btn) {
      var on = btn.getAttribute("data-portal-lang") === lang;
      btn.style.background = on ? "rgba(0,0,0,.14)" : "transparent";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function mountToggleIn(host, insertBefore) {
    var doc = global.document;
    if (!doc || !host) return null;
    var existing = doc.getElementById("portalUiLangToggle");
    if (existing) {
      if (existing.parentNode !== host) {
        try {
          host.insertBefore(existing, insertBefore || host.firstChild);
        } catch (_e) {
          host.appendChild(existing);
        }
      }
      paintToggle();
      return existing;
    }
    if (!isExecSpanishEligible()) return null;

    var wrap = doc.createElement("div");
    wrap.id = "portalUiLangToggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Idioma / Language");
    wrap.setAttribute("data-portal-no-i18n", "1");
    wrap.style.cssText =
      "display:inline-flex;gap:4px;align-items:center;flex-wrap:nowrap;margin:0 6px 0 0;min-width:0;flex-shrink:0;";
    wrap.innerHTML =
      '<button type="button" data-portal-lang="es" title="Español" aria-label="Español" style="font:inherit;font-size:11px;font-weight:700;padding:5px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.18);cursor:pointer;min-width:0;line-height:1">ES</button>' +
      '<button type="button" data-portal-lang="en" title="English" aria-label="English" style="font:inherit;font-size:11px;font-weight:700;padding:5px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.18);cursor:pointer;min-width:0;line-height:1">EN</button>';
    wrap.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-portal-lang]");
      if (!btn) return;
      setLang(btn.getAttribute("data-portal-lang"));
    });
    try {
      if (insertBefore && insertBefore.parentNode === host) host.insertBefore(wrap, insertBefore);
      else host.insertBefore(wrap, host.firstChild);
    } catch (_e2) {
      host.appendChild(wrap);
    }
    paintToggle();
    return wrap;
  }

  function ensureLangToggle() {
    var doc = global.document;
    if (!doc) return;
    /* Prefer topbar next to photo / WhatsApp */
    var adminMeta = doc.querySelector(".admin-topbar-meta");
    if (adminMeta) {
      var profile = doc.getElementById("btnProfileMini");
      mountToggleIn(adminMeta, profile || null);
      return;
    }
    var ceoTop = doc.querySelector(".ceo-topbar");
    if (ceoTop) {
      var titles = doc.querySelector(".ceo-topbar-titles");
      mountToggleIn(ceoTop, titles ? titles.nextSibling : null);
      return;
    }
    /* Staff: sit beside the halo / photo, not buried in the tool grid */
    var staffCenter = doc.querySelector(".topbar-center.topbar-center--halo") || doc.querySelector(".topbar-center");
    if (staffCenter) {
      mountToggleIn(staffCenter, null);
      var tog = doc.getElementById("portalUiLangToggle");
      if (tog) {
        tog.style.margin = "6px 0 0";
        tog.style.justifyContent = "center";
        tog.style.width = "100%";
      }
      return;
    }
    var staffRight = doc.querySelector(".topbar-right.topbar-right--tools");
    if (staffRight) {
      mountToggleIn(staffRight, staffRight.firstChild);
      return;
    }
    var foot =
      doc.querySelector(".admin-sidebar-foot") ||
      doc.querySelector(".ceo-sidebar-foot") ||
      doc.querySelector("#menuSheet .sheet-head");
    if (foot) mountToggleIn(foot, null);
  }

  function wrapAdminSetView() {
    try {
      var sv = global.portalAdminSetView;
      if (!sv || sv.__portalI18nWrapped) return;
      var wrapped = function () {
        var r = sv.apply(this, arguments);
        if (getLang() === "es") {
          setTimeout(function () {
            translateTree(global.document && global.document.body);
          }, 0);
          setTimeout(function () {
            translateTree(global.document && global.document.body);
          }, 250);
        }
        return r;
      };
      wrapped.__portalI18nWrapped = true;
      global.portalAdminSetView = wrapped;
    } catch (_w) {}
  }

  function boot(surface) {
    bootSurface = clean(surface) || bootSurface;
    applyShell();
    ensureLangToggle();
    wrapAdminSetView();
    if (!isExecSpanishEligible()) {
      paintToggle();
      return getLang();
    }
    ensureObserver();
    translateTree(global.document && global.document.body);
    try {
      if (typeof global.renderNav === "function") global.renderNav();
    } catch (_rn) {}
    paintToggle();
    scheduleTranslate();
    return getLang();
  }

  /* Re-apply when auth identity arrives late */
  try {
    global.addEventListener("portal:supabase-ready", function () {
      boot(bootSurface || "auto");
    });
    global.addEventListener("portal:staff-identity-resolved", function () {
      boot(bootSurface || "staff");
    });
  } catch (_ev) {}

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
    translateTree: translateTree,
    ensureLangToggle: ensureLangToggle,
    boot: boot,
    STR_ES: STR_ES,
  };

  global.PortalUiLocale = api;
})(typeof window !== "undefined" ? window : globalThis);
