<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;

/**
 * Proxies chat messages to Anthropic Claude.
 * Requires ANTHROPIC_API_KEY in .env.
 *
 * POST /api/ai/chat  { "message": "...", "history": [...] }
 */
class AiAssistantController extends BaseController
{
    private const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
    private const MODEL         = 'claude-haiku-4-5-20251001';
    private const MAX_TOKENS    = 1024;

    private const SYSTEM_PROMPT = <<<'PROMPT'
You are a helpful AI assistant embedded in CUR-MIS — the Management Information System for the Catholic University of Rwanda (CUR).

Your job is to help platform users (students, staff, faculty, administrators, applicants) understand and use the system effectively.

Key platform modules you can explain:
- **Admissions**: Online application portal, document upload, verification, merit lists, offers, and enrollment.
- **Students**: Student registry, profiles, enrollment status, and international students.
- **Academics**: Faculties, departments, programs, modules/courses, scheduling, registrations, marks, and grading scales.
- **Finance**: Fee structures, billing, student ledger, bursaries/scholarships, revenue reports, fines, and overdue alerts.
- **HR Management**: Staff directory, payroll, salary payments, leave management, performance appraisals.
- **Exams**: Schedules, results, deliberation, GPA/grading scales, and revaluation requests.
- **Attendance**: Recording and reviewing student and staff attendance.
- **Gate Management**: Student access verification based on payment and registration status.
- **Messaging & Communication**: Internal messages, announcements, discussion forums.
- **Documents**: Document generation, transcript requests, academic certificates, graduand management.
- **System Administration**: User accounts, roles, permissions, system logs, and audit trails.

Guidelines:
- Answer concisely and helpfully about how to use or navigate the platform.
- If asked about something outside the platform scope, briefly acknowledge it and redirect to platform-related questions.
- Be friendly, professional, and speak in terms the user's role would understand.
- Do not make up features that are not listed above.
PROMPT;

    public function chat(Request $request, Response $response): never
    {
        $apiKey = $_ENV['ANTHROPIC_API_KEY'] ?? '';
        if (empty($apiKey)) {
            $this->error($response, 'AI assistant is not configured. Please add ANTHROPIC_API_KEY to the server environment.', 503);
        }

        $body    = $request->body();
        $message = trim((string) ($body['message'] ?? ''));
        $history = is_array($body['history'] ?? null) ? $body['history'] : [];

        if ($message === '') {
            $this->error($response, 'Message is required.', 422);
        }

        // Build messages array — history + new user message.
        $messages = [];
        foreach ($history as $entry) {
            $role    = (string) ($entry['role'] ?? '');
            $content = (string) ($entry['content'] ?? '');
            if (in_array($role, ['user', 'assistant'], true) && $content !== '') {
                $messages[] = ['role' => $role, 'content' => $content];
            }
        }
        $messages[] = ['role' => 'user', 'content' => $message];

        // Cap history to last 20 turns to keep token cost reasonable.
        if (count($messages) > 20) {
            $messages = array_slice($messages, -20);
        }

        $payload = json_encode([
            'model'      => self::MODEL,
            'max_tokens' => self::MAX_TOKENS,
            'system'     => self::SYSTEM_PROMPT,
            'messages'   => $messages,
        ]);

        $ch = curl_init(self::ANTHROPIC_API);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
                'anthropic-version: 2023-06-01',
            ],
        ]);

        $raw    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '') {
            $this->error($response, 'AI request failed: ' . $curlErr, 502);
        }

        $data = json_decode($raw ?: '{}', true);

        if ($status !== 200) {
            $errMsg = $data['error']['message'] ?? 'AI service error.';
            $this->error($response, $errMsg, 502);
        }

        $reply = $data['content'][0]['text'] ?? '';
        $this->success($response, ['reply' => $reply], 'OK');
    }
}
