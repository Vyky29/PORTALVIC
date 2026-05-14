# Pre-live: RLS para `clients`, `sessions`, `announcements` (UNRESTRICTED)

**Objetivo antes de producción:** decidir si esas tablas siguen sin RLS por diseño o hay que alinearlas con el resto (`onboarding_candidates`, `venue_reviews`, etc.): `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + políticas + `GRANT` acordes.

**Por qué importa:** con RLS desactivado, quien tenga permiso SQL vía rol de API (a menudo `anon` + `authenticated` según `GRANT`) puede leer/escribir **todas** las filas si las políticas no limitan — depende de cómo estén los grants en tu proyecto.

---

## Lo que ya sabemos desde el repo PORTAL (búsqueda en código)

- En **`working_ui/`** no aparecen llamadas Supabase del estilo `.from("clients")`, `.from("sessions")` ni `.from("announcements")` en los HTML/JS actuales del portal que revisamos (sí hay uso explícito de otras tablas: `staff_profiles`, `session_feedback`, `staff_timesheets`, `expense_claims`, `onboarding_candidates`, etc.).
- Los dashboards cargan **roster / sesiones / clientes** vía **`StaffDashboardSpreadsheetAdapter`** y fuentes tipo hoja (`STAFF_DASHBOARD_SOURCE`), no necesariamente esas tablas de Postgres.
- **Announcements (legado):** existe un borrador de esquema en `portal_legacy/database/announcements_table.sql` (tablas `announcements` + `announcement_targets`, referencias a `roles`/`staff`). **Tu instancia actual en Supabase puede no coincidir** con ese legado; hay que inspeccionar el esquema real en el Table Editor.

**Conclusión:** no podemos afirmar solo desde este repo si `clients` / `sessions` / `announcements` las consume el navegador con **anon** o solo **authenticated**; hay que **medir en runtime** (pasos abajo) y entonces redactar la migración SQL.

---

## Checklist obligatoria antes de escribir la migración RLS

1. **Tráfico real (staging o prod con cuidado)**  
   Abre staff/lead dashboard con sesión iniciada → DevTools → **Network** → filtra `rest/v1/` o `supabase.co`. Anota cada petición que toque `clients`, `sessions` o `announcements` (método GET/PATCH/POST y rol si lo ves en el JWT).

2. **Grants en Supabase**  
   SQL o UI: qué tiene `GRANT` el rol **`anon`** y **`authenticated`** sobre esas tablas. Sin RLS, el grant es la barrera principal.

3. **Quién debe hacer qué (negocio)**  
   Por tabla, rellena:

   | Tabla | ¿Solo staff logueado? | ¿Anon? | SELECT | INSERT | UPDATE | DELETE |
   |-------|------------------------|--------|--------|--------|--------|--------|
   | clients | ? | ? | ? | ? | ? | ? |
   | sessions | ? | ? | ? | ? | ? | ? |
   | announcements | ? | ? | ? | ? | ? | ? |

4. **Políticas alineadas con `staff_profiles`**  
   Igual que en `database/migrations/20260424_onboarding_candidates.sql`: `exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.app_role in (...))` — ajustando roles y si hace falta **solo lectura** para parte del equipo.

5. **Probar después de migrar**  
   Login staff → flujos que antes tocaban esas tablas → sin errores 401/403 en PostgREST.

---

## Próximo entregable (cuando tengas la tabla del punto 3)

Pedir en el chat: *«políticas RLS para clients/sessions/announcements con esta tabla de uso»* y adjuntar el resultado del paso 1–3. Con eso se puede generar **`database/migrations/YYYYMMDD_rls_clients_sessions_announcements.sql`** sin romper el dashboard.

---

## Referencia interna (Cursor / humanos)

Este fichero existe para **no olvidar** el endurecimiento de las tres tablas **UNRESTRICTED** antes de declarar el portal *live*. Actualizar este `.md` cuando completéis la auditoría de red y grants.
