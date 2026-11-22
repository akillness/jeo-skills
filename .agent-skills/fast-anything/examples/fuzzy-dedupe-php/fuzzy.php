<?php
declare(strict_types=1);

// Fuzzy string matching helpers.
final class Fuzzy
{
    // Edit distance: how many inserts, deletes or substitutions turn a into b (by character).
    public static function levenshtein(string $a, string $b): int
    {
        $a = preg_split('//u', $a, -1, PREG_SPLIT_NO_EMPTY);
        $b = preg_split('//u', $b, -1, PREG_SPLIT_NO_EMPTY);
        if (count($a) < count($b)) {
            [$a, $b] = [$b, $a];
        }
        $previous = range(0, count($b));
        foreach ($a as $i => $ca) {
            $current = [$i + 1];
            foreach ($b as $j => $cb) {
                $current[] = min($previous[$j + 1] + 1, $current[$j] + 1, $previous[$j] + ($ca === $cb ? 0 : 1));
            }
            $previous = $current;
        }
        return $previous[count($b)];
    }

    public static function normalize(string $name): string
    {
        return implode(' ', preg_split('/\s+/', strtolower(trim($name)), -1, PREG_SPLIT_NO_EMPTY));
    }

    // Index pairs of names within $maxDistance edits of each other.
    public static function findDuplicates(array $names, int $maxDistance = 2): array
    {
        $clean = array_map([self::class, 'normalize'], $names);
        $pairs = [];
        $n = count($clean);
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                if (self::levenshtein($clean[$i], $clean[$j]) <= $maxDistance) {
                    $pairs[] = [$i, $j];
                }
            }
        }
        return $pairs;
    }
}
