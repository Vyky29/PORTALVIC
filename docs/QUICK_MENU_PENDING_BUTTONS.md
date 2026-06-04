# Quick menu — botones restaurados (WIP esta semana)

Los botones del menú rápido volvieron a **staff** y **lead** dashboards, conectados de nuevo (sin `disabled` ni `menu-btn--portal-pending`).

Última actualización: 2026-06-01

## Conexiones actuales

| ID | Destino |
|----|---------|
| `quickMenuStaffSessionPlan` | Sheet `#staffSessionPlanSheet` (`data-open`) |
| `quickMenuLeadSessionPlan` | Sheet `#leadSessionPlanSheet` (`data-open`) |
| `quickMenuLeadPerformanceReview` | `performance.html` (nueva pestaña + `portalReturn`) |
| `quickMenuRoleTraining` | `SWtraining_portal.html` — visible solo swimming instructors (`portal_swimming_instructor_menus.js`) |
| `quickMenuSafeguarding` | NSPCC My Learning (URL externa) |
| `quickMenuPolicies` | `policies_portal.html` (+ firmante vía `portalQuickMenuNavigate`) |
| `quickMenuRiskAssessments` | `risk_assessment.html` (read-only staff portal; PDF export in-page) |
| `quickMenuStaffWellbeingReview` | `staff_wellbeing_review.html` (stress RA form; draft save + summary PDF) |

## Chips del acordeón

Ver `working_ui/portal/portal_quick_menu_accordion.js` (Planning, Training, Compliance, Lead).

## Notas para terminar esta semana

- Session plan / session planner: sheets existen; completar contenido y flujo en las sheets.
- Performance, policies, risk, swimming programme: páginas en `working_ui/`; pulir UX y datos según necesidad del producto.
