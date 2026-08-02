import { AppShell } from '@/components/shell/app-shell';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="MANAGER">{children}</AppShell>;
}
