<?php

declare(strict_types=1);

namespace App\Models;

class ModulePrerequisiteModel extends BaseModel
{
    protected string $table = 'module_prerequisites';
    protected array $fillable = ['module_id', 'prerequisite_module_id'];

    /**
     * Replace the entire prerequisite set for a module in a single transaction.
     * Self-references and duplicates in $prereqIds are silently dropped.
     */
    public function syncFor(int $moduleId, array $prereqIds): void
    {
        $this->db->transaction(function ($db) use ($moduleId, $prereqIds) {
            $db->execute('DELETE FROM `module_prerequisites` WHERE module_id = ?', [$moduleId]);

            $clean = array_values(array_unique(array_map('intval', $prereqIds)));
            foreach ($clean as $pid) {
                if ($pid === 0 || $pid === $moduleId) {
                    continue;
                }
                $db->execute(
                    'INSERT IGNORE INTO `module_prerequisites` (module_id, prerequisite_module_id) VALUES (?, ?)',
                    [$moduleId, $pid]
                );
            }
        });
    }
}
