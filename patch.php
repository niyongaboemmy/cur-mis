<?php
$file = 'temp.php';
$content = file_get_contents($file);

$useIntake = "use App\Models\IntakeModel;\nuse App\Models\FacultyModel;";
$content = str_replace("use App\Models\FacultyModel;", $useIntake, $content);

$initIntake = "\$this->offerModel       = new AdmissionOfferModel();\n        \$this->intakeModel      = new IntakeModel();";
$content = str_replace("\$this->offerModel       = new AdmissionOfferModel();", $initIntake, $content);

$getIntakesMethod = <<<PHP
    /**
     * GET /api/portal/intakes
     */
    public function getIntakes(Request \$request, Response \$response): never
    {
        \$intakes = \$this->intakeModel->getActive();
        \$this->success(\$response, \$intakes, 'Active intakes fetched successfully.');
    }

    /**
     * GET /api/portal/faculties
PHP;

$content = str_replace("    /**\n     * GET /api/portal/faculties", $getIntakesMethod, $content);

$propIntake = "private AdmissionOfferModel       \$offerModel;\n    private IntakeModel               \$intakeModel;";
$content = str_replace("private AdmissionOfferModel       \$offerModel;", $propIntake, $content);

file_put_contents($file, $content);
echo "Patched temp.php\n";
