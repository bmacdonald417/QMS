/**
 * Status pill for QMS Document.status and ExternalSubmissionStatus values.
 *
 * Distinct from the smaller-domain StatusPill which only covers the four
 * CmmcDocument states. This one handles the full Document workflow plus the
 * external-submission state machine, mapping every value to the same
 * three-tier color language used across the system surface:
 *
 *   green muted  → live / approved / released
 *   amber muted  → in-flight / under review / pending
 *   red muted    → rejected
 *   muted gray   → draft / archived / unknown
 */
type Tone = 'green' | 'amber' | 'red' | 'muted';

// Token names refer to the shadcn-style HSL CSS variables shipped by the
// obsidian + copper design system in tailwind.config.js. Legacy aliases
// (compliance.green-muted, surface.overlay, etc.) still resolve, but new
// code uses the canonical names directly.
const TONES: Record<Tone, string> = {
  green: 'bg-success/15 text-success ring-1 ring-inset ring-success/30',
  amber: 'bg-warning/10 text-warning ring-1 ring-inset ring-warning/30',
  red:   'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/30',
  muted: 'bg-secondary text-gray-400 ring-1 ring-inset ring-border',
};

function classify(status: string): Tone {
  switch (status) {
    case 'EFFECTIVE':
    case 'APPROVED':
    case 'QUALITY_RELEASED':
      return 'green';
    case 'IN_REVIEW':
    case 'AWAITING_APPROVAL':
    case 'PENDING_APPROVAL':
    case 'PENDING_QUALITY_RELEASE':
    case 'PENDING_REVIEW':
    case 'UNDER_REVIEW':
      return 'amber';
    case 'REJECTED':
      return 'red';
    case 'DRAFT':
    case 'OBSOLETE':
    case 'ARCHIVED':
    default:
      return 'muted';
  }
}

interface DocStatusBadgeProps {
  status: string;
  className?: string;
}

export function DocStatusBadge({ status, className = '' }: DocStatusBadgeProps) {
  const tone = classify(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide ${TONES[tone]} ${className}`}
    >
      {status}
    </span>
  );
}

export const __testing = { classify };
