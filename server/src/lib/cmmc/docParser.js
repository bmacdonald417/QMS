import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCmmcBundlePath } from './manifest.js';

/**
 * Parse markdown header block to extract controlled document metadata
 * Expected format:
 * # Title
 * **Document Version:** 1.0
 * **Date:** YYYY-MM-DD
 * **Classification:** Internal Use
 * **Compliance Framework:** CMMC 2.0 Level 2 (Advanced)
 * **Reference:** NIST SP 800-171 Rev. 2, Section X
 * **Applies to:** ...
 * ---
 * (content follows)
 *
 * @param {string} markdownContent - Full markdown content
 * @returns {Object} Parsed metadata
 */
export function parseDocumentHeader(markdownContent) {
  const lines = markdownContent.split('\n');
  const metadata = {
    version: null,
    date: null,
    classification: null,
    framework: null,
    reference: null,
    appliesTo: null,
    title: null,
  };

  // Find title (first # heading)
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      metadata.title = line.slice(2).trim();
      break;
    }
  }

  // Parse metadata fields (look in first ~80 lines)
  const searchLines = Math.min(80, lines.length);
  for (let i = 0; i < searchLines; i++) {
    const line = lines[i].trim();

    // Stop at horizontal rule
    if (line === '---' || line === '***' || line === '___') {
      break;
    }

    // Match patterns like "**Field:** value" or "**Field:** value with spaces"
    const match = line.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
    if (match) {
      const field = match[1].trim().toLowerCase();
      const value = match[2].trim();

      if (field.includes('version') && !metadata.version) {
        metadata.version = value;
      } else if (field.includes('date') && !metadata.date) {
        metadata.date = value;
      } else if (field.includes('classification') && !metadata.classification) {
        metadata.classification = value;
      } else if ((field.includes('framework') || field.includes('compliance')) && !metadata.framework) {
        metadata.framework = value;
      } else if (field.includes('reference') && !metadata.reference) {
        metadata.reference = value;
      } else if ((field.includes('applies') || field.includes('applies to')) && !metadata.appliesTo) {
        metadata.appliesTo = value;
      }
    }
  }

  return metadata;
}

/**
 * Extract the markdown body (content after header block)
 * @param {string} markdownContent - Full markdown content
 * @returns {string} Body content
 */
export function extractMarkdownBody(markdownContent) {
  const lines = markdownContent.split('\n');
  let bodyStartIndex = 0;

  // Find where the header block ends (horizontal rule or after metadata)
  for (let i = 0; i < Math.min(80, lines.length); i++) {
    const line = lines[i].trim();
    if (line === '---' || line === '***' || line === '___') {
      bodyStartIndex = i + 1;
      break;
    }
  }

  // If no horizontal rule found, try to find where metadata likely ends
  if (bodyStartIndex === 0) {
    // Look for first non-metadata line (not starting with # or **)
    for (let i = 0; i < Math.min(80, lines.length); i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#') && !line.startsWith('**') && line !== '') {
        bodyStartIndex = i;
        break;
      }
    }
  }

  return lines.slice(bodyStartIndex).join('\n').trim();
}

/**
 * Read and parse a document file
 * @param {string} relativePath - Path relative to bundle root (e.g., "docs/02-policies-and-procedures/MAC-POL-220_...")
 * @returns {Object} { content, metadata, body }
 */
export function readDocumentFile(relativePath) {
  const bundlePath = getCmmcBundlePath();
  const fullPath = join(bundlePath, relativePath);

  try {
    if (!existsSync(fullPath)) {
      throw new Error(`Document file not found: ${fullPath} (relative: ${relativePath}, bundle: ${bundlePath})`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const metadata = parseDocumentHeader(content);
    const body = extractMarkdownBody(content);

    return {
      content,
      metadata,
      body,
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      throw new Error(`Document file not found: ${fullPath} (relative: ${relativePath}, bundle: ${bundlePath}, cwd: ${process.cwd()})`);
    }
    throw error;
  }
}

/**
 * Get document metadata with fallback values
 * @param {string} relativePath
 * @returns {Object} Metadata with defaults for missing fields
 */
export async function getDocumentMetadata(relativePath) {
  try {
    const { metadata } = readDocumentFile(relativePath);
    return {
      version: metadata.version || '—',
      date: metadata.date || '—',
      classification: metadata.classification || '—',
      framework: metadata.framework || '—',
      reference: metadata.reference || '—',
      appliesTo: metadata.appliesTo || null,
      title: metadata.title || '—',
    };
  } catch (error) {
    console.warn(`Failed to parse document metadata for ${relativePath}:`, error.message);
    return {
      version: '—',
      date: '—',
      classification: '—',
      framework: '—',
      reference: '—',
      appliesTo: null,
      title: '—',
    };
  }
}