// Hosts the standalone PHP finance dashboard inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const DASHBOARD_PHP_URL = "https://cur.ac.rw/umis/finance/dashboard.php";

export default function DashboardPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={DASHBOARD_PHP_URL}
        title="Finance Dashboard"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
