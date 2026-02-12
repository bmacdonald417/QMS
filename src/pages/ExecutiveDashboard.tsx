import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge } from '@/components/ui';
import { PageShell } from './PageShell';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

const kpis = [
  { label: 'Open CAPAs', value: '12', trend: '+2', variant: 'warning' as const },
  { label: 'Documents in Review', value: '5', trend: '0', variant: 'info' as const },
  { label: 'Training Due', value: '8', trend: '-1', variant: 'warning' as const },
  { label: 'Compliance Score', value: '94%', trend: '+1%', variant: 'success' as const },
];

interface PendingTask {
  id: string;
  taskType: 'REVIEW' | 'APPROVAL' | 'QUALITY_RELEASE';
  docId: string;
  title: string;
  link: string;
}

/** Compliance health: 0–100 */
const radarScores = [
  { axis: 'Document Control', value: 92 },
  { axis: 'Training', value: 88 },
  { axis: 'CAPA', value: 85 },
  { axis: 'Change Control', value: 95 },
  { axis: 'Risk', value: 90 },
  { axis: 'Supplier', value: 87 },
];

export function ExecutiveDashboard() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<PendingTask[]>([]);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ tasks: PendingTask[] }>('/api/tasks', { token })
      .then((data) => setTasks(data.tasks))
      .catch(() => setTasks([]));
  }, [token]);

  return (
    <PageShell title="Executive Dashboard" subtitle="Quality and compliance at a glance">
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {kpis.map((kpi, i) => (
            <Card key={kpi.label} padding="md" className="flex flex-col">
              <span className="label-caps text-gray-500">{kpi.label}</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-white">{kpi.value}</span>
                <Badge variant={kpi.trend.startsWith('-') ? 'success' : kpi.variant} size="sm">
                  {kpi.trend}
                </Badge>
              </div>
            </Card>
          ))}
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
            className="lg:col-span-2"
          >
            <Card padding="md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-white">My Pending Tasks</h2>
              </div>
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-500">No pending assignments.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        to={task.link}
                        className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-overlay px-4 py-3 hover:border-mactech-blue/50 hover:bg-surface-elevated transition-colors"
                      >
                        <span className="text-sm text-gray-200">
                          {task.taskType} {task.docId} — {task.title}
                        </span>
                        <Badge variant="info" size="sm">
                          Open
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <Card padding="md">
              <h2 className="text-lg font-medium text-white mb-4">Compliance Health</h2>
              <div className="space-y-3">
                {radarScores.map((r) => (
                  <div key={r.axis}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{r.axis}</span>
                      <span className="text-gray-300">{r.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                      <div
                        className="h-full rounded-full bg-compliance-green transition-all duration-300"
                        style={{ width: `${r.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageShell>
  );
}
