import { ReactNode } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "../ui/ThemeToggle";
import { APP_FULL_NAME, APP_TAGLINE } from "@/constants";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

const features = [
  "Centralised student & staff records",
  "Real-time academic reporting",
  "Role-based access control",
  "Secure, audit-ready data",
];

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex bg-[rgb(var(--bg-app))] dark:bg-ink-900 transition-colors duration-300">
      {/* ── Left brand panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col justify-between overflow-hidden bg-brand dark:bg-brand-active p-12">
        {/* Hero photograph — swap the file at /public/login-hero.jpg to change the photo. */}
        <img
          src="/login-hero.jpg"
          alt="Catholic University of Rwanda graduates"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
          loading="eager"
          fetchPriority="high"
        />

        {/* Navy brand overlay — keeps text readable and ties the photo to CUR's palette. */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800/95 via-primary-700/80 to-primary-600/60 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-900/90 via-transparent to-transparent" />

        <div className="relative z-10">
          <Logo to="/" size="xl" variant="light" />
        </div>

        <div className="relative z-10 space-y-10">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="mt-5 text-[32px] xl:text-[40px] font-semibold text-white leading-[1.1] tracking-tight">
              Faith. Learning. <br />
              <span className="text-gold-400">Service to Rwanda.</span>
            </h1>
            <p className="mt-4 text-primary-100 text-[14px] leading-relaxed max-w-md">
              {APP_FULL_NAME} — {APP_TAGLINE}. Manage academics, students, staff
              &amp; finance in one beautifully simple workspace.
            </p>
          </motion.div>

          <motion.ul
            className="space-y-2.5"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.25 } } }}
          >
            {features.map((f) => (
              <motion.li
                key={f}
                variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
                className="flex items-center gap-2.5 text-white/90 text-[13.5px]"
              >
                <CheckCircle2 className="w-4 h-4 text-gold-400 shrink-0" />
                {f}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <p className="relative z-10 text-primary-200/80 text-[12px]">
          © {new Date().getFullYear()} Catholic University of Rwanda. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative min-h-screen">
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
            <div className="lg:hidden mb-8">
              <Logo to="/" size="lg" />
            </div>

            <div className="mb-8">
              <h2 className="text-[24px] font-semibold text-ink-900 dark:text-white tracking-tight">
                {title}
              </h2>
              <p className="text-ink-500 dark:text-ink-400 mt-1 text-[13.5px]">
                {subtitle}
              </p>
            </div>

            {children}
          </motion.div>
        </div>

        {isDev && import.meta.env.VITE_API_DOCS_URL && (
          <footer className="p-4 border-t border-ink-100 dark:border-ink-700 text-center bg-white/50 dark:bg-ink-900/50 backdrop-blur-sm">
            <a
              href={import.meta.env.VITE_API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-primary-600 dark:text-ink-400 dark:hover:text-primary-400 transition-colors"
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
