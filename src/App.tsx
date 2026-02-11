import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import {
  ExecutiveDashboard,
  DocumentControl,
  TrainingCompetency,
  AuditManagement,
  CAPA,
  ChangeControl,
  RiskManagement,
  EquipmentAssets,
  SupplierQuality,
} from '@/pages';
import { LoginScreen } from '@/pages/LoginScreen';
import { AppProvider } from '@/context/AppContext';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/" element={<MainLayout />}>
        <Route index element={<ExecutiveDashboard />} />
        <Route path="documents" element={<DocumentControl />} />
        <Route path="training" element={<TrainingCompetency />} />
        <Route path="audits" element={<AuditManagement />} />
        <Route path="capa" element={<CAPA />} />
        <Route path="change-control" element={<ChangeControl />} />
        <Route path="risk" element={<RiskManagement />} />
        <Route path="equipment" element={<EquipmentAssets />} />
        <Route path="suppliers" element={<SupplierQuality />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
