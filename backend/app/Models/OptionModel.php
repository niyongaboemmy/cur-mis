<?php

declare(strict_types=1);

namespace App\Models;

class OptionModel extends BaseModel
{
    protected string $table = 'options';
    protected array $fillable = ['name', 'department_id', 'description', 'is_active'];

    /** @return int[] Campus IDs linked to this option/program. */
    public function getCampusIds(int $optionId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT campus_id FROM `option_campuses` WHERE option_id = ? ORDER BY campus_id ASC",
            [$optionId],
        );
        return array_map(static fn ($r) => (int)$r['campus_id'], $rows);
    }

    /**
     * Replace the set of campuses attached to a program.
     *
     * @param int[] $campusIds
     */
    public function setCampusIds(int $optionId, array $campusIds): void
    {
        $clean = array_values(array_unique(array_map('intval', $campusIds)));
        $this->db->beginTransaction();
        try {
            $this->db->execute("DELETE FROM `option_campuses` WHERE option_id = ?", [$optionId]);
            foreach ($clean as $campusId) {
                if ($campusId <= 0) continue;
                $this->db->execute(
                    "INSERT IGNORE INTO `option_campuses` (option_id, campus_id) VALUES (?, ?)",
                    [$optionId, $campusId],
                );
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Map of option_id → list of campus ids, for a list of option ids.
     * Used to enrich the index/list response without an N+1.
     *
     * @param int[] $optionIds
     * @return array<int, int[]>
     */
    public function campusIdsForOptions(array $optionIds): array
    {
        if (empty($optionIds)) return [];
        $ids = array_map('intval', $optionIds);
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        $rows = $this->db->fetchAll(
            "SELECT option_id, campus_id FROM `option_campuses` WHERE option_id IN ($ph)",
            $ids,
        );
        $out = [];
        foreach ($ids as $id) $out[$id] = [];
        foreach ($rows as $r) {
            $out[(int)$r['option_id']][] = (int)$r['campus_id'];
        }
        return $out;
    }
}
