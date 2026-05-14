/**
 * Un solo sitio para URL de Medios del admin + query ?v= (cache bust).
 * Cambia PORTAL_ADMIN_MEDIOS_V cuando resubas el paquete en working_ui/ELEMENTOR/MEDIOS/ a Medios.
 *
 * Crítico en producción: admin_dashboard.app_.js (referenciado en ELEMENTOR/MEDIOS/admin_embed.html).
 * Sin él en …/uploads/2026/05/ el admin queda vacío y la consola muestra 404.
 */
export const PORTAL_ADMIN_MEDIOS_BASE =
  "https://www.clubsensational.org/wp-content/uploads/2026/05";

export const PORTAL_ADMIN_MEDIOS_V = "20260507-portal-admin-colors";
