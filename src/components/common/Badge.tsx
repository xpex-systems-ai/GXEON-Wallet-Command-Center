import React from 'react';

export type BadgeVariant =
  | 'cyan'
  | 'orange'
  | 'green'
  | 'amber'
  | 'red'
  | 'slate'
  | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'cyan',
  className = '',
  dot = false,
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dotColor: string }> = {
    cyan: {
      bg: 'bg-[#00D4FF]/10',
      text: 'text-[#00D4FF]',
      border: 'border-[#00D4FF]/30',
      dotColor: 'bg-[#00D4FF]',
    },
    orange: {
      bg: 'bg-[#FF7A00]/10',
      text: 'text-[#FF7A00]',
      border: 'border-[#FF7A00]/30',
      dotColor: 'bg-[#FF7A00]',
    },
    green: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      dotColor: 'bg-emerald-400',
    },
    amber: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      dotColor: 'bg-amber-400',
    },
    red: {
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      border: 'border-red-500/30',
      dotColor: 'bg-red-400',
    },
    slate: {
      bg: 'bg-slate-800/60',
      text: 'text-slate-300',
      border: 'border-slate-700',
      dotColor: 'bg-slate-400',
    },
    purple: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      dotColor: 'bg-purple-400',
    },
  };

  const style = variantStyles[variant] || variantStyles.cyan;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dotColor} animate-pulse`} />}
      {children}
    </span>
  );
};
