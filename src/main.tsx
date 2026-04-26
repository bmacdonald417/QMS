import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';
import { apiUrl } from '@/lib/api';

const BUILD_ID_KEY = 'qms_build_id';

async function ensureLatestBuild(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/api/version'), { cache: 'no-store' });
    const data = (await res.json()) as { buildId?: string };
    const buildId = data?.buildId;
    if (!buildId) return true;
    const prev = sessionStorage.getItem(BUILD_ID_KEY);
    if (prev !== null && prev !== buildId) {
      sessionStorage.setItem(BUILD_ID_KEY, buildId);
      window.location.reload();
      return false;
    }
    sessionStorage.setItem(BUILD_ID_KEY, buildId);
  } catch {
    // e.g. dev server not running or CORS
  }
  return true;
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

async function init() {
  const shouldRender = await ensureLatestBuild();
  if (!shouldRender) return;
  if (!PUBLISHABLE_KEY) {
    document.body.innerHTML =
      '<pre style="padding:24px;font-family:monospace">VITE_CLERK_PUBLISHABLE_KEY not set. Add it to the Railway service environment.</pre>';
    return;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/sign-in">
        <App />
      </ClerkProvider>
    </StrictMode>
  );
}

init();
