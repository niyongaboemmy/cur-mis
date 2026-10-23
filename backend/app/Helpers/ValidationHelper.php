<?php

declare(strict_types=1);

namespace App\Helpers;

class ValidationHelper
{
    /**
     * Validate data against a rule set.
     *
     * Supported rules: required, email, min:n, max:n, numeric, string, boolean, in:a,b,c, regex:/pattern/, date, email_domain
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
                    'date'     => static::validateDate($value),
                    'email_domain' => static::validateEmailDomain($value),
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

    /**
     * A real calendar date in YYYY-MM-DD with a plausible year. A browser
     * date input lets the year run to six digits ("19876-01-01"), which
     * MySQL rejects with a 1292 error instead of a clean 422.
     */
    private static function validateDate(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        $str = (string)$value;
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $str, $m)
            || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])
            || (int)$m[1] < 1900
            || $str > date('Y-m-d')) {
            return 'The %s field must be a valid date (YYYY-MM-DD).';
        }
        return null;
    }

    /** Misspellings of the providers applicants actually use, seen bouncing in production. */
    private const EMAIL_DOMAIN_TYPOS = [
        'gmail.cm'   => 'gmail.com', 'gmail.co'   => 'gmail.com', 'gmail.om'   => 'gmail.com',
        'gmail.con'  => 'gmail.com', 'gmail.comm' => 'gmail.com', 'gmail.cpm'  => 'gmail.com',
        'gmail.vom'  => 'gmail.com', 'gmail.coom' => 'gmail.com', 'gmail.c'    => 'gmail.com',
        'gmaill.com' => 'gmail.com', 'gmaile.com' => 'gmail.com', 'gmai.com'   => 'gmail.com',
        'gamil.com'  => 'gmail.com', 'gmial.com'  => 'gmail.com', 'gnail.com'  => 'gmail.com',
        'gmal.com'   => 'gmail.com', 'gmil.com'   => 'gmail.com', 'gmail.cim'  => 'gmail.com',
        'yahoo.cm'   => 'yahoo.com', 'yahoo.co'   => 'yahoo.com', 'yahoo.con'  => 'yahoo.com',
        'yaho.com'   => 'yahoo.com', 'yahooo.com' => 'yahoo.com',
        'hotmail.cm' => 'hotmail.com', 'hotmail.con' => 'hotmail.com', 'hotmal.com' => 'hotmail.com',
        'outlook.cm' => 'outlook.com', 'outlook.con' => 'outlook.com',
    ];

    /**
     * Reject well-known misspellings of common mail domains. A typo here
     * means the applicant never receives their OTP or letters, and keeps
     * retrying against an address the mail server will always bounce.
     */
    private static function validateEmailDomain(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        $domain = strtolower(substr(strrchr((string)$value, '@') ?: '', 1));
        $fix = self::EMAIL_DOMAIN_TYPOS[$domain] ?? null;
        if ($fix !== null) {
            return "The %s address looks misspelled: did you mean @{$fix}?";
        }
        return null;
    }
}
