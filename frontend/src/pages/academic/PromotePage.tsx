// Hosts the standalone PHP promotion tool inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const PROMOTE_PHP_URL = "https://cur.ac.rw/umis/documents/promote/index.php";

export default function PromotePage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={PROMOTE_PHP_URL}
        title="Promote students"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
