<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Sorts staff into Academic and Administrative using the CUR staff lists
 * (database/seeds/cur_staff_categories.json).
 *
 * Names are matched on their words, not their order, and ignore case, accents,
 * punctuation and titles (Dr, Sr). "Jean Marie Vianney NSENGIYUMVA" matches
 * "NSENGIYUMVA Jean marie Vianney". A list name that matches no employee, or
 * matches more than one, is reported and left alone. Nothing is guessed.
 */
final class StaffCategoryClassifier
{
    public const ACADEMIC       = 'Academic';
    public const ADMINISTRATIVE = 'Administrative';

    private const TITLES = ['dr', 'sr', 'prof', 'professor'];

    /** Accented letters mapped to plain ASCII before matching. */
    private const ACCENTS = [
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'ç' => 'c', 'ñ' => 'n', 'ÿ' => 'y',
    ];

    /**
     * Reads the bundled CUR lists.
     *
     * @return array{Academic: list<array{first_name: string, last_name: string}>, Administrative: list<array{first_name: string, last_name: string}>}
     */
    public static function curLists(): array
    {
        $path = dirname(__DIR__, 2) . '/database/seeds/cur_staff_categories.json';
        $data = json_decode((string) file_get_contents($path), true);
        return [
            self::ACADEMIC       => $data[self::ACADEMIC] ?? [],
            self::ADMINISTRATIVE => $data[self::ADMINISTRATIVE] ?? [],
        ];
    }

    /**
     * Works out which employee each list name belongs to, without saving anything.
     *
     * @return array{
     *   matched: list<array{employee_id: int, name: string, category: string}>,
     *   unmatched: list<array{name: string, category: string}>,
     *   ambiguous: list<array{name: string, category: string, employee_ids: list<int>}>,
     *   conflicts: list<array{name: string, employee_id: int}>,
     *   counts: array{Academic: int, Administrative: int, matched: int, unmatched: int, ambiguous: int, conflicts: int}
     * }
     */
    public static function plan(Database $db, array $lists): array
    {
        $index = self::employeeIndex($db);

        $claims = [];   // employee_id => list of categories claimed
        $names  = [];   // employee_id => display name, for conflicts
        $result = ['matched' => [], 'unmatched' => [], 'ambiguous' => [], 'conflicts' => []];

        foreach ([self::ACADEMIC, self::ADMINISTRATIVE] as $category) {
            foreach ($lists[$category] ?? [] as $person) {
                $name = trim($person['first_name'] . ' ' . $person['last_name']);
                $ids  = $index[self::key($name)] ?? [];

                if (count($ids) === 0) {
                    $result['unmatched'][] = ['name' => $name, 'category' => $category];
                    continue;
                }
                if (count($ids) > 1) {
                    $result['ambiguous'][] = ['name' => $name, 'category' => $category, 'employee_ids' => $ids];
                    continue;
                }

                $id = $ids[0];
                $claims[$id][] = $category;
                $names[$id]    = $name;
                $result['matched'][] = ['employee_id' => $id, 'name' => $name, 'category' => $category];
            }
        }

        // The same person on both lists cannot be classified either way.
        $conflicted = [];
        foreach ($claims as $id => $cats) {
            if (count(array_unique($cats)) > 1) {
                $conflicted[$id] = true;
                $result['conflicts'][] = ['name' => $names[$id], 'employee_id' => $id];
            }
        }
        $result['matched'] = array_values(array_filter(
            $result['matched'],
            static fn (array $m) => !isset($conflicted[$m['employee_id']])
        ));

        $result['counts'] = [
            self::ACADEMIC       => count(array_filter($result['matched'], static fn ($m) => $m['category'] === self::ACADEMIC)),
            self::ADMINISTRATIVE => count(array_filter($result['matched'], static fn ($m) => $m['category'] === self::ADMINISTRATIVE)),
            'matched'            => count($result['matched']),
            'unmatched'          => count($result['unmatched']),
            'ambiguous'          => count($result['ambiguous']),
            'conflicts'          => count($result['conflicts']),
        ];

        return $result;
    }

    /**
     * Saves the matched categories. Returns how many employees were updated.
     */
    public static function apply(Database $db, array $plan): int
    {
        foreach ($plan['matched'] as $m) {
            $db->execute(
                "UPDATE employees SET staff_category = ? WHERE id = ?",
                [$m['category'], $m['employee_id']]
            );
        }
        return count($plan['matched']);
    }

    /**
     * A name's matching key: lowercase, no accents, no punctuation or titles,
     * words sorted so the order does not matter.
     */
    public static function key(string $name): string
    {
        $name  = mb_strtolower($name, 'UTF-8');
        $name  = strtr($name, self::ACCENTS);
        $name  = preg_replace('/[^a-z\s]+/', ' ', $name) ?? '';
        $words = array_filter(explode(' ', $name), static fn (string $w) => $w !== '' && !in_array($w, self::TITLES, true));
        sort($words);
        return implode(' ', $words);
    }

    /**
     * Map of matching key => employee ids, built from every employee record.
     *
     * @return array<string, list<int>>
     */
    private static function employeeIndex(Database $db): array
    {
        $index = [];
        $rows = $db->fetchAll("SELECT id, employee_fname, employee_lname FROM employees") ?: [];
        foreach ($rows as $row) {
            $key = self::key(trim($row['employee_fname'] . ' ' . $row['employee_lname']));
            if ($key !== '') {
                $index[$key][] = (int) $row['id'];
            }
        }
        return $index;
    }
}
