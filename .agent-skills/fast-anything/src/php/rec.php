<?php
// fast-anything's PHP recorder, prepended with -d auto_prepend_file for one run.
final class FastAnythingRec
{
    public static bool $inside = false;
    private static array $kept = [];
    private static array $args = [];
    private static int $calls = 0;
    private static int $skipped = 0;
    private static int $nanos = 0;
    private static array $why = [];
    private static $fn = null;
    private static array $params = [];

    /** Missing optional arguments, filled in from the declaration like PHP does. */
    public static function full(string $name, array $args): array
    {
        $ps = self::$params[$name] ??= (str_contains($name, '::') ? new ReflectionMethod(...explode('::', $name, 2)) : new ReflectionFunction($name))->getParameters();
        for ($i = count($args); $i < count($ps); $i++) {
            if (!$ps[$i]->isDefaultValueAvailable()) break;
            $args[] = $ps[$i]->getDefaultValue();
        }
        return $args;
    }

    public static function enc($v): string
    {
        self::check($v);
        return json_encode($v, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private static function check($v): void
    {
        if (is_array($v)) { foreach ($v as $x) self::check($x); return; }
        if (is_float($v) && !is_finite($v)) throw new InvalidArgumentException('NaN or INF');
        if (is_string($v) && !preg_match('//u', $v)) throw new InvalidArgumentException('binary string');
        if (is_object($v)) throw new InvalidArgumentException(get_class($v) . ' object');
        if (is_resource($v)) throw new InvalidArgumentException('resource');
    }

    public static function record(string $name, array $args, callable $fn)
    {
        $args = self::full($name, $args);
        self::$fn = $fn;
        self::$inside = true;
        try {
            self::$calls++;
            $limit = (int) (getenv('FAST_ANYTHING_RECORD_LIMIT') ?: 500);
            $slot = count(self::$kept) < $limit ? count(self::$kept) : random_int(0, self::$calls - 1);
            $enc = null;
            if ($slot < $limit) {
                try { $enc = self::enc($args); } catch (Throwable $e) { self::$skipped++; self::$why[$e->getMessage()] = true; }
            }
            $t = hrtime(true);
            try {
                $r = $fn(...$args);
            } catch (Throwable $e) {
                self::$nanos += hrtime(true) - $t;
                if ($enc !== null) self::store($slot, '{"args":' . $enc . ',"raises":' . json_encode(get_class($e)) . '}', null);
                throw $e;
            }
            self::$nanos += hrtime(true) - $t;
            if ($enc !== null) {
                try { self::store($slot, '{"args":' . $enc . ',"result":' . self::enc($r) . '}', $args); }
                catch (Throwable $e) { self::$skipped++; self::$why[$e->getMessage()] = true; }
            }
            return $r;
        } finally {
            self::$inside = false;
        }
    }

    private static function store(int $slot, string $line, ?array $args): void
    {
        self::$kept[$slot] = $line;
        self::$args[$slot] = $args;
    }

    private static function variants($v): array
    {
        $out = [];
        if (is_string($v)) {
            $chars = preg_split('//u', $v, -1, PREG_SPLIT_NO_EMPTY);
            if ($chars === false) return [];
        } elseif (is_array($v) && array_is_list($v)) {
            $chars = $v;
        } else {
            return [];
        }
        $n = count($chars);
        if ($n < 2) return [];
        mt_srand(0xFA57);
        foreach ([0, 1, 2, 3, 5, 8, 13, 21, 34, 55] as $len) {
            if ($len >= $n) break;
            for ($rep = 0; $rep < ($len < 2 ? 1 : 3); $rep++) {
                $slice = array_slice($chars, mt_rand(0, $n - $len), $len);
                $out[] = is_string($v) ? implode('', $slice) : $slice;
            }
        }
        return $out;
    }

    public static function save(): void
    {
        self::$inside = true;
        $derived = [];
        $seen = [];
        $start = hrtime(true);
        if (self::$fn !== null) {
            foreach (self::$args as $args) {
                if ($args === null) continue;
                foreach ($args as $i => $arg) {
                    foreach (self::variants($arg) as $smaller) {
                        if (count($derived) >= 200 || hrtime(true) - $start > 3e9) break 3;
                        $next = $args;
                        $next[$i] = $smaller;
                        try {
                            $enc = self::enc($next);
                            if (isset($seen[$enc])) continue;
                            $seen[$enc] = true;
                            $r = (self::$fn)(...$next);
                            $derived[] = '{"args":' . $enc . ',"result":' . self::enc($r) . ',"derived":true}';
                        } catch (Throwable $e) {
                            // outside the function's domain: not a fair test
                        }
                    }
                }
            }
        }
        ksort(self::$kept);
        $lines = array_merge(array_values(self::$kept), $derived);
        file_put_contents(getenv('FAST_ANYTHING_RECORD_OUT'), $lines ? implode("\n", $lines) . "\n" : '');
        file_put_contents(getenv('FAST_ANYTHING_RECORD_META'), json_encode([
            'calls' => self::$calls, 'kept' => count(self::$kept), 'skipped' => self::$skipped,
            'unsupported' => array_keys(self::$why), 'original_ns' => self::$calls ? self::$nanos / self::$calls : 0,
        ]));
    }
}

register_shutdown_function([FastAnythingRec::class, 'save']);
