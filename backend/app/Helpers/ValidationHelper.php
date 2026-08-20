<?php

declare(strict_types=1);

namespace App\Helpers;

class ValidationHelper
{
    /**
     * Validate data against a rule set.
     *
     * Supported rules: required, email, min:n, max:n, numeric, string, boolean, in:a,b,c, regex:/pattern/
     *
     * @return array  Field-keyed error arrays. Empty = valid.
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $fieldRules) {
            $value = $data[$field] ?? null;

            // Accept both array-of-rules (['required','email']) and
            // pipe-separated string ('required|email') notations.
            if (is_string($fieldRules)) {
                $fieldRules = array_filter(
                    array_map('trim', explode('|', $fieldRules)),
                    fn ($r) => $r !== '',
                );
            }

            foreach ((array)$fieldRules as $rule) {
                [$ruleName, $param] = array_pad(explode(':', $rule, 2), 2, null);

                $error = match ($ruleName) {
                    'required' => static::validateRequired($value),
                    'email'    => static::validateEmail($value),
                    'min'      => static::validateMin($value, (int)$param),
                    'max'      => static::validateMax($value, (int)$param),
                    'numeric'  => static::validateNumeric($value),
                    'string'   => static::validateString($value),
                    'boolean'  => static::validateBoolean($value),
                    'in'       => static::validateIn($value, explode(',', $param ?? '')),
                    'regex'    => static::validateRegex($value, $param ?? ''),
                    default    => null,
                };

                if ($error !== null) {
                    $errors[$field][] = sprintf($error, $field, $param);
                    if ($ruleName === 'required') {
                        break;
                    }
                }
            }
        }

        return $errors;
    }

    private static function validateRequired(mixed $value): ?string
    {
        if ($value === null || $value === '' || $value === []) {
            return 'The %s field is required.';
        }
        return null;
    }

    private static function validateEmail(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return 'The %s field must be a valid email address.';
        }
        return null;
    }

    private static function validateMin(mixed $value, int $min): ?string
    {
        if ($value === null) return null;
        // Use numeric comparison only for PHP int/float (JSON numbers decoded by json_decode).
        // String values — including numeric strings like OTPs — use string-length check.
        if (is_int($value) || is_float($value)) {
            if ($value < $min) {
                return "The %s field must be at least {$min}.";
            }
        } else {
            if (mb_strlen((string)$value) < $min) {
                return "The %s field must be at least {$min} characters.";
            }
        }
        return null;
    }

    private static function validateMax(mixed $value, int $max): ?string
    {
        if ($value === null) return null;
        if (is_int($value) || is_float($value)) {
            if ($value > $max) {
                return "The %s field must not exceed {$max}.";
            }
        } else {
            if (mb_strlen((string)$value) > $max) {
                return "The %s field must not exceed {$max} characters.";
            }
        }
        return null;
    }

    private static function validateNumeric(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        if (!is_numeric($value)) {
            return 'The %s field must be numeric.';
        }
        return null;
    }

    private static function validateString(mixed $value): ?string
    {
        if ($value === null) return null;
        if (!is_string($value)) {
            return 'The %s field must be a string.';
        }
        return null;
    }

    private static function validateBoolean(mixed $value): ?string
    {
        if ($value === null) return null;
        if (!in_array($value, [true, false, 1, 0, '1', '0', 'true', 'false'], true)) {
            return 'The %s field must be a boolean.';
        }
        return null;
    }

    private static function validateIn(mixed $value, array $allowed): ?string
    {
        if ($value === null) return null;
        if (!in_array((string)$value, $allowed, true)) {
            return 'The %s field must be one of: ' . implode(', ', $allowed) . '.';
        }
        return null;
    }

    private static function validateRegex(mixed $value, string $pattern): ?string
    {
        if ($value === null || $value === '') return null;
        if (!preg_match($pattern, (string)$value)) {
            return 'The %s field format is invalid.';
        }
        return null;
    }
}
