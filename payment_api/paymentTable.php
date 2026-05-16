<?php
// ── DB connection ─────────────────────────────────────────────────────────────
$host = 'localhost'; $user = 'curac_save'; $pass = 'curac_save'; $db = 'curac_save';
$conn = new mysqli($host, $user, $pass, $db);
$conn->set_charset('utf8mb4');

// ── Stats ─────────────────────────────────────────────────────────────────────
$stats = $conn->query("
    SELECT
        COUNT(*)                                      AS total_tx,
        COALESCE(SUM(CASE WHEN payment_notifi='Debit'  THEN amount END),0) AS total_in,
        COALESCE(SUM(CASE WHEN payment_notifi='Credit' THEN amount END),0) AS total_rev,
        COALESCE(SUM(CASE WHEN status=1               THEN amount END),0) AS confirmed,
        COALESCE(SUM(CASE WHEN status=0 AND payment_notifi='Debit' THEN amount END),0) AS pending
    FROM payment
")->fetch_assoc();

// ── Monthly chart data (last 6 months) ───────────────────────────────────────
$monthly = $conn->query("
    SELECT DATE_FORMAT(recorded_date,'%b %Y') AS mo,
           SUM(CASE WHEN payment_notifi='Debit' THEN amount ELSE 0 END) AS amt
    FROM payment
    WHERE recorded_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(recorded_date,'%Y-%m')
    ORDER BY MIN(recorded_date)
");
$months = []; $amounts = [];
while ($r = $monthly->fetch_assoc()) { $months[] = $r['mo']; $amounts[] = (float)$r['amt']; }

// ── Recent 50 payments ────────────────────────────────────────────────────────
$search  = trim($_GET['q'] ?? '');
$page    = max(1, (int)($_GET['p'] ?? 1));
$perPage = 15;
$offset  = ($page - 1) * $perPage;

$where = '';
$bind  = [];
$types = '';
if ($search !== '') {
    $like  = "%$search%";
    $where = "WHERE (p.student LIKE ? OR p.trans_code LIKE ? OR p.external_transaction_id LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)";
    $bind  = [$like,$like,$like,$like,$like];
    $types = 'sssss';
}

$countRow = $conn->query("SELECT COUNT(*) AS n FROM payment p LEFT JOIN student s ON s.regnumber=p.student $where" . ($types ? '' : ''));
// for search we need prepared count
if ($search !== '') {
    $stC = $conn->prepare("SELECT COUNT(*) AS n FROM payment p LEFT JOIN student s ON s.regnumber=p.student $where");
    $stC->bind_param($types, ...$bind);
    $stC->execute();
    $totalRows = $stC->get_result()->fetch_assoc()['n'];
    $stC->close();
} else {
    $totalRows = $conn->query("SELECT COUNT(*) AS n FROM payment p")->fetch_assoc()['n'];
}
$totalPages = max(1, ceil($totalRows / $perPage));

$sql = "SELECT p.*, CONCAT(COALESCE(s.fname,''),' ',COALESCE(s.lname,'')) AS full_name
        FROM payment p
        LEFT JOIN student s ON s.regnumber = p.student
        $where
        ORDER BY p.recorded_date DESC
        LIMIT $perPage OFFSET $offset";

if ($search !== '') {
    $stP = $conn->prepare($sql);
    $stP->bind_param($types, ...$bind);
    $stP->execute();
    $rows = $stP->get_result();
    $stP->close();
} else {
    $rows = $conn->query($sql);
}

function fmt($n){ return 'RWF '.number_format((float)$n,0,'.', ','); }
function ago($dt){
    $diff = time() - strtotime($dt);
    if($diff<60) return $diff.'s ago';
    if($diff<3600) return floor($diff/60).'m ago';
    if($diff<86400) return floor($diff/3600).'h ago';
    return floor($diff/86400).'d ago';
}
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CUR – Payment Dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
/* DARK (default) */
:root,[data-theme="dark"]{
  --bg:#0f1117;--card:#1a1d2e;--card2:#222538;--border:#2a2d45;
  --blue:#4f8ef7;--green:#22d3a5;--orange:#f97316;--red:#f43f5e;
  --purple:#a78bfa;--text:#e2e8f0;--muted:#64748b;--white:#fff;
  --shadow:0 2px 16px rgba(0,0,0,.35);
}
/* LIGHT */
[data-theme="light"]{
  --bg:#f1f5f9;--card:#ffffff;--card2:#f8fafc;--border:#e2e8f0;
  --blue:#2563eb;--green:#059669;--orange:#d97706;--red:#dc2626;
  --purple:#7c3aed;--text:#1e293b;--muted:#64748b;--white:#1e293b;
  --shadow:0 2px 12px rgba(0,0,0,.07);
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',Arial,sans-serif;font-size:14px;min-height:100vh;transition:background .25s,color .25s}

/* SIDEBAR */
.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:0;z-index:100}
.logo{padding:22px 20px 18px;border-bottom:1px solid var(--border)}
.logo h1{font-size:16px;font-weight:700;color:var(--blue);letter-spacing:.5px}
.logo span{font-size:11px;color:var(--muted)}
.nav{padding:16px 10px;flex:1}
.nav a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:13px;margin-bottom:2px;transition:.15s}
.nav a.active,.nav a:hover{background:var(--card2);color:var(--text)}
.nav a.active{color:var(--blue)}
.nav .ico{font-size:16px;width:20px;text-align:center}
.sidebar-foot{padding:16px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}

/* MAIN */
.main{margin-left:220px;padding:28px 28px 40px;min-height:100vh}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.topbar h2{font-size:20px;font-weight:600;color:var(--text)}
.topbar .meta{font-size:12px;color:var(--muted)}
.badge-live{display:inline-flex;align-items:center;gap:5px;background:#14532d;color:#4ade80;font-size:11px;padding:3px 10px;border-radius:999px}
.badge-live::before{content:'';width:6px;height:6px;background:#4ade80;border-radius:50%;animation:pulse 1.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* STAT CARDS */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;position:relative;overflow:hidden}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:14px 14px 0 0}
.stat.blue::before{background:var(--blue)}
.stat.green::before{background:var(--green)}
.stat.orange::before{background:var(--orange)}
.stat.purple::before{background:var(--purple)}
.stat .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.stat .value{font-size:22px;font-weight:700;color:var(--text);margin-bottom:4px}
.stat .sub{font-size:11px;color:var(--muted)}
.stat .icon{position:absolute;right:16px;top:16px;font-size:28px;opacity:.15}

/* GRID 2-COL */
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:24px}
.chart-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
.chart-card h3{font-size:13px;font-weight:600;color:var(--text);margin-bottom:16px}
.chart-wrap{height:200px;position:relative}

/* DONUT SIDE */
.donut-side{display:flex;flex-direction:column;gap:10px;padding-top:8px}
.donut-wrap{height:160px;position:relative;margin-bottom:8px}
.legend{display:flex;flex-direction:column;gap:6px}
.leg-row{display:flex;align-items:center;justify-content:space-between;font-size:12px}
.leg-dot{width:8px;height:8px;border-radius:50%;margin-right:6px;flex-shrink:0}
.leg-label{display:flex;align-items:center;color:var(--muted)}
.leg-val{color:var(--text);font-weight:500}

/* TABLE CARD */
.table-card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.table-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--border)}
.table-head h3{font-size:13px;font-weight:600;color:var(--text)}
.search-wrap{position:relative}
.search-wrap input{background:var(--card2);border:1px solid var(--border);color:var(--text);padding:7px 12px 7px 32px;border-radius:8px;font-size:12px;width:220px;outline:none}
.search-wrap input:focus{border-color:var(--blue)}
.search-wrap::before{content:'🔍';position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px}

table{width:100%;border-collapse:collapse}
thead tr{background:var(--card2)}
th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500;white-space:nowrap}
td{padding:11px 14px;border-top:1px solid var(--border);font-size:13px;vertical-align:middle}
tr:hover td{background:rgba(255,255,255,.02)}

.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:500}
.pill.debit{background:rgba(79,142,247,.15);color:var(--blue)}
.pill.credit{background:rgba(34,211,165,.15);color:var(--green)}
.pill.confirmed{background:rgba(34,211,165,.15);color:var(--green)}
.pill.pending{background:rgba(249,115,22,.15);color:var(--orange)}

.amount-pos{color:var(--green);font-weight:600}
.amount-neg{color:var(--red);font-weight:600}
.mono{font-family:monospace;font-size:12px;color:var(--muted)}
.student-name{font-weight:500;color:var(--text)}
.student-reg{font-size:11px;color:var(--muted)}

/* PAGINATION */
.pager{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-top:1px solid var(--border)}
.pager .info{font-size:12px;color:var(--muted)}
.pager-btns{display:flex;gap:4px}
.pager-btns a{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;font-size:12px;text-decoration:none;color:var(--muted);background:var(--card2);border:1px solid var(--border)}
.pager-btns a.active{background:var(--blue);color:#fff;border-color:var(--blue)}
.pager-btns a:hover:not(.active){background:var(--border);color:var(--text)}

.empty{text-align:center;padding:40px;color:var(--muted)}

.theme-btn{display:inline-flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap}
.theme-btn:hover{border-color:var(--blue);color:var(--blue)}
.theme-btn .t-icon{font-size:15px;display:inline-block;transition:transform .4s}
.theme-btn:hover .t-icon{transform:rotate(20deg)}
.sidebar{transition:background .25s,border-color .25s}
.stat{transition:background .25s,border-color .25s,transform .15s}
.stat:hover{transform:translateY(-2px)}
.chart-card,.table-card{transition:background .25s,border-color .25s}
@media(max-width:900px){
  .sidebar{display:none}
  .main{margin-left:0;padding:16px}
  .stats{grid-template-columns:1fr 1fr}
  .grid2{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- SIDEBAR -->
<aside class="sidebar">
  <div class="logo">
    <h1>🏦 CUR Finance</h1>
    <span>Payment Management</span>
  </div>
  <nav class="nav">
  <!--  <a href="payments_dashboard.php" class="active"><span class="ico">📊</span> Dashboard</a>-->
    <a href="apitest.html"><span class="ico">🧪</span> Test API</a>
   <!-- <a href="index.php"><span class="ico">⚡</span> API Status</a>
-->  </nav>
  <div class="sidebar-foot">curac_save · <?= date('d M Y') ?></div>
</aside>

<!-- MAIN -->
<main class="main">

  <!-- TOPBAR -->
  <div class="topbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:12px">
    <div>
      <h2 style="font-size:20px;font-weight:600;color:var(--text)">Payment Dashboard</h2>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">All transactions · curac_save.payment</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="badge-live">Live Data</span>
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtn">
        <span class="t-icon" id="themeIcon">☀️</span>
        <span id="themeLabel">Light Mode</span>
      </button>
    </div>
  </div>

  <!-- STAT CARDS -->
  <div class="stats">
    <div class="stat blue">
      <div class="icon">💳</div>
      <div class="label">Total Transactions</div>
      <div class="value"><?= number_format($stats['total_tx']) ?></div>
      <div class="sub">All records</div>
    </div>
    <div class="stat green">
      <div class="icon">💰</div>
      <div class="label">Total Received</div>
      <div class="value"><?= number_format($stats['total_in'],0) ?></div>
      <div class="sub">RWF · Debit entries</div>
    </div>
    <div class="stat orange">
      <div class="icon">⏳</div>
      <div class="label">Pending Amount</div>
      <div class="value"><?= number_format($stats['pending'],0) ?></div>
      <div class="sub">RWF · Awaiting confirmation</div>
    </div>
    <div class="stat purple">
      <div class="icon">✅</div>
      <div class="label">Confirmed Amount</div>
      <div class="value"><?= number_format($stats['confirmed'],0) ?></div>
      <div class="sub">RWF · Status = 1</div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="grid2">
    <div class="chart-card">
      <h3>📈 Monthly Payment Volume (RWF)</h3>
      <div class="chart-wrap">
        <canvas id="barChart"></canvas>
      </div>
    </div>
    <div class="chart-card">
      <h3>🍩 Transaction Breakdown</h3>
      <div class="donut-wrap">
        <canvas id="donut"></canvas>
      </div>
      <div class="legend">
        <div class="leg-row">
          <span class="leg-label"><span class="leg-dot" style="background:#4f8ef7"></span>Debit (In)</span>
          <span class="leg-val"><?= fmt($stats['total_in']) ?></span>
        </div>
        <div class="leg-row">
          <span class="leg-label"><span class="leg-dot" style="background:#f43f5e"></span>Credit (Reversed)</span>
          <span class="leg-val"><?= fmt($stats['total_rev']) ?></span>
        </div>
        <div class="leg-row">
          <span class="leg-label"><span class="leg-dot" style="background:#22d3a5"></span>Net Total</span>
          <span class="leg-val"><?= fmt($stats['total_in'] - $stats['total_rev']) ?></span>
        </div>
      </div>
    </div>
  </div>

  <!-- TABLE -->
  <div class="table-card">
    <div class="table-head">
      <h3>💳 Payment Records
        <span style="color:var(--muted);font-weight:400;margin-left:6px">(<?= number_format($totalRows) ?> total)</span>
      </h3>
      <form method="GET" class="search-wrap">
        <input name="q" value="<?= htmlspecialchars($search) ?>" placeholder="Search student, code, ref…"/>
      </form>
    </div>

    <?php if ($rows && $rows->num_rows > 0): ?>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Trans Code</th>
          <th>Student</th>
          <th>Amount</th>
          <th>Channel</th>
          <th>Type</th>
          <th>Status</th>
          <th>Purpose</th>
          <th>Date</th>
          <th>Recorded</th>
        </tr>
      </thead>
      <tbody>
        <?php $n = $offset+1; while($r = $rows->fetch_assoc()): ?>
        <tr>
          <td style="color:var(--muted);font-size:12px"><?= $n++ ?></td>
          <td class="mono"><?= htmlspecialchars($r['trans_code'] ?? '—') ?></td>
          <td>
            <div class="student-name"><?= trim($r['full_name']) !== '' ? htmlspecialchars(trim($r['full_name'])) : '—' ?></div>
            <div class="student-reg"><?= htmlspecialchars($r['student'] ?? '') ?></div>
          </td>
          <td class="<?= $r['payment_notifi']==='Credit' ? 'amount-neg' : 'amount-pos' ?>">
            <?= $r['payment_notifi']==='Credit' ? '−' : '+' ?><?= number_format((float)$r['amount'],0) ?> <span style="font-size:10px;color:var(--muted)">RWF</span>
          </td>
          <td><?= htmlspecialchars($r['payment_chanel'] ?? '—') ?></td>
          <td><span class="pill <?= strtolower($r['payment_notifi'] ?? 'debit') ?>"><?= htmlspecialchars($r['payment_notifi'] ?? '—') ?></span></td>
          <td>
            <?php $st = (int)$r['status']; ?>
            <span class="pill <?= $st===1 ? 'confirmed' : 'pending' ?>">
              <?= $st===1 ? '✓ Confirmed' : '⏳ Pending' ?>
            </span>
          </td>
          <td class="mono"><?= htmlspecialchars($r['fee_category'] ?? '—') ?></td>
          <td style="color:var(--muted);font-size:12px;white-space:nowrap"><?= htmlspecialchars($r['date'] ?? '—') ?></td>
          <td style="color:var(--muted);font-size:11px;white-space:nowrap" title="<?= htmlspecialchars($r['recorded_date'] ?? '') ?>">
            <?= $r['recorded_date'] ? ago($r['recorded_date']) : '—' ?>
          </td>
        </tr>
        <?php endwhile; ?>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <div class="pager">
      <div class="info">Showing <?= $offset+1 ?>–<?= min($offset+$perPage,$totalRows) ?> of <?= number_format($totalRows) ?></div>
      <div class="pager-btns">
        <?php if($page>1): ?><a href="?p=<?=$page-1?>&q=<?=urlencode($search)?>">‹</a><?php endif; ?>
        <?php
          $from=max(1,$page-2); $to=min($totalPages,$page+2);
          for($i=$from;$i<=$to;$i++):
        ?>
          <a href="?p=<?=$i?>&q=<?=urlencode($search)?>" class="<?=$i===$page?'active':''?>"><?=$i?></a>
        <?php endfor; ?>
        <?php if($page<$totalPages): ?><a href="?p=<?=$page+1?>&q=<?=urlencode($search)?>">›</a><?php endif; ?>
      </div>
    </div>

    <?php else: ?>
    <div class="empty">
      <?php if($search): ?>
        <div style="font-size:32px;margin-bottom:8px">🔍</div>
        No results for "<strong><?= htmlspecialchars($search) ?></strong>" — <a href="?" style="color:var(--blue)">clear search</a>
      <?php else: ?>
        <div style="font-size:32px;margin-bottom:8px">📭</div>
        No payment records yet. Use the <a href="apitest.html" style="color:var(--blue)">Test API</a> to add one.
      <?php endif; ?>
    </div>
    <?php endif; ?>
  </div>

</main>

<script>
var barChart, donutChart;
// Bar chart
const ctx1 = document.getElementById('barChart').getContext('2d');
barChart = new Chart(ctx1, {
  type: 'bar',
  data: {
    labels: <?= json_encode($months) ?>,
    datasets: [{
      label: 'RWF',
      data: <?= json_encode($amounts) ?>,
      backgroundColor: 'rgba(79,142,247,0.7)',
      borderColor: '#4f8ef7',
      borderWidth: 1,
      borderRadius: 6,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#2a2d45' }, ticks: { color: '#64748b', font: {size:11} } },
      y: { grid: { color: '#2a2d45' }, ticks: { color: '#64748b', font: {size:11},
           callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v } }
    }
  }
});

// Donut
const ctx2 = document.getElementById('donut').getContext('2d');
donutChart = new Chart(ctx2, {
  type: 'doughnut',
  data: {
    labels: ['Debit','Credit'],
    datasets: [{
      data: [<?= (float)$stats['total_in'] ?>, <?= (float)$stats['total_rev'] ?>],
      backgroundColor: ['#4f8ef7','#f43f5e'],
      borderColor: '#1a1d2e', borderWidth: 3,
      hoverOffset: 6
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    cutout: '72%',
    plugins: { legend: { display: false } }
  }
});


// ── Theme toggle ─────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cur_theme', theme);
  var isDark = theme === 'dark';
  document.getElementById('themeIcon').textContent  = isDark ? '☀️' : '🌙';
  document.getElementById('themeLabel').textContent = isDark ? 'Light Mode' : 'Dark Mode';

  // Update chart colors
  var gridCol  = isDark ? '#2a2d45' : '#e2e8f0';
  var tickCol  = isDark ? '#64748b' : '#94a3b8';
  var borderC  = isDark ? '#1a1d2e' : '#ffffff';

  if (barChart) {
    barChart.options.scales.x.grid.color = gridCol;
    barChart.options.scales.x.ticks.color = tickCol;
    barChart.options.scales.y.grid.color = gridCol;
    barChart.options.scales.y.ticks.color = tickCol;
    barChart.update();
  }
  if (donutChart) {
    donutChart.data.datasets[0].borderColor = borderC;
    donutChart.update();
  }
}

function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// Restore saved preference on load
(function(){
  var saved = localStorage.getItem('cur_theme') || 'dark';
  applyTheme(saved);
})();
</script>
</body>
</html>