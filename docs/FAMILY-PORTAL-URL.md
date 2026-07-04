# Family portal — URL canónica

## Dónde vive (producto)

| Audiencia | URL canónica | Host técnico |
|-----------|--------------|--------------|
| **Padres / familias** | **https://www.clubsensational.org/parent** | `portalvic` (Vercel) |
| **Instructores / leads** | https://clubsensational-staff.vercel.app | `clubsensational-staff` (Vercel) |
| **Admin / CEO** | https://portalvic.vercel.app | `portalvic` (Vercel) |

El family portal **no** debe usarse en el dominio staff.  
`clubsensational-staff.vercel.app/parent` redirige a `www.clubsensational.org/parent`.

## Rutas family (portalvic)

- `/parent` — login + portal
- `/parents` — redirige a `/parent` (typo plural)
- `/parent/re-enrolment` — re-enrolment 2026/27
- `/parent/registration` — registro general
- `/parent/climbing-registration` — escalada

Mientras `clubsensational.org/parent` no esté enlazado, todo funciona en:

**https://portalvic.vercel.app/parent**

## Conectar `clubsensational.org/parent`

WordPress ya usa `www.clubsensational.org`. Para que `/parent` y `/parents` abran el portal:

### Opción A — Plugin WordPress (recomendada, ~2 min)

En el repo: `wordpress/clubsensational-family-portal-redirect/`

1. Comprimir la carpeta en ZIP o subirla por FTP a `wp-content/plugins/`
2. WordPress → **Plugins** → activar **clubSENsational Family Portal Redirect**
3. Probar:
   - https://www.clubsensational.org/parent
   - https://www.clubsensational.org/parents → mismo destino
   - https://www.clubsensational.org/parent/re-enrolment

Por defecto redirige a `https://portalvic.vercel.app/parent`. Cuando exista subdominio limpio, añadir en `functions.php` del tema hijo:

```php
add_filter('cs_family_portal_origin', function () {
  return 'https://family.clubsensational.org/parent';
});
```

### Opción B — Redirección WordPress (plugin Redirection)

| Origen | Destino |
|--------|---------|
| `/parent` | `https://portalvic.vercel.app/parent` |
| `/parent/(.*)` | `https://portalvic.vercel.app/parent/$1` |
| `/parents` | `https://portalvic.vercel.app/parent` |
| `/parents/(.*)` | `https://portalvic.vercel.app/parent/$1` |

Los padres verán `portalvic.vercel.app` en la barra hasta usar subdominio o proxy.

### Opción C — Subdominio en Vercel (URL limpia, recomendada a medio plazo)

1. Vercel → proyecto **portalvic** → Domains → añadir `family.clubsensational.org`
2. DNS: CNAME `family` → `cname.vercel-dns.com`
3. Comunicar a familias: **https://family.clubsensational.org/parent**

Actualizar `PORTAL_FAMILY_ORIGIN` en Vercel (portalvic + clubsensational-staff):

```
PORTAL_FAMILY_ORIGIN=https://family.clubsensational.org
```

### Opción D — Mantener `/parent` en clubsensational.org (proxy)

Requiere Cloudflare Worker o proxy inverso que envíe `/parent/*` a `portalvic.vercel.app/parent/*` sin cambiar la URL visible. Configuración en Cloudflare/DNS, no en este repo.

## Variables Vercel

| Variable | Proyecto | Valor por defecto |
|----------|----------|-------------------|
| `PORTAL_FAMILY_ORIGIN` | portalvic, clubsensational-staff | `https://www.clubsensational.org` |
| `CLUBSENSATIONAL_FAMILY_ORIGIN` | (alias) | igual |

## Comprobar

```bash
curl -sI https://clubsensational-staff.vercel.app/parent | grep -i location
# → https://www.clubsensational.org/parent
```

Tras enlazar dominio o redirect WordPress, abrir **https://www.clubsensational.org/parent** y hacer sign-in de prueba.
