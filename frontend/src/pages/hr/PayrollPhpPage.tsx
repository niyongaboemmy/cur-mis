// Hosts the standalone PHP payroll application inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const PAYROLL_PHP_URL = "https://cur.ac.rw/umis/documents/payroll/payroll.php";

export default function PayrollPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={PAYROLL_PHP_URL}
        title="Payroll System"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
