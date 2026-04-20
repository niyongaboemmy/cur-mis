<?php

declare(strict_types=1);

namespace FileServer;

class Router
{
    private array $routes = [];

    public function add(string $method, string $path, callable $handler): void
    {
        $this->routes[] = [
            'method' => strtoupper($method),
            'path'   => $path,
            'regex'  => $this->pathToRegex($path),
            'handler'=> $handler
        ];
    }

    public function resolve(Request $request, Response $response): void
    {
        $method = $request->method();
        $uri    = $request->uri();

        // Handle sub-directory logic if deployed under /cur-mis/file-server/public
        // This is a minimal router, so we assume relative to root or handled by .htaccess
        
        foreach ($this->routes as $route) {
            if ($route['method'] === $method && preg_match($route['regex'], $uri, $matches)) {
                array_shift($matches); // Remove full match
                call_user_func_array($route['handler'], [$request, $response, ...$matches]);
                return;
            }
        }

        $response->error('Route not found.', 404);
    }

    private function pathToRegex(string $path): string
    {
        $regex = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '([^/]+)', $path);
        return "#^" . $regex . "$#D";
    }
}
