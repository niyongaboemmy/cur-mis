// Hosts the standalone PHP "my payslips" page inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const MY_PAYSLIPS_PHP_URL = "https://cur.ac.rw/umis/documents/payroll/my_payslips.php";

export default function MyPayslipsPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={MY_PAYSLIPS_PHP_URL}
        title="My Payroll"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
