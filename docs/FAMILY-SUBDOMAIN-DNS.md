# family.clubsensational.org — DNS (Wix)

Dominio añadido en Vercel al proyecto **portalvic** (4 Jul 2026).

## Registro DNS (Wix)

En el panel DNS de **clubsensational.org** (Wix o donde gestiones el dominio):

| Tipo | Nombre / Host | Valor | TTL |
|------|---------------|-------|-----|
| **A** | `family` | `76.76.21.21` | 3600 (o automático) |

No hace falta cambiar nameservers (el sitio principal sigue en Wix/LiteSpeed).

## Comprobar

Tras propagar (5–30 min, a veces hasta 24 h):

```bash
curl -sI https://family.clubsensational.org/parent | head -5
# HTTP/2 200
```

```bash
npx vercel domains verify family.clubsensational.org
```

## WordPress plugin (v1.1.0+)

Actualiza el plugin en wp-admin (sube de nuevo el ZIP del repo).  
Redirige `/parent` → `https://family.clubsensational.org/parent` (sin `portalvic` en la barra).

## Vercel env (manual)

En **portalvic** y **clubsensational-staff** → Settings → Environment Variables:

```
PORTAL_FAMILY_ORIGIN=https://family.clubsensational.org
```

Redeploy ambos proyectos tras guardar.

## URLs para familias

| Uso | URL |
|-----|-----|
| Enlace corto (web principal) | https://www.clubsensational.org/parent |
| Host técnico (directo) | https://family.clubsensational.org/parent |
| Re-enrolment | …/parent/re-enrolment |
