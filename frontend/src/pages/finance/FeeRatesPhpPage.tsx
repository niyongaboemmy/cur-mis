// Hosts the standalone PHP fee-rates screen inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const FEE_RATES_PHP_URL = "https://cur.ac.rw/umis/finance/billing/bill_students.php";

export default function FeeRatesPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={FEE_RATES_PHP_URL}
        title="Fee Rates"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
