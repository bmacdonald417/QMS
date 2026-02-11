import { type HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const variantMap = {
  default: 'bg-surface-elevated border border-surface-border shadow-depth-sm',
  elevated: 'bg-surface-overlay border border-surface-border shadow-depth-md',
  bordered: 'bg-surface-elevated border border-surface-border',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', children, ...props }, ref) => {
    const styles = `rounded-lg ${variantMap[variant]} ${paddingMap[padding]} ${className}`;
    return (
      <div ref={ref} className={styles} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({
  title,
  subtitle,
  action,
}) => (
  <div className="flex items-start justify-between gap-4 mb-4">
    <div>
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const CardSection: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <section className="mb-6 last:mb-0">
    <span className="label-caps block mb-2">{label}</span>
    {children}
  </section>
);
