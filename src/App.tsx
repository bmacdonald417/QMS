import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  ExecutiveDashboard,
  DocumentControl,
  DocumentDetail,
  TrainingCompetency,
  AuditManagement,
  AuditDetail,
  ChangeControl,
  ChangeControlNew,
  ChangeControlDetail,
  RiskManagement,
  EquipmentAssets,
  SupplierQuality,
  QualityHealthDashboard,
  SearchPage,
  PeriodicReviewsPage,
  CompletedForms,
  CompletedFormDetail,
} from '@/pages';
import { CAPAList, CAPANew, CAPADetail } from '@/pages/capas';
import {
  SystemManagementLayout,
  SystemDashboard,
  SystemUsers,
  SystemRoles,
  SystemAudit,
  SystemSecurityPolicies,
  SystemReference,
  SystemRetention,
  SystemESign,
  SystemIntegrations,
  SystemQmsAgent,
  SystemExecutionPackages,
  SystemExecutionPackageDetail,
  SystemGovernanceManifest,
  SystemGovernancePackage,
  SystemGovernanceRelease,
  SystemReleaseReadiness,
} from '@/pages/system';
import {
  TeamTraining,
  Approvals,
  MyTasks,
  MyTraining,
} from '@/pages/placeholders';
import { SignInPage } from '@/pages/SignInPage';
import { SignUpPage } from '@/pages/SignUpPage';
import DocumentByCodeRedirect from '@/pages/DocumentByCodeRedirect';
import CmmcControlTags from '@/pages/CmmcControlTags';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route element={<MainLayout />}>
          <Route index element={<ExecutiveDashboard />} />
          <Route path="dashboard" element={<QualityHealthDashboard />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="documents" element={<DocumentControl />} />
          <Route path="documents/by-code/:documentId" element={<DocumentByCodeRedirect />} />
          <Route path="cmmc/control-tags" element={<CmmcControlTags />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="training" element={<TrainingCompetency />} />
          <Route path="periodic-reviews" element={<PeriodicReviewsPage />} />
          <Route path="audits" element={<AuditManagement />} />
          <Route path="audits/:auditId" element={<AuditDetail />} />
          <Route path="capas" element={<CAPAList />} />
          <Route path="capas/new" element={<CAPANew />} />
          <Route path="capas/:id" element={<CAPADetail />} />
          <Route path="capa" element={<Navigate to="/capas" replace />} />
          <Route path="change-control" element={<ChangeControl />} />
          <Route path="change-control/new" element={<ChangeControlNew />} />
          <Route path="change-control/:id" element={<ChangeControlDetail />} />
          <Route path="risk" element={<RiskManagement />} />
          <Route path="equipment" element={<EquipmentAssets />} />
          <Route path="suppliers" element={<SupplierQuality />} />
          <Route path="system" element={<SystemManagementLayout />}>
            <Route index element={<SystemDashboard />} />
            <Route path="users" element={<SystemUsers />} />
            <Route path="roles" element={<SystemRoles />} />
            <Route path="audit" element={<SystemAudit />} />
            <Route path="security-policies" element={<SystemSecurityPolicies />} />
            <Route path="reference" element={<SystemReference />} />
            <Route path="retention" element={<SystemRetention />} />
            <Route path="esign" element={<SystemESign />} />
            <Route path="integrations" element={<SystemIntegrations />} />
            <Route path="qms-agent" element={<SystemQmsAgent />} />
            <Route path="qms-agent/execution-packages" element={<SystemExecutionPackages />} />
            <Route path="qms-agent/execution-packages/:id" element={<SystemExecutionPackageDetail />} />
            <Route path="governance-manifest" element={<SystemGovernanceManifest />} />
            <Route path="governance-package" element={<SystemGovernancePackage />} />
            <Route path="release-readiness" element={<SystemReleaseReadiness />} />
            <Route path="governance-release" element={<SystemGovernanceRelease />} />
          </Route>
          <Route path="team-documents" element={<Navigate to="/documents" replace />} />
          <Route path="team-training" element={<TeamTraining />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="my-training" element={<MyTraining />} />
          <Route path="completed-forms" element={<CompletedForms />} />
          <Route path="completed-forms/:id" element={<CompletedFormDetail />} />
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
