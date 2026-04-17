/**
 * @typedef {Object} WorkflowTemplateDefinition
 * @property {string} templateKey
 * @property {string} templateName
 * @property {string[]} targetModules
 * @property {string} objective
 * @property {{ stateKey: string, label: string, sortOrder: number }[]} defaultStates
 * @property {{ from: string, to: string, label?: string|null, rolesJson?: unknown }[]} defaultTransitions
 * @property {string[]} defaultRoles
 * @property {string} approvalModel
 * @property {string[]} auditRequirements
 * @property {string[]} notificationRules
 * @property {string[]} trainingLinkageRules
 * @property {string[]} uiRecommendations
 * @property {string[]} schemaRecommendations
 */

export {};
