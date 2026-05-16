<?php
$conn = new mysqli('localhost','curac_save','curac_save','curac_save');
$conn->set_charset('utf8mb4');

// Stats
$stats = $conn->query("
    SELECT
        COUNT(*)                                            AS total,
        SUM(amount_due)                                     AS total_due,
        SUM(amount_paid)                                    AS total_paid,
        SUM(CASE WHEN status='paid'    THEN 1 END)          AS cnt_paid,
        SUM(CASE WHEN status='partial' THEN 1 END)          AS cnt_partial,
        SUM(CASE WHEN status='unpaid'  THEN 1 END)          AS cnt_unpaid,
        SUM(CASE WHEN status='overdue' THEN 1 END)          AS cnt_overdue,
        SUM(amount_due - amount_paid - bursary_amount)      AS total_outstanding
    FROM fee_invoices
")->fetch_assoc();

$search  = trim($_GET['q'] ?? '');
$filter  = trim($_GET['s'] ?? '');
$page    = max(1,(int)($_GET['p'] ?? 1));
$perPage = 20;
$offset  = ($page-1)*$perPage;

$where = '1=1';
$bind  = []; $types = '';
if ($search !== '') {
    $like  = "%$search%";
    $where .= " AND (s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ? OR fi.fee_type LIKE ?)";
    $bind   = array_merge($bind,[$like,$like,$like,$like]);
    $types .= 'ssss';
}
if (in_array($filter,['paid','partial','unpaid','overdue','waived'])) {
    $where .= " AND fi.status = ?";
    $bind[] = $filter; $types .= 's';
}

$countSql = "SELECT COUNT(*) AS n
             FROM fee_invoices fi
             LEFT JOIN student s ON s.id = fi.student_id
             WHERE $where";
if ($types) {
    $st = $conn->prepare($countSql);
    $st->bind_param($types,...$bind);
    $st->execute();
    $totalRows = $st->get_result()->fetch_assoc()['n'];
    $st->close();
} else {
    $totalRows = $conn->query($countSql)->fetch_assoc()['n'];
}
$totalPages = max(1,ceil($totalRows/$perPage));

$sql = "SELECT fi.*,
               CONCAT(COALESCE(s.fname,''),' ',COALESCE(s.lname,'')) AS full_name,
               s.regnumber,
               (SELECT SUM(p.amount)
                FROM payment p
                WHERE p.student = s.regnumber AND p.payment_notifi='Debit') AS bank_paid_total,
               (SELECT MAX(p.recorded_date)
                FROM payment p
                WHERE p.student = s.regnumber AND p.payment_notifi='Debit') AS last_bank_payment
        FROM fee_invoices fi
        LEFT JOIN student s ON s.id = fi.student_id
        WHERE $where
        ORDER BY fi.created_at DESC
        LIMIT $perPage OFFSET $offset";
if ($types) {
    $st = $conn->prepare($sql);
    $st->bind_param($types,...$bind);
    $st->execute();
    $rows = $st->get_result();
    $st->close();
} else {
    $rows = $conn->query($sql);
}

function pct($paid,$due){ return $due>0 ? min(100,round($paid/$due*100)) : 0; }
function statusColor($s){
    return ['paid'=>'#22d3a5','partial'=>'#f97316','unpaid'=>'#f43f5e','overdue'=>'#dc2626','waived'=>'#a78bfa'][$s] ?? '#64748b';
}
function statusBg($s){
    return ['paid'=>'rgba(34,211,165,.15)','partial'=>'rgba(249,115,22,.15)','unpaid'=>'rgba(244,63,94,.15)','overdue'=>'rgba(220,38,38,.15)','waived'=>'rgba(167,139,250,.15)'][$s] ?? 'rgba(100,116,139,.15)';
}
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CUR – Fee Invoices</title>
<style>
:root,[data-theme="dark"]{
  --bg:#0f1117;--card:#1a1d2e;--card2:#222538;--border:#2a2d45;
  --blue:#4f8ef7;--green:#22d3a5;--orange:#f97316;--red:#f43f5e;
  --purple:#a78bfa;--text:#e2e8f0;--muted:#64748b;--shadow:0 2px 16px rgba(0,0,0,.35);
}
[data-theme="light"]{
  --bg:#f1f5f9;--card:#fff;--card2:#f8fafc;--border:#e2e8f0;
  --blue:#2563eb;--green:#059669;--orange:#d97706;--red:#dc2626;
  --purple:#7c3aed;--text:#1e293b;--muted:#64748b;--shadow:0 2px 12px rgba(0,0,0,.07);
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',Arial,sans-serif;font-size:14px;transition:background .25s,color .25s}
.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:100;box-shadow:var(--shadow)}
.logo{padding:22px 20px 18px;border-bottom:1px solid var(--border)}
.logo h1{font-size:16px;font-weight:700;color:var(--blue)}
.logo span{font-size:11px;color:var(--muted)}
.nav{padding:16px 10px;flex:1}
.nav a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:13px;margin-bottom:2px;transition:.15s}
.nav a.active,.nav a:hover{background:var(--card2);color:var(--text)}
.nav a.active{color:var(--blue)}
.sidebar-foot{padding:16px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
.main{margin-left:220px;padding:28px;min-height:100vh}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.topbar h2{font-size:20px;font-weight:600}
.topbar-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.theme-btn{display:inline-flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:999px;font-size:12px;cursor:pointer;transition:.2s}
.theme-btn:hover{border-color:var(--blue);color:var(--blue)}
.sync-btn{display:inline-flex;align-items:center;gap:6px;background:var(--blue);color:#fff;border:none;padding:7px 16px;border-radius:8px;font-size:12px;cursor:pointer;transition:.2s}
.sync-btn:hover{opacity:.85}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:22px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;position:relative;overflow:hidden;transition:transform .15s}
.stat:hover{transform:translateY(-2px)}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:12px 12px 0 0}
.stat.blue::before{background:var(--blue)}.stat.green::before{background:var(--green)}
.stat.orange::before{background:var(--orange)}.stat.red::before{background:var(--red)}.stat.purple::before{background:var(--purple)}
.stat .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.stat .value{font-size:20px;font-weight:700}
.stat .sub{font-size:11px;color:var(--muted);margin-top:2px}
/* filters */
.filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.filter-btn{padding:5px 14px;border-radius:999px;font-size:12px;border:1px solid var(--border);background:var(--card2);color:var(--muted);text-decoration:none;transition:.15s}
.filter-btn:hover,.filter-btn.active{border-color:var(--blue);color:var(--blue);background:rgba(79,142,247,.1)}
.search-wrap{position:relative;margin-left:auto}
.search-wrap input{background:var(--card2);border:1px solid var(--border);color:var(--text);padding:7px 12px 7px 32px;border-radius:8px;font-size:12px;width:240px;outline:none}
.search-wrap input:focus{border-color:var(--blue)}
.search-wrap::before{content:'🔍';position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px}
/* table */
.table-card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse}
thead tr{background:var(--card2)}
th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500;white-space:nowrap}
td{padding:11px 14px;border-top:1px solid var(--border);font-size:13px;vertical-align:middle}
tr:hover td{background:rgba(79,142,247,.04)}
.pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:500}
.progress-wrap{width:100px;background:var(--border);border-radius:999px;height:6px;overflow:hidden}
.progress-bar{height:6px;border-radius:999px;transition:width .4s}
.mono{font-family:monospace;font-size:12px;color:var(--muted)}
.name-main{font-weight:500}
.name-reg{font-size:11px;color:var(--muted)}
.bank-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--blue);background:rgba(79,142,247,.1);padding:2px 8px;border-radius:4px;margin-top:3px}
.pager{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-top:1px solid var(--border)}
.pager-btns{display:flex;gap:4px}
.pager-btns a{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;font-size:12px;text-decoration:none;color:var(--muted);background:var(--card2);border:1px solid var(--border)}
.pager-btns a.active{background:var(--blue);color:#fff;border-color:var(--blue)}
.pager-btns a:hover:not(.active){border-color:var(--blue);color:var(--blue)}
.empty{text-align:center;padding:40px;color:var(--muted)}
#syncMsg{font-size:12px;color:var(--green);display:none}
@media(max-width:900px){.sidebar{display:none}.main{margin-left:0;padding:16px}.stats{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="logo"><h1>🏦 CUR Finance</h1><span>Payment Management</span></div>
  <nav class="nav">
    <a href="payments_dashboard.php"><span style="width:20px;text-align:center">📊</span> Dashboard</a>
    <a href="invoices_dashboard.php" class="active"><span style="width:20px;text-align:center">📄</span> Fee Invoices</a>
    <a href="apitest.html"><span style="width:20px;text-align:center">🧪</span> Test API</a>
    <a href="index.php"><span style="width:20px;text-align:center">⚡</span> API Status</a>
  </nav>
  <div class="sidebar-foot">curac_save · <?= date('d M Y') ?></div>
</aside>

<main class="main">
  <div class="topbar">
    <div>
      <h2>Fee Invoices</h2>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">Auto-updated by bank & mobile payments</div>
    </div>
    <div class="topbar-right">
      <span id="syncMsg">✓ Sync complete!</span>
      <button class="sync-btn" onclick="runSync()">🔄 Re-sync All</button>
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtn">
        <span id="themeIcon">☀️</span><span id="themeLabel">Light Mode</span>
      </button>
    </div>
  </div>

  <!-- STATS -->
  <div class="stats">
    <div class="stat blue">
      <div class="label">Total Invoices</div>
      <div class="value"><?= number_format($stats['total']) ?></div>
      <div class="sub">All students</div>
    </div>
    <div class="stat green">
      <div class="label">Total Collected</div>
      <div class="value"><?= number_format((float)$stats['total_paid'],0) ?></div>
      <div class="sub">RWF paid</div>
    </div>
    <div class="stat red">
      <div class="label">Outstanding</div>
      <div class="value"><?= number_format((float)$stats['total_outstanding'],0) ?></div>
      <div class="sub">RWF remaining</div>
    </div>
    <div class="stat orange">
      <div class="label">Partial / Unpaid</div>
      <div class="value"><?= number_format((int)$stats['cnt_partial'] + (int)$stats['cnt_unpaid']) ?></div>
      <div class="sub"><?= $stats['cnt_partial'] ?> partial · <?= $stats['cnt_unpaid'] ?> unpaid</div>
    </div>
    <div class="stat purple">
      <div class="label">Fully Paid</div>
      <div class="value"><?= number_format((int)$stats['cnt_paid']) ?></div>
      <div class="sub"><?= $stats['cnt_overdue'] ?> overdue</div>
    </div>
  </div>

  <!-- FILTERS + SEARCH -->
  <div class="filters">
    <?php
    $filters = [''=>'All', 'paid'=>'✓ Paid', 'partial'=>'⚡ Partial', 'unpaid'=>'✗ Unpaid', 'overdue'=>'⏰ Overdue', 'waived'=>'🎓 Waived'];
    foreach ($filters as $val => $label):
      $active = $filter === $val ? 'active' : '';
      $href = '?s='.urlencode($val).'&q='.urlencode($search);
    ?>
    <a href="<?= $href ?>" class="filter-btn <?= $active ?>"><?= $label ?></a>
    <?php endforeach; ?>
    <form method="GET" class="search-wrap" style="margin-left:auto">
      <input type="hidden" name="s" value="<?= htmlspecialchars($filter) ?>"/>
      <input name="q" value="<?= htmlspecialchars($search) ?>" placeholder="Search name, reg, fee type…"/>
    </form>
  </div>

  <!-- TABLE -->
  <div class="table-card">
    <?php if ($rows && $rows->num_rows > 0): ?>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Student</th>
          <th>Fee Type</th>
          <th>Semester</th>
          <th>Amount Due</th>
          <th>Paid</th>
          <th>Outstanding</th>
          <th>Progress</th>
          <th>Status</th>
          <th>Bank Payments</th>
          <th>Last Payment</th>
        </tr>
      </thead>
      <tbody>
        <?php $n=$offset+1; while($r=$rows->fetch_assoc()):
          $due     = (float)$r['amount_due'];
          $paid    = (float)$r['amount_paid'];
          $bursary = (float)$r['bursary_amount'];
          $outstanding = max(0, $due - $paid - $bursary);
          $pct = pct($paid + $bursary, $due);
          $sc  = statusColor($r['status']);
          $sbg = statusBg($r['status']);
          $bankTotal = (float)($r['bank_paid_total'] ?? 0);
        ?>
        <tr>
          <td style="color:var(--muted);font-size:12px"><?= $n++ ?></td>
          <td>
            <div class="name-main"><?= trim($r['full_name']) ?: '—' ?></div>
            <div class="name-reg"><?= htmlspecialchars($r['regnumber'] ?? '') ?></div>
          </td>
          <td style="font-size:12px"><?= htmlspecialchars($r['fee_type']) ?></td>
          <td style="font-size:12px;color:var(--muted)">Sem <?= $r['semester'] ?></td>
          <td style="font-weight:500"><?= number_format($due,0) ?> <span style="font-size:10px;color:var(--muted)">RWF</span></td>
          <td style="color:var(--green);font-weight:600"><?= number_format($paid,0) ?></td>
          <td style="color:<?= $outstanding>0?'var(--red)':'var(--green)' ?>;font-weight:600"><?= number_format($outstanding,0) ?></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="progress-wrap">
                <div class="progress-bar" style="width:<?= $pct ?>%;background:<?= $sc ?>"></div>
              </div>
              <span style="font-size:11px;color:var(--muted)"><?= $pct ?>%</span>
            </div>
          </td>
          <td>
            <span class="pill" style="background:<?= $sbg ?>;color:<?= $sc ?>">
              <?= ucfirst($r['status']) ?>
            </span>
          </td>
          <td>
            <?php if ($bankTotal > 0): ?>
              <div class="bank-tag">🏦 <?= number_format($bankTotal,0) ?> RWF</div>
            <?php else: ?>
              <span style="color:var(--muted);font-size:12px">—</span>
            <?php endif; ?>
          </td>
          <td style="font-size:11px;color:var(--muted)">
            <?= $r['last_bank_payment'] ? date('d M Y', strtotime($r['last_bank_payment'])) : '—' ?>
          </td>
        </tr>
        <?php endwhile; ?>
      </tbody>
    </table>
    </div>
    <div class="pager">
      <div style="font-size:12px;color:var(--muted)">Showing <?= $offset+1 ?>–<?= min($offset+$perPage,$totalRows) ?> of <?= number_format($totalRows) ?></div>
      <div class="pager-btns">
        <?php if($page>1):?><a href="?p=<?=$page-1?>&s=<?=urlencode($filter)?>&q=<?=urlencode($search)?>">‹</a><?php endif;?>
        <?php for($i=max(1,$page-2);$i<=min($totalPages,$page+2);$i++):?>
          <a href="?p=<?=$i?>&s=<?=urlencode($filter)?>&q=<?=urlencode($search)?>" class="<?=$i===$page?'active':''?>"><?=$i?></a>
        <?php endfor;?>
        <?php if($page<$totalPages):?><a href="?p=<?=$page+1?>&s=<?=urlencode($filter)?>&q=<?=urlencode($search)?>">›</a><?php endif;?>
      </div>
    </div>
    <?php else: ?>
    <div class="empty">
      <div style="font-size:32px;margin-bottom:8px">📭</div>
      No invoices found<?= $search ? ' for "'.htmlspecialchars($search).'"' : '' ?>.
    </div>
    <?php endif; ?>
  </div>
</main>

<script>
function toggleTheme(){
  var t = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('cur_theme',t);
  document.getElementById('themeIcon').textContent  = t==='dark'?'☀️':'🌙';
  document.getElementById('themeLabel').textContent = t==='dark'?'Light Mode':'Dark Mode';
}
(function(){
  var s = localStorage.getItem('cur_theme')||'dark';
  document.documentElement.setAttribute('data-theme',s);
  document.getElementById('themeIcon').textContent  = s==='dark'?'☀️':'🌙';
  document.getElementById('themeLabel').textContent = s==='dark'?'Light Mode':'Dark Mode';
})();

function runSync(){
  var btn = document.querySelector('.sync-btn');
  btn.textContent = '⏳ Syncing…';
  btn.disabled = true;
  var xhr = new XMLHttpRequest();
  xhr.open('POST','sync.php',true);
  xhr.setRequestHeader('Authorization','Bearer <?= htmlspecialchars($conn->query("SELECT token FROM api_authorization LIMIT 1")->fetch_assoc()['token'] ?? '') ?>');
  xhr.setRequestHeader('Content-Type','application/json');
  xhr.onreadystatechange = function(){
    if(xhr.readyState!==4) return;
    var d; try{d=JSON.parse(xhr.responseText);}catch(e){d={};}
    btn.textContent = '🔄 Re-sync All';
    btn.disabled = false;
    var msg = document.getElementById('syncMsg');
    msg.textContent = '✓ Synced: '+( d.payments_processed||0)+' payments, '+(d.invoices_updated||0)+' invoices updated';
    msg.style.display='inline';
    setTimeout(function(){ location.reload(); }, 1500);
  };
  xhr.send('{}');
}
</script>
</body>
</html>