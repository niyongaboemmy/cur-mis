import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ResponsibilityRole } from "@/services/hrService";
import { parseRoleCodes } from "@/utils/payrollCalc";

/**
 * One select per responsibility. Someone can hold several (CUR procedure, step 5),
 * so each extra role gets its own window. The value passed up is a comma-separated
 * list of codes; empty windows exist only here until a role is picked.
 */
export default function ResponsibilityRolesInput({
  value,
  onChange,
  roles,
}: {
  value: string;
  onChange: (value: string) => void;
  roles: ResponsibilityRole[];
}) {
  const [windows, setWindows] = useState<string[]>(() => {
    const codes = parseRoleCodes(value);
    return codes.length > 0 ? codes : [""];
  });

  // Follow changes made from outside (for example when another employee is opened).
  useEffect(() => {
    const incoming = parseRoleCodes(value);
    const current = parseRoleCodes(windows.join(","));
    if (incoming.join(",") !== current.join(",")) {
      setWindows(incoming.length > 0 ? incoming : [""]);
    }
  }, [value]);

  const commit = (next: string[]) => {
    setWindows(next);
    onChange(parseRoleCodes(next.join(",")).join(","));
  };

  const update = (index: number, code: string) =>
    commit(windows.map((c, i) => (i === index ? code : c)));

  const remove = (index: number) => {
    const next = windows.filter((_, i) => i !== index);
    commit(next.length > 0 ? next : [""]);
  };

  const add = () => setWindows([...windows, ""]);

  return (
    <div className="space-y-2">
      {windows.map((code, index) => {
        // A role already picked in another window cannot be picked again here.
        const taken = windows.filter((c, i) => i !== index && c !== "");
        return (
          <div key={index} className="flex items-center gap-2">
            <select
              className="input text-[13px] flex-1 min-w-0"
              value={code}
              onChange={(e) => update(index, e.target.value)}
            >
              <option value="">None</option>
              {roles
                .filter((role) => !taken.includes(role.code))
                .map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.label} — {role.amount.toLocaleString("en-US")}
                  </option>
                ))}
            </select>
            {windows.length > 1 && (
              <button
                type="button"
                className="icon-btn text-red-500"
                onClick={() => remove(index)}
                aria-label="Remove responsibility"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn-secondary btn-sm gap-1.5 text-[12px]"
        onClick={add}
        disabled={windows.some((c) => c === "")}
      >
        <Plus className="w-3.5 h-3.5" /> Add another responsibility
      </button>
    </div>
  );
}
