import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  numInputs?: number;
  disabled?: boolean;
}

export default function OtpInput({ 
  value, 
  onChange, 
  numInputs = 6, 
  disabled = false 
}: OtpInputProps) {
  const [otp, setOtp] = useState<string[]>(new Array(numInputs).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync internal state with external value prop (for resend or reset cases)
  useEffect(() => {
    if (value === "") {
      setOtp(new Array(numInputs).fill(""));
    }
  }, [value, numInputs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value;
    if (isNaN(Number(val))) return;

    const newOtp = [...otp];
    // Take only the last character if multiple are entered
    newOtp[index] = val.substring(val.length - 1);
    setOtp(newOtp);
    onChange(newOtp.join(""));

    // Focus next input
    if (val && index < numInputs - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        // Move focus back if current is empty
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < numInputs - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const data = e.clipboardData.getData("text").trim();
    if (isNaN(Number(data))) return;

    const pasteData = data.substring(0, numInputs).split("");
    const newOtp = [...otp];
    
    pasteData.forEach((char, index) => {
      newOtp[index] = char;
    });

    setOtp(newOtp);
    onChange(newOtp.join(""));

    // Focus the last filled input or the last one overall
    const lastIndex = Math.min(pasteData.length, numInputs - 1);
    inputRefs.current[lastIndex]?.focus();
  };

  return (
    <div className="flex gap-2 sm:gap-4 justify-center">
      {otp.map((digit, index) => (
        <motion.input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          whileFocus={{ scale: 1.05 }}
          className={`
            w-10 h-12 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-semibold 
            rounded-xl border-2 transition-all duration-200 outline-none
            ${disabled ? "bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400" : 
              digit ? "border-primary-500 bg-primary-50/30 text-primary-900 ring-2 ring-primary-500/10" : 
              "border-gray-200 bg-white hover:border-gray-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:bg-gray-900 dark:border-gray-800 dark:text-white"}
          `}
        />
      ))}
    </div>
  );
}
