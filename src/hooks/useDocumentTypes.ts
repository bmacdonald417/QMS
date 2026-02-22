import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/documentTypes';

export type DocumentTypeOption = { value: string; label: string };

/** Document types: prefer types injected by server into HTML, then API, then static fallback. */
export function useDocumentTypes(): DocumentTypeOption[] {
  const [types, setTypes] = useState<DocumentTypeOption[]>(() => {
    const fromHtml = typeof window !== 'undefined' && (window as Window & { __DOCUMENT_TYPES__?: DocumentTypeOption[] }).__DOCUMENT_TYPES__;
    if (Array.isArray(fromHtml) && fromHtml.length > 0) return fromHtml;
    return [...DOCUMENT_TYPES];
  });

  useEffect(() => {
    const fromHtml = (window as Window & { __DOCUMENT_TYPES__?: DocumentTypeOption[] }).__DOCUMENT_TYPES__;
    if (Array.isArray(fromHtml) && fromHtml.length > 0) return;
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
