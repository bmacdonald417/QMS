import { QMS_MODULES } from './modules-data.js';

export { QMS_MODULES };

/**
 * @returns {import('./types.js').QmsModuleDefinition[]}
 */
export function listQmsModules() {
  return QMS_MODULES;
}

/**
 * @param {string} moduleKey
 * @returns {import('./types.js').QmsModuleDefinition | null}
 */
export function getQmsModule(moduleKey) {
  if (!moduleKey || typeof moduleKey !== 'string') return null;
  return QMS_MODULES.find((m) => m.moduleKey === moduleKey) ?? null;
}

/**
 * @param {string} moduleKey
 * @returns {Pick<import('./types.js').QmsModuleDefinition, 'moduleKey' | 'displayName' | 'description'> | null}
 */
export function getQmsModuleSummary(moduleKey) {
  const m = getQmsModule(moduleKey);
  if (!m) return null;
  return { moduleKey: m.moduleKey, displayName: m.displayName, description: m.description };
}
