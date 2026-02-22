import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface EvidenceLinkProps {
  href: string;
  children: React.ReactNode;
}

export function EvidenceLink({ href, children }: EvidenceLinkProps) {
  // Check if it's an internal document link (MAC-XXX format)
  const isInternal = /^MAC-[A-Z]+-\d+$/.test(href);

  if (isInternal) {
    return (
      <Link
        to={`/cmmc/docs/${href}`}
        className="text-mactech-blue hover:text-mactech-blue/80 underline inline-flex items-center gap-1"
      >
        {children}
        <ExternalLink className="w-3 h-3" />
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-mactech-blue hover:text-mactech-blue/80 underline inline-flex items-center gap-1"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}