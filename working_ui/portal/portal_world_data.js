/* Source of truth copied from portal_world.html. Do not replace with sample data. */
(function (root) {
  var ISLANDS = [
    {
      id: "ceo",
      cls: "island--ceo",
      kicker: "Direccion",
      name: "CEO",
      host: "portalvic.vercel.app/ceo_dashboard",
      short: "portalvic / CEO",
      x: 34, y: 15,
      chips: ["Finance", "Visitantes", "Padres"],
      home: [],
      visit: [],
      happens: [
        "Mira finance, visitantes del Booking y quien esta dentro del Parent.",
        "Activity log, portal activity y staff readiness salen de aqui.",
        "No opera el dia. El dia es Admin."
      ]
    },
    {
      id: "auto",
      cls: "island--auto",
      kicker: "Motor",
      name: "Automatizaciones",
      host: "Supabase, correo y cron",
      short: "email, sync, avisos",
      x: 50, y: 15,
      chips: ["Email", "Sync", "Avisos", "Holds"],
      home: [],
      visit: [],
      happens: [
        "OTP: el codigo sale por email a la familia. Si el lead es nuevo, Admin recibe un aviso. No reescribe Staff ni Parent.",
        "Booking pagado: esta caja escribe a la vez Admin (Overview, Schedule, Places, Finance), Staff Today y Parent (Today card, Bookings, Invoices).",
        "Un trial pagado deja ademas el soft hold en Booking hasta el final del dia.",
        "Un cobro fallido y el trabajo de la manana tambien salen de aqui. Solo ponen o quitan soft hold. No cancelan la plaza."
      ]
    },
    {
      id: "booking",
      cls: "island--booking",
      kicker: "Puerta publica",
      name: "Booking",
      host: "www.clubsensational.org/bookingportal",
      short: "clubsensational.org/booking",
      x: 14, y: 44,
      chips: ["OTP", "Registro", "Cuenta", "Soft hold"],
      home: [],
      visit: [],
      happens: [
        "Quien entra: sin cuenta, con OTP sin terminar el registro (LEAD), o Connected as su cuenta (PIN o codigo por email).",
        "OTP pide el codigo. Si no acaba el formulario, se queda en LEADS.",
        "Registro terminado pasa a REGISTERED. Aun no es CLIENT. El pago sigue en Parent.",
        "Soft hold: un trial pagado reserva la plaza del termino en el offer. Booking la enseña ocupada. Nadie mas la coge. Si el dia acaba sin cerrar el termino, el hold se suelta y la plaza vuelve.",
        "El hold de 30 minutos es otro: el enlace de pago sin cobrar ocupa la plaza media hora. Si no pagan, queda libre. No es el soft hold."
      ]
    },
    {
      id: "admin",
      cls: "island--admin",
      kicker: "Oficina del dia",
      name: "Admin",
      host: "portalvic.vercel.app",
      short: "portalvic / Admin",
      x: 34, y: 48,
      chips: ["Overview", "Schedule", "Places", "Leads", "Finance", "Holds"],
      home: [],
      visit: [],
      happens: [
        "Sessions Overview es el look-here del dia. Schedule and Covers escribe el cover, la ausencia de un dia y el day off.",
        "Places, Leads, CLIENT, REGISTERED y WAITING. Finance: re-enrolments, payments, absents y cancelled services.",
        "Al pagar un registro, a la vez entran Schedule, Overview y Places. Staff Today y Parent se enteran en el mismo paso.",
        "Soft hold de pago (buffer bajo o cobro fallido): la oficina puede recordar, retener una sesion, soltar o cortar. El cron de la manana solo pone o quita ese soft hold. No cancela la plaza solo.",
        "Potential workers abre el alta. Workers ve el job y el health cuando ya estan rellenos. Documents guarda archivos, timesheet y expenses.",
        "La campana (tarde, cancel, incident, expense) vive aqui."
      ]
    },
    {
      id: "staff",
      cls: "island--staff",
      kicker: "Equipo",
      name: "Staff",
      host: "clubsensational-staff.vercel.app",
      short: "clubsensational-staff",
      x: 56, y: 44,
      chips: ["Today", "Feedback", "Timesheet", "Expenses"],
      home: [],
      visit: [],
      happens: [
        "Today es su dia. Un cover, una sesion nueva o una ausencia que escribe Admin aparece aqui.",
        "Feedback cierra la sesion. A la vez: Overview en Admin pasa a verde y Parent lo lee en la Today card.",
        "Si falta feedback, el halo y Quick menu avisan en Staff y la campana en Admin. No bloquea la app.",
        "Timesheet cuenta el turno de Admin y el feedback de aqui. No se escriben las horas a mano. Expenses sale de aqui y queda Pending en Documents de Admin.",
        "Onboarding es la puerta de entrada: misma cuenta, mismo host. Al terminar, el dia a dia es este portal.",
        "Una ausencia que marca la familia en Parent sale en Today. La plaza del termino no se borra."
      ]
    },
    {
      id: "parent",
      cls: "island--parent",
      kicker: "Familias",
      name: "Parent",
      host: "www.clubsensational.org/parent",
      short: "clubsensational.org/parent",
      x: 34, y: 82,
      chips: ["Today", "Bookings", "Invoices", "Absent", "Team", "Notes"],
      home: [],
      visit: [],
      happens: [
        "Today card: la sesion de hoy, o la siguiente si hoy no hay.",
        "Bookings: lo que ese nino tiene reservado. Desde aqui tambien se abre Booking para una plaza nueva.",
        "Invoices: facturas de la familia. Si hay una sin pagar, ese acceso se marca.",
        "Tambien estan Sessions, Absent, Team, Consents y Notes.",
        "No ve el day off del instructor ni COVER NEEDED. Si el cover tiene nombre, Team muestra ese nombre.",
        "Marcar Absent avisa a la vez a Admin y a Staff Today. La plaza del termino sigue."
      ]
    },
    {
      id: "onb",
      cls: "island--onb",
      kicker: "Alta",
      name: "Onboarding",
      host: "clubsensational-staff.vercel.app/onboarding_portal",
      short: "staff / Onboarding",
      x: 56, y: 15,
      chips: ["Job", "Health", "Starter", "Documents"],
      home: [],
      visit: [],
      happens: [
        "Es el portal del alta, en el mismo host que Staff.",
        "Job, Health, Starter checklist y Documents: foto, pasaporte y right to work.",
        "Admin lo abre desde Potential workers, despues de la entrevista.",
        "Cuando la persona entra en Staff, es la misma cuenta. Si falta algo del alta, Onboarding sigue en el menu de Staff.",
        "Admin Workers lee el job y el health. Documents guarda los archivos."
      ]
    },
    {
      id: "email",
      cls: "island--sat island--email",
      kicker: "Fuera",
      name: "Email",
      host: "Correo",
      short: "codigo y avisos",
      x: 0, y: 0,
      chips: ["OTP", "Oficina"],
      home: [],
      visit: [],
      happens: [
        "La familia lo pide en Booking. El codigo OTP sale por email. Dura unos 10 minutos.",
        "Si el lead es nuevo, la oficina tambien recibe un email. Un codigo repetido no vuelve a avisar.",
        "Ese email no sale por WhatsApp."
      ]
    },
    {
      id: "wa",
      cls: "island--sat island--wa",
      kicker: "Fuera",
      name: "WhatsApp",
      host: "Business y dos APIs",
      short: "familias y staff",
      x: 0, y: 0,
      chips: ["Business", "Parents API", "Staff API"],
      home: [],
      visit: [],
      happens: [
        "Business manda plantillas. El chase del feedback a las 20:30 sale por aqui.",
        "Parents API es el hilo con las familias.",
        "Staff API es el hilo con los trabajadores.",
        "No es Comms. Comms es la llamada y el mensaje dentro del portal."
      ]
    },
    {
      id: "stripe",
      cls: "island--sat island--stripe",
      kicker: "Cobro",
      name: "Stripe",
      host: "Tarjeta y Apple Pay",
      short: "tarjeta",
      x: 0, y: 0,
      chips: ["Card", "Apple Pay"],
      home: [],
      visit: [],
      happens: [
        "La tarjeta del enlace de finish-booking entra por Stripe.",
        "Cuando cobra, Automatizaciones escribe Admin, Staff y Parent.",
        "La mensualidad del termino no es Stripe. Eso es GoCardless."
      ]
    },
    {
      id: "gc",
      cls: "island--sat island--gc",
      kicker: "Cobro",
      name: "GoCardless",
      host: "Domiciliacion",
      short: "mensual",
      x: 0, y: 0,
      chips: ["Direct debit"],
      home: [],
      visit: [],
      happens: [
        "La cuota mensual del termino se cobra por GoCardless.",
        "Si falla, Automatizaciones pone soft hold. La plaza sigue de esa familia.",
        "No cancela la plaza solo."
      ]
    },
    {
      id: "xero",
      cls: "island--sat island--xero",
      kicker: "Cuentas",
      name: "Xero",
      host: "Facturas",
      short: "borradores",
      x: 0, y: 0,
      chips: ["Invoices", "Products"],
      home: [],
      visit: [],
      happens: [
        "El cobro de una plaza y el re-enrolment dejan el borrador de la factura en Xero.",
        "Admin Finance lo lee. Xero no mueve el tablero del dia."
      ]
    },
    {
      id: "comms",
      cls: "island--comms",
      kicker: "Llamadas",
      name: "Comms",
      host: "comunicaciones",
      short: "llamada y chat",
      x: 0, y: 0,
      chips: ["Llamada", "Video", "Mensaje"],
      home: [],
      visit: [],
      happens: [
        "Es el portal de la oficina con los trabajadores: llamada, video y mensaje dentro de la app.",
        "No es WhatsApp y no cambia la plaza ni el feedback."
      ]
    }
  ];

  var LINKS = [
    { id: "b-auto", from: "booking", to: "auto", bow: 8, label: "OTP, pago y holds" },
    { id: "auto-a", from: "auto", to: "admin", bow: -6, label: "Aviso, Overview, Schedule, Places y Finance" },
    { id: "auto-s", from: "auto", to: "staff", bow: 6, label: "Today, halo y feedback pendiente" },
    { id: "auto-p", from: "auto", to: "parent", bow: 22, label: "Today card, Bookings, Invoices y avisos" },
    { id: "auto-b", from: "auto", to: "booking", bow: -8, label: "Soft hold y suelta de plaza" },
    { id: "b-a", from: "booking", to: "admin", bow: 5, label: "OTP, registro, soft hold y pago" },
    { id: "b-p", from: "booking", to: "parent", bow: -14, label: "Cuenta, finish-booking y Today card" },
    { id: "a-s", from: "admin", to: "staff", label: "Today, cover, feedback, timesheet y expenses" },
    { id: "a-o", from: "admin", to: "onb", label: "Entrevista y alta desde Potential workers" },
    { id: "o-s", from: "onb", to: "staff", label: "Misma cuenta: al terminar el alta entra en Staff" },
    { id: "a-p", from: "admin", to: "parent", label: "Today card, Bookings, Invoices, Absent y Notas filtradas" },
    { id: "s-p", from: "staff", to: "parent", label: "Stats a Session Feedback, directo y sin Admin" },
    { id: "p-a", from: "parent", to: "admin", bow: -16, label: "Nota de la familia o descarga de foto: campana de Admin" },
    { id: "a-c", from: "admin", to: "ceo", bow: -8, label: "Cifras, visitantes y padres en el portal" },
    { id: "b-c", from: "booking", to: "ceo", bow: -5, label: "Visitantes de Booking" },
    { id: "p-c", from: "parent", to: "ceo", bow: -18, label: "Quien esta dentro de Parent" },
    { id: "b-stripe", from: "booking", to: "stripe", bow: 4, label: "Tarjeta y Apple Pay" },
    { id: "b-gc", from: "booking", to: "gc", bow: -6, label: "Cuota mensual" },
    { id: "a-xero", from: "admin", to: "xero", bow: 6, label: "Borrador de factura" },
    { id: "auto-email", from: "auto", to: "email", bow: 5, label: "Codigo OTP y aviso de lead nuevo" },
    { id: "auto-wa", from: "auto", to: "wa", bow: -5, label: "Plantillas, Parents API y Staff API" },
    { id: "a-comms", from: "admin", to: "comms", bow: 8, label: "Llamada y mensaje con el equipo" },
    { id: "s-comms", from: "staff", to: "comms", bow: -4, label: "La misma llamada, del lado del trabajador" },
    { id: "s-wa", from: "staff", to: "wa", bow: 6, label: "Hilo Staff API" },
    { id: "p-wa", from: "parent", to: "wa", bow: 10, label: "Hilo Parents API" }
  ];

  var STORIES = [
    {
      id: "lead",
      label: "Cuenta y registro",
      actor: "A la vez",
      steps: [
        { islands: ["booking"], links: [], text: "Entra sin cuenta, o Connected as su cuenta (PIN o codigo por email)." },
        { islands: ["booking", "auto"], links: ["b-auto"], text: "OTP. El codigo sale por email a la familia. Si el lead es nuevo, el punto llega a Admin como aviso. No reescribe Staff ni Parent." },
        { islands: ["booking", "parent", "admin"], links: ["b-p", "b-a"], text: "A la vez: Parent abre finish-booking, Admin ve el lead, y el enlace sin pagar hace hold de 30 min en Booking. Eso no es el soft hold." },
        { islands: ["booking", "auto", "admin", "staff", "parent"], links: ["b-auto", "auto-a", "auto-s", "auto-p"], text: "Al pagar, el punto sale de Booking, pasa por Automatizaciones y llega a la vez a Admin, Staff y Parent. CLIENT en Schedule, Overview y Places. Today, Today card, Bookings e Invoices." }
      ]
    },
    {
      id: "hold",
      label: "Soft hold",
      actor: "A la vez",
      steps: [
        { islands: ["booking"], links: [], text: "Trial pagado. El soft hold reserva la plaza del termino. Booking la pinta ocupada. Otra familia no la puede coger." },
        { islands: ["booking", "admin", "parent"], links: ["b-a", "b-p", "a-p"], text: "A la vez: Admin ve el hold, Parent tiene el enlace del termino, y Booking sigue bloqueando esa plaza." },
        { islands: ["booking", "admin"], links: ["b-a"], text: "Si el dia acaba y no cierran el termino, el soft hold se suelta. La plaza vuelve al offer y Admin recibe el aviso." },
        { islands: ["admin"], links: [], text: "Otro soft hold, el de pago: buffer bajo o cobro fallido. El cron de la manana lo pone o lo quita. La plaza sigue siendo de esa familia. Admin puede recordar, retener una sesion, soltar o cortar." }
      ]
    },
    {
      id: "feedback",
      label: "Sesion del dia",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], cats: { staff: "Feedback" }, text: "Staff escribe el feedback. Relevant information se queda en Staff y no sale a la familia." },
        { islands: ["staff", "parent"], links: ["s-p"], cats: { staff: "Feedback", parent: "Session Feedback" }, edge: "Stats, directo", text: "Los stats (engagement, regulation, independence) van directos a Session Feedback del Parent. No pasan por Admin." },
        { islands: ["admin"], links: [], cats: { admin: "Filtro de notas" }, text: "El texto escrito se filtra dentro de Admin. Hasta que ese filtro no esta, la nota no sigue." },
        { islands: ["admin", "parent"], links: ["a-p"], cats: { admin: "Filtro de notas", parent: "Notas" }, edge: "Filtradas", text: "La nota filtrada llega a Notas del Parent. No sale en la tarjeta de hoy." },
        { islands: ["admin"], links: [], cats: { admin: "Overview" }, text: "Overview pasa a verde con el feedback escrito. Eso actualiza el tablero de Admin. No escribe la nota ni los stats." },
        { islands: ["admin", "staff"], links: ["a-s"], cats: { admin: "Campana", staff: "Halo" }, text: "Si falta, el aviso es otro efecto: halo en Staff y campana en Admin. No rellena la nota de la familia ni los stats." }
      ]
    },
    {
      id: "cover",
      label: "Un cover",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Schedule and Covers asigna el cover, o deja COVER NEEDED." },
        { islands: ["staff", "parent"], links: ["a-s", "a-p"], text: "A la vez: Staff Today cambia (halo y Quick menu). Parent solo ve el nombre en Team si el cover ya tiene persona. El day off no sale en Parent." }
      ]
    },
    {
      id: "absence",
      label: "Ausencia",
      actor: "A la vez",
      steps: [
        { islands: ["parent"], links: [], text: "La familia marca Absent en Parent. Es un dia, no el termino." },
        { islands: ["admin", "staff", "parent"], links: ["a-p", "a-s"], text: "A la vez: Admin (Overview y Absents), Staff Today, y la Today card. Bookings del termino siguen." }
      ]
    },
    {
      id: "invoice",
      label: "Factura",
      actor: "A la vez",
      steps: [
        { islands: ["parent", "admin"], links: ["a-p"], text: "A la vez: Invoices en Parent se marca si hay una sin pagar, y Finance en Admin lo ve." },
        { islands: ["admin", "booking"], links: ["b-a"], text: "Si el buffer de own arrangement baja del minimo, el cron pone soft hold. La plaza no sale al offer. Pagar lo quita." }
      ]
    },
    {
      id: "from-parent",
      label: "Desde Parent",
      actor: "A la vez",
      steps: [
        { islands: ["parent"], links: [], text: "La familia ya esta dentro del Parent. Abre Booking desde ahi para mirar otro servicio. No pide codigo." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "En Leads sale Parent portal, no Booking OTP. No hay formulario nuevo. El registro de antes sigue en el archivo." },
        { islands: ["booking", "admin"], links: ["b-a"], text: "Si la plaza esta libre, la pueden coger. Si esta llena, pasan a la lista de espera. Admin ve por que puerta entraron." }
      ]
    },
    {
      id: "waiting",
      label: "Lista de espera",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "admin"], links: ["b-a"], text: "El servicio esta lleno. Quien ya se registro y quiere esa plaza va a Waiting. No ocupa un asiento en Overview." },
        { islands: ["admin"], links: [], text: "Waiting list es la cola. No es CLIENT. No es LEAD: el LEAD pidio codigo y no termino el registro." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "Cuando se abre un hueco, la oficina ofrece la plaza. Hasta entonces Parent no ve esa sesion como reservada." }
      ]
    },
    {
      id: "dayoff",
      label: "Dia libre",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Validate day o HR Add day off escribe el dia libre. Si ese dia hay ninos reservados y nadie cubre, sale COVER NEEDED." },
        { islands: ["staff", "admin"], links: ["a-s"], text: "Staff Today muestra el dia libre y el cover. Halo y Quick menu. Parent no ve el dia libre ni COVER NEEDED." },
        { islands: ["parent"], links: ["a-p"], text: "Team solo cambia el nombre cuando el cover ya tiene una persona. Sin nombre, la familia sigue viendo a su instructor." }
      ]
    },
    {
      id: "cancel-service",
      label: "Cancelar servicio",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Cancelar el servicio quita la plaza el resto del termino. No es la ausencia de un solo dia." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "Finance, Cancelled services, lo guarda. En Parent, Bookings deja de mostrar ese servicio. Overview deja de pintar al nino desde esa fecha." },
        { islands: ["admin"], links: [], text: "La falta de un dia se queda en Absents, credits and refunds. El asiento del termino sigue." }
      ]
    },
    {
      id: "consent",
      label: "Consentimiento",
      actor: "A la vez",
      steps: [
        { islands: ["parent"], links: [], text: "En Consents la familia dice si se pueden usar fotos de logro." },
        { islands: ["admin"], links: ["a-p"], text: "Parent consents, en Admin, enseña lo que firmaron. Sin ese si, la foto no sale a la familia." },
        { islands: ["staff", "parent", "admin"], links: ["s-p", "a-p"], text: "Despues del feedback se puede subir la foto de logro. Parent la ve si el consentimiento lo permite. Si no, se queda en la oficina." }
      ]
    },
    {
      id: "credit",
      label: "Credito",
      actor: "A la vez",
      steps: [
        { islands: ["parent", "admin"], links: ["a-p"], text: "Una sesion que no se hizo puede dejar credito o un makeup. La pantalla de oficina es Absents, credits and refunds." },
        { islands: ["admin", "booking"], links: ["b-a"], text: "El makeup es otra sesion, no un registro nuevo. La plaza del termino sigue, salvo que el servicio se haya cancelado." },
        { islands: ["staff", "admin"], links: ["a-s"], text: "El dia del makeup entra en Schedule y en Staff Today como cualquier sesion. El feedback de ese dia cuenta aparte." }
      ]
    },
    {
      id: "onboarding",
      label: "Onboarding",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "La entrevista vive en Potential workers, en Admin. Desde ahi empieza el alta." },
        { islands: ["onb"], links: ["a-o"], text: "Onboarding pide Job, Health, Starter checklist y Documents (foto, pasaporte, right to work)." },
        { islands: ["onb", "admin"], links: ["a-o"], text: "A la vez: Admin Workers ve el job y el health ya rellenos, y Documents guarda los archivos." },
        { islands: ["onb", "staff"], links: ["o-s"], text: "Misma cuenta y mismo host. En Staff ya estan Today, feedback, timesheet y expenses. Si el alta no esta cerrada, Onboarding sigue en el menu." }
      ]
    },
    {
      id: "timesheet",
      label: "Timesheet",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], text: "El trabajador abre Timesheet. Las horas no se escriben a mano." },
        { islands: ["admin", "staff"], links: ["a-s"], text: "A la vez: el turno sale del timetable y de Schedule en Admin, y cuenta el feedback de Staff. Sin feedback, el dia sigue pendiente." },
        { islands: ["admin", "staff"], links: ["a-s"], text: "Admin lo descarga para payroll. Si lo envia otra vez, el nuevo sustituye al anterior. El dia 24 a las 23:00 WhatsApp avisa a quien no lo ha mandado." }
      ]
    },
    {
      id: "expense",
      label: "Expense",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], text: "El trabajador manda el gasto desde Expenses." },
        { islands: ["staff", "admin"], links: ["a-s"], cats: { admin: "H&R / Documents" }, text: "A la vez: H&R / Documents en Admin lo guarda con su nombre y el mes. Queda Pending, y la campana puede mostrar el gasto." },
        { islands: ["admin"], links: [], text: "Mark paid cuando ya esta pagado. La fecha es el dia en que se pulsa, no el mes del gasto." }
      ]
    },
    {
      id: "otp-mail",
      label: "OTP email",
      actor: "A la vez",
      steps: [
        { islands: ["booking"], links: [], text: "La familia pide el codigo en Booking. Todavia no hay plaza." },
        { islands: ["booking", "auto"], links: ["b-auto"], text: "Automatizaciones manda solo el email con el codigo. Dura unos 10 minutos." },
        { islands: ["auto", "admin"], links: ["auto-a"], text: "Si ese lead no existia, el aviso llega a Admin. Un codigo repetido no vuelve a avisar. Staff y Parent no cambian." }
      ]
    },
    {
      id: "paid-sync",
      label: "Booking pagado",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "auto"], links: ["b-auto"], cats: { booking: "Pago", auto: "Sync" }, text: "El pago entra. Booking no escribe los portales a mano. Se lo pasa a Automatizaciones." },
        { islands: ["auto", "admin", "staff", "parent"], links: ["auto-a", "auto-s", "auto-p"], cats: { auto: "Sync", admin: ["Overview", "Schedule", "Places", "Finance"], staff: ["Today"], parent: ["Today card", "Bookings", "Invoices"] }, text: "A la vez el punto llega a Admin (Overview, Schedule, Places, Finance), a Staff Today y a Parent (Today card, Bookings, Invoices)." },
        { islands: ["auto", "booking"], links: ["auto-b"], cats: { auto: "Sync", booking: "Soft hold" }, edge: "Soft hold", text: "Si era un trial, Automatizaciones deja el soft hold en Booking hasta el final de ese dia." }
      ]
    },
    {
      id: "pay30",
      label: "Hold 30 min",
      actor: "A la vez",
      steps: [
        { islands: ["parent", "booking"], links: ["b-p"], text: "El enlace de finish-booking sin cobrar ocupa la plaza 30 minutos. No es el soft hold." },
        { islands: ["booking", "admin"], links: ["b-a"], text: "Admin ve la plaza en espera de pago. Si no cobran, la plaza vuelve. El reloj solo no la suelta si sigue en awaiting payment." }
      ]
    },
    {
      id: "trial-term",
      label: "Trial y termino",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "auto"], links: ["b-auto"], text: "El trial se paga. Automatizaciones crea la oferta del termino." },
        { islands: ["auto", "parent", "booking"], links: ["auto-p", "auto-b"], text: "El enlace de Parent queda en TERM. Booking pinta la plaza ocupada con soft hold hasta las 23:59 de Londres." },
        { islands: ["auto", "admin", "booking"], links: ["auto-a", "auto-b"], text: "Si el dia acaba y no cogen el termino, el hold se suelta y Admin recibe el aviso. La plaza vuelve al offer." }
      ]
    },
    {
      id: "fail-pay",
      label: "Cobro fallido",
      actor: "A la vez",
      steps: [
        { islands: ["auto"], links: [], text: "GoCardless falla. Hay un margen. Automatizaciones pone soft hold. La plaza sigue siendo de esa familia." },
        { islands: ["auto", "booking", "admin"], links: ["auto-b", "auto-a"], text: "Booking deja de ofrecerla. Admin puede recordar, retener una sesion, soltar o cortar." },
        { islands: ["auto", "booking"], links: ["auto-b"], text: "El trabajo de la manana solo pone o quita ese soft hold. No cancela la plaza solo." }
      ]
    },
    {
      id: "bank-paid",
      label: "Ya pague",
      actor: "A la vez",
      steps: [
        { islands: ["parent"], links: [], text: "La familia marca que ya pago por banco." },
        { islands: ["parent", "auto", "admin"], links: ["a-p", "auto-a"], text: "Automatizaciones avisa a la oficina. La plaza sigue hasta que Admin confirma el pago." },
        { islands: ["auto", "admin", "parent"], links: ["auto-a", "auto-p"], text: "Cuando se confirma, Finance pasa a pagado y Parent deja de marcarlo como pendiente." }
      ]
    },
    {
      id: "reenrol",
      label: "Re-enrolment",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Empieza el termino nuevo. Finance, Re-enrolments, prepara el cobro." },
        { islands: ["admin", "auto", "parent"], links: ["auto-p", "a-p"], text: "Parent recibe la factura. Bookings sigue ensenando la plaza del termino." },
        { islands: ["auto", "admin", "booking"], links: ["auto-a", "auto-b"], text: "Al cobrar, Places y Booking quedan al dia. Si no cobra y el buffer baja, entra el soft hold." }
      ]
    },
    {
      id: "late-mark",
      label: "Tarde",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], text: "Staff marca que el nino llega tarde." },
        { islands: ["staff", "admin", "parent"], links: ["a-s", "s-p"], text: "A la vez: la campana de Admin, y la Today card de Parent. La plaza del termino no se borra." }
      ]
    },
    {
      id: "incident",
      label: "Incidente",
      actor: "A la vez",
      steps: [
        { islands: ["staff", "admin"], links: ["a-s"], text: "Un incidente o un wellbeing se escribe ese dia. La campana de Admin se enciende." },
        { islands: ["admin"], links: [], text: "Un incidente de una sesion ya pasada puede pedir aprobacion en Late feedback. El feedback normal no." },
        { islands: ["parent"], links: [], text: "Parent no cambia la reserva por esto. No es una ausencia ni un cover." }
      ]
    },
    {
      id: "disruption",
      label: "Disruption",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Session disruption es el parte de una sesion que se rompe. No es un cover." },
        { islands: ["admin", "staff"], links: ["a-s"], text: "Staff Today lo ve. La campana puede avisarlo. Parent no ve COVER NEEDED." }
      ]
    },
    {
      id: "chase",
      label: "Feedback 20:30",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], text: "Si el feedback del dia sigue abierto, a las 20:30 sale el WhatsApp." },
        { islands: ["staff", "admin"], links: ["a-s"], text: "El halo y Quick menu lo recuerdan en Staff. La campana lo ve Admin. No bloquea la app con un anuncio." }
      ]
    },
    {
      id: "bells",
      label: "Campana",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "La campana de Admin junta tarde, cancel, incidente, wellbeing y gastos." },
        { islands: ["staff"], links: ["a-s"], text: "Staff tiene halo y Quick menu para un cover y para el feedback que falta." },
        { islands: ["parent"], links: ["a-p"], text: "Parent tiene su propio aviso. No ve el dia libre del instructor ni COVER NEEDED." }
      ]
    },
    {
      id: "family-pin",
      label: "PIN familia",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Admin guarda el PIN de la familia." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "Con ese PIN, o con el codigo por email, Parent abre Connected as. No es el OTP de un lead nuevo." }
      ]
    },
    {
      id: "notes",
      label: "Notas",
      actor: "A la vez",
      steps: [
        { islands: ["parent"], links: [], text: "La familia escribe en una nota de Parent." },
        { islands: ["parent", "admin"], links: ["p-a"], cats: { admin: "Campana" }, text: "La campana de Admin recibe ese mensaje. Reply o Close. Staff no lo lee y no lo reescribe. No cambia la plaza ni el feedback." },
        { islands: ["parent", "admin"], links: ["p-a"], text: "Si descarga una foto, la campana de Admin es solo Close. No es el mensaje de la nota." }
      ]
    },
    {
      id: "broadcast",
      label: "Mensaje familias",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "Admin escribe un mensaje para varias familias." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "Llega a Parent. No es un cambio de horario y no abre la hoja de Sign and submit." }
      ]
    },
    {
      id: "seat-open",
      label: "Hueco libre",
      actor: "A la vez",
      steps: [
        { islands: ["admin", "booking"], links: ["b-a"], text: "Se libera una plaza. Places y Booking la ensenan libre." },
        { islands: ["admin", "parent"], links: ["a-p"], text: "La oficina se la ofrece a quien esta en Waiting. Hasta entonces Parent no la ve reservada." }
      ]
    },
    {
      id: "interview",
      label: "Entrevista",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], text: "La entrevista vive en Potential workers." },
        { islands: ["admin", "onb"], links: ["a-o"], text: "Si sigue, Admin abre Onboarding. Job, Health, Starter y Documents." },
        { islands: ["onb", "staff"], links: ["o-s"], text: "La misma cuenta entra en Staff. Si el alta no esta cerrada, Onboarding sigue en el menu." }
      ]
    },
    {
      id: "contract",
      label: "Contrato",
      actor: "A la vez",
      steps: [
        { islands: ["admin", "staff"], links: ["a-s"], cats: { admin: "H&R / Contracts" }, text: "El contrato y las policies salen de Admin, categoria H&R / Contracts, hacia Staff, Contrato." },
        { islands: ["staff", "admin"], links: ["a-s"], cats: { admin: "H&R / Documents" }, text: "Cuando firma, el archivo vuelve a Admin, categoria H&R / Documents. No es el formulario de Onboarding." }
      ]
    },
    {
      id: "staff-pin",
      label: "PIN staff",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], cats: { admin: "H&R / Documents" }, text: "Admin guarda el PIN del trabajador en H&R / Documents." },
        { islands: ["admin", "staff"], links: ["a-s"], cats: { admin: "H&R / Documents" }, text: "Con ese PIN entra en Staff. Es la misma cuenta que Onboarding." }
      ]
    },
    {
      id: "payslip",
      label: "Nomina",
      actor: "A la vez",
      steps: [
        { islands: ["admin"], links: [], cats: { admin: "H&R / Finance" }, text: "H&R / Finance deja el payslip." },
        { islands: ["admin", "staff"], links: ["a-s"], cats: { admin: "H&R / Finance" }, text: "El trabajador lo abre en Staff. El PDF no cambia el horario." }
      ]
    },
    {
      id: "annual",
      label: "Perfil anual",
      actor: "A la vez",
      steps: [
        { islands: ["staff"], links: [], text: "Una vez al ano el trabajador abre su perfil y confirma los datos." },
        { islands: ["staff", "admin"], links: ["a-s"], text: "Solo se guardan los cambios. Admin ve el registro. No es el alta de Onboarding." }
      ]
    },
    {
      id: "ceo-see",
      label: "Visitantes",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "ceo"], links: ["b-c"], text: "Quien entra en Booking queda como visitante. CEO lo lee. No opera el dia." },
        { islands: ["parent", "ceo"], links: ["p-c"], text: "Quien esta dentro de Parent tambien se ve en CEO. El look-here del dia sigue siendo Admin Overview." }
      ]
    },
    {
      id: "pay-card",
      label: "Stripe",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "stripe"], links: ["b-stripe"], text: "La familia paga con tarjeta en el enlace. Entra por Stripe, tambien Apple Pay." },
        { islands: ["stripe", "auto", "admin", "staff", "parent"], links: ["b-auto", "auto-a", "auto-s", "auto-p"], text: "Al cobrar, el punto pasa por Automatizaciones y llega a Admin, Staff y Parent. La mensualidad del termino no es esta caja." }
      ]
    },
    {
      id: "pay-gc",
      label: "GoCardless",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "gc"], links: ["b-gc"], text: "La cuota mensual del termino se cobra por GoCardless. No es la tarjeta." },
        { islands: ["gc", "auto", "booking", "admin"], links: ["auto-b", "auto-a"], text: "Si el cobro falla, Automatizaciones pone soft hold en Booking y avisa a Admin. La plaza sigue de esa familia." }
      ]
    },
    {
      id: "xero-draft",
      label: "Xero",
      actor: "A la vez",
      steps: [
        { islands: ["admin", "xero"], links: ["a-xero"], text: "Admin Finance deja el borrador de la factura en Xero. Tambien el re-enrolment." },
        { islands: ["xero", "admin"], links: ["a-xero"], text: "Xero guarda la factura. No mueve Overview ni la plaza del dia." }
      ]
    },
    {
      id: "mail-out",
      label: "Email",
      actor: "A la vez",
      steps: [
        { islands: ["booking", "auto", "email"], links: ["b-auto", "auto-email"], text: "La familia pide el codigo en Booking. Automatizaciones manda el OTP por email. Dura unos 10 minutos." },
        { islands: ["booking", "email", "auto", "admin"], links: ["b-auto", "auto-email", "auto-a"], text: "Si el lead es nuevo, el aviso de la oficina tambien es un email. No sale por WhatsApp. Un codigo repetido no vuelve a avisar." }
      ]
    },
    {
      id: "wa-lanes",
      label: "WhatsApp",
      actor: "A la vez",
      steps: [
        { islands: ["auto", "wa"], links: ["auto-wa"], text: "WhatsApp tiene tres carriles: Business (plantillas), Parents API y Staff API." },
        { islands: ["wa", "staff", "parent"], links: ["s-wa", "p-wa"], text: "El chase de las 20:30 es una plantilla. El hilo con la familia es Parents API. El hilo con el trabajador es Staff API." },
        { islands: ["comms"], links: [], text: "La llamada y el chat de dentro del portal son Comms. No pasan por WhatsApp." }
      ]
    },
    {
      id: "comms-call",
      label: "Llamadas",
      actor: "A la vez",
      steps: [
        { islands: ["admin", "comms", "staff"], links: ["a-comms", "s-comms"], text: "Comms es el portal de llamada, video y mensaje entre la oficina y el trabajador." },
        { islands: ["comms", "wa"], links: [], text: "No es el WhatsApp. No cambia la plaza ni el feedback." }
      ]
    }
  ];

  var WORLDS = [
    { id: "booking", label: "Booking" },
    { id: "auto", label: "Automatizaciones" },
    { id: "admin", label: "Admin" },
    { id: "staff", label: "Staff" },
    { id: "comms", label: "Comms" },
    { id: "parent", label: "Parent" },
    { id: "onb", label: "Onboarding" },
    { id: "ceo", label: "CEO" }
  ];
  var STORY_WORLD = {
    lead: "booking",
    hold: "booking",
    pay30: "booking",
    "trial-term": "booking",
    waiting: "booking",
    "otp-mail": "auto",
    "paid-sync": "auto",
    "fail-pay": "auto",
    feedback: "admin",
    cover: "admin",
    dayoff: "admin",
    "cancel-service": "admin",
    credit: "admin",
    "seat-open": "admin",
    reenrol: "admin",
    disruption: "admin",
    bells: "admin",
    broadcast: "admin",
    interview: "admin",
    "late-mark": "staff",
    incident: "staff",
    chase: "staff",
    timesheet: "staff",
    expense: "staff",
    contract: "staff",
    "staff-pin": "staff",
    payslip: "staff",
    annual: "staff",
    "pay-card": "booking",
    "pay-gc": "booking",
    "xero-draft": "admin",
    "mail-out": "auto",
    "wa-lanes": "auto",
    "comms-call": "comms",
    absence: "parent",
    invoice: "parent",
    "from-parent": "parent",
    "bank-paid": "parent",
    "family-pin": "parent",
    notes: "parent",
    consent: "parent",
    onboarding: "onb",
    "ceo-see": "ceo"
  };
  STORIES.forEach(function (story) { story.world = STORY_WORLD[story.id] || "admin"; });
  root.PortalWorldData = { ISLANDS: ISLANDS, LINKS: LINKS, STORIES: STORIES, WORLDS: WORLDS, STORY_WORLD: STORY_WORLD };
})(typeof window !== "undefined" ? window : globalThis);
