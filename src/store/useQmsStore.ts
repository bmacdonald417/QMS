import { create } from 'zustand';
import type { AuditTrailEntry } from '@/types/audit';
import type { DocumentRecord } from '@/lib/schemas';
import type { CAPARecord } from '@/lib/schemas';

/** Global QMS data store — extend per module as needed */
interface QmsState {
  auditTrail: AuditTrailEntry[];
  documents: DocumentRecord[];
  capas: CAPARecord[];
  addAuditEntry: (entry: Omit<AuditTrailEntry, 'id'>) => void;
  setDocuments: (docs: DocumentRecord[]) => void;
  setCapas: (capas: CAPARecord[]) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useQmsStore = create<QmsState>((set) => ({
  auditTrail: [],
  documents: [],
  capas: [],

  addAuditEntry: (entry) =>
    set((state) => ({
      auditTrail: [
        ...state.auditTrail,
        { ...entry, id: generateId(), timestamp: entry.timestamp || new Date().toISOString() },
      ],
    })),

  setDocuments: (docs) => set({ documents: docs }),
  setCapas: (capas) => set({ capas }),
}));
