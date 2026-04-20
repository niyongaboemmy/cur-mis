import { Outlet, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Menu, X } from "lucide-react";
import { useState } from "react";
import { APP_NAME } from "@/constants";
import UserDropdown from "@/components/layout/UserDropdown";

const navItems = [{ to: "/", icon: Home, label: "Dashboard" }];

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 shadow-xl border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <span className="text-xl font-bold text-primary-700">{APP_NAME}</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                 ${
                   isActive
                     ? "bg-primary-50 text-primary-700"
                     : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                 }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between px-4 lg:px-8 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
              Dashboard
            </h1>
          </div>

          <UserDropdown />
        </header>

        <motion.main
          key="outlet"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 p-6 dark:bg-black"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
