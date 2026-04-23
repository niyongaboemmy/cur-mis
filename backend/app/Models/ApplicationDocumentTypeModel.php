<?php

declare(strict_types=1);

namespace App\Models;

class ApplicationDocumentTypeModel extends BaseModel
{
    protected string $table    = 'document_types';
    protected array  $fillable = ['name', 'slug', 'description', 'allowed_extensions', 'sort_order', 'is_active'];
    protected array  $hidden   = [];

    public function getActive(): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `document_types` WHERE `is_active` = 1 ORDER BY `sort_order` ASC, `id` ASC"
        );
    }
}
