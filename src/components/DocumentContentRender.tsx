import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a',
];

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
    const sanitized = DOMPurify.sanitize(trimmed, { ALLOWED_TAGS });
    return (
      <>
        <div
          className={`document-content prose prose-invert max-w-none prose-p:text-gray-200 prose-headings:text-white prose-table:text-gray-200 ${className}`}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
        <style>{`
          .document-content table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
          .document-content th, .document-content td { border: 1px solid #374151; padding: 6px 10px; text-align: left; }
          .document-content th { background: rgba(255,255,255,0.08); font-weight: 600; }
        `}</style>
      </>
    );
  }
  return (
    <div className={`prose prose-invert max-w-none prose-p:text-gray-200 prose-headings:text-white ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
