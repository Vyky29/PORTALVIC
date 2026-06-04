# Quick menu — botones ocultos (pendientes de activar)

Estos botones estaban en rojo (`menu-btn--portal-pending`, `disabled`) y se **quitaron del menú** hasta que el flujo esté listo. Para volver a mostrarlos, restaura el markup en `staff_dashboard.html` / `lead_dashboard.html` (busca el `id` en git history) y quita `disabled` + clase `menu-btn--portal-pending`.

Última actualización: 2026-06-15

---

## Staff dashboard (`staff_dashboard.html`)

| ID | Etiqueta | Categoría | Notas |
|----|----------|-----------|--------|
| `quickMenuStaffSessionPlan` | Session Plan | Planning | Abrir planificador de sesión |
| `quickMenuRoleTraining` | Swimming Programme | Training | Solo swimming instructors cuando esté listo (`portal_swimming_instructor_menus.js`) |
| `quickMenuSafeguarding` | Safeguarding | Training | NSPCC My Learning / enlace externo |
| `quickMenuPolicies` | Policies | Compliance | Políticas (p. ej. `policies_portal`) |
| `quickMenuRiskAssessments` | Risk Assessments | Compliance | Evaluaciones de riesgo (`risk_assessments_portal`) |

**Sigue activo en Planning:** `quickMenuStaffTermReview` (Swimming Term Review) — oculto por JS hasta rol swimming instructor.

---

## Lead dashboard (`lead_dashboard.html`)

| ID | Etiqueta | Categoría | Notas |
|----|----------|-----------|--------|
| `quickMenuLeadSessionPlan` | Session Planner | Lead | Planificar sesiones de lead |
| `quickMenuLeadPerformanceReview` | Performance Review (Workers) | Lead | Revisión de rendimiento del equipo |
| `quickMenuRoleTraining` | Swimming Programme | Training | Igual que staff — swimming instructors |
| `quickMenuSafeguarding` | Safeguarding | Training | Igual que staff |
| `quickMenuPolicies` | Policies | Compliance | Igual que staff |
| `quickMenuRiskAssessments` | Risk Assessments | Compliance | Igual que staff |

**Sigue activo en Lead:** `quickMenuLeadTermReview` → `termreview.html`

---

## Categorías que pueden quedar vacías

- **Staff → Compliance:** sin botones visibles hasta restaurar Policies / Risk.
- **Staff → Training:** solo Induction (Safeguarding y Swimming Programme ocultos).
- **Lead → Compliance:** vacía hasta restaurar Policies / Risk.
- **Lead → Training:** solo Induction.

Cuando reactives un botón, actualiza también los **chips** del acordeón en `portal/portal_quick_menu_accordion.js` si quieres que el hint del encabezado coincida (p. ej. `chips: ["Policies", "Risk"]` en Compliance).
