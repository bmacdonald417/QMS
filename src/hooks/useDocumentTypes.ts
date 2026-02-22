import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/documentTypes';

export type DocumentTypeOption = { value: string; label: string };

/** Fetches document types from API (avoids cache issues). Falls back to static list if fetch fails. */
export function useDocumentTypes(): DocumentTypeOption[] {
  const [types, setTypes] = useState<DocumentTypeOption[]>(() => [...DOCUMENT_TYPES]);

  useEffect(() => {
    apiRequest<{ types: DocumentTypeOption[] }>('/api/documents/types', {})
      .then((data) => {
        if (Array.isArray(data.types) && data.types.length > 0) {
          setTypes(data.types);
        }
      })
      .catch(() => {
        // Keep static fallback on error
      });
  }, []);

  return types;
}
