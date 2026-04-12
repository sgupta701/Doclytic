import { ReactNode } from 'react';
import TopNav from './TopNav';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <TopNav />
      <div className="flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 lg:p-8 md:ml-64">
          {children}
        </main>
      </div>
    </div>
  );
}
