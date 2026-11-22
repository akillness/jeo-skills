<?php
// fast-anything's PHP profiler, prepended with -d auto_prepend_file for one run. Every function
// in the project got one line,  $__faP = new \FastAnythingProf(N);  timed until the function returns.
final class FastAnythingProf
{
    public static array $stats = [];
    public static array $stack = [];
    public static array $active = [];
    public static int $started = 0;
    private int $t;

    public function __construct(private int $id)
    {
        self::$active[$id] = (self::$active[$id] ?? 0) + 1;
        self::$stack[] = 0;
        $this->t = hrtime(true);
    }

    public function __destruct()
    {
        $took = hrtime(true) - $this->t;
        $children = array_pop(self::$stack) ?? 0;
        $s = self::$stats[$this->id] ?? [0, 0, 0];
        $s[0]++;
        $s[1] += $took - $children;
        if (--self::$active[$this->id] === 0) $s[2] += $took;
        self::$stats[$this->id] = $s;
        if (self::$stack) self::$stack[array_key_last(self::$stack)] += $took;
    }
}

FastAnythingProf::$started = hrtime(true);
register_shutdown_function(function () {
    $wall = (hrtime(true) - FastAnythingProf::$started) / 1e9;
    $stats = [];
    foreach (FastAnythingProf::$stats as $id => [$calls, $own, $cum]) $stats[(string) $id] = [$calls, $own / 1e9, $cum / 1e9];
    file_put_contents(getenv('FAST_ANYTHING_PROF_OUT'), json_encode(['wall' => $wall, 'stats' => (object) $stats]));
});
