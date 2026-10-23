// Hosts the CUR documents portal inside the MIS shell. The iframe fills the
// content area under the top bar and beside the sidebar, like the Payroll page.
// The negative margins cancel the page gutters from MainLayout.
const DOCUMENTS_PORTAL_URL = "https://cur.ac.rw/umis/documents/";

export default function DocumentGenerationPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={DOCUMENTS_PORTAL_URL}
        title="CUR Documents Portal"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
