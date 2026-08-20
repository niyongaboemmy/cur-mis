import { Outlet } from "react-router-dom";

export default function AdmissionsHub() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Outlet />
    </div>
  );
}
