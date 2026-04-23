import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  UserCircle,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Calendar,
  Pencil,
  Loader2,
  Eye,
  EyeOff,
  MapPin,
  Building2,
  GraduationCap,
  FileText,
  Upload,
  Camera,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { useCurrentUser } from "@/hooks/useAuth";
import Modal from "@/components/ui/Modal";
import userService from "@/services/userService";
import { applicantService } from "@/services/admissionService";

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { isLoading: authLoading } = useCurrentUser();
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: profileQ, isLoading: profileLoading } = useQuery({
    queryKey: ["applicant-profile"],
    queryFn: () => applicantService.getProfile(),
    enabled: user?.role === 'applicant',
  });

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => applicantService.uploadPhoto(file),
    onSuccess: (r) => {
      toast.success("Photo uploaded");
      if (r.data?.url) setPhotoUrl(r.data.url);
      qc.invalidateQueries({ queryKey: ["applicant-profile"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Upload failed"),
  });

  if (!user) return null;

  const profile = profileQ?.data?.profile;
  const displayPhoto =
    photoUrl ||
    profile?.profile_photo_url ||
    (profile?.profile_photo_id
      ? `${import.meta.env.VITE_API_URL || ""}/api/files/${profile.profile_photo_id}`
      : null);

  const initials = user.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* ─── Header card ─── */}
      <section className="card p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-primary" />
        <div className="relative flex flex-col md:flex-row md:items-end gap-5 pt-8 md:pt-14">
          <div className="relative group">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-brand dark:bg-brand-active flex items-center justify-center text-white text-3xl font-semibold shadow-card shrink-0 ring-4 ring-white dark:ring-ink-800 overflow-hidden">
              {displayPhoto ? (
                <img
                  src={displayPhoto}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            {user.is_applicant && (
              <>
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  ref={fileRef}
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      uploadPhoto.mutate(e.target.files[0]);
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadPhoto.isPending}
                  className="absolute bottom-1 right-1 p-1.5 rounded-lg bg-white dark:bg-ink-800 shadow-lg border border-ink-100 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:text-brand dark:hover:text-gold-400 transition-all opacity-0 group-hover:opacity-100"
                >
                  {uploadPhoto.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[24px] font-semibold text-ink-900 dark:text-white tracking-tight truncate">
              {user.full_name}
            </h1>
            <p className="text-ink-500 dark:text-ink-400 text-[13.5px] mt-1 truncate flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0" /> {user.email}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="chip-primary capitalize">
                <ShieldCheck className="w-3 h-3" /> {user.role ?? "member"}
              </span>
              {(user as any).is_active ? (
                <span className="chip-success">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="chip-soft">Disabled</span>
              )}
              {(user as any).username && (
                <span className="chip-soft">@{(user as any).username}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ─── Account details ─── */}
        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Account details</h2>
              <p className="section-sub">Your CUR-MIS profile information</p>
            </div>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Detail
              icon={UserCircle}
              label="Full name"
              value={user.full_name}
            />
            <Detail icon={Mail} label="Email" value={user.email} />
            <Detail
              icon={Phone}
              label="Phone"
              value={(user as any).phone || "—"}
            />
            <Detail
              icon={ShieldCheck}
              label="Role"
              value={
                <span className="capitalize">{user.role ?? "member"}</span>
              }
            />
            <Detail
              icon={Clock}
              label="Last login"
              value={fmt((user as any).last_login)}
            />
            <Detail
              icon={Calendar}
              label="Member since"
              value={fmt((user as any).created_at)}
            />
          </dl>

          {(authLoading || profileLoading) && (
            <p className="text-xs text-ink-400 mt-4 animate-pulse">
              Refreshing profile…
            </p>
          )}
        </section>

        {/* ─── Permissions ─── */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Permissions</h2>
              <p className="section-sub">What you can access</p>
            </div>
            <span className="chip-soft">{user.permissions?.length ?? 0}</span>
          </div>

          {user.permissions && user.permissions.length > 0 ? (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {user.permissions.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 text-[12.5px] text-ink-700 dark:text-ink-200"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <code className="font-mono">{p}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-500 text-[13px]">No permissions assigned.</p>
          )}
        </section>
      </div>

      {user.is_applicant && (
        <ApplicantSections
          profile={profile}
          application={profileQ?.data?.application}
        />
      )}

      {editOpen && (
        <EditProfileModal
          user={user}
          applicantProfile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setUser({ ...user, ...updated } as any);
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["applicant-profile"] });
          }}
        />
      )}
    </motion.div>
  );
}

/* ── Applicant specific sections ─────────────────────────────────────── */
function ApplicantSections({
  profile,
  application: app,
}: {
  profile?: any;
  application?: any;
}) {
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal / Location details */}
        <section className="card p-6">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand" />
            Personal & Location
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Detail
              icon={UserCircle}
              label="Middle Name"
              value={profile.middle_name || "—"}
            />
            <Detail
              icon={ShieldCheck}
              label="ID Details"
              value={`${profile.id_type || "N/A"}: ${profile.id_number || "—"}`}
            />
            <Detail
              icon={MapPin}
              label="Province"
              value={profile.province || "—"}
            />
            <Detail
              icon={MapPin}
              label="District"
              value={profile.district || "—"}
            />
            <Detail
              icon={Building2}
              label="Emergency Contact"
              value={profile.emergency_contact_name || "—"}
            />
            <Detail
              icon={Phone}
              label="Emergency Phone"
              value={profile.emergency_contact_phone || "—"}
            />
          </dl>
        </section>

        {/* Current Application details */}
        <section className="card p-6">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-brand" />
            Active Application
          </h2>
          {app ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between p-3 bg-brand/5 border border-brand/10 rounded-xl">
                <div>
                  <p className="text-[14px] font-semibold text-ink-900">
                    {app.department_name}
                  </p>
                  <p className="text-[12px] text-ink-500">
                    {app.faculty_name} • {app.intake}
                  </p>
                </div>
                <span className="chip-primary text-[10px]">{app.status}</span>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <Detail
                  icon={FileText}
                  label="App Number"
                  value={app.application_number}
                />
                <Detail
                  icon={ShieldCheck}
                  label="Doc Status"
                  value={app.document_status}
                />
              </dl>
            </div>
          ) : (
            <p className="text-[13px] text-ink-500">
              No active application found.
            </p>
          )}
        </section>
      </div>

      {/* Documents section link */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand" />
            Academic Documents
          </h2>
          <button
            className="btn-primary btn-sm"
            onClick={() => (window.location.href = "/applicant/documents")}
          >
            <Upload className="w-3.5 h-3.5" /> Go to Documents
          </button>
        </div>
        <p className="text-[13px] text-ink-500">
          Manage your high school transcripts, university degrees, and identity
          documents required for your current applications.
        </p>
      </section>
    </div>
  );
}

/* ── Edit profile modal ─────────────────────────────────────────────── */
function EditProfileModal({
  user,
  applicantProfile: ap,
  onClose,
  onSaved,
}: {
  user: any;
  applicantProfile?: any;
  onClose: () => void;
  onSaved: (updated: { full_name: string; email: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name ?? "",
    email: user.email ?? "",
    password: "",
    // Applicant fields
    middle_name: ap?.middle_name ?? "",
    id_type: ap?.id_type ?? "",
    id_number: ap?.id_number ?? "",
    province: ap?.province ?? "",
    district: ap?.district ?? "",
    sector: ap?.sector ?? "",
    emergency_contact_name: ap?.emergency_contact_name ?? "",
    emergency_contact_phone: ap?.emergency_contact_phone ?? "",
  });
  const [showPw, setShowPw] = useState(false);
  const [changePw, setChangePw] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      // 1. Update base user
      const userPayload: Record<string, string> = {
        full_name: form.full_name,
        email: form.email,
      };
      if (changePw && form.password) userPayload.password = form.password;
      await userService.updateUser(user.id, userPayload);

      // 2. Update applicant profile if applicable
      if (user.is_applicant) {
        await applicantService.updateProfile({
          middle_name: form.middle_name,
          id_type: form.id_type as any,
          id_number: form.id_number,
          province: form.province,
          district: form.district,
          sector: form.sector,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
        });
      }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      onSaved({ full_name: form.full_name, email: form.email });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to update profile"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit profile"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.full_name || !form.email}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Full name</label>
            <input
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Middle Name</label>
            <input
              className="input"
              value={form.middle_name}
              onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
            />
          </div>
        </div>

        {user.is_applicant && (
          <>
            <div className="border-t border-ink-100 pt-4">
              <h3 className="text-[13px] font-bold text-ink-900 dark:text-white mb-3">
                Identity & Location
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">ID type</label>
                  <select
                    className="input"
                    value={form.id_type}
                    onChange={(e) =>
                      setForm({ ...form, id_type: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="birth_certificate">Birth certificate</option>
                  </select>
                </div>
                <div>
                  <label className="label">ID number</label>
                  <input
                    className="input"
                    value={form.id_number}
                    onChange={(e) =>
                      setForm({ ...form, id_number: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Province</label>
                  <input
                    className="input"
                    value={form.province}
                    onChange={(e) =>
                      setForm({ ...form, province: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">District</label>
                  <input
                    className="input"
                    value={form.district}
                    onChange={(e) =>
                      setForm({ ...form, district: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-ink-100 pt-4">
              <h3 className="text-[13px] font-bold text-ink-900 dark:text-white mb-3">
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Contact Name</label>
                  <input
                    className="input"
                    value={form.emergency_contact_name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        emergency_contact_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Contact Phone</label>
                  <input
                    className="input"
                    value={form.emergency_contact_phone}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        emergency_contact_phone: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-ink-100 pt-4">
          <label className="flex items-center gap-2 text-[13px] text-ink-700 dark:text-ink-300 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={changePw}
              onChange={(e) => setChangePw(e.target.checked)}
            />
            Change password
          </label>
          {changePw && (
            <div className="mt-3 relative">
              <label className="label">New password</label>
              <input
                type={showPw ? "text" : "password"}
                className="input pr-9"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min. 8 characters"
              />
              <button
                type="button"
                className="absolute right-2.5 top-[calc(1.5rem+6px)] text-ink-400 hover:text-ink-600"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 shrink-0 rounded-md bg-primary-50 dark:bg-ink-700 text-brand dark:text-gold-400 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium text-ink-400 uppercase tracking-wider">
          {label}
        </dt>
        <dd className="text-[13.5px] text-ink-900 dark:text-ink-100 truncate">
          {value}
        </dd>
      </div>
    </div>
  );
}

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  try {
    const d = new Date(v.replace(" ", "T"));
    if (isNaN(d.getTime())) return v;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return v;
  }
}
