import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PlaceholderPageProps {
  title: string;
  description: string;
  /** Optional decorative icon. Defaults to a Sparkles glyph. */
  icon?: ReactNode;
  /** Optional CTA. `to` renders a router Link; `onClick` renders a button. */
  cta?:
    | { label: string; to: string }
    | { label: string; onClick: () => void };
}

/**
 * Modernized empty/coming-soon state — copper-tinted brand chip + headline +
 * 1–2 sentence body + optional CTA, on a soft gridded card. Mirrors the
 * MacTech suite empty-state vocabulary.
 *
 * Routes through this: /team-training, /approvals (legacy), /my-tasks,
 * /my-training, plus any future placeholder routes. Real empty states inside
 * tables should use `<TableEmpty>` from `@/components/ui/table`.
 */
export function PlaceholderPage({
  title,
  description,
  icon,
  cta,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-60 pointer-events-none" />
        <CardContent className="relative z-10 p-10 sm:p-14 flex flex-col items-center text-center">
          <div
            className="brand-mark-chip flex h-14 w-14 items-center justify-center rounded-xl mb-6 [&_svg]:h-6 [&_svg]:w-6"
            aria-hidden
          >
            {icon ?? <Sparkles />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
            {description}
          </p>
          {cta && (
            <div className="mt-6">
              {'to' in cta ? (
                <Button asChild>
                  <Link to={cta.to}>{cta.label}</Link>
                </Button>
              ) : (
                <Button onClick={cta.onClick}>{cta.label}</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
