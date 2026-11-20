import { useState } from "react";

// Hosts the standalone "all in one" management application inside the MIS shell.
// The iframe fills the whole <main> area (negative margins cancel the page
// gutters from MainLayout) and has no border, so it reads as part of the page.
// A background-coloured overlay covers it until the frame has loaded, then fades out.
const ALL_IN_ONE_URL = "https://cur.ac.rw/umis/documents/all_in_one/index.php";

export default function HrAllInOnePage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full -mx-5 sm:-mx-6 lg:-mx-8 -mb-6 bg-white dark:bg-ink-900">
      <div
        aria-hidden={loaded}
        className={`absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-ink-900 transition-opacity duration-300 ${
          loaded ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500 dark:border-ink-700" />
      </div>
      <iframe
        src={ALL_IN_ONE_URL}
        title="Management System"
        onLoad={() => setLoaded(true)}
        className={`block w-full h-full border-0 bg-white dark:bg-ink-900 transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
