import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { Callout } from './Callout';
import { ControlTag } from './ControlTag';
import { EvidenceLink } from './EvidenceLink';

interface CmmcMarkdownRendererProps {
  content: string;
  className?: string;
}

// Custom components for markdown rendering
const components = {
  // Handle callouts: <Callout type="info" title="Note">content</Callout>
  // This is a simplified version - in a real MDX setup, you'd use MDX components
  // For now, we'll render markdown and handle special patterns
  p: ({ children }: any) => {
    // Check if it's a callout pattern (this is a simplified approach)
    // In production, you'd want to use MDX for proper component rendering
    return <p className="mb-4 text-gray-200">{children}</p>;
  },
  h1: ({ children, id }: any) => (
    <h1 id={id} className="text-3xl font-bold text-white mt-8 mb-4">
      {children}
    </h1>
  ),
  h2: ({ children, id }: any) => (
    <h2 id={id} className="text-2xl font-bold text-white mt-6 mb-3">
      {children}
    </h2>
  ),
  h3: ({ children, id }: any) => (
    <h3 id={id} className="text-xl font-semibold text-white mt-4 mb-2">
      {children}
    </h3>
  ),
  h4: ({ children, id }: any) => (
    <h4 id={id} className="text-lg font-semibold text-white mt-3 mb-2">
      {children}
    </h4>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside mb-4 space-y-2 text-gray-200 ml-4">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-200 ml-4">{children}</ol>
  ),
  li: ({ children }: any) => <li className="mb-1">{children}</li>,
  code: ({ inline, children }: any) => {
    if (inline) {
      return (
        <code className="bg-surface-elevated px-1.5 py-0.5 rounded text-sm font-mono text-mactech-blue">
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-surface-elevated p-4 rounded-lg overflow-x-auto text-sm font-mono text-gray-200 mb-4">
        {children}
      </code>
    );
  },
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-mactech-blue pl-4 my-4 italic text-gray-300">
      {children}
    </blockquote>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border-collapse border border-surface-border">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-surface-elevated">{children}</thead>,
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => <tr className="border-b border-surface-border">{children}</tr>,
  th: ({ children }: any) => (
    <th className="border border-surface-border px-4 py-2 text-left font-semibold text-white">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-border px-4 py-2 text-gray-200">{children}</td>
  ),
  a: ({ href, children }: any) => {
    // Check if it's an internal document link
    if (href && /^MAC-[A-Z]+-\d+$/.test(href)) {
      return <EvidenceLink href={href}>{children}</EvidenceLink>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-mactech-blue hover:text-mactech-blue/80 underline"
      >
        {children}
      </a>
    );
  },
};

export function CmmcMarkdownRenderer({ content, className = '' }: CmmcMarkdownRendererProps) {
  return (
    <div className={`prose prose-invert prose-headings:text-white prose-p:text-gray-200 prose-a:text-mactech-blue prose-strong:text-white prose-code:text-mactech-blue max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}