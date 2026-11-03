// Hosts the standalone PHP finance application inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const BILLING_PHP_URL = "https://cur.ac.rw/umis/finance/billing/bill_students.php";

export default function BillingPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={BILLING_PHP_URL}
        title="Billing System"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
