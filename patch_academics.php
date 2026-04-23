<?php
$file = 'temp_academics.php';
$content = file_get_contents($file);

$useIntake = "use App\Models\SchoolModel;\nuse App\Models\IntakeModel;";
$content = str_replace("use App\Models\SchoolModel;", $useIntake, $content);

$initIntake = "'schools'     => new SchoolModel(),\n            'intakes'     => new IntakeModel(),";
$content = str_replace("'schools'     => new SchoolModel(),", $initIntake, $content);

$rulesIntake = <<<PHP
            'intakes' => [
                'name'       => ['required', 'min:3'],
                'start_date' => ['required'],
                'end_date'   => ['required'],
            ],
            default => [],
PHP;
$content = str_replace("default => [],", $rulesIntake, $content);

file_put_contents($file, $content);
echo "Patched temp_academics.php\n";
