import React, { useState, forwardRef } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  forgotPasswordLink?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, forgotPasswordLink, className = "", ...props }, ref) => {
    const [showPass, setShowPass] = useState(false);

    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <label className="label mb-0" htmlFor={props.id || props.name}>
              {label}
            </label>
          )}
          {forgotPasswordLink && (
            <Link
              to={forgotPasswordLink}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
              tabIndex={-1}
            >
              Forgot password?
            </Link>
          )}
        </div>
        
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors pointer-events-none">
            <Lock className="h-4 w-4" />
          </div>
          
          <input
            {...props}
            ref={ref}
            type={showPass ? "text" : "password"}
            className={`input pl-10 pr-10 ${error ? "border-red-400 ring-1 ring-red-400 focus:ring-red-400" : ""} ${className}`}
          />
          
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
            tabIndex={-1}
            aria-label={showPass ? "Hide password" : "Show password"}
          >
            {showPass ? (
              <EyeOff className="h-4 w-4 animate-in fade-in duration-200" />
            ) : (
              <Eye className="h-4 w-4 animate-in fade-in duration-200" />
            )}
          </button>
        </div>
        
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="error-text overflow-hidden"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
