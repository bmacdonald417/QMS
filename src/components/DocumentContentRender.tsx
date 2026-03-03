import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a',
];

/**
 * Remove Related Documents and signature/document-control sections from content.
 * These are shown via Where Used and PDF approval/signature blocks instead.
 */
function stripRelatedDocumentsAndSignatureSections(html: string): string {
  if (!html?.trim()) return html;
  let out = html;
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:\d+\.\s*)?Related\s+Documents\s*<\/h[1-6]>[\s\S]*?(?=<h[1-6]\s|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:\d+\.\s*)?Document\s+control\s*<\/h[1-6]>[\s\S]*?(?=<h[1-6]\s|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*(?:Signature\s*&?\s*evidence|Signature|Approval)[\s\S]*?<\/h[1-6]>[\s\S]*?(?=<h[1-6]\s|$)/gi,
    ''
  );
  out = out.replace(
    /<h[1-6][^>]*>\s*Appendix\s+[A-Z]:\s*Related\s+Documents[\s\S]*?<\/h[1-6]>[\s\S]*?(?=<h[1-6]\s|$)/gi,
    ''
  );
  out = out.replace(
    /<(p|div|table)[^>]*>[\s\S]*?Prepared\s+By[\s\S]*?(?=<h[1-6]\s|$)/gi,
    ''
  );
  out = out.replace(
    /<(p|div)[^>]*>[\s\S]*?<strong>\s*Prepared\s+By\s*<\/strong>[\s\S]*?(?=<h[1-6]\s|$)/gi,
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
    <div className={`prose prose-invert max-w-none break-words prose-p:text-gray-200 prose-headings:text-white ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
