/**
 * Shared Clerk appearance object for QMS auth pages.
 *
 * Mirrors vetted/clearD's copper-on-graphite Clerk styling so users moving
 * between MacTech apps see consistent chrome. Copper accent (#F1994C) replaces
 * the prior Apple system blue (#007AFF). Primary buttons use near-black text
 * (#0A0A0A) on copper to meet WCAG AA — copper + white fails AA.
 */

export const ACCENT = '#F1994C';
export const ACCENT_HOVER = '#D87E36';
export const ACCENT_ACTIVE = '#B0651B';
export const ACCENT_HIGHLIGHT = '#F2A65A';
export const ACCENT_FOOTER_LINK = '#FFB078';
export const COPPER_FOREGROUND = '#0A0A0A';

export const clerkAppearance = {
  variables: {
    colorPrimary: ACCENT,
    colorTextOnPrimaryBackground: COPPER_FOREGROUND,
    colorBackground: '#121212',
    colorText: '#f3f4f6',
    colorTextSecondary: '#9ca3af',
    colorInputBackground: '#1A1A1A',
    colorInputText: '#f3f4f6',
    colorNeutral: '#ffffff',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox:
      'w-full bg-[#141414] border border-[#2A2A2A] rounded-xl shadow-lg shadow-black/40 p-7',
    card: 'shadow-none border-0 bg-transparent p-0 w-full',
    header: 'hidden',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    socialButtonsBlockButton:
      'h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] hover:bg-[#141414] hover:border-[#F1994C] text-gray-100 font-medium normal-case text-sm transition-colors',
    socialButtonsBlockButtonText: 'text-gray-100 font-medium text-sm',
    socialButtonsBlockButtonArrow: 'hidden',
    socialButtonsProviderIcon: 'h-5 w-5',
    dividerRow: 'my-5',
    dividerLine: 'bg-[#2A2A2A]',
    dividerText:
      'text-gray-500 text-[11px] uppercase tracking-[0.18em] font-medium px-3',
    formFieldLabel: 'text-gray-300 font-medium text-sm mb-1.5',
    formFieldInput:
      'h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] text-gray-100 placeholder:text-gray-500 hover:border-[#4A4A4A] focus:border-[#F1994C] focus:ring-2 focus:ring-[#F1994C]/30 transition-colors',
    formButtonPrimary:
      'h-12 rounded-lg bg-[#F1994C] hover:bg-[#D87E36] active:bg-[#B0651B] text-[#0A0A0A] font-semibold normal-case text-sm shadow-sm transition-colors',
    footerActionText: 'text-gray-400 text-sm',
    footerActionLink: 'text-[#F1994C] hover:text-[#FFB078] font-semibold',
    formResendCodeLink: 'text-[#F1994C] font-medium',
    formFieldAction: 'text-[#F1994C] font-medium',
    identityPreviewText: 'text-gray-300',
    identityPreviewEditButton: 'text-[#F1994C] font-medium',
    footer: 'hidden',
  },
} as const;
