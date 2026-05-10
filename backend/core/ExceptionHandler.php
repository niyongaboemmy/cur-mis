<?php

declare(strict_types=1);

namespace Core;

use App\Helpers\ResponseHelper;

/**
 * Global exception and error handler.
 *
 * Register this early in index.php so any uncaught exception or PHP error
 * returns a structured JSON response instead of an HTML error page.
 */
class ExceptionHandler
{
    public static function register(): void
    {
        // Write all error_log() output to the app's own log file instead of
        // the shared server log, so errors from this app are easy to isolate.
        if (\defined('BASE_PATH')) {
            $logDir = BASE_PATH . '/logs';
            if (!is_dir($logDir)) {
                mkdir($logDir, 0755, true);
            }
            ini_set('error_log', $logDir . '/app.log');
        }

        // Catch uncaught exceptions
        set_exception_handler([static::class, 'handleException']);

        // Convert PHP errors to ErrorException so they also hit handleException
        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            if (!(error_reporting() & $severity)) {
                return false; // Respect error_reporting() level
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });

        // Catch fatal errors that set_error_handler cannot (memory exhaustion, etc.)
        register_shutdown_function([static::class, 'handleShutdown']);
    }

    public static function handleException(\Throwable $e): void
    {
        $debug = ($_ENV['APP_DEBUG'] ?? 'false') === 'true';

        // Always write the full error to the server log (visible in cPanel Error Log)
        error_log(sprintf(
            '[%s] %s: %s in %s on line %d',
            date('Y-m-d H:i:s'),
            get_class($e),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine()
        ));

        $status = 500;
        $message = 'An internal server error occurred.';

        // Map known exception types to appropriate HTTP status codes
        $map = [
            \InvalidArgumentException::class => [400, $e->getMessage()],
            \RuntimeException::class => [500, $debug ? $e->getMessage() : 'Server error.'],
        ];

        foreach ($map as $class => [$code, $msg]) {
            if ($e instanceof $class) {
                $status = $code;
                $message = $msg;
                break;
            }
        }

        $payload = ['success' => false, 'message' => $message];

        if ($debug) {
            $payload['debug'] = [
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => array_slice(
                    explode("\n", $e->getTraceAsString()),
                    0,
                    10
                ),
            ];
        }

        ResponseHelper::json($payload, $status);
    }

    public static function handleShutdown(): void
    {
        $error = error_get_last();

        // Only handle fatal errors that were not already caught
        if ($error && in_array($error['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE], true)) {
            $debug = ($_ENV['APP_DEBUG'] ?? 'false') === 'true';

            error_log(sprintf(
                '[%s] Fatal PHP error (type %d): %s in %s on line %d',
                date('Y-m-d H:i:s'),
                $error['type'],
                $error['message'],
                $error['file'],
                $error['line']
            ));

            $payload = ['success' => false, 'message' => 'Fatal server error.'];

            if ($debug) {
                $payload['debug'] = [
                    'type' => $error['type'],
                    'message' => $error['message'],
                    'file' => $error['file'],
                    'line' => $error['line'],
                ];
            }

            ResponseHelper::json($payload, 500);
        }
    }
}
