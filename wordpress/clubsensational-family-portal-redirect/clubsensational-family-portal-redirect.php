<?php
/**
 * Plugin Name: clubSENsational Family Portal Redirect
 * Description: Sends /parent and /parents (and subpaths) to the Vercel family portal.
 * Version: 1.1.0
 * Author: clubSENsational
 *
 * Upload this folder to wp-content/plugins/ and activate in WordPress admin.
 * Default target: family.clubsensational.org (Vercel portalvic).
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('template_redirect', 'cs_family_portal_redirect', 1);

function cs_family_portal_redirect(): void
{
    if (is_admin() || wp_doing_ajax() || (defined('REST_REQUEST') && REST_REQUEST)) {
        return;
    }

    $path = trim((string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
    if ($path === '') {
        return;
    }

    $base = rtrim(apply_filters('cs_family_portal_origin', 'https://family.clubsensational.org/parent'), '/');
    $query = !empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '';

    if ($path === 'parent' || $path === 'parents') {
        wp_redirect($base . $query, 302);
        exit;
    }

    if (preg_match('#^parents/(.+)$#', $path, $m)) {
        wp_redirect($base . '/' . $m[1] . $query, 302);
        exit;
    }

    if (preg_match('#^parent/(.+)$#', $path, $m)) {
        wp_redirect($base . '/' . $m[1] . $query, 302);
        exit;
    }
}
