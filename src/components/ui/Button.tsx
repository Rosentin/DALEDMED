import React from 'react';
import { cn } from '../../utils';
import { motion, HTMLMotionProps } from 'motion/react';

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ opacity: 0.9, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-bold transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none uppercase tracking-wider",
          {
            'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40': variant === 'primary',
            'bg-slate-800 text-white hover:bg-slate-700': variant === 'secondary',
            'border-2 border-slate-200 bg-transparent text-slate-500 hover:bg-slate-50': variant === 'outline',
            'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
            
            'py-2 px-3 text-[10px]': size === 'sm',
            'py-3 px-4 text-xs': size === 'md',
            'py-4 px-6 text-sm': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
