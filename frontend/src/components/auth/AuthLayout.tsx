import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "../ui/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export default function AuthLayout({
  children,
  title,
  subtitle,
}: AuthLayoutProps) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex bg-[rgb(var(--bg-app))] dark:bg-ink-900 transition-colors duration-300">
      {/* ── Left brand panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col justify-between overflow-hidden bg-brand dark:bg-brand-active p-12">
        {/* Hero photograph — swap the file at /public/login-hero.jpg to change the photo. */}
        <img
          src="https://cur.ac.rw/mis/main/img/4c4eb882b016f9df1f03c4d661d37bb9.png"
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
              Message from the Rector
            </h1>
            <p className="mt-4 text-white/90 text-[15px] xl:text-[16px] leading-relaxed max-w-lg">
             Welcome to our university. We provide a supportive learning environment focused on academic excellence, innovation, and personal growth. Join our vibrant community as we help shape the leaders of tomorrow.

            </p>
          </motion.div>
        </div>

        <p className="relative z-10 text-primary-200/80 text-[12px] pb-10">
          © {new Date().getFullYear()} Catholic University of Rwanda. All rights
          reserved.
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative min-h-screen">
        <div className="absolute top-4 right-4 z-50">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-24">
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
          <footer className="p-4 border-t border-ink-100 dark:border-ink-700 text-center bg-white/50 dark:bg-ink-900/50 backdrop-blur-sm pb-[52px]">
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

      {/* ── Account Info Banner ──────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0c3966] py-2 px-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm sm:text-[14px] border-t-2 border-[#164e87] shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
        <span className="text-xl">💳</span>
        <div className="flex items-center flex-wrap justify-center gap-x-2">
          <span className="text-gold-400 font-bold uppercase tracking-wider">
            Equity Bank:
          </span>
          <span className="text-white font-bold tracking-wide">
            4009201274006
          </span>
          <span className="text-white/60 mx-1 hidden sm:inline">|</span>
          <span className="text-gold-400 font-bold uppercase tracking-wider">
            Bank of Kigali:
          </span>
          <span className="text-white font-bold tracking-wide">
            100239674199
          </span>
          <span className="text-white/60 mx-1 hidden sm:inline">|</span>
          <span className="text-white font-bold tracking-wider">
            CUR-KIGALI-CAMPUS
          </span>
        </div>
        <span className="text-xl">💳</span>
      </div>
    </div>
  );
}
