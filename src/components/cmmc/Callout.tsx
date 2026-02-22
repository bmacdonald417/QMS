import { AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';

interface CalloutProps {
  type?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: React.ReactNode;
}

const typeConfig = {
  info: {
    icon: Info,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    iconColor: 'text-blue-400',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-300',
    iconColor: 'text-yellow-400',
  },
  success: {
    icon: CheckCircle,
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-300',
    iconColor: 'text-green-400',
  },
  danger: {
    icon: XCircle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-300',
    iconColor: 'text-red-400',
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