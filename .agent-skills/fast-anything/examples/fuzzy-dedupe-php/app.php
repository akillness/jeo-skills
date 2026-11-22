<?php
// Find near-duplicate customer names, the slow way.
//     php app.php
declare(strict_types=1);

require __DIR__ . '/fuzzy.php';

const FIRST = ['Maria', 'Giulia', 'Sofia', 'Luca', 'Marco', 'Matteo', 'José', 'Zoë', 'Łukasz', 'Aiko', 'Chen', 'Olga', 'Ahmed',
    'Fatima', 'Liam', 'Emma', 'Noah', 'Ava', 'Mateo', 'Ingrid'];
const LAST = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'García', 'Müller', 'Nowak', 'Tanaka', 'Wang', 'Ivanova',
    'Haddad', 'Smith', 'Johnson', 'Brown', 'Silva', 'Kowalski', 'Novák', 'Dubois', 'Larsen'];

function make_names(int $count, int $seed): array
{
    mt_srand($seed);
    $names = [];
    for ($k = 0; $k < $count; $k++) {
        $chars = preg_split('//u', FIRST[mt_rand(0, 19)] . ' ' . LAST[mt_rand(0, 19)], -1, PREG_SPLIT_NO_EMPTY);
        if (mt_rand() / mt_getrandmax() < 0.35) {
            $chars[mt_rand(0, count($chars) - 1)] = 'aeiourstln'[mt_rand(0, 9)];
        }
        $names[] = implode('', $chars);
    }
    return $names;
}

$names = make_names(600, 7);
$pairs = Fuzzy::findDuplicates($names);
echo count($names), ' names, ', count($pairs), " likely duplicate pairs\n";
$shown = 0;
foreach ($pairs as [$i, $j]) {
    if ($shown === 5) break;
    if ($names[$i] !== $names[$j]) {
        echo "  {$names[$i]} ~ {$names[$j]}\n";
        $shown++;
    }
}
