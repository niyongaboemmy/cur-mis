import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { User, LogOut, Sun, Moon, ChevronDown, Settings } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useLogout } from "@/hooks/useAuth";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate    = useNavigate();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const logoutMutation = useLogout();

  const go = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);

  const userInitials = user?.full_name ? getInitials(user.full_name) : "U";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 py-1 pl-1 pr-2.5 rounded-md hover:bg-ink-100 dark:hover:bg-ink-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        <div className="h-9 w-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-[12px]">
          {userInitials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-100 leading-tight">
            {user?.full_name ?? "User"}
          </p>
          <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5 capitalize leading-tight">
            {user?.role ?? "Member"}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-ink-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-72 rounded-lg shadow-card overflow-hidden z-[60] bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700"
          >
            {/* Profile header */}
            <div className="p-4 border-b border-ink-100 dark:border-ink-700">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-md bg-primary-600 flex items-center justify-center text-white text-[15px] font-semibold">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <h4 className="text-[14px] font-semibold text-ink-900 dark:text-white truncate">
                    {user?.full_name}
                  </h4>
                  <p className="text-[12px] text-ink-500 dark:text-ink-400 truncate">
                    {user?.email}
                  </p>
                  <span className="mt-1.5 inline-block chip-primary">
                    {user?.role ?? 'Member'}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu */}
            <div className="p-1.5">
              <MenuItem icon={<User     className="h-4 w-4" />} onClick={() => go('/profile')}>My profile</MenuItem>
              <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => go('/profile')}>Account settings</MenuItem>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {theme === "dark"
                    ? <Moon className="h-4 w-4 text-ink-500" />
                    : <Sun className="h-4 w-4 text-ink-500" />}
                  <span className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
                    {theme === "dark" ? "Dark mode" : "Light mode"}
                  </span>
                </div>
                <div
                  className={`relative flex items-center h-5 w-9 rounded-full transition-colors duration-200 shrink-0 ${
                    theme === "dark" ? "bg-primary-600" : "bg-ink-200"
                  }`}
                >
                  <span
                    className={`absolute h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
                      theme === "dark" ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  />
                </div>
              </button>

              <div className="my-1 border-t border-ink-100 dark:border-ink-700" />

              <button
                onClick={() => { setIsOpen(false); logoutMutation.mutate(); }}
                disabled={logoutMutation.isPending}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-[13px] font-medium">
                  {logoutMutation.isPending ? "Signing out…" : "Sign out"}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- tiny row --- */
function MenuItem({
  icon,
  children,
  onClick,
}: {
  icon:      React.ReactNode;
  children:  React.ReactNode;
  onClick?:  () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
    >
      <span className="text-ink-500 dark:text-ink-400">{icon}</span>
      <span className="text-[13px] font-medium">{children}</span>
    </button>
  );
}
