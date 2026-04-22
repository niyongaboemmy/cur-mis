<?php

$routesFiles = glob("routes/api/*.php");
$definedRoutes = [];

foreach ($routesFiles as $routeFile) {
    if (basename($routeFile) === "api.php") continue;
    $content = file_get_contents($routeFile);
    
    // Find all raw route declarations
    preg_match_all('/\$router->(get|post|put|patch|delete)\s*\(\s*\'([^\']+)\'/', $content, $matches);
    
    // Some routes use groups, let's attempt to infer the prefix.
    // For simplicity, we assume prefix roughly matches file name if no /api/ is in path.
    // Oh wait, in applicant.php: $router->group('/api/applicant', function ($router) { $router->get('/profile', ...); });
    // This script might fail on groups.
    // Let's just find them and print manually to verify.
    foreach ($matches[2] as $idx => $path) {
        $method = strtoupper($matches[1][$idx]);
        
        // Very basic mapping
        if (!str_starts_with($path, '/api/')) {
            $prefix = '/api/' . basename($routeFile, '.php');
            if ($path === '' || $path === '/') {
                $path = $prefix;
            } else {
                $path = $prefix . '/' . ltrim($path, '/');
            }
        }
        
        $path = '/' . ltrim(rtrim($path, '/'), '/');
        $definedRoutes["$method $path"] = true;
    }
}

$docs = file_get_contents("public/api-docs.php");
preg_match_all("/'method'\s*=>\s*'([^']+)',\s*'path'\s*=>\s*'([^']+)'/i", $docs, $docMatches);

$documentedRoutes = [];
foreach ($docMatches[1] as $idx => $method) {
    $path = '/' . ltrim(rtrim($docMatches[2][$idx], '/'), '/');
    $documentedRoutes[strtoupper($method) . " " . $path] = true;
}

$missing = [];
foreach (array_keys($definedRoutes) as $route) {
    if (!isset($documentedRoutes[$route])) {
        $missing[] = $route;
    }
}

echo "Total Defined: " . count($definedRoutes) . "\n";
echo "Total Documented: " . count($documentedRoutes) . "\n";
echo "Missing:\n";
foreach ($missing as $m) echo "- $m\n";
