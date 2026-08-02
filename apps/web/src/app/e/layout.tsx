import { AppShell } from '@/components/shell/app-shell';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="EMPLOYEE">{children}</AppShell>;
}
