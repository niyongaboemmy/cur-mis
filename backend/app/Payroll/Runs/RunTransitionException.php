<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

use DomainException;

/** A rule about payroll runs was broken: a forbidden state move, a locked run, or a missing prerequisite. */
final class RunTransitionException extends DomainException
{
}
