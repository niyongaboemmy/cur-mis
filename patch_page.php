<?php
$file = 'temp_page.tsx';
$content = file_get_contents($file);

$content = str_replace(
    "import type { AcMgmtEntity } from '@/types/academic'",
    "import type { AcMgmtEntity } from '@/types/academic'\nimport { CalendarDays } from 'lucide-react'",
    $content
);

$intakeCfg = <<<TS
      { key: 'is_paid',      label: 'Paid',         type: 'checkbox' },
    ],
  },
  {
    slug: 'intakes' as AcMgmtEntity, label: 'Intakes', singular: 'Intake', icon: CalendarDays, pk: 'id',
    columns: [
      { key: 'name',         label: 'Name' },
      { key: 'start_date',   label: 'Start Date' },
      { key: 'end_date',     label: 'End Date' },
      { key: 'is_active',    label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'name',         label: 'Name',       type: 'text', required: true, placeholder: 'January 2024' },
      { key: 'start_date',   label: 'Start Date', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
      { key: 'end_date',     label: 'End Date',   type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
      { key: 'is_active',    label: 'Active',     type: 'checkbox' },
    ],
  },
]
TS;

$content = str_replace(
    "      { key: 'is_paid',      label: 'Paid',         type: 'checkbox' },\n    ],\n  },\n]",
    $intakeCfg,
    $content
);

file_put_contents($file, $content);
