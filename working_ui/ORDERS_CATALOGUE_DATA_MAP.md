# Orders catalogue — mapa de datos

Documento vivo: resume **de dónde sale cada parte** de la vista **Orders** en `admin_dashboard.html` (tabla *Orders catalogue*). Actualízalo cuando cambien funciones o columnas.

## Fuentes globales (archivos / APIs)

| Fuente | Archivo típico | Variable JS | Export |
|--------|-----------------|-------------|--------|
| Participantes + padres / ventana de reservas | `Participants_Parents info (PORTAL).xlsx` | `window.PARTICIPANTS_PARENTS_PORTAL_SOURCE` | `participants_parents_portal_data.js` (carpeta `working_ui/`, opcionalmente tras CDN) |
| Pagos / servicios facturados | `Clients Payments (PORTAL).xlsx` | `window.CLIENTS_PAYMENTS_PORTAL_SOURCE` | `clients_payments_portal_data.js` |
| Roster del día (horarios, participante en slot) | Hoja / bundle staff dashboard | `slotsForSelectedDate(iso)` → sesiones mapeadas a slots | `StaffDashboardSpreadsheetAdapter` + `STAFF_DASHBOARD_SOURCE` |
| Meta operativa por slot (funding/source/EHCP “Private/Parent”) | `localStorage` por fecha | `bookingLoadMetaForDate(iso)` / `booking.metaById` | UI Service Booking / modales (no está en el xlsx de payments) |
| Supabase | — | `schedule_overrides` | Overrides del día; `findOverrideForSlot` |

## Filtros de la página (barra superior)

| Control | Variable | Efecto |
|---------|----------|--------|
| **Show orders** | `booking.ordersTimePreset` + `booking.selectedDate` | Define el rango de fechas (`ordersPortalRangeBounds`) para decidir qué filas de participantes entran por `firstBookingIso` / `lastBookingIso`. Al cambiar, se sincroniza la fecha de sesión con `bookingSyncDateInputFromOrdersPreset` y se refresca el módulo reservas. |
| **Client** | `booking.ordersClientFilter` | Tras el filtro de rango, solo se muestran filas cuyo **nombre del niño** (`adminParticipantsParentsChildDisplayName`) coincide exactamente (comparación *case-insensitive*) con el valor elegido. Vacío = todos. El desplegable se rellena con nombres únicos que ya caen en la ventana de fechas (`ordersPortalDistinctChildNamesInRange`). |
| **All / Outstanding** (chip de navegación) | `booking.ordersScope` | *Outstanding*: se excluyen familias cuya suma de pendiente en todas las filas de pagos emparejadas es ≤ 0,02. |

## Columnas de la tabla

### Date

- **Origen:** `lastIso` de la fila construida (último booking del participante en el export de padres: `lastBookingIso` o fallback `firstBookingIso` / `createdIso`).
- **Formato:** `ordersPortalFormatBookingWhen` (texto local en-GB + “12:00pm” fijo como ancla de día).
- **Waitlist:** badge si `pp.onWaitingList === true` en el export de participantes.

### Parent name

- **Origen:** `pp.parentDisplay` del export **Participants_Parents**.

### Order summary

- **Nombre del niño:** `adminParticipantsParentsChildDisplayName(pp)`.
- **Líneas de servicio:** todas las filas de **Clients Payments** que casan con niño + carer (`ordersPortalMatchedPayRows`). Para cada fila, el campo `service` se parte por separadores `·` o `•` (`ordersPortalServiceLinesFromPayRow`) para mostrar **una línea por actividad** cuando en el Excel van concatenadas.
- **Hora de roster:** si hay **exactamente una** línea de servicio y existe un slot de `slotsForSelectedDate` cuyo participante coincide con el niño, se añade `anchorTimeLabel` (o inicio) al final de esa línea.
- **Sin filas de pagos:** texto de respaldo con programa del slot + día largo del último booking.
- **Latest Booking:** fecha `lastIso` formateada `DD/MM/YYYY` (`bookingFormatDdMmYyyy`).

### Payment method

- **Origen:** cada fila de `ordersPortalMatchedPayRows(pp)`.
- **Contenido por bloque:** línea destacada `fund`, línea secundaria `payMethod` (columnas del export **Clients Payments**). Varios bloques si hay varias filas emparejadas.

### Funding / Source / EHCP

- **Origen:** **no** viene del xlsx de payments. Es el mismo criterio que la tabla “master” de reservas: `ordersPortalMetaForPp` → `bookingMetaForSlot` sobre el primer slot de roster que coincide con el niño (fecha último booking o `booking.selectedDate`).
- **Texto:** `bookingFundingLabel`, `bookingSourceLabel`, y `EHCP` / `No EHCP` según `hasEhcp`. Si no hay meta/slot, valores por defecto: Private, Parent, No EHCP.

### Cost

- **Origen:** agregación de **todas** las filas de pagos emparejadas (`ordersPortalMoneyBlockAggregate`).
- **Balance:** suma de `ordersPortalOutstandingAmount` por fila (columna `out` o `tot − paid`).
- **Total (all services):** suma de `tot` y de `paid` donde existan.
- **Register / term (mock):** si el niño resuelve a un `clientId` en datos admin (`ordersPortalRegisterTermTotal`).

### Actions

- **View Order:** `portalResolveClientIdFromSheetPax` + cajón de cliente.
- **Send Invoice:** demo / alerta.

## Orden y paginación

- Filas ordenadas por `lastIso` descendente, luego nombre del niño (`ordersPortalBuildFilteredRows`).
- Paginación: 12 filas por página, estado en `booking.portalOrdersPage`.

## Funciones clave (referencia rápida)

- `ordersPortalRangeBounds()` — ventana de fechas según preset.
- `ordersPortalMatchedPayRows(pp)` — cruce niño + padre con `CLIENTS_PAYMENTS_PORTAL_SOURCE.rows`.
- `ordersPortalFindRosterSlotForPp(pp, anchorIso)` — primer slot del día de semana de esa fecha que coincide con el participante.
- `ordersPortalMetaForPp(pp, lastIso)` — meta de booking para Funding/Source/EHCP.
- `ordersPortalRefreshTable()` — reconstruye filas, sincroniza el desplegable **Client** y repinta la página actual.

## Nota sobre “Service Booking Master” en pantalla

La tabla maestra por día (`#bookingMasterTable`) **ya no se muestra** en la vista Orders: la misma lógica de meta y roster sigue usándose **por detrás** para columnas del catálogo (p. ej. Funding/Source/EHCP y hora opcional). La rejilla por día sigue disponible en otras vistas que monten esa tabla, si existen.

---

*Última revisión alineada con `working_ui/admin_dashboard.html` (módulo Orders / `viewBookings`).*
