'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, 
  Search, 
  Plus, 
  Filter, 
  Trash2, 
  Eye, 
  Shield, 
  BarChart3, 
  Clock, 
  Users,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Loader2,
  LogOut,
  UserCog,
  ArrowLeft,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  ShieldCheck,
  Bot,
  ChevronRight,
  Edit2,
  Settings,
  X,
  ExternalLink,
  Upload,
  HardDrive,
  Cloud,
  ChevronLeft
} from 'lucide-react';
import api, { authApi } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams ? searchParams.get('tab') || 'dashboard' : 'dashboard'; 
  const [activeTab, setActiveTab] = useState(initialTab);
  
  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<Record<string, unknown> | null>(null);

  // Prevent noisy unused-import warnings for icons that may be optionally used in variants
  void Search; void Filter; void Eye; void BarChart3; void MoreVertical; void LogOut; void UserCog; void ArrowLeft; void LayoutDashboard; void MessageSquare; void Bot; void Settings; void ShieldCheck; void ChevronLeft;
  const [editingDoc, setEditingDoc] = useState<Record<string, unknown> | null>(null);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', category: '', sensitivity: '', department: '' });
  const [systemConfig, setSystemConfig] = useState<{ categories: string[], departments: string[] }>({ categories: [], departments: [] });
  const [newCategory, setNewCategory] = useState('');
  const [newDepartment, setNewDepartment] = useState('');

  // Add Resource Modal State
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [addResourceStep, setAddResourceStep] = useState<'select' | 'manual' | 'sync'>('select');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ title: '', category: 'General', department: 'General' });
  const [isUploading, setIsUploading] = useState(false);
  
  // Add User Modal State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'VIEWER', department: 'General' });

  // Helper to safely extract error messages from unknown errors
  const extractErrorMessage = (err: unknown, fallback = 'An error occurred'): string => {
    if (typeof err !== 'object' || err === null) return fallback;
    const e = err as Record<string, unknown>;
    const resp = e['response'];
    if (typeof resp === 'object' && resp !== null) {
      const r = resp as Record<string, unknown>;
      const data = r['data'];
      if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        const msg = d['error'];
        if (typeof msg === 'string') return msg;
      }
    }
    return fallback;
  };

  useEffect(() => {
    // Verify session using server-side cookie/token via authApi.getMe
    const init = async () => {
      try {
          const freshUser = await authApi.getMe();
          if (!freshUser) {
            // No session
            router.push('/login');
            return;
          }

        setCurrentUser(freshUser);
        if (freshUser.role !== 'ADMIN' && freshUser.role !== 'MANAGER') {
          alert('Access Denied. You need Admin privileges.');
          router.push('/');
          return;
        }
        // Sync local copy
        localStorage.setItem('user', JSON.stringify(freshUser));
        setIsAuthChecking(false);

        // Auto-sync for admins
        if (freshUser.role === 'ADMIN') {
          console.log('Admin detected: Triggering auto-sync...');
          handleSyncNow();
        }

        // Fetch admin data
        fetchData();
      } catch (error: unknown) {
          console.error('Admin auth verify failed', error);
          router.push('/login');
        }
    };

    init();
    }, [activeTab, fetchData, handleSyncNow, router]);

  

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'documents') {
        const res = await api.get('/documents');
        setDocuments(res.data);
      } else if (activeTab === 'users') {
        const res = await api.get('/users');
        setUsers(res.data);
      } else if (activeTab === 'history' || activeTab === 'dashboard') {
        const res = await api.get('/history');
        setHistory(res.data);
      }
      // Always fetch stats
      const statsRes = await api.get('/stats');
      setStats(statsRes.data);

      const configRes = await api.get('/config');
      setSystemConfig(configRes.data);
    } catch (error: unknown) {
      console.error('Failed to fetch admin data', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return; 
    }
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      // Optimistic update
      setUsers(prev => prev.map(u => String(u['id']) === userId ? { ...u, role: newRole } : u));
    } catch {
      alert('Failed to update role');
    }
  };

  const handleMetadataUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    
    setIsUpdatingMetadata(true);
    try {
      await api.patch(`/documents/${editingDoc.id}`, editForm);
      // Update local state
      setDocuments(documents.map(d => d.id === editingDoc.id ? { ...d, name: editForm.title, ...editForm } : d));
      setEditingDoc(null);
      alert('Document updated successfully');
    } catch {
      alert('Failed to update metadata');
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const handleUpdateCategories = async (newCategories: string[]) => {
    try {
      const res = await api.patch('/config/categories', { categories: newCategories });
      setSystemConfig(prev => ({ ...prev, categories: res.data.categories }));
    } catch {
      alert('Failed to update categories');
    }
  };

  const handleUpdateDepartments = async (newDepartments: string[]) => {
    try {
      const res = await api.patch('/config/departments', { departments: newDepartments });
      setSystemConfig(prev => ({ ...prev, departments: res.data.departments }));
    } catch {
      alert('Failed to update departments');
    }
  };



  const handleDepartmentChange = async (userId: string, newDept: string) => {
    try {
      await api.patch(`/users/${userId}`, { department: newDept });
      setUsers(prev => prev.map(u => String(u['id']) === userId ? { ...u, department: newDept } : u));
    } catch {
      alert('Failed to update department');
    }
  };

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadForm.title);
    formData.append('category', uploadForm.category);
    formData.append('department', uploadForm.department);

    setIsUploading(true);
    try {
      await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      alert('File uploaded successfully');
      setIsAddResourceModalOpen(false);
      setUploadFile(null);
      setAddResourceStep('select');
      fetchData();
    } catch {
      alert('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const res = await api.post('/users', userForm);
      setUsers(prev => [...prev, res.data]);
      setIsAddUserModalOpen(false);
      setUserForm({ name: '', email: '', password: '', role: 'VIEWER', department: 'General' });
      alert('User created successfully');
    } catch (error: unknown) {
      alert(extractErrorMessage(error, 'Failed to create user'));
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This cannot be undone.')) {
      return;
    }
    try {
      await api.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => String(u['id']) !== userId));
      alert('User deleted successfully');
    } catch {
      alert('Failed to delete user');
    }
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = window.prompt('Enter new password for this user:');
    if (!newPassword) return;
    
    try {
      await api.patch(`/users/${userId}/password`, { password: newPassword });
      alert('Password updated successfully');
    } catch {
      alert('Failed to update password');
    }
  };

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await api.post('/sync');
      // res.data.message often contains "Demo Sync" or "Sync complete"
      console.log('Sync result:', res.data);
      // Refresh current tab data
      fetchData();
    } catch (e) {
      console.error('Sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchData]);

  const handleRowSync = async (docId: string) => {
    try {
      await api.post(`/documents/${docId}/sync`);
      fetchData(); // Refresh list to show 'Synced' status
    } catch {
      alert('Row sync failed');
    }
  };

  const openEditModal = (doc: Record<string, unknown>) => {
    console.log('Admin: Opening Edit Modal for doc:', doc);
    setEditingDoc(doc);
    setEditForm({
      title: String(doc['name'] ?? ''),
      category: String(doc['category'] ?? 'General'),
      sensitivity: String(doc['sensitivity'] ?? 'INTERNAL'),
      department: String(doc['department'] ?? 'General')
    });
  };

  // Admin page does not expose a logout button here; use the global sidebar logout instead
  

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col w-full">
      {/* Top Header */}
      <header className="h-20 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">Knowledge Control Center</h1>
            <p className="text-xs text-[#64748B]">Welcome back, {String(currentUser?.['name'] ?? '')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] text-[#0F172A] rounded-lg hover:bg-gray-50 transition-all font-medium disabled:opacity-50"
          >
            {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Cloud size={18} />}
            <span>Sync Knowledge</span>
          </button>
          <button 
            onClick={() => setIsAddResourceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] text-white rounded-lg hover:bg-blue-600 transition-all font-medium"
          >
            <Plus size={18} />
            <span>Add Resource</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {(!currentUser || isAuthChecking) ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={40} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-10">
              {isLoading && activeTab !== 'documents' ? ( // Optimization: Don't block UI if just refreshing docs
                 <div className="flex items-center justify-center h-full">
                   <Loader2 className="animate-spin text-blue-600" size={40} />
                 </div>
              ) : (
                <>
                  {activeTab === 'dashboard' && (
                     <div className="space-y-8">
                        <div>
                           <h2 className="text-2xl font-bold text-[#0F172A]">System Overview</h2>
                           <p className="text-[#64748B]">Real-time metrics and system health.</p>
                        </div>
                        {/* Stats Grid - Moved here */}
                        <div className="grid grid-cols-4 gap-6">
                           {[
                             { label: 'Total Documents', value: stats?.totalDocuments || '0', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
                             { label: 'Active Users', value: stats?.activeUsers || '0', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
                             { label: 'AI Resolution', value: stats?.aiResolution || '0%', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
                             { label: 'System Health', value: stats?.systemHealth || 'Unknown', icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' }
                           ].map((stat) => (
                             <div key={stat.label} className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                               <div className="flex items-center justify-between mb-4">
                                 <div className={`p-2 ${stat.bg} ${stat.color} rounded-lg`}>
                                   <stat.icon size={20} />
                                 </div>
                               </div>
                               <p className="text-sm font-medium text-[#64748B]">{stat.label}</p>
                               <p className="text-2xl font-bold text-[#0F172A] mt-1">{String(stat.value ?? '')}</p>
                             </div>
                           ))}
                         </div>
                         
                         {/* Real Recent Activity */}
                         <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                            <h3 className="font-bold text-[#0F172A] mb-4">Recent Knowledge Updates</h3>
                            <div className="space-y-4">
                               {history.length > 0 ? (
                                 history.slice(0, 5).map((entry: unknown, i: number) => {
                                   const e = (entry as Record<string, unknown>) || {};
                                   const eventType = String(e['event_type'] ?? 'UNKNOWN');
                                   const docName = String(e['doc_name'] ?? 'Unknown');
                                   const createdAt = e['created_at'] ? String(e['created_at']) : undefined;
                                   return (
                                   <div key={String(e['id'] ?? i)} className="flex items-center gap-3 text-sm text-[#64748B]">
                                      <div className={`p-1.5 rounded-lg ${
                                        eventType === 'CREATED' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                                      }`}>
                                        <Clock size={14} />
                                      </div>
                                      <span className="font-medium text-[#0F172A]">{docName}</span>
                                      <span className="text-xs">{eventType}</span>
                                      <span className="ml-auto text-xs">{createdAt ? new Date(createdAt).toLocaleTimeString() : ''}</span>
                                   </div>
                                   );
                                 })
                               ) : (
                                  <div className="flex items-center gap-3 text-sm text-[#64748B]">
                                     <Clock size={16} />
                                     <span>No recent activity found.</span>
                                  </div>
                               )}
                            </div>
                            {history.length > 5 && (
                              <button 
                                onClick={() => setActiveTab('history')}
                                className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              >
                                View full history <ChevronRight size={12} />
                              </button>
                            )}
                         </div>
                     </div>
                  )}

                  {activeTab === 'documents' && (
                    <div className="space-y-8">
                       <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-[#0F172A]">Document Library</h2>
                          <p className="text-[#64748B]">Browse and manage knowledge base files.</p>
                        </div>
                      </div>
    
                      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-sm p-8 text-center text-gray-500">
                         {documents.length > 0 ? (
                           <table className="w-full text-left">
                             <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                               <tr>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Name</th>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Category</th>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Department</th>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Sensitivity</th>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Status</th>
                                 <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Actions</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-[#E2E8F0]">
                               {documents.map((doc) => {
                                 const d = (doc as Record<string, unknown>) || {};
                                 const id = String(d['id'] ?? Math.random());
                                 const name = String(d['name'] ?? 'Untitled');
                                 const category = String(d['category'] ?? '');
                                 const department = String(d['department'] ?? 'General');
                                 const sensitivity = String(d['sensitivity'] ?? 'INTERNAL');
                                 const status = String(d['status'] ?? '');
                                 return (
                                 <tr key={id} className="hover:bg-[#F8FAFC]">
                                   <td className="px-6 py-4">
                                     <div className="flex items-center gap-3">
                                       <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                         <FileText size={16} />
                                       </div>
                                       <span className="text-sm font-semibold text-[#0F172A]">{name}</span>
                                     </div>
                                   </td>
                                   <td className="px-6 py-4 text-sm text-[#64748B]">{category}</td>
                                   <td className="px-6 py-4">
                                     <span className={`px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full`}>
                                       {department}
                                     </span>
                                   </td>
                                   <td className="px-6 py-4">
                                     <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                                       sensitivity === 'CONFIDENTIAL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                     }`}>
                                       {sensitivity}
                                     </span>
                                   </td>
                                   <td className="px-6 py-4">
                                     <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                                       status === 'Synced' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                     }`}>
                                       {status}
                                     </span>
                                   </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <button 
                                          onClick={() => openEditModal(d)}
                                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                          title="Edit Metadata"
                                        >
                                          <Edit2 size={16} />
                                        </button>
                                        <button 
                                          onClick={() => handleRowSync(id)}
                                          className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                          title="Sync this document"
                                        >
                                          <HardDrive size={16} />
                                        </button>
                                        <button 
                                          onClick={() => {
                                             if(window.confirm('Are you sure you want to delete this document? This cannot be undone.')) {
                                               alert('Document deleted (simulated)');
                                               setDocuments(prev => prev.filter(d => String((d as Record<string, unknown>)['id']) !== id));
                                             }
                                          }}
                                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete Document"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                 </tr>
                                 );
                               })}
                             </tbody>
                           </table>
                         ) : (
                           <p>No documents found.</p>
                         )}
                      </div>
                    </div>
                  )}
    
                  {activeTab === 'users' && (
                    <div className="space-y-8">
                       <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-[#0F172A]">User Permissions</h2>
                          <p className="text-[#64748B]">Manage access roles and departmental privileges.</p>
                        </div>
                        <button 
                          onClick={() => setIsAddUserModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm shadow-sm shadow-blue-500/10"
                        >
                          <Plus size={16} />
                          <span>Add User</span>
                        </button>
                      </div>
    
                      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                           <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <tr>
                              <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">User</th>
                              <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Email</th>
                              <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Department</th>
                               <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Role</th>
                               <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">Status</th>
                               <th scope="col" className="px-6 py-4 text-xs font-bold text-[#64748B] uppercase tracking-wider text-right">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-[#E2E8F0]">
                             {users.map((u) => {
                               const userObj = (u as Record<string, unknown>) || {};
                               const uname = String(userObj['name'] ?? 'User');
                               const uemail = String(userObj['email'] ?? '');
                               const uid = String(userObj['id'] ?? Math.random());
                               return (
                               <tr key={uid} className="hover:bg-[#F8FAFC] transition-colors">
                                 <td className="px-6 py-4">
                                   <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                       {uname.charAt(0)}
                                     </div>
                                     <span className="text-sm font-semibold text-[#0F172A]">{uname}</span>
                                   </div>
                                 </td>
                                 <td className="px-6 py-4 text-sm text-[#64748B]">{uemail}</td>
                                 <td className="px-6 py-4">
                                   <select 
                                     value={String(userObj['department'] ?? '')}
                                     onChange={(e) => handleDepartmentChange(uid, e.target.value)}
                                     className="bg-white border border-[#E2E8F0] text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                   >
                                     {systemConfig.departments.map(dept => (
                                       <option key={dept} value={dept}>{dept}</option>
                                     ))}
                                   </select>
                                 </td>
                                 <td className="px-6 py-4">
                                     <select 
                                     value={String(userObj['role'] ?? 'VIEWER')}
                                     onChange={(e) => handleRoleChange(uid, e.target.value)}
                                     className="bg-white border border-[#E2E8F0] text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                   >
                                     <option value="ADMIN">ADMIN</option>
                                     <option value="MANAGER">MANAGER</option>
                                     <option value="EDITOR">EDITOR</option>
                                     <option value="VIEWER">VIEWER</option>
                                   </select>
                                 </td>
                                 <td className="px-6 py-4">
                                     <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                                     {String(userObj['status'] ?? '')}
                                   </span>
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                   <div className="flex items-center justify-end gap-2">
                                     <button 
                                       onClick={() => handleResetPassword(uid)}
                                       className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                       title="Reset Password"
                                     >
                                       <ShieldCheck size={16} />
                                     </button>
                                     <button 
                                       onClick={() => handleDeleteUser(uid)}
                                       disabled={String(userObj['email'] ?? '') === String(currentUser?.['email'] ?? '')}
                                       className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                                       title="Delete User"
                                     >
                                       <Trash2 size={16} />
                                     </button>
                                   </div>
                                 </td>
                               </tr>
                               );
                             })}
                             
                           </tbody>
                        </table>
                      </div>
                    </div>
                  )}
    
                  {activeTab === 'history' && (
                    <div className="space-y-8">
                       <div>
                         <h2 className="text-2xl font-bold text-[#0F172A]">Activity Log</h2>
                         <p className="text-[#64748B]">History of document syncs and AI knowledge updates.</p>
                       </div>

                       <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                         {history.length > 0 ? (
                           <div className="divide-y divide-[#E2E8F0]">
                             {history.map((event: unknown, i: number) => {
                                 const ev = (event as Record<string, unknown>) || {};
                                 const et = String(ev['event_type'] ?? 'UNKNOWN');
                                 const docName = String(ev['doc_name'] ?? 'Unknown');
                                 const created = ev['created_at'] ? String(ev['created_at']) : undefined;
                                 const details = String(ev['details'] ?? 'Document processed and indexed.');
                                 const docId = String(ev['doc_id'] ?? '');
                                 return (
                                 <div key={String(ev['id'] ?? i)} className="p-6 hover:bg-[#F8FAFC] transition-colors">
                                   <div className="flex items-start gap-4">
                                     <div className={`mt-1 p-2 rounded-lg ${
                                       et === 'CREATED' ? 'bg-green-50 text-green-600' :
                                       et === 'UPDATED' ? 'bg-blue-50 text-blue-600' :
                                       'bg-red-50 text-red-600'
                                     }`}>
                                        <Clock size={16} />
                                     </div>
                                     <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <h4 className="font-bold text-[#0F172A]">{docName}</h4>
                                          <span className="text-xs text-[#64748B]">{created ? new Date(created).toLocaleString() : ''}</span>
                                        </div>
                                        <p className="text-sm text-[#64748B] mb-2">{details}</p>
                                        <div className="flex items-center gap-4">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            et === 'CREATED' ? 'bg-green-100 text-green-700' :
                                            et === 'UPDATED' ? 'bg-blue-100 text-blue-700' :
                                            'bg-red-100 text-red-700'
                                          }`}>
                                            {et}
                                          </span>
                                          <span className="text-[10px] text-[#94A3B8]">ID: {docId}</span>
                                        </div>
                                     </div>
                                   </div>
                                 </div>
                                 );
                               })}
                           </div>
                         ) : (
                           <div className="p-20 text-center">
                              <p className="text-[#64748B]">No activity recorded yet. Trigger a sync to see history.</p>
                           </div>
                         )}
                       </div>
                    </div>
                  )}

                  {activeTab === 'settings' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div>
                        <h2 className="text-2xl font-bold text-[#0F172A]">System Configuration</h2>
                        <p className="text-[#64748B]">Manage document categories and user departments.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Categories Management */}
                        <div className="bg-white p-8 rounded-3xl border border-[#E2E8F0] shadow-sm">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                              <BookOpen size={20} />
                            </div>
                            <h3 className="text-lg font-bold text-[#0F172A]">Document Categories</h3>
                          </div>
                          
                          <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {systemConfig.categories.map((cat) => (
                              <div key={cat} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group hover:bg-blue-50 transition-all">
                                <span className="text-sm font-medium text-[#0F172A]">{cat}</span>
                                <button 
                                  onClick={() => handleUpdateCategories(systemConfig.categories.filter(c => c !== cat))}
                                  className="p-1.5 text-[#94A3B8] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input 
                              type="text"
                              value={newCategory}
                              onChange={(e) => setNewCategory(e.target.value)}
                              placeholder="New category..."
                              className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCategory.trim()) {
                                  handleUpdateCategories([...systemConfig.categories, newCategory.trim()]);
                                  setNewCategory('');
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                if (newCategory.trim()) {
                                  handleUpdateCategories([...systemConfig.categories, newCategory.trim()]);
                                  setNewCategory('');
                                }
                              }}
                              className="p-2.5 bg-[#0F172A] text-white rounded-xl hover:bg-blue-600 transition-all shadow-sm shadow-black/10"
                            >
                              <Plus size={20} />
                            </button>
                          </div>
                        </div>

                        {/* Departments Management */}
                        <div className="bg-white p-8 rounded-3xl border border-[#E2E8F0] shadow-sm">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                              <Users size={20} />
                            </div>
                            <h3 className="text-lg font-bold text-[#0F172A]">User Departments</h3>
                          </div>
                          
                          <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {systemConfig.departments.map((dept) => (
                              <div key={dept} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group hover:bg-purple-50 transition-all">
                                <span className="text-sm font-medium text-[#0F172A]">{dept}</span>
                                <button 
                                  onClick={() => handleUpdateDepartments(systemConfig.departments.filter(d => d !== dept))}
                                  className="p-1.5 text-[#94A3B8] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input 
                              type="text"
                              value={newDepartment}
                              onChange={(e) => setNewDepartment(e.target.value)}
                              placeholder="New department..."
                              className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newDepartment.trim()) {
                                  handleUpdateDepartments([...systemConfig.departments, newDepartment.trim()]);
                                  setNewDepartment('');
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                if (newDepartment.trim()) {
                                  handleUpdateDepartments([...systemConfig.departments, newDepartment.trim()]);
                                  setNewDepartment('');
                                }
                              }}
                              className="p-2.5 bg-[#0F172A] text-white rounded-xl hover:bg-blue-600 transition-all shadow-sm shadow-black/10"
                            >
                              <Plus size={20} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
        )}
      </div>

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0] bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-[#0F172A]">Edit Metadata</h3>
                <p className="text-xs text-[#64748B] font-medium mt-1">Update title and classification</p>
              </div>
              <div className="flex items-center gap-3">
                {typeof editingDoc['link'] === 'string' && (
                  <a 
                    href={String(editingDoc['link'])} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-blue-100"
                  >
                    <ExternalLink size={14} />
                    Open Original
                  </a>
                )}
                <button onClick={() => setEditingDoc(null)} className="text-[#64748B] hover:text-[#0F172A] p-1">
                  <X size={24} />
                </button>
              </div>
            </div>
            <form onSubmit={handleMetadataUpdate} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-[#64748B] mb-2 uppercase tracking-wide">Document Title</label>
                <input 
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="e.g., Security Policy 2024"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Category</label>
                <select 
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  {systemConfig.categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#64748B] mb-2 uppercase tracking-wide">Sensitivity</label>
                <select 
                  value={editForm.sensitivity}
                  onChange={(e) => setEditForm({...editForm, sensitivity: e.target.value})}
                  className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="INTERNAL">INTERNAL</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Target Department</label>
                <select 
                  value={editForm.department}
                  onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  {systemConfig.departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="flex-1 px-4 py-3 border border-[#E2E8F0] text-[#64748B] rounded-xl text-sm font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUpdatingMetadata}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUpdatingMetadata && <Loader2 size={16} className="animate-spin" />}
                  <span>{isUpdatingMetadata ? 'Updating...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Metadata Modal (existing) ... */}

      {/* Add Resource Modal */}
      {isAddResourceModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0] bg-gray-50/50">
              <div className="flex items-center gap-3">
                {addResourceStep !== 'select' && (
                  <button 
                    onClick={() => setAddResourceStep('select')}
                    className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#0F172A]">Add New Resource</h3>
                  <p className="text-xs text-[#64748B] font-medium mt-1">
                    {addResourceStep === 'select' ? 'Choose import method' : 
                     addResourceStep === 'manual' ? 'Upload from local device' : 'Sync from Google Drive'}
                  </p>
                </div>
              </div>
              <button onClick={() => {
                setIsAddResourceModalOpen(false);
                setAddResourceStep('select');
              }} className="text-[#64748B] hover:text-[#0F172A] p-1">
                <X size={24} />
              </button>
            </div>

            <div className="p-8">
              {addResourceStep === 'select' && (
                <div className="grid grid-cols-2 gap-6">
                  <button 
                    onClick={() => setAddResourceStep('manual')}
                    className="flex flex-col items-center gap-4 p-8 border-2 border-[#E2E8F0] border-dashed rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                  >
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                      <HardDrive size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-[#0F172A]">Manual Upload</p>
                      <p className="text-xs text-[#64748B] mt-1">PDF, Word, or Text files</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => setAddResourceStep('sync')}
                    className="flex flex-col items-center gap-4 p-8 border-2 border-[#E2E8F0] border-dashed rounded-3xl hover:border-purple-500 hover:bg-purple-50/50 transition-all group"
                  >
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
                      <Cloud size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-[#0F172A]">Drive Sync</p>
                      <p className="text-xs text-[#64748B] mt-1">Auto-import from Folder</p>
                    </div>
                  </button>
                </div>
              )}

              {addResourceStep === 'sync' && (
                <div className="space-y-6 text-center py-8">
                  <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Cloud size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#0F172A]">Google Drive Integration</h4>
                    <p className="text-sm text-[#64748B] max-w-[280px] mx-auto mt-2">
                      This will scan the configured shared folder and index all new or updated documents.
                    </p>
                  </div>
                  <button 
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="w-full py-4 bg-[#0F172A] text-white rounded-xl font-bold hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    <span>{isSyncing ? 'Syncing Drive...' : 'Start Cloud Sync'}</span>
                  </button>
                </div>
              )}

              {addResourceStep === 'manual' && (
                <form onSubmit={handleManualUpload} className="space-y-5">
                  <div 
                    className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                      uploadFile ? 'border-green-500 bg-green-50/30' : 'border-[#E2E8F0] hover:border-blue-500 bg-gray-50/50'
                    }`}
                  >
                    <input 
                      type="file" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadFile(file);
                          setUploadForm(prev => ({ ...prev, title: file.name.split('.')[0] || '' }));
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <div className={`p-3 rounded-xl ${uploadFile ? 'bg-green-100 text-green-600' : 'bg-white text-blue-600 shadow-sm'}`}>
                        <Upload size={24} />
                      </div>
                      {uploadFile ? (
                        <div>
                          <p className="text-sm font-bold text-green-700">{uploadFile.name}</p>
                          <p className="text-xs text-green-600 mt-0.5">{(uploadFile.size / 1024).toFixed(1)} KB • Ready to upload</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-bold text-[#0F172A]">Click to select or drag and drop</p>
                          <p className="text-xs text-[#64748B] mt-0.5">Maximum file size 10MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Display Title</label>
                       <input 
                         type="text"
                         required
                         value={uploadForm.title}
                         onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})}
                         placeholder="Document name"
                         className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Category</label>
                       <select 
                         value={uploadForm.category}
                         onChange={(e) => setUploadForm({...uploadForm, category: e.target.value})}
                         className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                       >
                         {systemConfig.categories.map(cat => (
                           <option key={cat} value={cat}>{cat}</option>
                         ))}
                       </select>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Department</label>
                       <select 
                         value={uploadForm.department}
                         onChange={(e) => setUploadForm({...uploadForm, department: e.target.value})}
                         className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                       >
                         {systemConfig.departments.map(dept => (
                           <option key={dept} value={dept}>{dept}</option>
                         ))}
                       </select>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={!uploadFile || isUploading}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    <span>{isUploading ? 'Uploading file...' : 'Complete Upload'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0] bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-[#0F172A]">Create New User</h3>
                <p className="text-xs text-[#64748B] font-medium mt-1">Set credentials and permissions</p>
              </div>
              <button 
                onClick={() => setIsAddUserModalOpen(false)} 
                className="text-[#64748B] hover:text-[#0F172A] p-1"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Full Name</label>
                <input 
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Email Address</label>
                <input 
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Initial Password</label>
                <input 
                  type="password"
                  required
                  value={userForm.password}
                  onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Role</label>
                  <select 
                    value={userForm.role}
                    onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Department</label>
                  <select 
                    value={userForm.department}
                    onChange={(e) => setUserForm({...userForm, department: e.target.value})}
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {systemConfig.departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-[#E2E8F0] text-[#64748B] rounded-xl text-sm font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreatingUser}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreatingUser && <Loader2 size={16} className="animate-spin" />}
                  <span>{isCreatingUser ? 'Creating...' : 'Create User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
       <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
         <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-blue-600" size={40} />
            <p className="text-sm font-medium text-[#64748B]">Loading Control Center...</p>
         </div>
       </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
