<?php

declare(strict_types=1);

namespace App\Seeders;

/**
 * A named, on-demand data seeder. Registered in SeederService::REGISTRY and
 * run only when explicitly requested by name — never automatically, never all-at-once.
 */
interface SeederInterface
{
    /** Runs the seed and returns a short summary of what it did. */
    public static function run(): array;
}
