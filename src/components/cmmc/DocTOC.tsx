import { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Heading {
  id: string;
  level: number;
  text: string;
}

interface DocTOCProps {
  content: string;
  className?: string;
}

export function DocTOC({ content, className = '' }: DocTOCProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Extract headings from rendered DOM (after ReactMarkdown processes with rehype-slug)
    // This runs after a short delay to ensure DOM is updated
    const timer = setTimeout(() => {
      const headings: Heading[] = [];
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      
      headingElements.forEach((el) => {
        const id = el.id;
        const level = parseInt(el.tagName.charAt(1));
        const text = el.textContent || '';
        if (id && text) {
          headings.push({ id, level, text });
        }
      });

      setHeadings(headings);
    }, 100);

    return () => clearTimeout(timer);
  }, [content]);

  useEffect(() => {
    // Track scroll position for active heading
    const handleScroll = () => {
      const scrollPos = window.scrollY + 100;
      for (let i = headings.length - 1; i >= 0; i--) {
        const element = document.getElementById(headings[i].id);
        if (element && element.offsetTop <= scrollPos) {
          setActiveId(headings[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (headings.length === 0) return null;

  return (
    <Card
      variant="bordered"
      padding="md"
      className={`sticky top-4 ${isCollapsed ? 'max-h-12' : ''} ${className}`}
    >
      <div
        className="flex items-center justify-between cursor-pointer mb-2"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <h3 className="text-sm font-semibold text-gray-300">Table of Contents</h3>
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </div>
      {!isCollapsed && (
        <nav className="space-y-1">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToHeading(heading.id);
              }}
              className={`block text-sm py-1 px-2 rounded hover:bg-surface-elevated transition-colors ${
                heading.level === 1
                  ? 'font-semibold text-white'
                  : heading.level === 2
                  ? 'text-gray-200 pl-4'
                  : 'text-gray-400 pl-8'
              } ${activeId === heading.id ? 'bg-surface-elevated text-mactech-blue' : ''}`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      )}
    </Card>
  );
}