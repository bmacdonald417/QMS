/** Strip Markdown bold/italic so "**Title**" displays as "Title" in UI */
export function stripMarkdownFormatting(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}
