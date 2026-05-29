<?php
/**
 * CUR Payment API - Token Authentication Class
 */

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

class Rest
{
    private mysqli $db;

    public function __construct()
    {
        $conn = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
        if ($conn->connect_error) {
            http_response_code(500);
            echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed', 'status' => 500]);
            exit;
        }
        $conn->set_charset('utf8mb4');
        $this->db = $conn;
    }

    /**
     * Claim a bearer token.
     *
     * POST body: { "user_name": "bk_csgd", "password": "..." }
     *
     * Success: { timestamp, message, status:200, data:{ token } }
     * Failure: { timestamp, message, status:401 }
     */
    public function claimtoken(array $row): void
    {
        $date     = date('Y-m-d H:i:s');
        $username = trim($row['user_name'] ?? '');
        $password = trim($row['password']  ?? '');

        if ($username === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'user_name and password are required', 'status' => 400]);
            return;
        }

        $stmt = $this->db->prepare(
            'SELECT token, merchant_code FROM api_authorization WHERE username = ? AND password = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $username, $password);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();

        if ($result->num_rows === 0) {
            http_response_code(401);
            echo json_encode(['timestamp' => $date, 'message' => 'Invalid credentials', 'status' => 401]);
            return;
        }

        $row = $result->fetch_assoc();

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'message'   => 'Successful',
            'status'    => 200,
            'data'      => [
                'token'         => $row['token'],
                'merchant_code' => $row['merchant_code'],
            ],
        ]);
    }
}
