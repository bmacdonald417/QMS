import { useEffect, useState } from 'react';
import { Card, Button, Input, Table, Modal } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type { Column } from '@/components/ui';

interface Department {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
}

interface Site {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
}

interface JobTitle {
  id: string;
  name: string;
  isActive: boolean;
}

type AddModalType = 'department' | 'site' | 'jobTitle' | null;

export function SystemReference() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [activeTab, setActiveTab] = useState<'departments' | 'sites' | 'jobTitles'>('departments');
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState<AddModalType>(null);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addActive, setAddActive] = useState(true);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchAll = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiRequest<{ departments: Department[] }>('/api/system/reference/departments', { token }),
      apiRequest<{ sites: Site[] }>('/api/system/reference/sites', { token }),
      apiRequest<{ jobTitles: JobTitle[] }>('/api/system/reference/job-titles', { token }),
    ])
      .then(([d, s, j]) => {
        setDepartments(d.departments || []);
        setSites(s.sites || []);
        setJobTitles(j.jobTitles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, [token]);

  const openAddModal = (type: AddModalType) => {
    setAddModal(type);
    setAddName('');
    setAddCode('');
    setAddActive(true);
    setAddError('');
  };

  const submitAdd = async () => {
    if (!token || !addModal || !addName.trim()) return;
    setAddError('');
    setAddSubmitting(true);
    try {
      if (addModal === 'department') {
        await apiRequest<{ department: Department }>('/api/system/reference/departments', {
          token,
          method: 'POST',
          body: { name: addName.trim(), code: addCode.trim() || null, isActive: addActive },
        });
      } else if (addModal === 'site') {
        await apiRequest<{ site: Site }>('/api/system/reference/sites', {
          token,
          method: 'POST',
          body: { name: addName.trim(), code: addCode.trim() || null, isActive: addActive },
        });
      } else if (addModal === 'jobTitle') {
        await apiRequest<{ jobTitle: JobTitle }>('/api/system/reference/job-titles', {
          token,
          method: 'POST',
          body: { name: addName.trim(), isActive: addActive },
        });
      }
      setAddModal(null);
      fetchAll();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setAddSubmitting(false);
    }
  };

  const deptColumns: Column<Department>[] = [
    { key: 'name', header: 'Name' },
    { key: 'code', header: 'Code', render: (r) => r.code ?? '—' },
    { key: 'isActive', header: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];
  const siteColumns: Column<Site>[] = [
    { key: 'name', header: 'Name' },
    { key: 'code', header: 'Code', render: (r) => r.code ?? '—' },
    { key: 'isActive', header: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];
  const jobColumns: Column<JobTitle>[] = [
    { key: 'name', header: 'Name' },
    { key: 'isActive', header: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];

  const addButtonLabel =
    activeTab === 'departments' ? 'Add Department' : activeTab === 'sites' ? 'Add Site' : 'Add Job title';

  return (
    <PageShell
      title="Reference Data"
      subtitle="Departments, sites, and job titles. Changes are audited."
      primaryAction={{
        label: addButtonLabel,
        onClick: () => openAddModal(activeTab === 'departments' ? 'department' : activeTab === 'sites' ? 'site' : 'jobTitle'),
      }}
    >
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-surface-border">
          {(['departments', 'sites', 'jobTitles'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                activeTab === tab ? 'border-mactech-blue text-mactech-blue' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'departments' ? 'Departments' : tab === 'sites' ? 'Sites' : 'Job titles'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <Card padding="none">
            {activeTab === 'departments' && (
              <Table columns={deptColumns} data={departments} keyExtractor={(r) => r.id} emptyMessage="No departments." />
            )}
            {activeTab === 'sites' && (
              <Table columns={siteColumns} data={sites} keyExtractor={(r) => r.id} emptyMessage="No sites." />
            )}
            {activeTab === 'jobTitles' && (
              <Table columns={jobColumns} data={jobTitles} keyExtractor={(r) => r.id} emptyMessage="No job titles." />
            )}
          </Card>
        )}
      </div>

      <Modal
        isOpen={addModal !== null}
        onClose={() => setAddModal(null)}
        title={addModal === 'department' ? 'Add Department' : addModal === 'site' ? 'Add Site' : 'Add Job title'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddModal(null)} disabled={addSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitAdd} loading={addSubmitting} disabled={!addName.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {addError && <p className="text-compliance-red text-sm">{addError}</p>}
          <Input label="Name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Required" />
          {(addModal === 'department' || addModal === 'site') && (
            <Input label="Code (optional)" value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="e.g. HQ, ENG" />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={addActive} onChange={(e) => setAddActive(e.target.checked)} className="rounded border-surface-border" />
            Active
          </label>
        </div>
      </Modal>
    </PageShell>
  );
}
