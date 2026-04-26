import { SignUp, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, ClipboardList, GitBranch } from 'lucide-react';

const clerkAppearance = {
  variables: {
    colorPrimary: '#007AFF',
    colorTextOnPrimaryBackground: '#ffffff',
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
    cardBox: 'w-full shadow-none border-0 bg-transparent p-0',
    card: 'shadow-none border-0 bg-transparent p-0 w-full',
    header: 'hidden',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    socialButtonsBlockButton:
      'h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] hover:bg-[#141414] hover:border-[#007AFF] text-gray-100 font-medium normal-case text-sm transition-colors',
    socialButtonsBlockButtonText: 'text-gray-100 font-medium text-sm',
    socialButtonsBlockButtonArrow: 'hidden',
    socialButtonsProviderIcon: 'h-5 w-5',
    dividerRow: 'my-5',
    dividerLine: 'bg-[#2A2A2A]',
    dividerText: 'text-gray-500 text-[11px] uppercase tracking-[0.18em] font-medium px-3',
    formFieldLabel: 'text-gray-300 font-medium text-sm mb-1.5',
    formFieldInput:
      'h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] text-gray-100 placeholder:text-gray-500 hover:border-[#4A4A4A] focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/30 transition-colors',
    formButtonPrimary:
      'h-12 rounded-lg bg-[#007AFF] hover:bg-[#0066D6] active:bg-[#0056B3] text-white font-semibold normal-case text-sm shadow-sm transition-colors',
    footerActionText: 'text-gray-400 text-sm',
    footerActionLink: 'text-[#3B9DFF] hover:text-[#5BB0FF] font-semibold',
    footer: 'hidden',
  },
} as const;

const trustCues = [
  {
    icon: ShieldCheck,
    title: 'ISO 9001 + 17025 quality system',
    body: 'Document control, CAPA workflow, audit management, supplier quality, and equipment lifecycle — built around the standards your auditor expects.',
  },
  {
    icon: ClipboardList,
    title: 'Electronic signatures with provenance',
    body: '21 CFR Part 11–style e-sign on every controlled document, CAPA closure, and change control. Audit trail captures who, what, when, and why.',
  },
  {
    icon: GitBranch,
    title: 'Change control built for regulated work',
    body: 'Initiator, owner, approver flow with task assignments, periodic reviews, and a full revision history per document.',
  },
];

export function SignUpPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex bg-[#0A0A0A] text-gray-100">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#04060a] via-[#0a1018] to-[#0a1422] relative overflow-hidden border-r border-[#1a2436]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,122,255,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(0,122,255,.09)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-[#007AFF]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-[#007AFF]/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between px-12 xl:px-16 py-16 w-full">
          <div>
            <img
              src="/mactech.png"
              alt="MacTech Solutions"
              className="h-12 xl:h-14 w-auto object-contain object-left mb-8 invert"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#007AFF] mb-3">
              Quality Management System
            </p>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
              The quality system
              <br />
              auditors trust.
            </h1>
            <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-md">
              ISO 9001 / 17025 aligned document control, CAPA, audits, change control, and competency tracking for regulated work.
            </p>
          </div>

          <div className="space-y-5">
            {trustCues.map((cue) => {
              const Icon = cue.icon;
              return (
                <div key={cue.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#007AFF]/15 border border-[#007AFF]/30 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#3B9DFF]" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{cue.title}</p>
                    <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{cue.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-500">
            mactechsolutionsllc.com · Veteran-owned · SDVOSB-certified
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 -mx-4 sm:-mx-6 -mt-2 px-4 sm:px-6 pt-6 pb-8 rounded-b-xl bg-gradient-to-br from-[#050505] to-[#101010] border-b border-[#2A2A2A]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#007AFF] mb-2">
              MacTech Solutions · Quality Management System
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              The quality system auditors trust.
            </h1>
          </div>
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B9DFF] mb-2">
              Create account
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              MacTech Quality
            </h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Continue with Google or use your email below.
            </p>
          </div>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </div>
      </div>
    </div>
  );
}
