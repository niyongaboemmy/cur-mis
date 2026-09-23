<?php
define('BASE_PATH', dirname(__DIR__, 2));
require BASE_PATH . '/vendor/autoload.php';
(Dotenv\Dotenv::createImmutable(BASE_PATH))->load();
require __DIR__ . '/_zztest_sweep.php';
sweepZzTest(\Core\Database::getInstance());
echo "swept\n";
