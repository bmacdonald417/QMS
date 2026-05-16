import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import DOMPurify from 'dompurify';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import {
  CheckCircle2,
  ShieldCheck,
  FileText,
  Printer,
  ExternalLink,
} from 'lucide-react';

/**
 * Read-only "C3PAO presentation" view of a single document.
 *
 * Linked from the codex /dashboard/documents page's "Open in QMS" button.
 * Renders the doc's content (Markdown or sanitized HTML) with a clean,
 * paper-style light theme, plus a full provenance footer:
 *   - signature ledger (Reviewer + Approver + Quality Release)
 *   - SIA narrative
 *   - hash provenance
 *   - control mappings as chips
 *
 * No editing, no signing, no upload affordances. Optimized for printing.
 *
 * Routes:
 *   /documents/:id/view             — UUID-keyed
 *   /documents/by-code/:documentId/view — permalink shim (resolves to UUID)
 */

interface UserRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
}

interface SignatureRef {
  id: string;
  signatureMeaning: string;
  signedAt: string;
  documentHash?: string | null;
  signatureHash?: string | null;
  signer: UserRef;
}

interface DocumentViewModel {
  id: string;
  documentId: string;
  title: string;
  content: string | null;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: string;
  effectiveDate: string | null;
  releasedAt: string | null;
  releasedByUserId: string | null;
  releasedBy: UserRef | null;
  securityImpactAnalysis: string | null;
  securityImpactAnalysisAt: string | null;
  securityImpactAnalysisByUserId: string | null;
  securityImpactAnalysisBy: UserRef | null;
  author: UserRef;
  signatures: SignatureRef[];
  controlsMapped: string[];
  qmsHash?: string;
  recordVersion?: number;
}

// Per the brief: only one accent (copper) is allowed for affordance, and
// state colors are reserved for green/amber/red. Reviewer/Approver are
// neutral procedural badges (subtle muted chip, distinguished by label),
// Quality Release is the "ready to ship" success state, and SIA Recorded
// is the "records-required attestation" warning state. Avoids both the
// blue/copper clash and the prior multi-hue legend.
const SIG_STYLES: Record<string, string> = {
  Reviewer: 'bg-gray-100 text-gray-800 ring-gray-200',
  Approver: 'bg-gray-100 text-gray-900 ring-gray-300',
  'Quality Release': 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'SIA Recorded': 'bg-amber-50 text-amber-800 ring-amber-200',
};

const ALLOWED_HTML_TAGS = [
  'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'hr',
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}
function shortHash(h: string | null | undefined, n = 16): string {
  if (!h) return '—';
  const cleaned = h.replace(/^sha256:/, '');
  return cleaned.length > n ? `${cleaned.slice(0, n)}…` : cleaned;
}
function fullName(u: UserRef | null | undefined): string {
  if (!u) return '—';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email || u.id;
}

export default function DocumentView() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [doc, setDoc] = useState<DocumentViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setErr(null);
    apiRequest<{ document: DocumentViewModel }>(`/api/documents/${id}`, { token })
      .then((d) => setDoc(d.document))
      .catch((e) => {
        const status = (e as { status?: number } | null)?.status;
        if (status === 404) setErr('Document not found.');
        else setErr('Failed to load document.');
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  // Build the full CMMC L2 attestation chain. The SIA is NOT a 21 CFR
  // Part 11 e-signature (no password re-entry, no document_signatures
  // row), but it IS one of the four required CMMC attestations and an
  // auditor expects to see all four in one place. Synthesize an SIA
  // pseudo-row from the document's SIA fields so the auditor doesn't
  // have to context-switch between two sections to confirm SoD.
  type ChainRow = {
    kind: 'esig' | 'attestation';
    meaning: string;
    signer: UserRef | null;
    at: string | null;
    signatureHash: string | null;
    cmmcRef: string;
  };

  const chainRows = useMemo<ChainRow[]>(() => {
    if (!doc) return [];
    const rows: ChainRow[] = [];
    for (const s of doc.signatures) {
      rows.push({
        kind: 'esig',
        meaning: s.signatureMeaning,
        signer: s.signer,
        at: s.signedAt,
        signatureHash: s.signatureHash ?? null,
        cmmcRef:
          s.signatureMeaning === 'Reviewer'
            ? 'CM.L2-3.4.3 [b]'
            : s.signatureMeaning === 'Approver'
              ? 'CM.L2-3.4.3 [c]'
              : s.signatureMeaning === 'Quality Release'
                ? 'CM.L2-3.4.5'
                : '',
      });
    }
    if (doc.securityImpactAnalysis?.trim()) {
      rows.push({
        kind: 'attestation',
        meaning: 'SIA Recorded',
        signer: doc.securityImpactAnalysisBy,
        at: doc.securityImpactAnalysisAt,
        signatureHash: null, // not an e-sig — no password-bound hash
        cmmcRef: 'CM.L2-3.4.4',
      });
    }
    const order = (m: string) =>
      m === 'Reviewer' ? 0 : m === 'SIA Recorded' ? 1 : m === 'Approver' ? 2 : m === 'Quality Release' ? 3 : 4;
    return rows.sort(
      (a, b) =>
        order(a.meaning) - order(b.meaning) ||
        new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime(),
    );
  }, [doc]);

  // Subset used for the hash-provenance footer (e-sig only)
  const sortedSigs = useMemo(() => {
    if (!doc) return [];
    const order = (m: string) =>
      m === 'Reviewer' ? 0 : m === 'Approver' ? 1 : m === 'Quality Release' ? 2 : 3;
    return [...doc.signatures].sort(
      (a, b) =>
        order(a.signatureMeaning) - order(b.signatureMeaning) ||
        new Date(a.signedAt).getTime() - new Date(b.signedAt).getTime(),
    );
  }, [doc]);

  const isReleased = doc?.status === 'EFFECTIVE' && !!doc?.releasedAt;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 text-center text-sm text-gray-500">
        Loading document…
      </div>
    );
  }
  if (err) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 text-center">
        <p className="text-base font-semibold text-gray-900">{err}</p>
        <Link to="/documents" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to documents
        </Link>
      </div>
    );
  }
  if (!doc) return null;

  const contentTrimmed = (doc.content ?? '').trim();
  const looksLikeHtml = contentTrimmed.startsWith('<') && contentTrimmed.includes('>');

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Screen + print styles */}
      <style>{`
        /* ── Screen ───────────────────────────────────── */
        .doc-body table { border-collapse: collapse; width: 100%; margin: 1.25em 0; font-size: 0.875em; overflow-x: auto; display: block; }
        .doc-body thead { background: #f8fafc; }
        .doc-body th, .doc-body td { border: 1px solid #cbd5e1; padding: 8px 14px; text-align: left; vertical-align: top; }
        .doc-body th { font-weight: 600; color: #1e293b; background: #f1f5f9; white-space: nowrap; }
        .doc-body td { color: #334155; word-break: break-word; }
        .doc-body tbody tr:nth-child(even) { background: #f8fafc; }
        .doc-body tbody tr:hover { background: #eff6ff; }
        .doc-body code:not(pre code) { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0.1em 0.4em; font-size: 0.82em; color: #0f172a; }
        .doc-body pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1em 1.25em; overflow-x: auto; font-size: 0.82em; line-height: 1.6; }
        .doc-body blockquote { border-left: 3px solid #94a3b8; padding: 0.5em 1em; margin-left: 0; background: #f8fafc; border-radius: 0 6px 6px 0; color: #475569; }
        .doc-body ul, .doc-body ol { padding-left: 1.5em; margin: 0.5em 0; }
        .doc-body ul { list-style-type: disc; }
        .doc-body ol { list-style-type: decimal; }
        .doc-body li { margin: 0.3em 0; }
        .doc-body hr { border-color: #e2e8f0; }
        .doc-body h1 { font-size: 1.5em; font-weight: 700; color: #0f172a; margin: 1.5em 0 0.5em; }
        .doc-body h2 { font-size: 1.25em; font-weight: 600; color: #1e293b; margin: 1.25em 0 0.4em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25em; }
        .doc-body h3 { font-size: 1.1em; font-weight: 600; color: #1e293b; margin: 1em 0 0.35em; }
        .doc-body h4, .doc-body h5, .doc-body h6 { font-weight: 600; color: #334155; margin: 0.75em 0 0.25em; }
        .doc-body p { margin: 0.6em 0; line-height: 1.7; color: #1e293b; }
        .doc-body strong { color: #0f172a; }
        .doc-body a { color: #2563eb; text-decoration: underline; }

        /* ── Print / PDF ──────────────────────────────── */
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .doc-body table { display: table; width: 100%; font-size: 0.8em; }
          .doc-body th, .doc-body td { border: 1px solid #64748b !important; padding: 6px 10px !important; }
          .doc-body th { background: #e2e8f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .doc-body tbody tr:nth-child(even) { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .doc-body pre, .doc-body code { font-size: 0.75em; background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .doc-body blockquote { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .doc-body h1, .doc-body h2, .doc-body h3 { page-break-after: avoid; }
          table, figure { page-break-inside: avoid; }
          p { orphans: 3; widows: 3; }
          .doc-body h2 { border-bottom: 1px solid #94a3b8; }
        }
      `}</style>

      <div className="mx-auto max-w-4xl px-6 py-10 print:px-0 print:py-2">
        {/* Top action row (hidden in print) */}
        <div className="no-print mb-4 flex items-center justify-between text-sm">
          <Link to={`/documents/${doc.id}`} className="text-primary hover:underline">
            ← Open in editable QMS view
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="https://codex.mactechsolutionsllc.com/dashboard/documents"
              className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Codex bundle
            </a>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / PDF
            </button>
          </div>
        </div>

        {/* The document — paper card */}
        <article className="rounded-2xl border border-gray-200 bg-white shadow-sm print:border-0 print:shadow-none">
          {/* Header */}
          <header className="border-b border-gray-200 px-10 py-8 print:px-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-sm tracking-wide text-gray-500">
                {doc.documentId}
              </span>
              <span className="text-xs uppercase tracking-wider text-gray-400">
                Version {doc.versionMajor}.{doc.versionMinor}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-gray-900">
              {doc.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isReleased ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Effective · Released
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  {doc.status.replace(/_/g, ' ')}
                </span>
              )}
              <span className="text-xs uppercase tracking-wider text-gray-500">
                {doc.documentType.replace(/_/g, ' ').toLowerCase()}
              </span>
              {doc.controlsMapped.length > 0 && (
                <span className="ml-2 flex flex-wrap gap-1">
                  {doc.controlsMapped.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/20"
                      title={`This document backs CMMC L2 control ${c}`}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {/* Metadata grid */}
            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Author</dt>
                <dd className="mt-0.5 text-gray-800">{fullName(doc.author)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Effective date</dt>
                <dd className="mt-0.5 text-gray-800">{fmtDate(doc.effectiveDate ?? doc.releasedAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Released</dt>
                <dd className="mt-0.5 text-gray-800">{fmtDate(doc.releasedAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Released by</dt>
                <dd className="mt-0.5 text-gray-800">{fullName(doc.releasedBy)}</dd>
              </div>
            </dl>
          </header>

          {/* Body */}
          <section className="px-10 py-10 print:px-0">
            {looksLikeHtml ? (
              <div
                className="doc-body max-w-none text-sm leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(contentTrimmed, { ALLOWED_TAGS: ALLOWED_HTML_TAGS }),
                }}
              />
            ) : contentTrimmed ? (
              <div className="doc-body max-w-none text-sm leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
                >
                  {contentTrimmed}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="italic text-gray-500">No content recorded for this document.</p>
            )}
          </section>

          {/* Combined attestation ledger */}
          <section className="border-t border-gray-200 bg-gray-50/50 px-10 py-8 print:px-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-700">
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              Approval &amp; attestation chain · CMMC L2
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              All four CMMC L2 doc-control attestations. Reviewer, Approver, and Quality
              Release are 21 CFR Part 11 e-signatures (password-verified). SIA is recorded
              as an attributed audit-trail event per CM.L2-3.4.4 — not an e-signature, but
              required before approval.
            </p>
            {chainRows.length === 0 ? (
              <p className="mt-3 text-sm italic text-gray-500">
                No attestations recorded yet.
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Signer / recorder</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">At</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">CMMC ref</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {chainRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 align-top">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SIG_STYLES[r.meaning] ?? 'bg-gray-100 text-gray-700 ring-gray-200'}`}
                          >
                            {r.meaning}
                          </span>
                        </td>
                        <td className="px-4 py-2 align-top text-gray-900">
                          {fullName(r.signer)}
                        </td>
                        <td className="px-4 py-2 align-top whitespace-nowrap text-gray-700">
                          {fmtDateTime(r.at)}
                        </td>
                        <td className="px-4 py-2 align-top font-mono text-xs text-gray-700">
                          {r.cmmcRef || '—'}
                        </td>
                        <td className="px-4 py-2 align-top font-mono text-xs text-gray-500">
                          {r.kind === 'esig' ? (
                            <span title="21 CFR Part 11 e-signature hash">
                              {shortHash(r.signatureHash, 18)}
                            </span>
                          ) : (
                            <span className="italic text-gray-400" title="Audit-trail attestation, not an e-signature">
                              audit-trail event
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SIA narrative — prose body only; the recorder/timestamp/CMMC
              ref are already in the attestation chain table above. */}
          {doc.securityImpactAnalysis?.trim() && (
            <section className="border-t border-gray-200 px-10 py-8 print:px-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-700">
                <FileText className="h-4 w-4 text-gray-500" />
                Security Impact Analysis · narrative
              </h2>
              <p className="mt-1 text-[11px] text-gray-500">
                Recorded by{' '}
                <span className="font-medium text-gray-700">
                  {fullName(doc.securityImpactAnalysisBy)}
                </span>{' '}
                on {fmtDateTime(doc.securityImpactAnalysisAt)}. Per Separation of
                Duties (CMMC AC.L2-3.1.4 / AU.L2-3.3.9), the recorder must not be the
                document author or any reviewer.
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">
                {doc.securityImpactAnalysis}
              </pre>
            </section>
          )}

          {/* Hash provenance */}
          <footer className="border-t border-gray-200 px-10 py-6 text-xs text-gray-500 print:px-0">
            <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono">
              {doc.qmsHash && (
                <span>
                  <span className="uppercase tracking-wider text-gray-400">qms_hash</span>{' '}
                  {shortHash(doc.qmsHash, 24)}
                </span>
              )}
              {doc.recordVersion != null && (
                <span>
                  <span className="uppercase tracking-wider text-gray-400">record_version</span>{' '}
                  {doc.recordVersion}
                </span>
              )}
              {sortedSigs[0]?.documentHash && (
                <span>
                  <span className="uppercase tracking-wider text-gray-400">document_hash</span>{' '}
                  {shortHash(sortedSigs[0].documentHash, 24)}
                </span>
              )}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              This is a read-only audit-presentation view. The canonical record lives in
              the QMS document control system at{' '}
              <span className="font-mono">quality.mactechsolutionsllc.com/documents/{doc.id}</span>.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
