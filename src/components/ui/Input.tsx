import React from 'react';
import { cn } from '../../utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
        <input
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors font-medium text-slate-900",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          {...props}
        />
        {error && <span className="text-[10px] text-red-500 font-bold uppercase">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
