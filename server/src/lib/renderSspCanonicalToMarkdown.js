/**
 * Render a Codex SSP canonical-JSON payload into a single markdown
 * document suitable for QMS Document.content storage + the read-only
 * /documents/:id/view page.
 *
 * Codex canonical JSON shape (from src/lib/ssp/generate.ts in the
 * codex repo):
 *   {
 *     organization, boundary, version_number, generated_from_snapshot_at,
 *     tally: {...},
 *     sections: [
 *       { kind, key, order, title, body_md, body_json?, citations?,
 *         aggregate_finding?, objective_verdicts?, met_via? },
 *       ...
 *     ]
 *   }
 *
 * Section kinds we render in order:
 *   system_id, scope, environment, connections, security_reqs,
 *   update_freq, control (110 of them, sorted by `order`), appendix
 */

const SECTION_LABELS = {
  system_id: 'System Identification',
  scope: 'System Scope',
  environment: 'Environment',
  connections: 'System Connections',
  security_reqs: 'Security Requirements Overview',
  update_freq: 'Plan Update Cadence',
  control: 'Control Implementations',
  appendix: 'Appendix',
};

function fmtTallyBlock(tally, controlsMapped) {
  if (!tally && !controlsMapped) return '';
  const lines = ['## Tally', ''];
  if (tally) {
    lines.push('| Field | Count |');
    lines.push('|---|---|');
    for (const [k, v] of Object.entries(tally)) {
      lines.push(`| \`${k}\` | ${v} |`);
    }
    lines.push('');
  }
  if (Array.isArray(controlsMapped) && controlsMapped.length > 0) {
    lines.push(`**Controls in scope:** ${controlsMapped.length} (${controlsMapped[0]} … ${controlsMapped[controlsMapped.length - 1]})`);
    lines.push('');
  }
  return lines.join('\n');
}

function fmtCitations(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return '';
  const lines = ['', '**Evidence citations:**', ''];
  for (const c of citations) {
    const id = c.evidenceId ?? c.evidence_id ?? '?';
    const kind = c.evidenceKind ?? c.evidence_kind ?? 'evidence';
    const sha = c.evidenceSha256 ?? c.evidence_sha256 ?? null;
    const objectives = Array.isArray(c.supportsObjectives ?? c.supports_objectives)
      ? (c.supportsObjectives ?? c.supports_objectives).join(', ')
      : '';
    const shaTail = sha ? ` · sha256:${String(sha).slice(0, 12)}…` : '';
    lines.push(`- ${kind} \`${id}\`${objectives ? ' — objectives: ' + objectives : ''}${shaTail}`);
    if (c.evidenceExcerpt ?? c.evidence_excerpt) {
      lines.push(`  > ${(c.evidenceExcerpt ?? c.evidence_excerpt).slice(0, 240)}`);
    }
  }
  return lines.join('\n');
}

function fmtObjectiveVerdicts(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return '';
  const lines = ['', '**Objective verdicts:**', ''];
  lines.push('| Objective | Verdict | Notes |');
  lines.push('|---|---|---|');
  for (const v of verdicts) {
    const objId = v.objective_id ?? v.objectiveId ?? '?';
    const verdict = v.verdict ?? '?';
    const notes = (v.notes ?? '').toString().replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
    lines.push(`| \`${objId}\` | ${verdict} | ${notes} |`);
  }
  return lines.join('\n');
}

function renderSection(section) {
  const title = section.title || section.key || section.kind || 'Section';
  const headingLevel = section.kind === 'control' ? '##' : '##';
  const lines = [`${headingLevel} ${title}`, ''];
  if (section.aggregate_finding) {
    lines.push(`**Aggregate finding:** \`${section.aggregate_finding}\``);
    lines.push('');
  }
  if (section.met_via) {
    lines.push(`**Met via:** \`${section.met_via}\``);
    lines.push('');
  }
  if (section.body_md) {
    lines.push(section.body_md.trim());
    lines.push('');
  }
  const objectives = fmtObjectiveVerdicts(section.objective_verdicts);
  if (objectives) lines.push(objectives, '');
  const citations = fmtCitations(section.citations);
  if (citations) lines.push(citations, '');
  return lines.join('\n');
}

/**
 * Render the full SSP canonical JSON to a markdown document.
 * @param {object} canonicalJson - The full Codex SSP canonical payload
 * @param {object} envelope - Optional envelope context (boundary_name, generated_at, payload_sha256, ssp_version_number)
 * @returns {string} markdown document body
 */
export function renderSspCanonicalToMarkdown(canonicalJson, envelope = {}) {
  if (!canonicalJson || typeof canonicalJson !== 'object') {
    return '<!-- Empty canonical SSP payload -->';
  }
  const out = [];
  const boundaryName = envelope.boundary_name ?? canonicalJson.boundary?.name ?? 'Unknown boundary';
  const orgName = canonicalJson.organization?.name ?? envelope.organization?.name ?? 'MacTech';
  const versionNumber = envelope.ssp_version_number ?? canonicalJson.version_number ?? '?';
  const generatedAt = envelope.generated_at ?? canonicalJson.generated_from_snapshot_at ?? null;
  const payloadSha256 = envelope.payload_sha256 ?? null;

  // Document header (front-matter style; ReactMarkdown renders cleanly).
  out.push(`# System Security Plan — ${boundaryName}`);
  out.push('');
  out.push(`**Organization:** ${orgName}  `);
  out.push(`**SSP version:** ${versionNumber}  `);
  if (generatedAt) out.push(`**Generated from snapshot at:** ${generatedAt}  `);
  if (payloadSha256) out.push(`**Canonical payload SHA-256:** \`${payloadSha256}\`  `);
  out.push('');
  out.push('> This document is the QMS-controlled record wrapper for an SSP authored in Trust Codex. The authoritative content (preserved verbatim below) is the canonical JSON the codex generator emitted at snapshot time. The QMS release chain (Reviewer → Approver → Quality Release) treated this content as the binding payload; the signature ledger at the page footer covers the exact bytes shown here.');
  out.push('');

  // Tally + controls roster summary
  const tallyBlock = fmtTallyBlock(canonicalJson.tally, envelope.controls_mapped);
  if (tallyBlock) {
    out.push(tallyBlock);
    out.push('');
  }

  // Sections — render in order; group by kind for headings.
  const sections = Array.isArray(canonicalJson.sections) ? canonicalJson.sections : [];
  // Sort by `order` numerically when present; falls back to source order.
  const sorted = [...sections].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });

  // Group by kind, emit kind heading once per kind family.
  const groupOrder = [
    'system_id', 'scope', 'environment', 'connections',
    'security_reqs', 'update_freq', 'control', 'appendix',
  ];
  const byKind = new Map();
  for (const s of sorted) {
    const kind = s.kind || 'other';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(s);
  }
  // Emit known kinds first, then any leftovers.
  const knownEmitted = new Set();
  for (const kind of groupOrder) {
    const group = byKind.get(kind);
    if (!group) continue;
    knownEmitted.add(kind);
    out.push('---', '');
    out.push(`# ${SECTION_LABELS[kind] ?? kind}`);
    out.push('');
    for (const s of group) {
      out.push(renderSection(s));
    }
  }
  for (const [kind, group] of byKind.entries()) {
    if (knownEmitted.has(kind)) continue;
    out.push('---', '');
    out.push(`# ${kind}`);
    out.push('');
    for (const s of group) out.push(renderSection(s));
  }

  return out.join('\n');
}
