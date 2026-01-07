import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  MessageSquare, 
  LayoutDashboard, 
  BookOpen, 
  ShieldCheck, 
  Clock, 
  LogOut,
  Settings,
  User as UserIcon
} from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  const activeTab = searchParams ? searchParams.get('tab') : null;

  useEffect(() => {
    // Defer setting mounted and user to avoid synchronous setState inside effect
    const storedUser = localStorage.getItem('user');
    let parsedUser: any = null;
    if (storedUser) {
      try {
        parsedUser = JSON.parse(storedUser);
      } catch (e) {
        console.error('Failed to parse user data:', e);
        localStorage.removeItem('user');
      }
    }

    const raf = requestAnimationFrame(() => {
      setIsMounted(true);
      if (parsedUser) setUser(parsedUser);
    });

    // Listen for cross-tab storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user') {
        if (e.newValue) {
          try {
            setUser(JSON.parse(e.newValue));
          } catch (err) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    };

    // Listen for custom logout events
    const handleLogoutEvent = () => {
      setUser(null);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('user-logout', handleLogoutEvent);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('user-logout', handleLogoutEvent);
    };
  }, []);

  const handleLogout = () => {
    authApi.logout();
  };

  const navItems = [
    { 
      name: 'Chat Assistant', 
      icon: MessageSquare, 
      path: '/', 
      isActive: pathname === '/' 
    },
    { 
      name: 'Dashboard', 
      icon: LayoutDashboard, 
      path: '/admin?tab=dashboard', 
      isActive: pathname === '/admin' && activeTab === 'dashboard',
      adminOnly: true 
    },
    { 
      name: 'Library', 
      icon: BookOpen, 
      path: '/admin?tab=documents', 
      isActive: pathname === '/admin' && activeTab === 'documents',
      adminOnly: true 
    },
    { 
      name: 'Access Control', 
      icon: ShieldCheck, 
      path: '/admin?tab=users', 
      isActive: pathname === '/admin' && activeTab === 'users',
      adminOnly: true 
    },
    { 
      name: 'Activity Log', 
      icon: Clock, 
      path: '/admin?tab=history', 
      isActive: pathname === '/admin' && (activeTab === 'history'),
      adminOnly: true 
    },
    { 
      name: 'Settings', 
      icon: Settings, 
      path: '/admin?tab=settings', 
      isActive: pathname === '/admin' && activeTab === 'settings',
      adminOnly: true 
    }
  ];

  // Filter nav items based on user role
  const visibleItems = navItems.filter(item => {
    if (!item.adminOnly) return true;
    return user?.role === 'ADMIN' || user?.role === 'MANAGER';
  });

  // Prevent hydration mismatch by showing skeleton before mount
  if (!isMounted || !user) {
    return (
      <aside className="w-72 bg-white border-r border-[#E2E8F0] flex flex-col h-screen shrink-0">
        <div className="p-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#2563EB] to-[#7C3AED] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">AIKB</h1>
              <p className="text-xs font-medium text-[#64748B]">Enterprise Knowledge</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* Skeleton nav items */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl animate-pulse">
              <div className="w-5 h-5 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl mb-2 animate-pulse">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-20"></div>
              <div className="h-2 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-white border-r border-[#E2E8F0] flex flex-col h-screen shrink-0">
      <div className="p-6 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#2563EB] to-[#7C3AED] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Bot className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">AIKB</h1>
            <p className="text-xs font-medium text-[#64748B]">Enterprise Knowledge</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {visibleItems.map((item) => (
          <button 
            key={item.name}
            onClick={() => router.push(item.path)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
              item.isActive 
                ? 'bg-[#EFF6FF] text-[#2563EB]' 
                : 'text-[#64748B] hover:bg-gray-50'
            }`}
          >
            <item.icon size={20} />
            <span>{item.name}</span>
          </button>
        ))}
      </nav>

      {/* User Profile Section */}
      <div className="p-4 border-t border-[#E2E8F0]">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl mb-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs shadow-sm">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-[#0F172A] truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-[#64748B] truncate font-medium">{user?.role || 'Viewer'}</p>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-all font-semibold text-sm"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
