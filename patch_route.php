<?php
$file = 'temp_route.php';
$content = file_get_contents($file);

$getIntakesRoute = "\$router->get('/api/portal/active-year', [ApplicationPortalController::class, 'getActiveYear']);\n\$router->get('/api/portal/intakes', [ApplicationPortalController::class, 'getIntakes']);";
$content = str_replace("\$router->get('/api/portal/active-year', [ApplicationPortalController::class, 'getActiveYear']);", $getIntakesRoute, $content);

file_put_contents($file, $content);
echo "Patched temp_route.php\n";
