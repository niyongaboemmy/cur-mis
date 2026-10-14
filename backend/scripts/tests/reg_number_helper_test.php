<?php

declare(strict_types=1);

// Run: php backend/scripts/tests/reg_number_helper_test.php

require_once __DIR__ . '/../../app/Helpers/RegNumberHelper.php';

use App\Helpers\RegNumberHelper;

$failures = 0;
$checks   = 0;

function check(string $label, bool $ok, int &$failures, int &$checks): void
{
    $checks++;
    if (!$ok) {
        $failures++;
        echo "FAIL: {$label}\n";
    }
}

// Spec examples
$r = RegNumberHelper::parse('1CUR20AK05905');
check('start year 2020', $r['startYear'] === 2020, $failures, $checks);
check('end year 2023 (non-health)', $r['endYear'] === 2023, $failures, $checks);
check('duration 3', $r['programDuration'] === 3, $failures, $checks);
check('level Undergraduate', $r['level'] === 'Undergraduate', $failures, $checks);
check('institution name', $r['institution'] === 'Catholic University of Rwanda', $failures, $checks);
check('initials AK', $r['initials'] === 'AK', $failures, $checks);
check('student number keeps leading zero', $r['studentNumber'] === '05905', $failures, $checks);

$h = RegNumberHelper::parse('1CUR20AK05905', true);
check('health end year 2024', $h['endYear'] === 2024, $failures, $checks);
check('health duration 4', $h['programDuration'] === 4, $failures, $checks);

// Bad input throws
$threw = false;
try {
    RegNumberHelper::parse('bad-id');
} catch (InvalidArgumentException) {
    $threw = true;
}
check('bad-id throws', $threw, $failures, $checks);
check('tryParse bad-id returns null', RegNumberHelper::tryParse('bad-id') === null, $failures, $checks);
check('tryParse empty returns null', RegNumberHelper::tryParse('') === null, $failures, $checks);

// Input is trimmed and case-insensitive
$lower = RegNumberHelper::parse('  1cur20ak05905 ');
check('trim + case-insensitive', $lower['regNumber'] === '1CUR20AK05905', $failures, $checks);

// Six-digit live numbers
$six = RegNumberHelper::parse('1CUR26AK013408');
check('six-digit number parses', $six['studentNumber'] === '013408', $failures, $checks);
check('six-digit start year 2026', $six['startYear'] === 2026, $failures, $checks);

// Unknown codes fall back to "Unknown" instead of crashing
$unk = RegNumberHelper::parse('9XYZ20AK05905');
check('unknown level', $unk['level'] === 'Unknown', $failures, $checks);
check('unknown institution', $unk['institution'] === 'Unknown', $failures, $checks);

echo $failures === 0
    ? "OK: {$checks} checks passed\n"
    : "{$failures} of {$checks} checks failed\n";
exit($failures === 0 ? 0 : 1);
