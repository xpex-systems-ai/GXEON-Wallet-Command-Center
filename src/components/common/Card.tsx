import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'orange' | 'cyan' | 'none';
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glow = 'none',
  onClick,
}) => {
  const glowClass =
    glow === 'orange'
      ? 'hover:border-[#FF7A00]/50 hover:shadow-glow-orange'
      : glow === 'cyan'
      ? 'hover:border-[#00D4FF]/50 hover:shadow-glow-cyan'
      : '';

  return (
    <div
      onClick={onClick}
      className={`bg-[#111C30]/80 backdrop-blur-md border border-[#1E314F] rounded-xl p-5 transition-all duration-200 ${glowClass} ${className}`}
    >
      {children}
    </div>
  );
};
