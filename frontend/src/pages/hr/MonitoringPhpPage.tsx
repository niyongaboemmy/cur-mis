// Hosts the standalone PHP monitoring dashboard inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const MONITORING_PHP_URL = "https://cur.ac.rw/umis/documents/all_in_one/index.php";

export default function MonitoringPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={MONITORING_PHP_URL}
        title="Monitoring Dashboard"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
