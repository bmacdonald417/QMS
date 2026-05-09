import { AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';

interface CalloutProps {
  type?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: React.ReactNode;
}

// Semantic-token palette. The brief forbids using blue alongside copper, so
// "info" reads as a neutral attention chip (muted surface + foreground), and
// warning/success/danger map onto the warning/success/destructive tokens.
const typeConfig = {
  info: {
    icon: Info,
    bg: 'bg-muted',
    border: 'border-border',
    text: 'text-foreground',
    iconColor: 'text-muted-foreground',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    text: 'text-warning',
    iconColor: 'text-warning',
  },
  success: {
    icon: CheckCircle,
    bg: 'bg-success/10',
    border: 'border-success/30',
    text: 'text-success',
    iconColor: 'text-success',
  },
  danger: {
    icon: XCircle,
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    text: 'text-destructive',
    iconColor: 'text-destructive',
  },
};

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.bg} ${config.border} p-4 my-4`}>
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          {title && <div className={`font-semibold ${config.text} mb-2`}>{title}</div>}
          <div className={config.text}>{children}</div>
        </div>
      </div>
    </div>
  );
}