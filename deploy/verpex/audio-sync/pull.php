<?php
// File: deploy/verpex/audio-sync/pull.php
// Description: EN-8 read-only Verpex audio reconciliation cron. Lists the PUBLIC Supabase
//   'tts-audio' buffer bucket (anon key — NO service key, NO secret Supabase creds), copies each
//   missing clip to REMOTE_PATH/audio/ via a public GET (verifying byte length), then POSTs the
//   CONFIRMED object names to the edge `audio-sync-confirm` action (authed by the rotatable shared
//   AUDIO_SYNC_TOKEN) so Supabase deletes ONLY clips confirmed present on Verpex. Verpex is the
//   durable home; Supabase is a small hot buffer. The script is idempotent (already-present clips
//   are re-confirmed, never re-downloaded) and path-traversal-hardened (object names must match
//   ^[a-z0-9_]+\.pcm$ — the only shape keyToServerPath() emits). Every failure is surfaced: to the
//   confirm-run heartbeat summary, to a best-effort log-sink ERROR event (public.logs), to stderr,
//   and via a non-zero exit so cPanel cron mail flags it. All network calls carry practical
//   connect/read timeouts (non-blocking storage doctrine).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

declare(strict_types=1);

// ---------------------------------------------------------------------------------------------
// 0. Config resolution — getenv() first, then a sibling config.php (chmod 600, NEVER committed).
//    See config.example.php for the required keys.
// ---------------------------------------------------------------------------------------------
$CFG = [];
$cfgFile = __DIR__ . '/config.php';
if (is_file($cfgFile)) {
    /** @var array<string,string> $CFG */
    $CFG = require $cfgFile;
}
$cfg = function (string $key, ?string $default = null) use ($CFG): ?string {
    $env = getenv($key);
    if ($env !== false && $env !== '') return $env;
    if (isset($CFG[$key]) && $CFG[$key] !== '') return (string) $CFG[$key];
    return $default;
};

$SUPABASE_URL     = rtrim((string) $cfg('SUPABASE_URL', ''), '/');
$SUPABASE_ANON    = (string) $cfg('SUPABASE_ANON_KEY', '');
$AUDIO_SYNC_TOKEN = (string) $cfg('AUDIO_SYNC_TOKEN', '');
$AUDIO_DIR        = rtrim((string) $cfg('AUDIO_DIR', ''), '/');
$BUCKET           = (string) $cfg('AUDIO_BUCKET', 'tts-audio');
$LOG_SINK_URL     = (string) $cfg('LOG_SINK_URL', $SUPABASE_URL !== '' ? $SUPABASE_URL . '/functions/v1/log-sink' : '');

// Object-name allowlist — MUST match audioStore.ts OBJECT_RE and keyToServerPath() output.
const OBJECT_RE = '/^[a-z0-9_]+\.pcm$/i';

// Practical timeouts (seconds). Retrieval is bounded so a slow buffer never hangs the cron.
const CONNECT_TIMEOUT = 10;
const LIST_TIMEOUT    = 15;
const DOWNLOAD_TIMEOUT = 30;
const CONFIRM_TIMEOUT = 15;
const LIST_PAGE       = 100;   // Supabase storage list page size
const MAX_KEYS        = 500;   // matches log-sink MAX_SYNC_KEYS / audioStore MAX_DELETE_BATCH

$isCli = (PHP_SAPI === 'cli');

// A run-scoped correlation id (this script is its own origin — it may mint one).
$correlationId = 'verpex-pull-' . bin2hex(random_bytes(8));
$startedAt = microtime(true);

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Emit a structured line to stderr (captured by cron mail). */
function elog(string $level, string $event, array $ctx = []): void {
    fwrite(STDERR, json_encode(array_merge(['level' => $level, 'event' => $event], $ctx)) . "\n");
}

/**
 * Best-effort: persist an ERROR/WARN event to public.logs via the anonymous log-sink events path,
 * so a hard failure that never reaches the confirm heartbeat is still observable (no swallowed
 * errors — observability doctrine). Never throws.
 */
function logSinkEvent(string $url, string $anon, string $level, string $event, string $message, array $details, string $correlationId): void {
    if ($url === '') return;
    $body = json_encode(['events' => [[
        'level'          => $level,
        'category'       => 'DATA_PROCESSING',
        'event_type'     => $event,
        'message'        => $message,
        'details'        => $details,
        'correlation_id' => $correlationId,
        'request_id'     => $correlationId,
        'device_info'    => 'verpex-cron',
    ]]]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => array_filter([
            'Content-Type: application/json',
            $anon !== '' ? 'apikey: ' . $anon : null,
            $anon !== '' ? 'Authorization: Bearer ' . $anon : null,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => CONFIRM_TIMEOUT,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

/** Fail hard: log everywhere we can, then exit non-zero. */
function bail(int $code, string $event, string $message, array $details, array $sink): void {
    elog('ERROR', $event, array_merge(['message' => $message], $details));
    logSinkEvent($sink['url'], $sink['anon'], 'ERROR', $event, $message, $details, $sink['correlationId']);
    if (!$sink['isCli']) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => $event, 'message' => $message, 'correlationId' => $sink['correlationId']]);
    }
    exit($code);
}

// ---------------------------------------------------------------------------------------------
// 1. Web-invocation guard. cPanel cron runs this via CLI (`php pull.php`) — no token needed.
//    A web request must present the shared token (query ?token= or x-audio-sync-token header),
//    else 403 — the endpoint must never let an anonymous caller trigger a heavy reconciliation.
// ---------------------------------------------------------------------------------------------
if (!$isCli) {
    $presented = $_GET['token'] ?? ($_SERVER['HTTP_X_AUDIO_SYNC_TOKEN'] ?? '');
    if ($AUDIO_SYNC_TOKEN === '' || !hash_equals($AUDIO_SYNC_TOKEN, (string) $presented)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'FORBIDDEN', 'message' => 'This endpoint requires the audio-sync token.']);
        exit(3);
    }
}

$sink = ['url' => $LOG_SINK_URL, 'anon' => $SUPABASE_ANON, 'correlationId' => $correlationId, 'isCli' => $isCli];

// ---------------------------------------------------------------------------------------------
// 2. Validate config (fail LOUD — no hardcoded fallbacks that mask misconfiguration).
// ---------------------------------------------------------------------------------------------
$missing = [];
if ($SUPABASE_URL === '')     $missing[] = 'SUPABASE_URL';
if ($SUPABASE_ANON === '')    $missing[] = 'SUPABASE_ANON_KEY';
if ($AUDIO_SYNC_TOKEN === '') $missing[] = 'AUDIO_SYNC_TOKEN';
if ($AUDIO_DIR === '')        $missing[] = 'AUDIO_DIR';
if ($missing !== []) {
    bail(2, 'verpex_pull_unconfigured', 'Missing required config: ' . implode(', ', $missing), ['missing' => $missing], $sink);
}
if (!is_dir($AUDIO_DIR)) {
    if (!@mkdir($AUDIO_DIR, 0755, true) && !is_dir($AUDIO_DIR)) {
        bail(2, 'verpex_pull_audio_dir_unwritable', 'AUDIO_DIR does not exist and could not be created.', ['audioDir' => $AUDIO_DIR], $sink);
    }
}

// ---------------------------------------------------------------------------------------------
// 3. List the public buffer bucket (paginated). Anon key + Authorization satisfy the
//    tts_audio_public_read RLS SELECT policy (migration 00012). No service key.
// ---------------------------------------------------------------------------------------------
$objects = []; // name => size|null
$offset = 0;
$listUrl = $SUPABASE_URL . '/storage/v1/object/list/' . rawurlencode($BUCKET);
do {
    $ch = curl_init($listUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['prefix' => '', 'limit' => LIST_PAGE, 'offset' => $offset]),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'apikey: ' . $SUPABASE_ANON,
            'Authorization: Bearer ' . $SUPABASE_ANON,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => LIST_TIMEOUT,
    ]);
    $resp = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $status !== 200) {
        bail(1, 'verpex_pull_list_failed', 'Failed to list the tts-audio buffer.', [
            'status' => $status, 'curlError' => $curlErr, 'offset' => $offset,
        ], $sink);
    }
    $page = json_decode((string) $resp, true);
    if (!is_array($page)) {
        bail(1, 'verpex_pull_list_parse_failed', 'Storage list returned non-array JSON.', ['status' => $status], $sink);
    }
    foreach ($page as $item) {
        $name = is_array($item) ? ($item['name'] ?? null) : null;
        if (!is_string($name) || $name === '') continue;
        // Supabase list includes a synthetic ".emptyFolderPlaceholder"; skip anything not matching.
        if (!preg_match(OBJECT_RE, $name)) continue;
        $size = null;
        if (is_array($item) && isset($item['metadata']['size']) && is_numeric($item['metadata']['size'])) {
            $size = (int) $item['metadata']['size'];
        }
        $objects[$name] = $size;
    }
    $count = count($page);
    $offset += LIST_PAGE;
} while ($count === LIST_PAGE);

// ---------------------------------------------------------------------------------------------
// 4. Copy each missing clip; collect the CONFIRMED set (present + correct on Verpex).
// ---------------------------------------------------------------------------------------------
$confirmed = [];
$copiedThisRun = 0;
$alreadyPresent = 0;
$rejected = [];
$errors = [];

foreach ($objects as $name => $size) {
    // Defense-in-depth: never trust a name off the network even though we filtered on list.
    if (!preg_match(OBJECT_RE, $name)) { $rejected[] = $name; continue; }
    $target = $AUDIO_DIR . '/' . $name;

    // Idempotent: already present and the right size → confirm (so the buffer copy is reclaimed),
    // do not re-download.
    if (is_file($target) && ($size === null || filesize($target) === $size)) {
        $alreadyPresent++;
        $confirmed[] = $name;
        if (count($confirmed) >= MAX_KEYS) break;
        continue;
    }

    $publicUrl = $SUPABASE_URL . '/storage/v1/object/public/' . rawurlencode($BUCKET) . '/' . rawurlencode($name);
    $tmp = $target . '.part';
    $fh = @fopen($tmp, 'wb');
    if ($fh === false) { $errors[] = ['name' => $name, 'reason' => 'tmp_open_failed']; continue; }

    $ch = curl_init($publicUrl);
    curl_setopt_array($ch, [
        CURLOPT_FILE           => $fh,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => DOWNLOAD_TIMEOUT,
    ]);
    $ok = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $ctype = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    fclose($fh);

    if ($ok === false || $status !== 200) {
        @unlink($tmp);
        $errors[] = ['name' => $name, 'reason' => 'download_failed', 'status' => $status, 'curlError' => $curlErr];
        continue;
    }
    // Reject an HTML/error body served with 200 (belt: a public bucket should never do this, but a
    // proxy/edge could). PCM is application/octet-stream; anything text/* is a miss.
    if (stripos($ctype, 'text/') === 0) {
        @unlink($tmp);
        $errors[] = ['name' => $name, 'reason' => 'unexpected_content_type', 'contentType' => $ctype];
        continue;
    }
    $got = filesize($tmp);
    if ($size !== null && $got !== $size) {
        @unlink($tmp);
        $errors[] = ['name' => $name, 'reason' => 'size_mismatch', 'expected' => $size, 'got' => $got];
        continue;
    }
    if ($got === 0) {
        @unlink($tmp);
        $errors[] = ['name' => $name, 'reason' => 'empty_download'];
        continue;
    }
    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        $errors[] = ['name' => $name, 'reason' => 'rename_failed'];
        continue;
    }
    $copiedThisRun++;
    $confirmed[] = $name;
    if (count($confirmed) >= MAX_KEYS) break;
}

// ---------------------------------------------------------------------------------------------
// 5. Copy-confirm: POST the confirmed names to the edge audio-sync-confirm action so Supabase
//    deletes ONLY clips confirmed present on Verpex. Authed by the rotatable shared token.
// ---------------------------------------------------------------------------------------------
$durationMs = (int) round((microtime(true) - $startedAt) * 1000);
$summary = [
    'correlation_id' => $correlationId,
    'listed'         => count($objects),
    'copied'         => $copiedThisRun,
    'already_present' => $alreadyPresent,
    'confirmed'      => count($confirmed),
    'errors'         => count($errors),
    'rejected'       => count($rejected),
    'duration_ms'    => $durationMs,
    'host'           => gethostname() ?: 'unknown',
];

$confirmStatus = null;
$confirmBody = null;
if ($confirmed !== []) {
    $payload = json_encode(['action' => 'audio-sync-confirm', 'keys' => array_values($confirmed), 'summary' => $summary]);
    $ch = curl_init($LOG_SINK_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => array_filter([
            'Content-Type: application/json',
            'x-audio-sync-token: ' . $AUDIO_SYNC_TOKEN,
            $SUPABASE_ANON !== '' ? 'apikey: ' . $SUPABASE_ANON : null,
            $SUPABASE_ANON !== '' ? 'Authorization: Bearer ' . $SUPABASE_ANON : null,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => CONFIRM_TIMEOUT,
    ]);
    $confirmBody = curl_exec($ch);
    $confirmStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($confirmBody === false || $confirmStatus !== 200) {
        // The copy succeeded but the buffer won't be reclaimed this run — the 7-day pg_cron backstop
        // and the next run's idempotent re-confirm both cover it. Surface loudly.
        $errors[] = ['reason' => 'confirm_failed', 'status' => $confirmStatus, 'curlError' => $curlErr];
        logSinkEvent($LOG_SINK_URL, $SUPABASE_ANON, 'ERROR', 'verpex_pull_confirm_failed',
            'Copy-confirm POST failed; buffer reclaim deferred to next run / backstop.',
            ['status' => $confirmStatus, 'curlError' => $curlErr, 'confirmed' => count($confirmed)], $correlationId);
    }
}

// ---------------------------------------------------------------------------------------------
// 6. Report. Non-zero exit on any error so cPanel cron mail flags the run.
// ---------------------------------------------------------------------------------------------
$result = array_merge($summary, [
    'confirm_status' => $confirmStatus,
    'error_detail'   => $errors,
    'rejected_names' => $rejected,
]);

if (!$isCli) {
    header('Content-Type: application/json');
}
echo json_encode($result, JSON_PRETTY_PRINT) . "\n";

exit($errors === [] ? 0 : 1);
