// SOURCE: codex repo @ 2161009 / docs/specs/governance-18-controls.json
//
// Vendored copy of the authoritative pure-governance CMMC L2 / NIST 800-171 R2
// control list. Codex side is canonical; bump this file (and the SOURCE sha
// above) when codex publishes a new version.
//
// Historical name "Governance-18" is legacy — the actual count is 17 after
// 3.4.3 was reclassified to hybrid. The codex's PURE_GOV_CONTROL_IDS constant
// in src/lib/governance/seed-data.ts is the authoritative count.

export const GOVERNANCE_CONTROLS_VERSION = '1.0.0';
export const GOVERNANCE_CONTROLS_LAST_UPDATED = '2026-05-05';

export const GOVERNANCE_CONTROLS = [
  { controlId: '3.1.4', family: 'AC', title: 'Separation of Duties' },
  { controlId: '3.2.1', family: 'AT', title: 'Security Awareness Training' },
  { controlId: '3.2.2', family: 'AT', title: 'Insider Threat Awareness' },
  { controlId: '3.2.3', family: 'AT', title: 'Insider Threat Training (Authorized)' },
  { controlId: '3.3.3', family: 'AU', title: 'Audit Reduction & Report Generation' },
  { controlId: '3.4.4', family: 'CM', title: 'Security Impact of Vendor Changes' },
  { controlId: '3.6.1', family: 'IR', title: 'Incident Response Capability' },
  { controlId: '3.6.2', family: 'IR', title: 'Incident Reporting' },
  { controlId: '3.6.3', family: 'IR', title: 'Incident Response Testing' },
  { controlId: '3.7.6', family: 'MA', title: 'Maintenance Personnel' },
  { controlId: '3.9.1', family: 'PS', title: 'Personnel Screening' },
  { controlId: '3.9.2', family: 'PS', title: 'Personnel Termination' },
  { controlId: '3.11.1', family: 'RA', title: 'Risk Assessment' },
  { controlId: '3.12.1', family: 'CA', title: 'Security Assessment' },
  { controlId: '3.12.2', family: 'CA', title: 'POA&M Management' },
  { controlId: '3.12.3', family: 'CA', title: 'Continuous Monitoring' },
  { controlId: '3.12.4', family: 'CA', title: 'System Security Plan' },
];

export const GOVERNANCE_CONTROL_IDS = new Set(GOVERNANCE_CONTROLS.map((c) => c.controlId));

export function isGovernanceControlId(controlId) {
  return GOVERNANCE_CONTROL_IDS.has(controlId);
}
