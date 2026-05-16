import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a',
];

/**
 * Remove Related Documents and signature/document-control sections from content.
 * These are shown via Where Used and PDF approval/signature blocks instead.
 *
 * Boundary lookahead: `<h[1-6][\s>]` matches the next heading whether it carries
 * attributes (`<h2 class="...">`) or is bare (`<h2>`). The previous form
 * `<h[1-6]\s` required whitespace and silently swallowed the entire body when
 * the next heading was bare — symptom: EFFECTIVE doc renders as a blank box.
 */
function stripRelatedDocumentsAndSignatureSections(html: string): string {
  if (!html?.trim()) return html;
  let out = html;
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:\d+\.\s*)?Related\s+Documents\s*<\/h[1-6]>[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:\d+\.\s*)?Document\s+control\s*<\/h[1-6]>[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:Signature\s*&?\s*evidence|Signature|Approval)[\s\S]*?<\/h[1-6]>[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*Appendix\s+[A-Z]:\s*Related\s+Documents[\s\S]*?<\/h[1-6]>[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  out = out.replace(
    /<(p|div|table)[^>]*>[\s\S]*?Prepared\s+By[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  out = out.replace(
    /<(p|div)[^>]*>[\s\S]*?<strong>\s*Prepared\s+By\s*<\/strong>[\s\S]*?(?=<h[1-6][\s>]|$)/gi,
    ''
  );
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Convert HTML paragraphs with " - item" patterns into proper ul/li for correct alignment */
function convertHtmlParagraphsToLists(html: string): string {
  return html.replace(/<p>([\s\S]*?) - ([\s\S]+?)((?: - [\s\S]+?)+)<\/p>/g, (_match, intro, first, rest) => {
    const items = [first.trim(), ...(rest ? rest.split(/ - /).slice(1).map((s: string) => s.trim()).filter(Boolean) : [])];
    return intro.trim() ? `<p>${intro.trim()}</p><ul><li>${items.join('</li><li>')}</li></ul>` : `<ul><li>${items.join('</li><li>')}</li></ul>`;
  });
}

export interface DocumentContentRenderProps {
  content: string | null | undefined;
  className?: string;
}

/**
 * Renders document content: HTML (sanitized), or Markdown for legacy content.
 */
export function DocumentContentRender({ content, className = '' }: DocumentContentRenderProps) {
  if (content == null || content.trim() === '') {
    return <p className={`text-gray-400 ${className}`}>No content provided.</p>;
  }
  const trimmed = content.trim();
  const looksLikeHtml = trimmed.startsWith('<') && trimmed.includes('>');
  if (looksLikeHtml) {
    const stripped = stripRelatedDocumentsAndSignatureSections(trimmed);
    const withLists = convertHtmlParagraphsToLists(stripped);
    const sanitized = DOMPurify.sanitize(withLists, { ALLOWED_TAGS });
    return (
      <>
        <div
          className={`document-content prose prose-invert max-w-none break-words prose-p:text-gray-200 prose-headings:text-white prose-table:text-gray-200 ${className}`}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
        <style>{`
          .document-content { overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; }
          .document-content ul, .document-content ol { margin: 0.5em 0 0.5em 1.5em; padding-left: 2em; list-style-position: outside; }
          .document-content ul { list-style-type: disc; }
          .document-content ol { list-style-type: decimal; }
          .document-content li { margin: 0.25em 0; padding-left: 0.25em; display: list-item; overflow-wrap: break-word; word-wrap: break-word; text-indent: 0; }
          .document-content table { border-collapse: collapse; width: 100%; margin: 0.5em 0; table-layout: fixed; }
          .document-content th, .document-content td { border: 1px solid #374151; padding: 6px 10px; text-align: left; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; }
          .document-content th { background: rgba(255,255,255,0.08); font-weight: 600; }
        `}</style>
      </>
    );
  }
  return (
    <>
      <div className={`document-content prose prose-invert max-w-none break-words prose-p:text-gray-200 prose-headings:text-white prose-strong:text-gray-100 prose-code:text-gray-200 prose-blockquote:text-gray-300 ${className}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      <style>{`
        .document-content table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.875em; }
        .document-content thead tr { background: rgba(255,255,255,0.08); }
        .document-content th, .document-content td { border: 1px solid #374151; padding: 8px 12px; text-align: left; vertical-align: top; overflow-wrap: break-word; word-break: break-word; }
        .document-content th { font-weight: 600; color: #f9fafb; background: rgba(255,255,255,0.06); }
        .document-content td { color: #e5e7eb; }
        .document-content tbody tr:hover { background: rgba(255,255,255,0.03); }
        .document-content ul, .document-content ol { margin: 0.5em 0 0.5em 1.5em; padding-left: 1em; }
        .document-content ul { list-style-type: disc; }
        .document-content ol { list-style-type: decimal; }
        .document-content li { margin: 0.25em 0; display: list-item; }
        .document-content code:not(pre code) { background: rgba(255,255,255,0.1); border-radius: 3px; padding: 0.1em 0.35em; font-size: 0.85em; }
        .document-content pre { background: rgba(0,0,0,0.3); border: 1px solid #374151; border-radius: 6px; padding: 1em; overflow-x: auto; }
        .document-content blockquote { border-left: 3px solid #4b5563; padding-left: 1em; margin-left: 0; color: #9ca3af; }
        .document-content hr { border-color: #374151; }
        .document-content overflow-wrap: break-word; word-wrap: break-word;
      `}</style>
    </>
  );
}
