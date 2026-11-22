<?php
// PHP side of fast-anything's scan: reads the app's files with PHP's own tokenizer and describes
// every function and static method. The CLI runs it as  php describe.php <file list> <out.json>.
declare(strict_types=1);

const IO = ['printf', 'vprintf', 'print_r', 'var_dump', 'var_export', 'fopen', 'fwrite', 'fputs', 'fread', 'fgets', 'fgetcsv',
    'fputcsv', 'file_get_contents', 'file_put_contents', 'file', 'readline', 'fscanf', 'unlink', 'mkdir', 'rmdir', 'header',
    'setcookie', 'exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'popen', 'sleep', 'usleep', 'error_log', 'mail',
    'curl_exec', 'fsockopen', 'ob_start', 'flush', 'session_start', 'opendir', 'scandir', 'glob', 'touch', 'rename', 'copy',
    'tempnam', 'ini_set', 'set_time_limit', 'putenv', 'getenv', 'fclose', 'readfile', 'stream_get_contents', 'trigger_error'];
const NONDET = ['rand', 'mt_rand', 'random_int', 'random_bytes', 'uniqid', 'time', 'microtime', 'hrtime', 'date', 'gmdate',
    'mktime', 'strtotime', 'shuffle', 'str_shuffle', 'array_rand', 'lcg_value', 'mt_srand', 'srand', 'getmypid'];
const SCALARS = ['int', 'float', 'string', 'bool', 'array', 'mixed', 'null', '?int', '?float', '?string', '?bool', '?array',
    'int|float', 'float|int', 'iterable', 'false', 'true'];
const SKIP = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];

function text($t): string { return is_array($t) ? $t[1] : $t; }
function id($t): ?int { return is_array($t) ? $t[0] : null; }

function describe_file(string $path): array {
    $src = file_get_contents($path);
    $tokens = token_get_all($src);
    $n = count($tokens);
    $off = [];
    $pos = 0;
    foreach ($tokens as $i => $t) { $off[$i] = $pos; $pos += strlen(text($t)); }
    $line = fn(int $byte): int => substr_count($src, "\n", 0, $byte) + 1;
    $next = function (int $i) use ($tokens, $n): int { for ($i++; $i < $n && in_array(id($tokens[$i]), SKIP, true); $i++); return $i; };
    $prev = function (int $i) use ($tokens): int { for ($i--; $i >= 0 && in_array(id($tokens[$i]), SKIP, true); $i--); return $i; };
    $match = function (int $i, string $open, string $close) use ($tokens, $n): int {
        $depth = 0;
        for (; $i < $n; $i++) {
            $t = $tokens[$i];
            if ($t === $open || ($open === '{' && in_array(id($t), [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) $depth++;
            elseif ($t === $close && --$depth === 0) return $i;
        }
        return $n - 1;
    };

    // top-level function names and static methods per class, for helper detection
    $out = [];
    $classes = [];   // stack of [name, depth]
    $depth = 0;
    $funcs = [];
    $statics = [];
    $found = [];
    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];
        if ($t === '{' || in_array(id($t), [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true)) { $depth++; continue; }
        if ($t === '}') { $depth--; if ($classes && end($classes)[1] === $depth) array_pop($classes); continue; }
        $k = id($t);
        if (in_array($k, [T_CLASS, T_TRAIT, T_INTERFACE, T_ENUM], true)) {
            $p = $prev($i);
            if ($p >= 0 && (id($tokens[$p]) === T_DOUBLE_COLON || id($tokens[$p]) === T_NEW)) continue;
            $nameAt = $next($i);
            $classes[] = [text($tokens[$nameAt]), $depth];
            continue;
        }
        if ($k !== T_FUNCTION) continue;
        $j = $next($i);
        $byRef = false;
        if ($tokens[$j] === '&') { $byRef = true; $j = $next($j); }
        if (id($tokens[$j]) !== T_STRING) continue; // a closure
        $name = $tokens[$j][1];
        $class = null;
        if ($classes && $depth === end($classes)[1] + 1) $class = end($classes)[0];
        elseif ($depth !== 0) continue; // declared inside a function body
        // modifiers and the first token of the declaration
        $start = $i;
        $static = false;
        for ($p = $prev($i); $p >= 0 && in_array(id($tokens[$p]), [T_STATIC, T_PUBLIC, T_PRIVATE, T_PROTECTED, T_FINAL, T_ABSTRACT], true); $p = $prev($p)) {
            if (id($tokens[$p]) === T_STATIC) $static = true;
            $start = $p;
        }
        $open = $next($j);
        $close = $match($open, '(', ')');
        $k2 = $next($close);
        $returns = null;
        if ($tokens[$k2] === ':') {
            $r = '';
            for ($k2 = $next($k2); $k2 < $n && $tokens[$k2] !== '{' && $tokens[$k2] !== ';'; $k2++) $r .= text($tokens[$k2]);
            $returns = trim($r);
        }
        if ($tokens[$k2] !== '{') continue; // abstract or interface method
        $bodyEnd = $match($k2, '{', '}');
        $found[] = compact('name', 'class', 'static', 'byRef', 'start', 'open', 'close', 'returns', 'k2', 'bodyEnd');
        if ($class === null) $funcs[strtolower($name)] = true;
        elseif ($static) $statics[$class][strtolower($name)] = true;
    }

    foreach ($found as $f) {
        ['name' => $name, 'class' => $class, 'static' => $static, 'byRef' => $byRef, 'start' => $start, 'open' => $open,
            'close' => $close, 'returns' => $returns, 'k2' => $brace, 'bodyEnd' => $bodyEnd] = $f;
        $blockers = [];
        $warnings = [];
        if ($class !== null && !$static) $blockers[] = 'instance method (static methods and functions only for now)';
        if ($byRef) $blockers[] = 'returns by reference';
        // parameters
        $params = [];
        $cur = [];
        $depthP = 0;
        $flush = function () use (&$cur, &$params, &$blockers) {
            if (!$cur) return;
            $type = '';
            $var = null;
            $default = null;
            $afterEq = false;
            foreach ($cur as $t) {
                if (in_array(id($t), SKIP, true) && !$afterEq) continue;
                if ($afterEq) { $default .= text($t); continue; }
                if ($t === '=') { $afterEq = true; $default = ''; continue; }
                if ($t === '&') { $blockers[] = 'takes arguments by reference'; continue; }
                if (id($t) === T_ELLIPSIS) { $blockers[] = 'takes variadic arguments'; continue; }
                if (in_array(id($t), [T_PUBLIC, T_PRIVATE, T_PROTECTED, T_READONLY], true)) continue;
                if (id($t) === T_VARIABLE) { $var = substr($t[1], 1); continue; }
                $type .= text($t);
            }
            $type = trim($type);
            if ($type !== '' && !in_array(strtolower($type), SCALARS, true)) $blockers[] = "takes a $type";
            $params[] = ['name' => $var, 'annotation' => $type === '' ? null : $type, 'default' => $default === null ? null : trim($default)];
            $cur = [];
        };
        for ($k = $open + 1; $k < $close; $k++) {
            $t = $tokens[$k];
            if ($t === '(' || $t === '[') $depthP++;
            if ($t === ')' || $t === ']') $depthP--;
            if ($t === ',' && $depthP === 0) { $flush(); continue; }
            $cur[] = $t;
        }
        $flush();
        if ($returns !== null) {
            $rl = strtolower($returns);
            if ($rl === 'void' || $rl === 'never') $blockers[] = "returns nothing ($returns)";
            elseif (!in_array($rl, SCALARS, true)) $blockers[] = "returns a $returns";
        }
        if ($params && array_filter($params, fn($p) => $p['annotation'] === null)) $warnings[] = 'untyped parameters: types are inferred from recorded calls';
        // the body
        $io = [];
        $nondet = [];
        $helpers = [];
        for ($k = $brace + 1; $k < $bodyEnd; $k++) {
            $t = $tokens[$k];
            $tk = id($t);
            if (in_array($tk, [T_ECHO, T_PRINT, T_EXIT, T_INCLUDE, T_INCLUDE_ONCE, T_REQUIRE, T_REQUIRE_ONCE, T_EVAL, T_INLINE_HTML], true)) $io[] = strtolower(trim(text($t)));
            if ($tk === T_GLOBAL || ($tk === T_VARIABLE && $t[1] === '$GLOBALS')) $blockers[] = 'uses global variables';
            if ($tk === T_STATIC && id($tokens[$next($k)]) === T_VARIABLE) $blockers[] = 'keeps static variables';
            if ($tk === T_VARIABLE && $t[1] === '$this') $blockers[] = 'uses $this';
            if ($tk === T_YIELD || $tk === T_YIELD_FROM) $blockers[] = 'is a generator';
            if (($tk === T_STRING || $tk === T_NAME_FULLY_QUALIFIED) && $tokens[$next($k)] === '(') {
                $p = $tokens[$prev($k)];
                $called = strtolower(ltrim($t[1], '\\'));
                if (in_array(id($p), [T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR, T_FUNCTION, T_NEW], true)) continue;
                if (id($p) === T_DOUBLE_COLON) {
                    $owner = strtolower(text($tokens[$prev($prev($k))]));
                    if ($class !== null && in_array($owner, ['self', 'static', strtolower($class)], true) && isset($statics[$class][$called]) && $called !== strtolower($name)) $helpers[] = $t[1];
                    continue;
                }
                if (in_array($called, IO, true) || str_starts_with($called, 'curl_') || str_starts_with($called, 'mysqli_') || str_starts_with($called, 'pg_')) $io[] = $called;
                if (in_array($called, NONDET, true)) $nondet[] = $called;
                if ($class === null && isset($funcs[$called]) && $called !== strtolower($name)) $helpers[] = $t[1];
            }
        }
        if ($io) $blockers[] = 'does I/O: ' . implode(', ', array_slice(array_values(array_unique($io)), 0, 3));
        if ($nondet) $blockers[] = 'not deterministic: ' . implode(', ', array_slice(array_values(array_unique($nondet)), 0, 3));
        $helpers = array_values(array_unique($helpers));
        if ($helpers) $warnings[] = 'calls ' . implode(', ', array_slice($helpers, 0, 3)) . ', they get ported together with it';
        $braceByte = $off[$brace];
        $lineEnd = strpos($src, "\n", $braceByte);
        $rest = trim(substr($src, $braceByte + 1, ($lineEnd === false ? strlen($src) : $lineEnd) - $braceByte - 1));
        if ($rest !== '' && !str_starts_with($rest, '//') && !str_starts_with($rest, '#')) $blockers[] = "its { doesn't end a line";
        $startByte = $off[$start];
        $endByte = $off[$bodyEnd] + 1;
        $out[] = [
            'path' => $path, 'name' => $name, 'class' => $class, 'static' => $static,
            'qualname' => $class === null ? $name : "$class.$name",
            'line' => $line($startByte), 'end_line' => $line($endByte - 1), 'body_offset' => $braceByte + 1,
            'params' => $params, 'returns' => $returns, 'blockers' => array_values(array_unique($blockers)),
            'warnings' => $warnings, 'calls' => $helpers,
            'source' => str_replace("\r", '', substr($src, $startByte, $endByte - $startByte)),
        ];
    }
    return $out;
}

$all = [];
foreach (file($argv[1], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $path) {
    try { array_push($all, ...describe_file($path)); } catch (Throwable $e) { /* unparsable: skip */ }
}
file_put_contents($argv[2], json_encode($all, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
