import React from 'react';
import { classNames as cn } from '~/utils/classNames';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ title, subtitle, children, className }: AuthCardProps) {
  return (
    <div className={cn(
      "relative w-full max-w-md mx-auto",
      "bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl",
      "border border-gray-200/50 dark:border-gray-700/50",
      "rounded-2xl shadow-2xl",
      "p-8",
      className
    )}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}
