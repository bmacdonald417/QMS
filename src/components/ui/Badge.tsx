import { type HTMLAttributes } from 'react';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-overlay text-gray-300 border border-surface-border',
  success: 'bg-compliance-green-muted text-compliance-green border border-compliance-green/30',
  warning: 'bg-amber-500/15 text-compliance-amber border border-amber-500/30',
  danger: 'bg-compliance-red/15 text-compliance-red border border-compliance-red/30',
  info: 'bg-mactech-blue-muted text-mactech-blue border border-mactech-blue/30',
  neutral: 'bg-gray-600/20 text-gray-400 border border-gray-500/30',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md ${variantStyles[variant]} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
