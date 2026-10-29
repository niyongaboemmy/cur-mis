// Hosts the standalone PHP leave requests and approvals screen inside the MIS shell.
// The iframe fills the whole <main> area: negative margins cancel the page
// gutters from MainLayout, and h-full uses the column height it provides.
const LEAVE_REQUESTS_PHP_URL = "https://cur.ac.rw/umis/documents/payroll/login.php";

export default function LeaveRequestsPhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={LEAVE_REQUESTS_PHP_URL}
        title="All requests & Approval"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
