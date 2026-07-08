<?php

declare(strict_types=1);

namespace App\Services;

use App\Seeders\PermissionsSeeder;
use App\Seeders\SeederInterface;

/**
 * Registry of named, on-demand data seeders.
 * Unlike migrations, seeders never run automatically and never run "all at once" —
 * the caller must name exactly which one to run.
 */
class SeederService
{
    private const REGISTRY = [
        'permissions' => PermissionsSeeder::class,
    ];

    /** Names of all registered seeders. */
    public function available(): array
    {
        return array_keys(self::REGISTRY);
    }

    public function has(string $name): bool
    {
        return isset(self::REGISTRY[$name]);
    }

    /** Runs exactly one named seeder and returns its summary log. */
    public function run(string $name): array
    {
        if (!$this->has($name)) {
            throw new \InvalidArgumentException("Unknown seeder: \"$name\".");
        }

        /** @var class-string<SeederInterface> $class */
        $class = self::REGISTRY[$name];

        return $class::run();
    }
}
