// -----------------------------------------------------------------------------
// QMS UI primitives barrel.
//
// Two parallel families coexist here during the migration to obsidian + copper:
//
//   1. Legacy QMS primitives (PascalCase files: LegacyButton.tsx, LegacyCard.tsx,
//      etc.) — bespoke API with `variant="primary"`, `loading`, `leftIcon`,
//      `padding="md"`, etc. These are re-exported under their original names
//      (Button, Card, Badge, Input, Modal, Table) so the ~30 existing
//      consumers keep compiling. They render in copper because tailwind.config
//      remaps the legacy `mactech-blue / surface-* / compliance-*` aliases onto
//      the new HSL token contract.
//
//   2. shadcn-style primitives (lowercase files: button.tsx, card.tsx, etc.)
//      — composable subparts (`<Card><CardHeader><CardTitle>...</Card>`) ported
//      verbatim from /Users/patrick/vetted/components/ui/. New code SHOULD
//      import these directly from `@/components/ui/button` etc.; they are NOT
//      re-exported from this barrel to avoid name collisions with the legacy
//      family.
//
// As pages migrate to the shadcn primitives, the corresponding LegacyX import
// can be dropped from the page and the lowercase one imported instead.
// -----------------------------------------------------------------------------

export { Badge } from './LegacyBadge';
export type { BadgeProps, BadgeVariant } from './LegacyBadge';
export { Button } from './LegacyButton';
export type { ButtonProps, ButtonVariant } from './LegacyButton';
export { Card, CardHeader, CardSection } from './LegacyCard';
export type { CardProps } from './LegacyCard';
export { Input } from './LegacyInput';
export type { InputProps } from './LegacyInput';
export { Modal } from './LegacyModal';
export type { ModalProps } from './LegacyModal';
export { Table } from './LegacyTable';
export type { TableProps, Column } from './LegacyTable';
