<?php
/**
 * Plugin Name: clubSENsational Family Portal Proxy
 * Description: Serves /parent and /bookingportal on www.clubsensational.org via reverse proxy (URL stays on your domain).
 * Version: 1.3.3
 * Author: clubSENsational
 *
 * Proxies family portal pages and static assets from family.clubsensational.org (Vercel).
 */
if (!defined('ABSPATH')) {
    exit;
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

    return $path === '/' ? '/parent' : $path;
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
