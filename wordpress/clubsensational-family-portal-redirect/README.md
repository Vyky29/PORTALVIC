# clubSENsational Family Portal — WordPress proxy

Sirve **https://www.clubsensational.org/parent** en tu dominio (la URL **no cambia** en el navegador).

Proxies desde `family.clubsensational.org` (Vercel):

- `/parent`, `/parents`, `/parent/*`
- `/portal/*` (JS, CSS, imágenes)
- `/portal-static-bootstrap.js`, manifest PWA, etc.

## Instalación

1. Sube la carpeta a `wp-content/plugins/clubsensational-family-portal-redirect/`
2. Activa **clubSENsational Family Portal Proxy**
3. Prueba: https://www.clubsensational.org/parent — debe cargar el portal **sin** redirigir a portalvic ni family

## Requisitos

- Registro DNS **A** `family` → `76.76.21.21` (Vercel) — ya configurado
- `https://family.clubsensational.org/parent` debe responder 200 (upstream del proxy)

## Cambiar upstream

```php
add_filter('cs_family_portal_upstream', function () {
    return 'https://family.clubsensational.org';
});
```
