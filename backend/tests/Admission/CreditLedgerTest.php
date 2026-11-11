<?php

declare(strict_types=1);

namespace Tests\Admission;

use App\Models\ApplicationCreditModel;
use App\Models\ApplicationInvoiceModel;
use App\Services\AdmissionBillingService;
use App\Services\UrubutoPayService;
use Core\Database;
use PHPUnit\Framework\TestCase;

/**
 * Admission payments: allocation, the student credit ledger, duplicate and
 * retried callbacks, and rollback.
 *
 * These run against a REAL MariaDB schema, so they only run when the suite is
 * started against a disposable database. They refuse to run unless the active
 * database name ends in `_test`, and they skip entirely unless CUR_TEST_DB=1.
 *
 *   php vendor/bin/phpunit -c phpunit.admission.xml.dist
 *
 * Every fixture application uses the application-number prefix TST- and is
 * removed in tearDown(). Applicant email is left blank on purpose: that keeps
 * the notification code from sending real mail during the run.
 */
final class CreditLedgerTest extends TestCase
{
    private Database $db;

    /** @var list<int> application ids created by this test */
    private array $appIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (($_ENV['CUR_TEST_DB'] ?? getenv('CUR_TEST_DB') ?: '') !== '1') {
            $this->markTestSkipped('Set CUR_TEST_DB=1 and point DB_DATABASE at a *_test database to run.');
        }

        $this->db = Database::getInstance();

        $name = (string)$this->db->fetchOne('SELECT DATABASE() AS name')['name'];
        if (!str_ends_with($name, '_test')) {
            $this->fail("Refusing to run: database '{$name}' is not a *_test database.");
        }

        // Fixtures are not whole admission records, so FK checks are relaxed for this session only.
        $this->db->execute('SET FOREIGN_KEY_CHECKS=0');
        $this->db->execute(
            'CREATE TABLE IF NOT EXISTS `payment` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `external_transaction_id` VARCHAR(100) NULL,
                `payment_notifi` VARCHAR(20) NULL,
                `trans_code` VARCHAR(100) NULL
             ) ENGINE=InnoDB'
        );
        $this->purgeFixtures();

        // Migration 086 (which adds this column) contains a DELIMITER block the test
        // loader cannot run, so the column is added here when it is missing.
        $this->db->execute(
            'ALTER TABLE `student_applications` ADD COLUMN IF NOT EXISTS `enrolled_student_id` VARCHAR(40) NULL DEFAULT NULL'
        );

        // Catalogue rows as production has them: the codes the gateway sends for each fee.
        $this->db->execute("DELETE FROM `urubuto_services` WHERE service_code IN ('REG-CODE', 'CURSU-CODE')");
        $this->db->execute(
            "INSERT INTO `urubuto_services`
                (service_code, service_name, payer_target, fee_structure_type, show_in_menu, is_active, sort_order, created_at, updated_at)
             VALUES
                ('REG-CODE',   'Registration', 'APPLICANT', 'REGISTRATION', 0, 1, 0, NOW(), NOW()),
                ('CURSU-CODE', 'CURSU',        'APPLICANT', 'CURSU',        0, 1, 0, NOW(), NOW())"
        );
    }

    protected function tearDown(): void
    {
        if (isset($this->db)) {
            $this->purgeFixtures();
            $this->db->execute('SET FOREIGN_KEY_CHECKS=1');
        }
        parent::tearDown();
    }

    /**
     * Remove every TST- fixture and its money rows. Done explicitly because the
     * session runs with FOREIGN_KEY_CHECKS off, and MySQL does not run ON DELETE
     * CASCADE then: leftover payment rows would make the next run's references
     * look like duplicates.
     */
    private function purgeFixtures(): void
    {
        $apps = "SELECT id FROM `student_applications` WHERE application_number LIKE 'TST-%'";

        $this->db->execute("DELETE FROM `application_invoice_payments` WHERE application_id IN ({$apps})");
        $this->db->execute("DELETE FROM `application_credits` WHERE application_id IN ({$apps})");
        $this->db->execute("DELETE FROM `application_invoices` WHERE application_id IN ({$apps})");
        $this->db->execute("DELETE FROM `application_fee_payments` WHERE application_id IN ({$apps})");
        $this->db->execute("DELETE FROM `admission_offers` WHERE application_id IN ({$apps})");
        $this->db->execute("DELETE FROM `student_applications` WHERE application_number LIKE 'TST-%'");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scenario A — payment arrives before the bill exists
    // ─────────────────────────────────────────────────────────────────────────

    public function testRegistrationPaidBeforeBillIsKeptAsCredit(): void
    {
        $app = $this->application('A1');

        $result = $this->billing()->applyGatewayPayment($app, 'TX-REG-1', 33000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame('recorded', $result['status'], 'A verified payment must not be refused for want of a bill.');
        self::assertSame(33000.0, $result['held_as_credit']);
        self::assertSame(0.0, $result['applied']);

        $credit = $this->creditsFor($app);
        self::assertCount(1, $credit);
        self::assertSame('TX-REG-1', $credit[0]['reference_number']);
        self::assertSame('REG-CODE', $credit[0]['service_code']);
        self::assertSame(33000.0, (float)$credit[0]['amount_received']);
        self::assertSame(33000.0, (float)$credit[0]['amount_remaining']);
        self::assertSame('open', $credit[0]['status']);
        self::assertSame($app['application_number'], $credit[0]['payer_code']);
        self::assertSame([], $this->paymentsFor($app), 'Nothing is booked to a bill until one exists.');
    }

    public function testHeldCreditAppliesWhenRegistrationBillIsRaised(): void
    {
        $app = $this->application('A2');
        $this->billing()->applyGatewayPayment($app, 'TX-REG-2', 33000, 'RWF', $this->now(), 'REG-CODE');

        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $allocations = $this->billing()->allocateOpenCredits((int)$app['id']);

        self::assertCount(1, $allocations);
        $reg = $this->billRow($app, 'REGISTRATION');
        self::assertSame('paid', $reg['status']);
        self::assertSame(33000.0, (float)$reg['amount_paid']);
        self::assertSame(0.0, $this->balanceOf($app, 'REGISTRATION'));

        $credit = $this->creditsFor($app)[0];
        self::assertSame('exhausted', $credit['status']);
        self::assertSame(0.0, (float)$credit['amount_remaining']);
        self::assertSame(33000.0, (float)$credit['amount_allocated']);

        $payments = $this->paymentsFor($app);
        self::assertCount(1, $payments);
        self::assertSame((int)$credit['id'], (int)$payments[0]['application_credit_id'], 'Allocation traces back to its credit.');
        self::assertSame('TX-REG-2-CR' . $credit['id'] . '-B' . $reg['id'], $payments[0]['reference_number'],
            'One reference per (credit, bill).');

        // Allocating again must draw nothing: a credit is spent once.
        self::assertSame([], $this->billing()->allocateOpenCredits((int)$app['id']));
        self::assertSame(33000.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
    }

    public function testBillRaisedAfterPaymentIsSettledByBillCreationPath(): void
    {
        // bill() calls allocateOpenCredits() at its end; the same path is exercised here
        // through the public allocator with the bill created first.
        $app = $this->application('A3');
        $this->billing()->applyGatewayPayment($app, 'TX-CUR-0', 3000, 'RWF', $this->now(), 'CURSU-CODE');
        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');

        $this->billing()->allocateOpenCredits((int)$app['id']);

        self::assertSame('paid', $this->billRow($app, 'CURSU')['status']);
        self::assertSame(0.0, $this->balanceOf($app, 'CURSU'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scenarios B and C — each fee is identified and settled independently
    // ─────────────────────────────────────────────────────────────────────────

    public function testRegistrationPaymentSettlesOnlyRegistration(): void
    {
        $app = $this->application('B1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');

        $result = $this->billing()->applyGatewayPayment($app, 'TX-B1', 33000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame('recorded', $result['status']);
        self::assertSame('paid', $this->billRow($app, 'REGISTRATION')['status']);
        self::assertSame(0.0, $this->balanceOf($app, 'REGISTRATION'));
        self::assertSame(0.0, (float)$this->billRow($app, 'CURSU')['amount_paid'], 'CURSU must not absorb a Registration payment.');
        self::assertSame('unpaid', $this->billRow($app, 'CURSU')['status']);
    }

    public function testCursuPaidAfterRegistrationMakesBothPaid(): void
    {
        $app = $this->application('C1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');
        $this->billing()->applyGatewayPayment($app, 'TX-C1-REG', 33000, 'RWF', $this->now(), 'REG-CODE');

        $this->billing()->applyGatewayPayment($app, 'TX-C1-CUR', 3000, 'RWF', $this->now(), 'CURSU-CODE');

        self::assertSame('paid', $this->billRow($app, 'REGISTRATION')['status']);
        self::assertSame('paid', $this->billRow($app, 'CURSU')['status']);
        self::assertSame(0.0, $this->balanceOf($app, 'REGISTRATION'));
        self::assertSame(0.0, $this->balanceOf($app, 'CURSU'));
        self::assertTrue($this->billing()->overview((int)$app['id'])['fully_paid']);
    }

    public function testCursuPaymentBeforeItsBillIsHeldThenAllocatedToCursu(): void
    {
        $app = $this->application('C2');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

        // CURSU money arrives before the CURSU bill exists: it must not land on Registration.
        $result = $this->billing()->applyGatewayPayment($app, 'TX-C2-CUR', 3000, 'RWF', $this->now(), 'CURSU-CODE');
        self::assertSame(3000.0, $result['held_as_credit']);
        self::assertSame(0.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);

        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');
        $this->billing()->allocateOpenCredits((int)$app['id']);

        self::assertSame('paid', $this->billRow($app, 'CURSU')['status']);
        self::assertSame(0.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
    }

    /**
     * The enrollment gate opens only when every bill is settled, and it is the
     * settling payment that accepts the offer. The full enrollment that follows
     * (registration number generation) needs the academic setup this database
     * does not have, so it is not asserted here; the gate is.
     */
    public function testOfferIsAcceptedOnlyWhenEveryBillIsSettled(): void
    {
        $app = $this->application('G1', 'offer_accepted');
        $this->db->execute(
            "INSERT INTO `admission_offers` (application_id, offer_letter_reference, offered_at, expires_at, status, enrollment_initiated, updated_at)
             VALUES (?, 'TST-OFFER', NOW(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'pending', 0, NOW())",
            [$app['id']]
        );
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');

        $this->billing()->applyGatewayPayment($app, 'TX-G1-REG', 33000, 'RWF', $this->now(), 'REG-CODE');
        self::assertSame('pending', $this->offerStatus($app), 'Registration alone must not open the gate.');

        $this->billing()->applyGatewayPayment($app, 'TX-G1-CUR', 3000, 'RWF', $this->now(), 'CURSU-CODE');
        self::assertSame('accepted', $this->offerStatus($app), 'The last settlement opens the gate.');
    }

    private function offerStatus(array $app): string
    {
        return (string)$this->db->fetchOne(
            'SELECT status FROM `admission_offers` WHERE application_id = ?',
            [$app['id']]
        )['status'];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Partial and excess payments
    // ─────────────────────────────────────────────────────────────────────────

    public function testPartialPaymentLeavesBillPartiallyPaid(): void
    {
        $app = $this->application('P1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

        $result = $this->billing()->applyGatewayPayment($app, 'TX-P1', 20000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame(0.0, $result['held_as_credit']);
        $reg = $this->billRow($app, 'REGISTRATION');
        self::assertSame('partial', $reg['status']);
        self::assertSame(20000.0, (float)$reg['amount_paid']);
        self::assertSame(13000.0, $this->balanceOf($app, 'REGISTRATION'));
    }

    public function testExcessPaymentIsHeldAndAppliedToTheNextBill(): void
    {
        $app = $this->application('X1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

        $result = $this->billing()->applyGatewayPayment($app, 'TX-X1', 36000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame(3000.0, $result['held_as_credit'], 'The 3,000 above Registration is kept, not discarded.');
        self::assertSame('paid', $this->billRow($app, 'REGISTRATION')['status']);
        self::assertSame(3000.0, (float)$this->creditsFor($app)[0]['amount_remaining']);

        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');
        $this->billing()->allocateOpenCredits((int)$app['id']);

        self::assertSame('paid', $this->billRow($app, 'CURSU')['status']);
        self::assertSame('exhausted', $this->creditsFor($app)[0]['status']);
        self::assertSame(36000.0, $this->sumPaymentsFor($app), 'Every shilling received is accounted for exactly once.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Duplicate, retried and failed callbacks
    // ─────────────────────────────────────────────────────────────────────────

    public function testDuplicateCallbackIsNotCountedTwice(): void
    {
        $app = $this->application('D1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

        $first  = $this->billing()->applyGatewayPayment($app, 'TX-D1', 33000, 'RWF', $this->now(), 'REG-CODE');
        $second = $this->billing()->applyGatewayPayment($app, 'TX-D1', 33000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame('recorded', $first['status']);
        self::assertSame('duplicate', $second['status']);
        self::assertSame(33000.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
        self::assertCount(1, $this->creditsFor($app));
        self::assertSame(33000.0, $this->sumPaymentsFor($app));
    }

    public function testRetriedCallbackWhileBillIsMissingCreatesOneCredit(): void
    {
        $app = $this->application('D2');

        $this->billing()->applyGatewayPayment($app, 'TX-D2', 33000, 'RWF', $this->now(), 'REG-CODE');
        $second = $this->billing()->applyGatewayPayment($app, 'TX-D2', 33000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame('duplicate', $second['status']);
        $credits = $this->creditsFor($app);
        self::assertCount(1, $credits);
        self::assertSame(33000.0, (float)$credits[0]['amount_remaining']);
    }

    public function testRejectedPaymentChangesNothing(): void
    {
        $app = $this->application('F1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

        $zero  = $this->billing()->applyGatewayPayment($app, 'TX-F1', 0, 'RWF', $this->now(), 'REG-CODE');
        $empty = $this->billing()->applyGatewayPayment($app, '', 33000, 'RWF', $this->now(), 'REG-CODE');

        self::assertSame('error', $zero['status']);
        self::assertSame('error', $empty['status']);
        self::assertSame([], $this->creditsFor($app));
        self::assertSame([], $this->paymentsFor($app));
        self::assertSame(0.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
    }

    public function testFailureAfterSettlementRollsBackTheCredit(): void
    {
        $app = $this->application('F2');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $billing = $this->billing();

        try {
            $billing->inTransaction(function () use ($billing, $app): void {
                $billing->settleGatewayPaymentInTx($app, 'TX-F2', 33000, 'RWF', $this->now(), 'REG-CODE');
                throw new \RuntimeException('simulated failure after the money was written');
            });
            self::fail('The simulated failure should have propagated.');
        } catch (\RuntimeException $e) {
            self::assertSame('simulated failure after the money was written', $e->getMessage());
        }

        self::assertSame([], $this->creditsFor($app), 'A rolled-back settlement leaves no credit behind.');
        self::assertSame([], $this->paymentsFor($app));
        self::assertSame(0.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Application fee vs admission fees, through the real callback entry point
    // ─────────────────────────────────────────────────────────────────────────

    public function testApplicationFeeSurplusIsKeptNotDiscarded(): void
    {
        $app = $this->application('AF1', 'offer_accepted', false);

        // Application fee defaults to 5,000 RWF; the applicant sends 33,000 with no bill raised yet.
        $result = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-AF1', 33000));

        self::assertSame('recorded', $result['status']);

        $fee = $this->db->fetchAll('SELECT amount FROM application_fee_payments WHERE application_id = ?', [$app['id']]);
        self::assertCount(1, $fee);
        self::assertSame(5000.0, (float)$fee[0]['amount'], 'The application fee takes exactly what it is owed.');

        $credit = $this->creditsFor($app);
        self::assertCount(1, $credit);
        self::assertSame(28000.0, (float)$credit[0]['amount_remaining'], 'The 28,000 surplus is kept, not dropped.');
        self::assertSame(33000.0, (float)$credit[0]['amount_received'] + 5000.0, 'Fee and credit together account for the whole payment.');
    }

    public function testApplicationFeeCallbackRetryIsDuplicate(): void
    {
        $app = $this->application('AF2', 'offer_accepted', false);
        $payload = $this->gatewayPayload($app, 'TX-AF2', 5000);

        $this->service()->recordMobilePayment($payload);
        $again = $this->service()->recordMobilePayment($payload);

        self::assertSame('duplicate', $again['status']);
        $fee = $this->db->fetchOne('SELECT COUNT(*) AS c FROM application_fee_payments WHERE application_id = ?', [$app['id']]);
        self::assertSame(1, (int)$fee['c']);
        self::assertSame([], $this->creditsFor($app), 'An exact fee payment leaves no credit.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────
    // Legacy applicants: a payment recorded only on the flat columns
    // (transaction_id, payment_amount, paid_at) with no ledger row. The claim
    // approval path (FeeController::approveApplicationPayment) writes exactly
    // this, and it is the state of the applicants the finance team reported.
    // ─────────────────────────────────────────────────────────────────────────

    /** An applicant whose application fee was settled through the claim path. */
    private function legacyApplication(string $tag, float $flatAmount, float $quote, string $tx): array
    {
        $app = $this->application($tag);
        $this->db->execute(
            'UPDATE `student_applications`
                SET payment_amount = ?, paid_at = NOW(), transaction_id = ?, application_fee_due = ?
              WHERE id = ?',
            [$flatAmount, $tx, $quote, $app['id']]
        );

        return $this->db->fetchOne('SELECT * FROM `student_applications` WHERE id = ?', [$app['id']]);
    }

    public function testLegacyClaimFeeDoesNotLetRegistrationPaymentSplit(): void
    {
        // Application fee 3,000 was settled by the claim (flat columns only, no ledger row).
        $app = $this->legacyApplication('L1', 3000, 3000, 'LEG-L1');
        $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
        $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');

        $result = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-L1-REG', 33000));

        self::assertSame('recorded', $result['status']);
        self::assertSame('paid', $this->billRow($app, 'REGISTRATION')['status'],
            'The whole 33,000 belongs to Registration: the fee was already settled.');
        self::assertSame(0.0, (float)$this->billRow($app, 'CURSU')['amount_paid']);
        $credit = $this->creditsFor($app);
        self::assertCount(1, $credit, 'The payment is on the credit ledger, fully allocated to Registration.');
        self::assertSame(33000.0, (float)$credit[0]['amount_allocated']);
        self::assertSame(0.0, (float)$credit[0]['amount_remaining']);
        self::assertSame('3000.00', $this->db->fetchOne('SELECT payment_amount FROM student_applications WHERE id = ?', [$app['id']])['payment_amount'],
            'A settled fee is not re-stamped with the Registration amount.');
    }

    public function testFirstNewPaymentKeepsTheLegacyTotal(): void
    {
        // Quote 5,000; the claim carried 3,000 on the flat columns. The applicant now pays the 2,000 balance.
        $app = $this->legacyApplication('L2', 3000, 5000, 'LEG-L2');

        $result = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-L2-FEE', 2000));

        self::assertSame('recorded', $result['status']);
        $ledger = $this->db->fetchAll('SELECT amount FROM `application_fee_payments` WHERE application_id = ?', [$app['id']]);
        self::assertCount(2, $ledger, 'The legacy amount is carried into the ledger alongside the new payment.');
        self::assertSame(5000.0, array_sum(array_map(static fn (array $r): float => (float)$r['amount'], $ledger)));
        self::assertSame('5000.00', $this->db->fetchOne('SELECT payment_amount FROM student_applications WHERE id = ?', [$app['id']])['payment_amount'],
            'The mirrored total must be 5,000, not the 2,000 of the new payment alone.');
        self::assertSame(5000.0, (float)$this->db->fetchOne('SELECT SUM(amount) AS s FROM `application_fee_payments` WHERE application_id = ?', [$app['id']])['s']);
    }

    public function testRetriedLegacyTransactionIsNotBookedAgain(): void
    {
        $app = $this->legacyApplication('L3', 3000, 3000, 'LEG-L3');

        // The gateway retries the callback for the very transaction the claim recorded.
        $result = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'LEG-L3', 3000));

        self::assertSame('duplicate', $result['status']);
        self::assertSame([], $this->creditsFor($app), 'A retry of a settled transaction must not become credit.');
        $ledgerRows = (int)$this->db->fetchOne(
            'SELECT COUNT(*) AS c FROM `application_fee_payments` WHERE application_id = ?',
            [$app['id']]
        )['c'];
        self::assertSame(0, $ledgerRows, 'The retry must not write a fee ledger row either.');
    }

    /**
     * The production shape: the 3,000 application fee was settled through the claim path
     * (flat columns, no frozen quote). The fee is priced live, here from the application-fee
     * setting. Scenario 1-4 of the acceptance list: the settled fee, then Registration 33,000,
     * then CURSU 3,000, each landing only on its own bill.
     */
    public function testSettledApplicationFeeNeverConsumesRegistrationOrCursu(): void
    {
        $this->setApplicationFeeSetting('3000');
        try {
            $app = $this->legacyApplication('S1', 3000, 0, 'LEG-S1');
            $this->db->execute('UPDATE `student_applications` SET application_fee_due = NULL WHERE id = ?', [$app['id']]);
            $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');
            $this->bill($app, 'CURSU', 3000, 'CURSU-CODE');

            $reg = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-S1-REG', 33000));
            $cur = $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-S1-CUR', 3000));

            self::assertSame('recorded', $reg['status']);
            self::assertSame('recorded', $cur['status']);
            self::assertSame('paid', $this->billRow($app, 'REGISTRATION')['status']);
            self::assertSame('paid', $this->billRow($app, 'CURSU')['status']);
            self::assertSame(0.0, $this->balanceOf($app, 'REGISTRATION'));
            self::assertSame(0.0, $this->balanceOf($app, 'CURSU'));

            // Nothing was written to the application-fee ledger: the settled 3,000 still sits on the
            // flat columns, which the fee service reads as paid while the ledger is empty.
            $feeRows = (int)$this->db->fetchOne(
                'SELECT COUNT(*) AS c FROM `application_fee_payments` WHERE application_id = ?',
                [$app['id']]
            )['c'];
            self::assertSame(0, $feeRows, 'Admission payments must not write to the application-fee ledger.');
            self::assertSame('3000.00', $this->db->fetchOne(
                'SELECT payment_amount FROM `student_applications` WHERE id = ?', [$app['id']]
            )['payment_amount']);

            // Every credit is fully spent, and each bill received exactly the money sent for it.
            foreach ($this->creditsFor($app) as $credit) {
                self::assertSame(0.0, (float)$credit['amount_remaining']);
            }
            self::assertSame(36000.0, $this->sumPaymentsFor($app));
        } finally {
            $this->setApplicationFeeSetting(null);
        }
    }

    /**
     * Documents what a fee that is NOT settled does. A 5,000 quote with 3,000 on record leaves
     * 2,000 owing on the fee, so the next 33,000 pays that 2,000 first and 31,000 reaches
     * Registration. This is the designed behaviour; the cPanel check decides whether it applies.
     */
    public function testUnsettledApplicationFeeTakesItsBalanceFirst(): void
    {
        $this->setApplicationFeeSetting('5000');
        try {
            $app = $this->legacyApplication('S2', 3000, 0, 'LEG-S2');
            $this->db->execute('UPDATE `student_applications` SET application_fee_due = NULL WHERE id = ?', [$app['id']]);
            $this->bill($app, 'REGISTRATION', 33000, 'REG-CODE');

            $this->service()->recordMobilePayment($this->gatewayPayload($app, 'TX-S2-REG', 33000));

            $fee = (float)$this->db->fetchOne(
                'SELECT COALESCE(SUM(amount),0) AS s FROM `application_fee_payments` WHERE application_id = ?',
                [$app['id']]
            )['s'];
            self::assertSame(5000.0, $fee, 'The fee is topped up to its 5,000 quote.');
            self::assertSame(31000.0, (float)$this->billRow($app, 'REGISTRATION')['amount_paid']);
            self::assertSame('partial', $this->billRow($app, 'REGISTRATION')['status']);
        } finally {
            $this->setApplicationFeeSetting(null);
        }
    }

    /** Sets (or with null, removes) the application-fee setting for one test. Test database only. */
    private function setApplicationFeeSetting(?string $amount): void
    {
        $this->db->execute("DELETE FROM `settings` WHERE key_name = 'application_fee_amount'");
        if ($amount !== null) {
            $this->db->execute(
                "INSERT INTO `settings` (key_name, value, description) VALUES ('application_fee_amount', ?, 'test fixture')",
                [$amount]
            );
        }
    }

    private function billing(): AdmissionBillingService
    {
        return new AdmissionBillingService();
    }

    private function service(): UrubutoPayService
    {
        return new UrubutoPayService();
    }

    private function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    /** @return array<string,mixed> */
    private function application(string $tag, string $status = 'offer_accepted', bool $lastName = true): array
    {
        $number = 'TST-' . $tag . '-' . bin2hex(random_bytes(3));

        $this->db->execute(
            "INSERT INTO `student_applications`
                (application_number, academic_year_id, faculty_id, department_id, intake,
                 first_name, last_name, email, phone, gender, birthdate, prev_school,
                 prev_qualification, prev_grade, graduation_year, status, payment_currency,
                 created_at, updated_at)
             VALUES (?, 1, 1, 1, '2026A', 'Test', ?, '', '0780000000', 'M', '2003-01-01',
                     'School', 'A2', 'A', 2022, ?, 'RWF', NOW(), NOW())",
            [$number, $lastName ? 'Mukamana' : '', $status]
        );

        $id  = (int)$this->db->lastInsertId();
        $app = $this->db->fetchOne('SELECT * FROM `student_applications` WHERE id = ?', [$id]);
        $this->appIds[] = $id;

        return $app;
    }

    /** Raise one admission bill directly, as bill() would. */
    private function bill(array $app, string $feeType, float $amount, string $serviceCode): int
    {
        return (int)(new ApplicationInvoiceModel())->create([
            'application_id' => (int)$app['id'],
            'fee_type'       => $feeType,
            'label'          => ucfirst(strtolower($feeType)),
            'service_code'   => $serviceCode,
            'amount_due'     => $amount,
            'amount_paid'    => 0,
            'currency'       => 'RWF',
            'status'         => 'unpaid',
            'billed_at'      => $this->now(),
        ]);
    }

    /** @return array<string,mixed> */
    private function billRow(array $app, string $feeType): array
    {
        return $this->db->fetchOne(
            'SELECT * FROM `application_invoices` WHERE application_id = ? AND fee_type = ?',
            [$app['id'], $feeType]
        );
    }

    private function balanceOf(array $app, string $feeType): float
    {
        $bill = $this->billRow($app, $feeType);

        return round((float)$bill['amount_due'] - (float)$bill['amount_paid'], 2);
    }

    /** @return list<array<string,mixed>> */
    private function creditsFor(array $app): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM `application_credits` WHERE application_id = ? ORDER BY id',
            [$app['id']]
        );
    }

    /** @return list<array<string,mixed>> */
    private function paymentsFor(array $app): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM `application_invoice_payments` WHERE application_id = ? ORDER BY id',
            [$app['id']]
        );
    }

    private function sumPaymentsFor(array $app): float
    {
        return round(array_sum(array_map(
            static fn (array $p): float => (float)$p['amount'],
            $this->paymentsFor($app)
        )), 2);
    }

    /** A callback as UrubutoPay sends it for a successful payment on the applicant's payer code. */
    private function gatewayPayload(array $app, string $tx, float $amount): array
    {
        return [
            'callback_type'     => 'PAYMENT',
            'status'            => 'SUCCESSFUL',
            'transaction_id'    => $tx,
            'payer_code'        => $app['application_number'],
            'amount'            => $amount,
            'currency'          => 'RWF',
            'payment_date_time' => $this->now(),
        ];
    }
}
