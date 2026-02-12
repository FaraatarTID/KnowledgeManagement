'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Loader2, Bot } from 'lucide-react';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check for 'expired' query param
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('expired') === 'true') {
        setErrorMsg('Your session has expired. Please log in again.');
        // Clean URL
        window.history.replaceState({}, '', '/login');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      await authApi.login({ email, password });
      router.push('/');
    } catch (error: unknown) {
      console.error('Login failed', error);
      let msg = 'Login failed. Please check your credentials.';
      if (typeof error === 'object' && error !== null) {
        const e = error as Record<string, unknown>;
        const code = e['code'];
        const resp = e['response'];

        if (code === 'ERR_NETWORK') {
          msg = 'Cannot reach the backend API. Check that the backend is running, NEXT_PUBLIC_API_URL is correct, and your CSP/connect-src allows the API origin.';
        } else if (typeof resp === 'object' && resp !== null) {
          const status = (resp as Record<string, unknown>)['status'];
          const data = (resp as Record<string, unknown>)['data'];

          if (status === 404) {
            msg = 'Login endpoint was not found. Ensure Next.js rewrite /api/v1 -> backend is active and backend server is reachable.';
          } else if (status === 500) {
            const responseText = typeof data === 'string' ? data : '';
            const proxyFailureHint = responseText.includes('ECONNREFUSED') || responseText.includes('Failed to proxy');
            msg = proxyFailureHint
              ? 'Backend is unreachable. Start API server with `cd server && npm install && npm run dev`, then retry login.'
              : 'Backend login service returned HTTP 500. Check backend logs in the server terminal for the real error.';
          } else if (typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>)['error'] === 'string') {
            msg = String((data as Record<string, unknown>)['error']);
          }
        }
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-3xl opacity-50 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-100 rounded-full blur-3xl opacity-50 animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E2E8F0] p-10 relative z-10">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-[#2563EB] to-[#7C3AED] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-6">
            <Bot className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-[#0F172A] tracking-tight mb-2">Welcome Back</h1>
          <p className="text-[#64748B]">Sign in to your AI Knowledge Base</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-3">
             <div className="shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">!</div>
             {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#64748B] uppercase tracking-wider ml-1">Email Address</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                 <User size={18} />
              </div>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#64748B] uppercase tracking-wider ml-1">Password</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                 <ShieldCheck size={18} />
              </div>
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-[#0F172A] text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : null}
            <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#E2E8F0] text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full border border-gray-100">
             <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
             <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">System Operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}
