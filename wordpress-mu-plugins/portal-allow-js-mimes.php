<?php
/**
 * Plugin Name: PORTAL — allow portal JS + webmanifest in Media Library
 * Description: Allows .js, .mjs, and .webmanifest uploads. Path: wp-content/mu-plugins/portal-allow-js-mimes.php (must-use). Multisite: also extends allowed upload filetypes.
 * Version: 1.2.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/** @return void */
function portal_allow_portal_mimes_register()
{
    // Late priority so security plugins do not strip these afterwards.
    add_filter(
        'upload_mimes',
        function ($mimes) {
            if (!is_array($mimes)) {
                $mimes = [];
            }
            $mimes['js'] = 'application/javascript';
            $mimes['mjs'] = 'application/javascript';
            $mimes['webmanifest'] = 'application/manifest+json';
            return $mimes;
        },
        99999
    );

    // Force extension/MIME when core or finfo leaves them empty (common for .webmanifest JSON).
    add_filter(
        'wp_check_filetype_and_ext',
        function ($data, $file, $filename, $mimes) {
            if (!is_array($data)) {
                $data = [];
            }
            $ext = strtolower(pathinfo((string) $filename, PATHINFO_EXTENSION));
            if ($ext === 'js' || $ext === 'mjs') {
                $data['ext'] = $ext;
                $data['type'] = 'application/javascript';
                return $data;
            }
            if ($ext === 'webmanifest') {
                $data['ext'] = 'webmanifest';
                $data['type'] = 'application/manifest+json';
                return $data;
            }
            return $data;
        },
        99999,
        4
    );

    // WordPress multisite: allowed upload extensions are a separate site option.
    if (is_multisite()) {
        add_filter(
            'site_option_upload_filetypes',
            function ($filetypes) {
                $types = array_filter(preg_split('/\s+/', (string) $filetypes, -1, PREG_SPLIT_NO_EMPTY));
                foreach (['js', 'mjs', 'webmanifest'] as $need) {
                    if (!in_array($need, $types, true)) {
                        $types[] = $need;
                    }
                }
                return implode(' ', $types);
            },
            99999
        );
    }
}

portal_allow_portal_mimes_register();
