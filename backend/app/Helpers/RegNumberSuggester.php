<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;

/**
 * "Did you mean …?" for registration numbers typed on a marks sheet.
 *
 * Marks sheets are filled in by hand, and the misses seen on live are always
 * the same few kinds: the intake year wrong (1CUR25… for 1CUR26…), a letter O
 * typed for a zero, or a zero added or dropped. Each is one or two characters
 * away from the real number, so we look up the students whose number ends in
 * the same four digits and keep the ones within edit distance 2.
 *
 * This only ever SUGGESTS. Nothing is enrolled or re-keyed until a person picks
 * the suggestion: two students can sit one character apart, and silently
 * choosing one would put marks on the wrong record.
 */
final class RegNumberSuggester
{
    private const MAX_DISTANCE    = 2;
    private const MAX_SUGGESTIONS = 3;

    public function __construct(private Database $db) {}

    /**
     * @param  string[] $regnumbers  numbers that matched no student
     * @return array<string, list<array{regnumber:string, name:string}>>
     *         keyed by the number as given; numbers with no close match are left out
     */
    public function suggestMany(array $regnumbers): array
    {
        $out = [];
        foreach (array_unique($regnumbers) as $reg) {
            $reg = (string)$reg;
            $found = $this->suggest($reg);
            if ($found !== []) {
                $out[$reg] = $found;
            }
        }
        return $out;
    }

    /** @return list<array{regnumber:string, name:string}> closest first */
    public function suggest(string $typed): array
    {
        $norm = self::normalise($typed);
        if (!preg_match('/(\d{4})$/', $norm, $m)) {
            return [];
        }

        $rows = $this->db->fetchAll(
            "SELECT regnumber, TRIM(CONCAT(COALESCE(fname,''),' ',COALESCE(lname,''))) AS name
               FROM `student`
              WHERE regnumber LIKE ?
              LIMIT 300",
            ['%' . $m[1]]
        );

        $scored = [];
        foreach ($rows as $r) {
            $candidate = (string)$r['regnumber'];
            $distance  = levenshtein($norm, strtoupper($candidate));
            if ($distance === 0 && strcasecmp($candidate, trim($typed)) === 0) {
                continue; // the number itself — not a suggestion
            }
            if ($distance <= self::MAX_DISTANCE) {
                $scored[] = ['regnumber' => $candidate, 'name' => (string)$r['name'], 'd' => $distance];
            }
        }

        usort($scored, static fn ($a, $b) => [$a['d'], $a['regnumber']] <=> [$b['d'], $b['regnumber']]);

        return array_map(
            static fn ($s) => ['regnumber' => $s['regnumber'], 'name' => $s['name']],
            \array_slice($scored, 0, self::MAX_SUGGESTIONS)
        );
    }

    /**
     * Upper-case, drop spaces and a leading spreadsheet apostrophe, and read a
     * letter O next to a digit as a zero ("1CUR25AKO12269" → "1CUR25AK012269").
     */
    private static function normalise(string $s): string
    {
        $s = strtoupper(preg_replace('/\s+/', '', ltrim($s, "'’")) ?? '');
        return preg_replace('/(?<=\d)O|O(?=\d)/', '0', $s) ?? $s;
    }
}
