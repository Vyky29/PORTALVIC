# clubSENsational Family Portal — WordPress proxy

Sirve rutas del portal en **www.clubsensational.org** (la URL **no cambia** en el navegador).

Proxies desde `family.clubsensational.org` (Vercel):

- `/parent`, `/parents`, `/parent/*`
- `/bookingportal`, `/booking-portal` (oferta pública de clases; legacy `/bookingservice` still redirects)
- `/portal/*` (JS, CSS, imágenes)
- `/portal-static-bootstrap.js`, manifest PWA, service worker (`clubsensational-family-sw.js`), etc.

## Instalación / actualización

1. Sube la carpeta a `wp-content/plugins/clubsensational-family-portal-redirect/` (o ZIP → Plugins → Add New)
2. Activa / actualiza **clubSENsational Family Portal Proxy** (v1.3+)
3. Prueba:
   - https://www.clubsensational.org/parent
   - https://www.clubsensational.org/bookingportal

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
