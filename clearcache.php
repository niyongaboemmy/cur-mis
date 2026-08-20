<?php
opcache_reset();
echo json_encode(['cleared' => true, 'time' => date('Y-m-d H:i:s')]);
