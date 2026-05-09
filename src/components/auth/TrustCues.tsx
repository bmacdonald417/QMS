import { ShieldCheck, ClipboardList, GitBranch } from 'lucide-react';

/**
 * Three short trust cues shown beneath the BrandMark on the QMS auth left
 * panel. Per the research brief: ISO 9001/17025, 21 CFR Part 11 e-sign, and
 * change control — the headline value props of MacTech Quality. Do NOT swap
 * to clearD's "cleared talent" copy.
 */
const cues = [
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

export function TrustCues() {
  return (
    <div className="space-y-5">
      {cues.map((cue) => {
        const Icon = cue.icon;
        return (
          <div key={cue.title} className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#F1994C]/15 border border-[#F1994C]/30 flex items-center justify-center">
              <Icon className="w-5 h-5 text-[#F2A65A]" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{cue.title}</p>
              <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{cue.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
