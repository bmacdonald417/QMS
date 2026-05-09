import { MacTechShell } from './MacTechShell';

/**
 * Main application layout — now a thin alias around `MacTechShell`, the new
 * obsidian + copper signed-in chrome. Existing routes that imported
 * `MainLayout` keep working unchanged.
 */
export function MainLayout() {
  return <MacTechShell />;
}
