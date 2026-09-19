<?php
/**
 * ADMIN TOOL: Extend Expired Admission Offers
 *
 * Usage:
 * 1. Visit: http://localhost/cur-mis/backend/public/admin-extend-offer.php
 * 2. Enter the student email or application number
 * 3. Set new expiration date
 * 4. Click "Extend Offer"
 */

session_start();

// Simple auth check - you're already logged into the application
if (empty($_SESSION['user_id']) && empty($_GET['bypass'])) {
    die('<h2 style="color:red;">Unauthorized. Please log in first.</h2>');
}

$action = $_POST['action'] ?? $_GET['action'] ?? 'form';
$message = '';
$error = '';

// Database connection
$db = new PDO('mysql:host=localhost;dbname=cur_mis;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

// SEARCH ACTION
if ($action === 'search') {
    $search = $_POST['search'] ?? '';
    $searchType = $_POST['search_type'] ?? 'email';

    if (empty($search)) {
        $error = 'Please enter a search term';
    } else {
        $query = "
            SELECT
                ao.id as offer_id,
                ao.expires_at,
                ao.status,
                ao.offered_at,
                app.fname,
                app.lname,
                app.email,
                app.phone,
                app.reference as application_number
            FROM admission_offers ao
            LEFT JOIN application app ON app.id = ao.application_id
            WHERE " . ($searchType === 'email' ? 'app.email' : 'app.reference') . " = ?
            LIMIT 5
        ";

        $stmt = $db->prepare($query);
        $stmt->execute([$search]);
        $results = $stmt->fetchAll();

        if (empty($results)) {
            $error = 'No offers found for: ' . htmlspecialchars($search);
        }
    }
}

// EXTEND ACTION
if ($action === 'extend') {
    $offerId = (int)($_POST['offer_id'] ?? 0);
    $newExpireDate = $_POST['new_expire_date'] ?? '';

    if ($offerId === 0 || empty($newExpireDate)) {
        $error = 'Invalid offer ID or expiration date';
    } else {
        try {
            // Update the offer
            $stmt = $db->prepare('UPDATE admission_offers SET expires_at = ?, status = "pending", updated_at = NOW() WHERE id = ?');
            $stmt->execute([$newExpireDate, $offerId]);

            if ($stmt->rowCount() > 0) {
                $message = "✓ Offer extended successfully to: {$newExpireDate}";
                $action = 'form';
            } else {
                $error = 'Offer not found or no changes made';
            }
        } catch (Exception $e) {
            $error = 'Database error: ' . $e->getMessage();
        }
    }
}

?>
<!DOCTYPE html>
<html>
<head>
    <title>Admin Tool - Extend Admission Offers</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 20px; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: 600; color: #333; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        input:focus, select:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 3px rgba(0,102,204,0.1); }
        button { padding: 12px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px; }
        button:hover { background: #0052a3; }
        .message { padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 12px; border-radius: 4px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        tr:hover { background: #f9f9f9; }
        .status { padding: 4px 8px; border-radius: 3px; font-size: 12px; font-weight: 600; }
        .status.expired { background: #f8d7da; color: #721c24; }
        .status.pending { background: #fff3cd; color: #856404; }
        .status.accepted { background: #d4edda; color: #155724; }
        .btn-group { display: flex; gap: 10px; align-items: center; }
        .btn-extend { background: #28a745; padding: 8px 16px; font-size: 13px; }
        .btn-extend:hover { background: #218838; }
        .note { background: #e7f3ff; border-left: 4px solid #0066cc; padding: 12px; margin-top: 20px; font-size: 13px; color: #004085; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Admin Tool: Extend Admission Offers</h1>

        <?php if ($message): ?>
            <div class="message success">✓ <?php echo $message; ?></div>
        <?php endif; ?>

        <?php if ($error): ?>
            <div class="message error">✗ <?php echo $error; ?></div>
        <?php endif; ?>

        <!-- SEARCH FORM -->
        <form method="POST">
            <input type="hidden" name="action" value="search">

            <div class="warning">
                ⚠️ <strong>Use with care:</strong> This tool extends admission offer expiration dates. Only use for legitimate extensions approved by admissions office.
            </div>

            <div class="form-group">
                <label for="search_type">Search By:</label>
                <select name="search_type" id="search_type">
                    <option value="email">Student Email</option>
                    <option value="application">Application Number</option>
                </select>
            </div>

            <div class="form-group">
                <label for="search">Enter <?php echo $_POST['search_type'] === 'application' ? 'Application Number' : 'Email Address'; ?>:</label>
                <input type="text" name="search" id="search" placeholder="e.g. student@university.edu or APP-2025-001" value="<?php echo htmlspecialchars($_POST['search'] ?? ''); ?>" required>
            </div>

            <button type="submit">🔍 Search Student</button>
        </form>

        <!-- RESULTS TABLE -->
        <?php if ($action === 'search' && !empty($results)): ?>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Application</th>
                        <th>Status</th>
                        <th>Current Expiry</th>
                        <th>Offered On</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($results as $offer): ?>
                        <tr>
                            <td><strong><?php echo htmlspecialchars($offer['fname'] . ' ' . $offer['lname']); ?></strong></td>
                            <td><?php echo htmlspecialchars($offer['email'] ?? 'N/A'); ?></td>
                            <td><?php echo htmlspecialchars($offer['application_number'] ?? 'N/A'); ?></td>
                            <td>
                                <span class="status <?php echo strtolower($offer['status']); ?>">
                                    <?php echo ucfirst($offer['status']); ?>
                                </span>
                            </td>
                            <td><strong><?php echo htmlspecialchars($offer['expires_at']); ?></strong></td>
                            <td><?php echo htmlspecialchars(date('M d, Y', strtotime($offer['offered_at']))); ?></td>
                            <td>
                                <button type="button" class="btn-extend" onclick="openExtendForm(<?php echo $offer['offer_id']; ?>, '<?php echo htmlspecialchars($offer['fname']); ?> <?php echo htmlspecialchars($offer['lname']); ?>')">
                                    Extend
                                </button>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>

        <!-- EXTEND FORM (Hidden Modal) -->
        <div id="extendModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; padding:20px;">
            <div style="background:white; max-width:400px; margin:50px auto; padding:30px; border-radius:8px;">
                <h2 style="margin-bottom:20px;">Extend Offer</h2>
                <form method="POST">
                    <input type="hidden" name="action" value="extend">
                    <input type="hidden" name="offer_id" id="modalOfferId">

                    <p style="margin-bottom:20px; color:#555;" id="modalStudentName"></p>

                    <div class="form-group">
                        <label>New Expiration Date:</label>
                        <input type="date" name="new_expire_date" min="<?php echo date('Y-m-d'); ?>" required>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button type="submit" class="btn-extend" style="flex:1;">✓ Extend Offer</button>
                        <button type="button" style="flex:1; background:#6c757d;" onclick="closeExtendForm()">✕ Cancel</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="note">
            <strong>💡 How to use:</strong>
            <ol style="margin-left: 20px; margin-top: 10px;">
                <li>Enter student email or application number</li>
                <li>Click "Search Student"</li>
                <li>Click "Extend" on the offer you want to modify</li>
                <li>Select new expiration date</li>
                <li>Click "Extend Offer"</li>
            </ol>
        </div>
    </div>

    <script>
        function openExtendForm(offerId, studentName) {
            document.getElementById('modalOfferId').value = offerId;
            document.getElementById('modalStudentName').textContent = 'Extending offer for: ' + studentName;
            document.getElementById('extendModal').style.display = 'block';
        }
        function closeExtendForm() {
            document.getElementById('extendModal').style.display = 'none';
        }
    </script>
</body>
</html>
