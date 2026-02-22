/**
 * Normalize markdown content for consistent hashing
 * - Normalize line endings to \n
 * - Trim trailing whitespace on each line
 * - Remove leading BOM
 * - Keep markdown exactly otherwise (do not reformat)
 *
 * @param {string} markdown - Raw markdown content
 * @returns {string} Normalized markdown
 */
export function normalizeMarkdown(markdown) {
  if (!markdown) return '';

  // Remove BOM if present
  let normalized = markdown;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  // Normalize line endings to \n
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines, trim trailing whitespace, rejoin
  const lines = normalized.split('\n');
  const trimmed = lines.map((line) => line.replace(/\s+$/, ''));
  normalized = trimmed.join('\n');

  return normalized;
}

/**
 * Stable JSON stringify with sorted keys
 * Ensures consistent output regardless of object property order
 *
 * @param {Object} obj - Object to stringify
 * @returns {string} JSON string with sorted keys
 */
export function stableStringify(obj) {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']';
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = obj[key];
      return JSON.stringify(key) + ':' + stableStringify(value);
    });
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(obj);
}

/**
 * Build the canonical signing payload object
 * This is the exact structure that will be hashed for signing
 *
 * @param {Object} params
 * @param {string} params.docCode
 * @param {string} params.title
 * @param {string} params.kind
 * @param {string} params.qmsDocType
 * @param {string|null} params.reviewCadence
 * @param {string} params.version
 * @param {string} params.date
 * @param {string} params.classification
 * @param {string} params.framework
 * @param {string} params.reference
 * @param {string|null} params.appliesTo
 * @param {string} params.normalizedMarkdownBody
 * @param {string} params.templateVersion
 * @returns {Object} Signing payload
 */
export function buildSigningPayload({
  docCode,
  title,
  kind,
  qmsDocType,
  reviewCadence,
  version,
  date,
  classification,
  framework,
  reference,
  appliesTo,
  normalizedMarkdownBody,
  templateVersion = 'controlled-doc@1',
}) {
  const payload = {
    docCode,
    title,
    kind,
    qmsDocType,
    reviewCadence: reviewCadence || null,
    version,
    date,
    classification,
    framework,
    reference,
    appliesTo: appliesTo || null,
    normalizedMarkdownBody,
    templateVersion,
  };

  // Remove null/undefined values for cleaner payload (but keep empty strings)
  const cleaned = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Canonicalize and stringify the signing payload
 * @param {Object} payload - Signing payload object
 * @returns {string} Canonical JSON string
 */
export function canonicalizePayload(payload) {
  return stableStringify(payload);
}