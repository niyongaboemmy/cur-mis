const fs = require('fs');
const file = '/Applications/MAMP/htdocs/cur-mis/frontend/src/pages/StudentsPage.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Import useCampusFilterStore and useState
code = code.replace(
  'import { useSystemStore } from "@/store/systemStore";',
  'import { useSystemStore } from "@/store/systemStore";\nimport { useCampusFilterStore } from "@/store/campusFilterStore";\nimport { useState } from "react";'
);

// 2. Add selectedCampus to StudentsPage
code = code.replace(
  'const selectedYear = useSystemStore((s) => s.selectedYearLabel);',
  'const selectedYear = useSystemStore((s) => s.selectedYearLabel);\n  const selectedCampus = useCampusFilterStore((s) => s.selectedCampusId);'
);

// 3. Update statsQ queryKey
code = code.replace(
  'queryKey: ["student-stats", selectedYear || "all"],',
  'queryKey: ["student-stats", selectedYear || "all", selectedCampus],'
);

// 4. Update AllTab to use selectedCampusId in listQ queryKey
code = code.replace(
  'const selectedYear = useSystemStore((s) => s.selectedYearLabel);',
  'const selectedYear = useSystemStore((s) => s.selectedYearLabel);\n  const selectedCampusId = useCampusFilterStore((s) => s.selectedCampusId);'
);

code = code.replace(
  'queryKey: ["students", listParams],',
  'queryKey: ["students", listParams, selectedCampusId],'
);

fs.writeFileSync(file, code);
