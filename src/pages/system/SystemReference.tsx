import { useEffect, useState } from 'react';
import { Card, Button, Input, Table } from '@/components/ui';
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

export function SystemReference() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [activeTab, setActiveTab] = useState<'departments' | 'sites' | 'jobTitles'>('departments');
  const [loading, setLoading] = useState(true);

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

  return (
    <PageShell title="Reference Data" subtitle="Departments, sites, and job titles. Changes are audited.">
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
    </PageShell>
  );
}
