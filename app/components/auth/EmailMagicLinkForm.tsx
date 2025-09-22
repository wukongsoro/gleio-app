import React, { useState } from 'react';
import { classNames as cn } from '~/utils/classNames';

interface EmailMagicLinkFormProps {
  onSubmit: (email: string) => Promise<void> | void;
  isLoading?: boolean;
  error?: string;
  successMessage?: string;
  className?: string;
}

export function EmailMagicLinkForm({
  onSubmit,
  isLoading = false,
  error,
  successMessage,
  className
}: EmailMagicLinkFormProps) {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isLoading) return;

    try {
      await onSubmit(email.trim());
      setIsSubmitted(true);
    } catch (err) {
      // Error is handled by parent component via error prop
    }
  };

  if (isSubmitted && successMessage) {
    return (
      <div className={cn("text-center space-y-4", className)}>
        <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Check your email
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {successMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white dark:bg-[#1a1a1a] text-gray-500 dark:text-gray-400">
            or
          </span>
        </div>
      </div>

      {/* Email Input */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          disabled={isLoading}
          className={cn(
            "w-full h-11 px-4 rounded-xl border",
            "bg-white dark:bg-gray-800",
            "border-gray-300 dark:border-gray-600",
            "text-gray-900 dark:text-white",
            "placeholder:text-gray-500 dark:placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-200"
          )}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !email.trim()}
        className={cn(
          "w-full h-11 flex items-center justify-center",
          "bg-black dark:bg-white text-white dark:text-black",
          "rounded-xl font-medium text-sm",
          "hover:bg-gray-800 dark:hover:bg-gray-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors duration-200"
        )}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Sending link...
          </div>
        ) : (
          'Send magic link'
        )}
      </button>
    </form>
  );
}
