/** Document types for QMS. Used in create/edit dropdowns and filters. */
export const DOCUMENT_TYPES = [
  { value: 'SOP', label: 'Standard Operating Procedure' },
  { value: 'POLICY', label: 'Policy' },
  { value: 'WORK_INSTRUCTION', label: 'Work Instruction Process' },
  { value: 'FORM', label: 'Form' },
  { value: 'IT_SYSTEM', label: 'IT & System' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'AUDIT_ASSESSMENT', label: 'Audit & Assessment' },
  { value: 'INCIDENT_RESPONSE_PLAN', label: 'Incident Response Plan' },
  { value: 'CONFIGURATION_MANAGEMENT_PLAN', label: 'Configuration Management Plan' },
  { value: 'OTHER', label: 'Other' },
] as const;
