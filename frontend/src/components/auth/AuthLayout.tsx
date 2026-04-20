import { ReactNode } from "react";
import { motion } from "framer-motion";
import { CheckCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { APP_NAME } from "@/constants";
import ThemeToggle from "../ui/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

const features = [
  "Centralised records management",
  "Real-time reporting & analytics",
  "Role-based access control",
  "Secure, audit-ready data",
];

export default function AuthLayout({
  children,
  title,
  subtitle,
}: AuthLayoutProps) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* ── Left panel (branding) ──────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 p-12">
        {/* Animated Background Blobs */}
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, 20, 0], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -left-32 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 right-0 w-80 h-80 bg-primary-400/20 rounded-full blur-3xl pointer-events-none"
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/[0.03] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">
              {APP_NAME}
            </span>
          </Link>
        </div>

        <div className="relative z-10 space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight">
              Manage everything
              <br />
              <span className="text-primary-200">in one place.</span>
            </h1>
            <p className="mt-4 text-primary-200 text-lg leading-relaxed max-w-md">
              A modern management information system built for speed, security,
              and scale.
            </p>
          </motion.div>

          <motion.ul
            className="space-y-3"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: 0.1, delayChildren: 0.4 },
              },
            }}
          >
            {features.map((f) => (
              <motion.li
                key={f}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0 },
                }}
                className="flex items-center gap-3 text-white/80 text-sm"
              >
                <CheckCircle className="w-4 h-4 text-primary-300 flex-shrink-0" />
                {f}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <p className="relative z-10 text-primary-300/60 text-xs">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </div>

      {/* ── Right panel (content) ────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative min-h-screen">
        {/* Toggle in top right */}
        <div className="absolute top-4 right-4 z-50">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            {/* Mobile logo */}
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-lg">
                {APP_NAME}
              </span>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {title}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                {subtitle}
              </p>
            </div>

            {children}
          </motion.div>
        </div>

        {/* Footer for Dev Mode */}
        {isDev && import.meta.env.VITE_API_DOCS_URL && (
          <footer className="p-4 border-t border-gray-100 dark:border-gray-800 text-center bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <a
              href={import.meta.env.VITE_API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              API Documentation
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}
