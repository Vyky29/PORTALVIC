# clubSENsational Family Portal — WordPress proxy

Sirve rutas del portal en **www.clubsensational.org** (la URL **no cambia** en el navegador).

Proxies desde `family.clubsensational.org` (Vercel):

- `/parent`, `/parents`, `/parent/*`
- `/bookingportal`, `/booking-portal` (oferta pública de clases; legacy `/bookingservice` still redirects)
- `/portal/*` (JS, CSS, imágenes)
- `/portal-static-bootstrap.js`, manifest PWA, service worker (`clubsensational-family-sw.js`), etc.

## Instalación / actualización

1. Sube la carpeta a `wp-content/plugins/clubsensational-family-portal-redirect/` (o ZIP → Plugins → Add New)
2. Activa / actualiza **clubSENsational Family Portal Proxy** (v1.5+)
3. Prueba:
   - https://www.clubsensational.org/parent
   - https://www.clubsensational.org/bookingportal
   - Menú **Services** (alineado con booking portal; sin Active Play & Movement ni Emotional Support)

## Menú Services (v1.4+)

Si el header usa un menú de WordPress (Appearance → Menus), el plugin **sustituye** los hijos de **Services** por:

| Servicio | Enlace |
|----------|--------|
| Aquatic Activity | `/swimming/` |
| Climbing Activity | `/climbing/` |
| Physical Activity | `/fitness/` |
| Multi-Activity | `/splash/` |
| Day Centre | `/bookingportal#timetable-day_centre` |
| Bespoke Programme | `/be-spoke/` |
| Counselling | `/counselling/` |
| Intensive Courses & Camps | `/holidays/` |

**Quitados:** Active Play & Movement, Emotional Support (sustituido por Counselling).

Si el menú está **solo** en Elementor (enlaces manuales, sin menú WP), edita el header en Elementor y copia la tabla de arriba.

## Splash & Connect /splash/ (v1.5+)

Ya no hay **Multi-Activity los miércoles en Acton**. El plugin oculta en `/splash/`:

- El bloque **Acton Centre / Wednesday** (sección Elementor `ffc7ab4`)
- La fila del mapa **Acton Centre (W3 6NE)** (`cb0281b`)
- Texto del pie: "Tuesday, Wednesday & Thursday Afternoon" y "W3 6NE" en Locations

Solo queda visible **SwimFarm / Sunday**. Para un arreglo permanente, edita la página en Elementor y borra esas secciones a mano.

## Requisitos

- Registro DNS **A** `family` → `76.76.21.21` (Vercel)
- Upstream vivos: `https://family.clubsensational.org/parent` y `/bookingportal`

## Mientras no actualices el plugin

Usa directo:

- https://family.clubsensational.org/bookingportal
- o https://portalvic.vercel.app/bookingportal

## Cambiar upstream

```php
add_filter('cs_family_portal_upstream', function () {
    return 'https://family.clubsensational.org';
});
```
