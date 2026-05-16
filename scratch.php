<?php
$env = parse_ini_file('/Applications/MAMP/htdocs/cur-mis/backend/.env');
var_dump($env['DB_HOST'], $env['DB_USERNAME'], $env['DB_PORT']);
