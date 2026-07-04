# WordPress — activar family portal en clubsensational.org

## Qué hace

Redirige estas rutas de WordPress al portal Vercel:

- `/parent` → portal familiar
- `/parents` → `/parent` (misma app)
- `/parent/re-enrolment`, `/parent/registration`, etc.

## Instalación

1. Copia la carpeta `clubsensational-family-portal-redirect` a:
   ```
   wp-content/plugins/clubsensational-family-portal-redirect/
   ```
2. WordPress admin → **Plugins** → **Activate** “clubSENsational Family Portal Redirect”
3. Prueba en el navegador:
   - https://www.clubsensational.org/parent
   - https://www.clubsensational.org/parents

Deberías acabar en `portalvic.vercel.app/parent` (302) hasta que configures subdominio limpio.

## Cambiar destino (subdominio futuro)

En el tema hijo `functions.php`:

```php
add_filter('cs_family_portal_origin', function () {
    return 'https://family.clubsensational.org/parent';
});
```

## Sin plugin (LiteSpeed / Apache)

Añadir antes de las reglas de WordPress en `.htaccess`:

```apache
RewriteEngine On
RewriteRule ^parents/?$ https://portalvic.vercel.app/parent [R=302,L,QSA]
RewriteRule ^parents/(.+)$ https://portalvic.vercel.app/parent/$1 [R=302,L,QSA]
RewriteRule ^parent/?$ https://portalvic.vercel.app/parent [R=302,L,QSA]
RewriteRule ^parent/(.+)$ https://portalvic.vercel.app/parent/$1 [R=302,L,QSA]
```
