import React from 'react';
import { cn } from '../../utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest",
        {
          'bg-slate-100 text-slate-800': variant === 'default',
          'bg-emerald-100 text-emerald-800 border border-emerald-200': variant === 'success',
          'bg-amber-100 text-amber-800 border border-amber-200': variant === 'warning',
          'bg-red-100 text-red-800 border border-red-200': variant === 'danger',
          'bg-blue-100 text-blue-800 border border-blue-200': variant === 'info',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
