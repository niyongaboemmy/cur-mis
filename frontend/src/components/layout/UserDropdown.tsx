import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, LogOut, Sun, Moon, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useLogout } from "@/hooks/useAuth";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const logoutMutation = useLogout();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const userInitials = user?.full_name ? getInitials(user.full_name) : "U";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-all duration-200 focus:outline-none"
      >
        <div className="h-7 w-7 rounded-full bg-primary-600 dark:bg-primary-500 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
          {userInitials}
        </div>
        <div className="hidden md:block text-left mr-0.5">
          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 leading-none">
            {user?.full_name || "User"}
          </p>
          <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 capitalize leading-none">
            {user?.role || "Member"}
          </p>
        </div>
        <ChevronDown
          className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl glass overflow-hidden z-50 border border-gray-200/50 dark:border-gray-700/30"
          >
            {/* Header / Profile Info */}
            <div className="p-3.5 border-b border-gray-200/50 dark:border-gray-700/30 bg-gray-50/20 dark:bg-gray-900/30">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12px] font-bold text-gray-900 dark:text-white truncate">
                    {user?.full_name}
                  </h4>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                    {user?.email}
                  </p>
                  <span className="mt-1 inline-block px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-bold bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-1">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group"
              >
                <div className="p-1 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 group-hover:scale-105 transition-transform">
                  <User className="h-3 w-3" />
                </div>
                <span className="font-medium">My Profile</span>
              </button>

              {/* Theme Toggle Row */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400">
                    {theme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                  </div>
                  <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                    {theme === "dark" ? "Dark Mode" : "Light Mode"}
                  </span>
                </div>
                {/* Pill toggle */}
                <div
                  className={`relative flex items-center h-5 w-9 rounded-full transition-colors duration-300 shrink-0 ${
                    theme === "dark" ? "bg-primary-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute flex items-center justify-center h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-300 ease-in-out ${
                      theme === "dark" ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  >
                    {theme === "dark"
                      ? <Moon className="h-2 w-2 text-primary-600" />
                      : <Sun className="h-2 w-2 text-amber-400" />
                    }
                  </span>
                </div>
              </button>


              <div className="my-1 border-t border-gray-200/50 dark:border-gray-700/30" />

              <button
                onClick={() => {
                  setIsOpen(false);
                  logoutMutation.mutate();
                }}
                disabled={logoutMutation.isPending}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors group disabled:opacity-50"
              >
                <div className="p-1 rounded bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 group-hover:scale-105 transition-transform">
                  <LogOut className="h-3 w-3" />
                </div>
                <span className="font-medium">
                  {logoutMutation.isPending ? "Logging out..." : "Sign Out"}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
