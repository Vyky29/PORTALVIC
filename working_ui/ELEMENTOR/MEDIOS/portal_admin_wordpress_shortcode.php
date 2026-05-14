<?php
/**
 * clubSENsational — admin embed sin pegar iframe/script en Elementor (evita 505/WAF en POST).
 *
 * --- OPCIÓN A (shortcode activo en WordPress) — checklist ---
 *
 * A1) Plugin «Code Snippets» instalado y activo (o pegar este bloque en functions.php del child theme).
 *
 * A2) Snippets → Add New:
 *     - Título: cs_portal_admin (o el que quieras).
 *     - Pega TODO este archivo desde la línea `defined('ABSPATH')` hasta el cierre del add_shortcode
 *       (incluye `<?php` solo si el editor lo exige; en Code Snippets a veces hay que QUITAR la primera
 *       línea `<?php` porque el plugin ya ejecuta PHP).
 *     - Scope: «Run snippet everywhere» (o al menos «Only front end»).
 *     - Guardar y activar (toggle verde). Si hay error de sintaxis, el shortcode nunca se registra.
 *
 * A3) Comprobar que WordPress conoce el shortcode (opcional): en cualquier página con editor clásico
 *     o bloque Shortcode de Gutenberg, poner [cs_portal_admin] y vista previa: debe verse el iframe,
 *     no el texto entre corchetes.
 *
 * A4) Página /operations-admin/ en Elementor:
 *     - Editar con Elementor.
 *     - ELIMINA el bloque donde aparece el texto literal [cs_portal_admin] (suele ser «HTML» o
 *       «Texto» / «Código»).
 *     - Arrastra el widget «Shortcode» (búscalo en el panel izquierdo; nombre exacto: Shortcode).
 *     - En el campo del widget escribe solo: [cs_portal_admin] (sin etiquetas HTML alrededor).
 *     - Actualizar / Publicar.
 *
 * A5) Caché: vaciar caché de WP (plugin de caché, LiteSpeed, etc.) y probar en ventana incógnita.
 *
 * A6) Medios / FTP: el iframe carga admin_embed.html, que pide entre otros
 *     admin_dashboard.app_.js (lógica del admin). WordPress Medios suele guardar ese nombre con «._» antes de .js.
 *     Origen en repo: working_ui/ELEMENTOR/MEDIOS/admin_dashboard.app_.js — súbelo a wp-content/uploads/2026/05/ con el mismo nombre.
 *
 * A7) Layout: el iframe va en position:fixed a viewport (sale del «boxed» de Elementor). Tras actualizar el snippet,
 *     sube también admin_embed.html (inyección CSS en la página padre). Si editas solo Medios sin el snippet,
 *     el padre puede seguir limitando el ancho hasta que pegues el PHP actualizado en Code Snippets.
 *
 * Si tras A2–A4 sigues viendo [cs_portal_admin] como texto: el snippet no está activo en este sitio,
 * hay otro snippet duplicado con error, o la plantilla de esa página no es la que editas en Elementor.
 *
 * Página canónica del admin: admin_dashboard.html
 * (PORTAL_ADMIN_DASHBOARD_URL en login.html / fallback en auth-handler.js).
 *
 * Al cambiar versión Medios, edita $v abajo (mismo valor que PORTAL_ADMIN_MEDIOS_V en
 * working_ui/scripts/portal_admin_medios.mjs).
 */
defined('ABSPATH') || die();

add_shortcode('cs_portal_admin', static function (): string {
    $v = '20260507-portal-admin-colors';
    /* Same WordPress site as this shortcode (no hardcoded www). For Vercel-only admin, point iframe elsewhere via filter. */
    $base = function_exists('content_url')
      ? content_url('uploads/2026/05/admin_embed.html')
      : 'ELEMENTOR/MEDIOS/admin_embed.html';
    $src = esc_url($base . '?v=' . rawurlencode($v));

    /* Iframe a pantalla completa: escapa del contenedor «boxed» de Elementor (evita márgenes blancos y doble scroll). */
    $iframeStyle = 'position:fixed;left:0;right:0;width:100vw;max-width:100vw;top:var(--wp-admin--admin-bar--height,0px);'
        . 'height:calc(100dvh - var(--wp-admin--admin-bar--height,0px));max-height:calc(100dvh - var(--wp-admin--admin-bar--height,0px));'
        . 'border:0;margin:0;padding:0;display:block;background:#0f172a;z-index:2147483000;box-sizing:border-box';

    return '<iframe src="' . $src . '" title="clubSENsational Admin" loading="lazy" style="' . esc_attr($iframeStyle) . '"></iframe>';
});
