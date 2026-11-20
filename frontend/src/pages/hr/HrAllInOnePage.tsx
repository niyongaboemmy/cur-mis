// Hosts the standalone "all in one" HR application inside the MIS shell.
// Same embedding approach as PayrollPhpPage: the iframe fills the whole <main>
// area; negative margins cancel the page gutters from MainLayout.
const HR_ALL_IN_ONE_URL = "https://cur.ac.rw/umis/documents/all_in_one/index.php";

export default function HrAllInOnePage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={HR_ALL_IN_ONE_URL}
        title="Monitoring Dashboard"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
