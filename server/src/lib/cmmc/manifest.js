import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Zod schema for manifest validation
const DocumentSchema = z.object({
  code: z.string(),
  title: z.string(),
  kind: z.string(),
  path: z.string(),
  qms_doc_type: z.string(),
  review_cadence: z.string().optional(),
});

const ManifestSchema = z.object({
  $schema: z.string().optional(),
  schema: z.string().optional(),
  version: z.string().optional(),
  purpose: z.string().optional(),
  framework: z.string().optional(),
  control_set: z.string().optional(),
  created_at: z.string().optional(),
  documents: z.array(DocumentSchema),
  workflow_notes: z.string().optional(),
});

/**
 * Get the path to the CMMC bundle directory
 * Priority:
 * 1. CMMC_BUNDLE_PATH environment variable
 * 2. Default locations (docs/cmmc-extracted)
 */
export function getCmmcBundlePath() {
  // 1. Check environment variable
  const customPath = process.env.CMMC_BUNDLE_PATH;
  if (customPath && existsSync(customPath)) {
    return customPath;
  }
  
  // 2. Try multiple possible locations
  // Relative to current working directory (Railway deployment)
  const cwdPath = join(process.cwd(), 'docs', 'cmmc-extracted');
  
  // Relative to server directory (if cwd is server/)
  const serverPath = join(process.cwd(), '..', 'docs', 'cmmc-extracted');
  
  // Relative to lib file location (development)
  const libPath = join(__dirname, '../../../..', 'docs', 'cmmc-extracted');
  
  // Check which path exists
  if (existsSync(cwdPath)) {
    return cwdPath;
  }
  if (existsSync(serverPath)) {
    return serverPath;
  }
  if (existsSync(libPath)) {
    return libPath;
  }
  
  // Default to lib path (development - most common)
  console.warn(`CMMC bundle path not found. Tried: ${cwdPath}, ${serverPath}, ${libPath}. Using: ${libPath}`);
  return libPath;
}

/**
 * Load and validate the qms-ingest-manifest.json file
 * @returns {Promise<{documents: Array, metadata: Object}>}
 */
export async function loadManifest() {
  const bundlePath = getCmmcBundlePath();
  const manifestPath = join(bundlePath, 'qms-ingest-manifest.json');

  try {
    // Log path for debugging (only in development or if explicitly enabled)
    if (process.env.NODE_ENV === 'development' || process.env.LOG_CMMC_PATHS === 'true') {
      console.log(`Loading manifest from: ${manifestPath}`);
      console.log(`Current working directory: ${process.cwd()}`);
      console.log(`Bundle path: ${bundlePath}`);
      console.log(`Manifest exists: ${existsSync(manifestPath)}`);
    }

    if (!existsSync(manifestPath)) {
      throw new Error(`Manifest file not found at ${manifestPath}. Current working directory: ${process.cwd()}`);
    }

    const content = readFileSync(manifestPath, 'utf-8');
    const raw = JSON.parse(content);
    const validated = ManifestSchema.parse(raw);

    return {
      documents: validated.documents,
      metadata: {
        schema: validated.schema,
        version: validated.version,
        purpose: validated.purpose,
        framework: validated.framework,
        control_set: validated.control_set,
        created_at: validated.created_at,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Manifest validation failed: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      throw new Error(`Manifest file not found at ${manifestPath}. Error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a document by code from the manifest
 * @param {string} code
 * @returns {Promise<Object|null>}
 */
export async function getDocumentFromManifest(code) {
  const { documents } = await loadManifest();
  return documents.find((doc) => doc.code === code) || null;
}

/**
 * Get all documents grouped by category folder
 * @returns {Promise<Object>}
 */
export async function getDocumentsByCategory() {
  const { documents } = await loadManifest();
  const categories = {};

  for (const doc of documents) {
    // Extract category from path (e.g., "docs/01-system-scope/..." -> "01-system-scope")
    const match = doc.path.match(/docs\/([^\/]+)\//);
    const category = match ? match[1] : 'other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(doc);
  }

  return categories;
}