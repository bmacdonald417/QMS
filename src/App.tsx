import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  ExecutiveDashboard,
  DocumentControl,
  DocumentDetail,
  TrainingCompetency,
  AuditManagement,
  CAPA,
  ChangeControl,
  RiskManagement,
  EquipmentAssets,
  SupplierQuality,
} from '@/pages';
import {
  SystemManagement,
  TeamDocuments,
  TeamTraining,
  Approvals,
  MyTasks,
  MyTraining,
} from '@/pages/placeholders';
import { LoginScreen } from '@/pages/LoginScreen';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';

function LoginOrRedirect() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginScreen />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginOrRedirect />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route element={<MainLayout />}>
          <Route index element={<ExecutiveDashboard />} />
          <Route path="documents" element={<DocumentControl />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="training" element={<TrainingCompetency />} />
          <Route path="audits" element={<AuditManagement />} />
          <Route path="capa" element={<CAPA />} />
          <Route path="change-control" element={<ChangeControl />} />
          <Route path="risk" element={<RiskManagement />} />
          <Route path="equipment" element={<EquipmentAssets />} />
          <Route path="suppliers" element={<SupplierQuality />} />
          <Route path="system" element={<SystemManagement />} />
          <Route path="team-documents" element={<TeamDocuments />} />
          <Route path="team-training" element={<TeamTraining />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="my-training" element={<MyTraining />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
