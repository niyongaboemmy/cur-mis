<?php

declare(strict_types=1);

namespace App\Models;

class SchoolModel extends BaseModel
{
    protected string $table = 'schools';
    protected string $primaryKey = 'school_id';
    protected array $fillable = [
        'school_name', 'school_descript', 'school_logo', 'school_banner', 
        'school_address', 'school_phone', 'school_email', 'url'
    ];
}
