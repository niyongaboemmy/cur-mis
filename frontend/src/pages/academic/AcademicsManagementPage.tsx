import { useMemo } from 'react'
import { EntityCrudTabs, ENTITIES } from '@/components/academic/EntityCrudTabs'
import type { AcMgmtEntity } from '@/types/academic'

const ACADEMIC_SETTINGS_SLUGS: AcMgmtEntity[] = ['faculties', 'departments', 'options', 'modules']

export default function AcademicsManagementPage() {
  const systemEntities = useMemo(
    () => ENTITIES.filter((e) => !ACADEMIC_SETTINGS_SLUGS.includes(e.slug)),
    [],
  )

  return (
    <div className="max-w-[1400px] mx-auto">
      <EntityCrudTabs
        entities={systemEntities}
        defaultSlug="schools"
        ariaLabel="Settings sections"
      />
    </div>
  )
}
