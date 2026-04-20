<?php

declare(strict_types=1);

namespace Core;

use App\Helpers\ResponseHelper;

/**
 * Lightweight front-controller router.
 *
 * Supports GET, POST, PUT, PATCH, DELETE and route groups with shared middleware.
 * Route parameters use the :name syntax, e.g. /api/users/:id.
 *
 * Usage:
 *   $router->get('/api/users',      [UserController::class, 'index']);
 *   $router->get('/api/users/:id',  [UserController::class, 'show']);
 *   $router->post('/api/users',     [UserController::class, 'store'], [AuthMiddleware::class]);
 *
 *   $router->group('/api/admin', function (Router $r) {
 *       $r->get('/stats', [AdminController::class, 'stats']);
 *   }, [AuthMiddleware::class, AdminMiddleware::class]);
 */
class Router
{
    /** @var array<int, array{method: string, path: string, handler: array|callable, middleware: array, pattern: string}> */
    private array $routes = [];

    private string $currentPrefix = '';
    private array  $currentGroupMiddleware = [];

    public function get(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    public function patch(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('PATCH', $path, $handler, $middleware);
    }

    public function delete(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    /**
     * Register a group of routes sharing a prefix and/or middleware.
     * Groups can be nested.
     */
    public function group(string $prefix, callable $callback, array $middleware = []): void
    {
        $previousPrefix     = $this->currentPrefix;
        $previousMiddleware = $this->currentGroupMiddleware;

        $this->currentPrefix          = $previousPrefix . $prefix;
        $this->currentGroupMiddleware = array_merge($previousMiddleware, $middleware);

        $callback($this);

        $this->currentPrefix          = $previousPrefix;
        $this->currentGroupMiddleware = $previousMiddleware;
    }

    private function addRoute(string $method, string $path, array|callable $handler, array $middleware): void
    {
        $fullPath      = $this->currentPrefix . $path;
        $allMiddleware = array_merge($this->currentGroupMiddleware, $middleware);

        $this->routes[] = [
            'method'     => $method,
            'path'       => $fullPath,
            'handler'    => $handler,
            'middleware' => $allMiddleware,
            'pattern'    => $this->pathToPattern($fullPath),
        ];
    }

    /**
     * Convert a route path with :param tokens into a named-capture regex.
     * E.g. /api/users/:id  →  #^/api/users/(?P<id>[^/]+)$#
     */
    private function pathToPattern(string $path): string
    {
        $pattern = preg_replace('/\/:([a-zA-Z_][a-zA-Z0-9_]*)/', '/(?P<$1>[^/]+)', $path);
        return '#^' . $pattern . '$#';
    }

    /**
     * Match the current HTTP method + URI and dispatch to the handler.
     * Returns 404 if no route matches, 405 if method is wrong.
     */
    public function dispatch(Request $request, Response $response): void
    {
        $method = $request->method();
        $uri    = $request->uri();

        $allowedMethods = [];

        foreach ($this->routes as $route) {
            if (!preg_match($route['pattern'], $uri, $matches)) {
                continue;
            }

            // URI matched — track which methods are valid (for 405 response)
            $allowedMethods[] = $route['method'];

            if ($route['method'] !== $method) {
                continue;
            }

            // Extract named captures as route params (e.g. ['id' => '42'])
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            $request->setRouteParams($params);

            // Run each middleware in order; any can abort the request
            foreach ($route['middleware'] as $middlewareClass) {
                (new $middlewareClass())->handle($request, $response);
            }

            // Dispatch to controller method or closure
            try {
                if (is_callable($route['handler'])) {
                    call_user_func($route['handler'], $request, $response);
                    return;
                }

                [$controllerClass, $action] = $route['handler'];
                (new $controllerClass())->$action($request, $response);
            } catch (\Throwable $e) {
                // Let the global ExceptionHandler deal with it
                throw $e;
            }

            return;
        }

        if (!empty($allowedMethods)) {
            // URI matched but method did not
            header('Allow: ' . implode(', ', array_unique($allowedMethods)));
            ResponseHelper::json([
                'success' => false,
                'message' => "Method {$method} not allowed.",
            ], 405);
        }

        ResponseHelper::json(['success' => false, 'message' => 'Route not found.'], 404);
    }
}
