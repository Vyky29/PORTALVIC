# clubSENsational Family Portal — WordPress proxy

Sirve rutas del portal en **www.clubsensational.org** (la URL **no cambia** en el navegador).

Proxies desde `family.clubsensational.org` (Vercel):

- `/parent`, `/parents`, `/parent/*`
- `/bookingportal`, `/booking-portal` (oferta pública de clases; legacy `/bookingservice` still redirects)
- `/timetable` (horario público 2026/27: weekly sessions, Day Centre, term dates)
- `/portal/*` (JS, CSS, imágenes)
- `/portal-static-bootstrap.js`, manifest PWA, service worker (`clubsensational-family-sw.js`), etc.

## Instalación / actualización

1. Sube la carpeta a `wp-content/plugins/clubsensational-family-portal-redirect/` (o ZIP → Plugins → Add New)
2. Activa / actualiza **clubSENsational Family Portal Proxy** (v1.7+)
3. Prueba:
   - https://www.clubsensational.org/parent
   - https://www.clubsensational.org/bookingportal
   - Menú **Services** (alineado con booking portal; sin Active Play & Movement ni Emotional Support)

## Menú Services (v1.4+)

Si el header usa un menú de WordPress (Appearance → Menus), el plugin **sustituye** los hijos de **Services** por:

| Servicio | Enlace |
|----------|--------|
| Timetable 2026/27 | `/timetable/` |
| Aquatic Activity | `/swimming/` |
| Climbing Activity | `/climbing/` |
| Physical Activity | `/fitness/` |
| Multi-Activity | `/splash/` |
| Day Centre | `/timetable#dc` |
| Bespoke Programme | `/be-spoke/` |
| Counselling | `/counselling/` |
| Intensive Courses & Camps | `/holidays/` |

**Quitados:** Active Play & Movement, Emotional Support (sustituido por Counselling).

Si el menú está **solo** en Elementor (enlaces manuales, sin menú WP), edita el header en Elementor y copia la tabla de arriba.

## Timetable 2026/27 /timetable/ (v1.7+)

Replaces the 2025/26 **Our Terms** calendars (HTML widget `.cs-calendar` on home, swimming, climbing, fitness, splash) and publishes weekly sessions + Day Centre.

- Page: `working_ui/timetable.html`
- Calendars: `working_ui/portal/public-term-calendars-2026-27.html` (`node scripts/build-public-term-calendars.mjs`)
- The plugin prints `/portal/cs-wp-term-calendars.js` in the WordPress footer so old calendars swap to 2026/27.

Without plugin v1.7:

- https://family.clubsensational.org/timetable

With plugin v1.7:

- https://www.clubsensational.org/timetable
- Homepage **Our Terms** shows 2026/27

## Splash & Connect /splash/ (v1.6+)

Ya no hay **Multi-Activity los miércoles en Acton**. La página vive en **Vercel** (`working_ui/splash.html`, generada sin bloque Acton/Wednesday). El plugin hace **proxy** de `/splash/` igual que `/bookingportal`.

Regenerar tras cambios en WordPress (opcional):

```bash
node scripts/build-splash-page.mjs
```

**Sin subir el plugin v1.6**, la copia corregida sigue en:

- https://family.clubsensational.org/splash/

**Con plugin v1.6** en WordPress, también en:

- https://www.clubsensational.org/splash/

## Requisitos

- Registro DNS **A** `family` → `76.76.21.21` (Vercel)
- Upstream vivos: `https://family.clubsensational.org/parent` y `/bookingportal`

## Mientras no actualices el plugin

Usa directo:

- https://family.clubsensational.org/bookingportal
- https://family.clubsensational.org/timetable
- o https://portalvic.vercel.app/bookingportal

## Cambiar upstream

```php
add_filter('cs_family_portal_upstream', function () {
    return 'https://family.clubsensational.org';
});
```
