'use client';

import React, { Suspense } from 'react';
import Sidebar from './Sidebar';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <div className="flex h-screen overflow-hidden">
      {!isLoginPage && (
        <Suspense fallback={<div className="w-72 bg-white border-r border-[#E2E8F0]" />}>
          <Sidebar />
        </Suspense>
      )}
      <main className="flex-1 relative overflow-y-auto bg-[#F8FAFC]">
        {children}
      </main>
    </div>
  );
}
