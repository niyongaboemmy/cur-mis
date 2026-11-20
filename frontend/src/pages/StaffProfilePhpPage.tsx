// Hosts the staff profile PHP page inside the MIS shell, the same way the
// Finance Overview hosts its PHP dashboard. The iframe fills the content area
// under the top bar and beside the sidebar. The negative margins cancel the
// page gutters from MainLayout.
const STAFF_PROFILE_URL = "https://cur.ac.rw/umis/documents/all_in_one/index.php?aio_m=hr&aio_p=my_profile.php";

export default function StaffProfilePhpPage() {
  return (
    <div className="h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6">
      <iframe
        src={STAFF_PROFILE_URL}
        title="Staff Profile"
        className="block w-full h-full border-0 bg-white"
      />
    </div>
  );
}
