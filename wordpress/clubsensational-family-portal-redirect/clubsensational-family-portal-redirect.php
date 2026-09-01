<?php
/**
 * Plugin Name: clubSENsational Family Portal Proxy
 * Description: Serves /parent and /bookingportal on www.clubsensational.org via reverse proxy (URL stays on your domain).
 * Version: 1.7.0
 * Author: clubSENsational
 *
 * Proxies family portal pages and static assets from family.clubsensational.org (Vercel).
 */
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Public services aligned with booking portal + live offer (Aug 2026).
 * Replaces the SERVICES submenu children so outdated items (e.g. Active Play & Movement,
 * Emotional Support) do not appear when the header uses a WordPress menu.
 */
function cs_family_portal_services_catalog(): array
{
    return [
        ['label' => 'Timetable 2026/27', 'path' => '/timetable/'],
        ['label' => 'Aquatic Activity', 'path' => '/swimming/'],
        ['label' => 'Climbing Activity', 'path' => '/climbing/'],
        ['label' => 'Physical Activity', 'path' => '/fitness/'],
        ['label' => 'Multi-Activity', 'path' => '/splash/'],
        ['label' => 'Day Centre', 'path' => '/timetable#dc'],
        ['label' => 'Bespoke Programme', 'path' => '/be-spoke/'],
        ['label' => 'Counselling', 'path' => '/counselling/'],
        ['label' => 'Intensive Courses & Camps', 'path' => '/holidays/'],
    ];
}

add_filter('wp_get_nav_menu_items', 'cs_family_portal_sync_services_menu', 20, 3);

function cs_family_portal_sync_services_menu($items, $menu, $args)
{
    if (empty($items) || !is_array($items)) {
        return $items;
    }

    $services_parent_id = null;
    foreach ($items as $item) {
        $title = isset($item->title) ? trim((string) $item->title) : '';
        if ($title !== '' && strcasecmp($title, 'Services') === 0 && (int) $item->menu_item_parent === 0) {
            $services_parent_id = (int) $item->ID;
            break;
        }
    }

    if (!$services_parent_id) {
        return $items;
    }

    $filtered = [];
    $had_children = false;
    foreach ($items as $item) {
        if ((int) $item->menu_item_parent === $services_parent_id) {
            $had_children = true;
            continue;
        }
        $filtered[] = $item;
    }

    if (!$had_children) {
        return $items;
    }

    $order = 1;
    $fake_id = 900000;
    foreach (cs_family_portal_services_catalog() as $row) {
        $obj = new stdClass();
        $obj->ID = $fake_id++;
        $obj->db_id = $obj->ID;
        $obj->menu_item_parent = $services_parent_id;
        $obj->object_id = $obj->ID;
        $obj->post_parent = $services_parent_id;
        $obj->type = 'custom';
        $obj->object = 'custom';
        $obj->title = $row['label'];
        $obj->url = home_url($row['path']);
        $obj->target = '';
        $obj->attr_title = '';
        $obj->description = '';
        $obj->classes = ['menu-item', 'menu-item-type-custom', 'menu-item-object-custom'];
        $obj->xfn = '';
        $obj->status = 'publish';
        $obj->menu_order = $order++;
        $filtered[] = $obj;
    }

    return $filtered;
}

add_action('plugins_loaded', 'cs_family_portal_early_proxy', 1);

function cs_family_portal_upstream_origin(): string
{
    return rtrim((string) apply_filters('cs_family_portal_upstream', 'https://family.clubsensational.org'), '/');
}

function cs_family_portal_should_proxy(string $path): bool
{
    $path = '/' . trim($path, '/');
    if ($path === '/') {
        return false;
    }

    $patterns = [
        '#^/parent(?:/|$)#',
        '#^/parents(?:/|$)#',
        '#^/bookingportal(?:/|$)#',
        '#^/booking-portal(?:/|$)#',
        '#^/splash(?:/|$)#',
        '#^/timetable(?:/|$)#',
        '#^/bookingservice(?:/|$)#',
        '#^/booking-service(?:/|$)#',
        '#^/portal/#',
        '#^/portal-static-bootstrap\.js$#',
        '#^/clubsensational-family\.webmanifest$#',
        '#^/clubsensational-family-sw\.js$#',
        '#^/re-enrolment/?$#',
        '#^/climbing-registration/?$#',
        '#^/registration-form/?$#',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $path)) {
            return true;
        }
    }

    return false;
}

function cs_family_portal_map_path(string $path): string
{
    $path = '/' . trim($path, '/');

    if (preg_match('#^/parents(?:/(.*))?$#', $path, $m)) {
        $rest = isset($m[1]) ? trim((string) $m[1], '/') : '';
        if ($rest === '' || $rest === 're-enrolment-form' || $rest === 're-enrolment') {
            return $rest === '' ? '/parent' : '/parent/re-enrolment';
        }
        return '/parent/' . $rest;
    }

    if ($path === '/re-enrolment-form' || $path === '/parent/re-enrolment-form') {
        return '/parent/re-enrolment';
    }

    if (preg_match('#^/(?:booking-service|bookingservice|booking-portal)(?:/(.*))?$#', $path, $m)) {
        $rest = isset($m[1]) ? trim((string) $m[1], '/') : '';
        return $rest === '' ? '/bookingportal' : '/bookingportal/' . $rest;
    }

    if (preg_match('#^/timetable(?:/(.*))?$#', $path, $m)) {
        $rest = isset($m[1]) ? trim((string) $m[1], '/') : '';
        return $rest === '' ? '/timetable' : '/timetable/' . $rest;
    }

    return $path === '/' ? '/parent' : $path;
}

add_action('wp_footer', 'cs_family_portal_term_calendar_script', 99);

function cs_family_portal_term_calendar_script(): void
{
    if (is_admin()) {
        return;
    }
    $src = home_url('/portal/cs-wp-term-calendars.js?v=20260901-tt');
    echo '<script src="' . esc_url($src) . '" defer></script>' . "\n";
}

function cs_family_portal_early_proxy(): void
{
    if (is_admin() || wp_doing_ajax() || (defined('REST_REQUEST') && REST_REQUEST)) {
        return;
    }

    $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $path = (string) (parse_url($requestUri, PHP_URL_PATH) ?: '/');

    if (!cs_family_portal_should_proxy($path)) {
        return;
    }

    $query = (string) (parse_url($requestUri, PHP_URL_QUERY) ?: '');
    $mapped = cs_family_portal_map_path($path);
    $url = cs_family_portal_upstream_origin() . $mapped . ($query !== '' ? '?' . $query : '');

    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $headers = [
        'Accept' => (string) ($_SERVER['HTTP_ACCEPT'] ?? '*/*'),
        'Accept-Encoding' => 'identity',
    ];

    $args = [
        'method' => $method,
        'timeout' => 45,
        'redirection' => 0,
        'headers' => $headers,
    ];

    if ($method !== 'GET' && $method !== 'HEAD') {
        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $args['body'] = $raw;
        }
        if (!empty($_SERVER['CONTENT_TYPE'])) {
            $args['headers']['Content-Type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
    }

    $response = wp_remote_request($url, $args);

    if (is_wp_error($response)) {
        status_header(502);
        nocache_headers();
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Family portal temporarily unavailable. Please try again in a moment.';
        exit;
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    if ($code < 100) {
        $code = 502;
    }

    status_header($code);
    nocache_headers();

    $respHeaders = wp_remote_retrieve_headers($response);
    $forward = [
        'content-type',
        'content-length',
        'cache-control',
        'etag',
        'last-modified',
        'content-disposition',
        'service-worker-allowed',
    ];

    foreach ($forward as $name) {
        $val = null;
        if (is_array($respHeaders)) {
            $val = $respHeaders[$name] ?? null;
        } elseif (is_object($respHeaders) && isset($respHeaders[$name])) {
            $val = $respHeaders[$name];
        }
        if ($val !== null && $val !== '') {
            header($name . ': ' . $val);
        }
    }

    if ($method !== 'HEAD') {
        echo wp_remote_retrieve_body($response);
    }

    exit;
}
