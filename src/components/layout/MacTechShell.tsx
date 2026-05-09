import { Outlet } from 'react-router-dom';
import { MacTechSidebar } from './MacTechSidebar';
import { MacTechTopbar } from './MacTechTopbar';
import { MacTechFooter } from './MacTechFooter';
import { QmsAgentFab } from '@/components/agent/QmsAgentFab';

/**
 * The signed-in chrome for QMS: fixed sidebar (w-64) + sticky h-14 topbar +
 * main content area + suite footer + floating QMS Agent.
 *
 * Mirrors vetted/clearD's `cleard-shell` so users moving between MacTech apps
 * see the same chrome vocabulary. Replaces the legacy MainLayout, but exports
 * are kept under the same names from the layout barrel for back-compat.
 */
export function MacTechShell() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <MacTechSidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        <MacTechTopbar />
        <main className="flex-1 overflow-x-hidden p-4 md:p-8">
          <Outlet />
        </main>
        <MacTechFooter />
      </div>
      <QmsAgentFab />
    </div>
  );
}
