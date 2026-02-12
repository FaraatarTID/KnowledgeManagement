import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BookOpen, Plus, FileText, MessageSquare, Cloud } from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import { useDebounce } from '@/hooks/useDebounce';
import ErrorBoundary from '@/components/ErrorBoundary';
import { toast } from '@/components/ToastContainer';
import { api } from '@/lib/apiClient';

// Extracted Components
import { AddDocumentModal } from '@/components/AddDocumentModal';
import { ChatInterface } from '@/components/ChatInterface';
import { DocumentList } from '@/components/DocumentList';

function AIKBContent() {
  type Doc = { id: string; title?: string; content?: string; category?: string; createdAt?: string };
  type ChatMsg = { id: string; type: 'user' | 'ai'; content: string; timestamp: string; sources?: { id: string; title?: string }[] };
  type ApiDocument = { id: string };

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [pendingRequests, setPendingRequests] = useState(0);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [rawSearchTerm, setRawSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('documents');
  
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const hasLocalChangesRef = useRef(false);
  const pendingDocSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { loadData, saveDocuments, saveChatHistory } = useStorage();
  
  const searchTerm = useDebounce(rawSearchTerm, 300);
  const isLoading = pendingRequests > 0;

  const syncDocumentsToBackend = useCallback(async (docsToSync: Doc[]) => {
    if (docsToSync.length === 0) return;

    try {
      // Delta-Sync: Fetch existing IDs first to avoid redundant indexing
      const existingDocs = await api.get<ApiDocument[]>('/documents');
      const existingIds = new Set(existingDocs.map(d => d.id));
      
      const missingDocs = docsToSync.filter(doc => !existingIds.has(doc.id));
      
      if (missingDocs.length === 0) {
        console.log('SyncService: All local documents are already in the cloud index.');
        return;
      }

      console.log(`SyncService: Found ${missingDocs.length} new local documents to sync.`);
      const result = await api.syncDocuments(missingDocs);
      
      if (result.stats && result.stats.successes > 0) {
        toast.success(`Synced ${result.stats.successes} new documents to AI search`);
      }
      if (result.stats && result.stats.failures > 0) {
        toast.error(`${result.stats.failures} documents failed to sync`);
      }
    } catch (error) {
      console.warn('Could not perform delta-sync with backend:', error);
    }
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      try {
          const { documents: loadedDocs, chatHistory: loadedChat } = await loadData();

          const normalizeDoc = (d: unknown): Doc => {
            const obj = (d as Record<string, unknown>) || {};
            return {
              id: typeof obj.id === 'string' && obj.id ? obj.id : uuidv4(),
              title: typeof obj.title === 'string' ? obj.title : String(obj.title ?? ''),
              content: typeof obj.content === 'string' ? obj.content : String(obj.content ?? ''),
              category: typeof obj.category === 'string' ? obj.category : String(obj.category ?? ''),
              createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
            };
          };

          const normalizeMsg = (m: unknown): ChatMsg => {
            const obj = (m as Record<string, unknown>) || {};
            return {
              id: typeof obj.id === 'string' && obj.id ? obj.id : uuidv4(),
              type: obj.type === 'ai' ? 'ai' : 'user',
              content: typeof obj.content === 'string' ? obj.content : String(obj.content ?? ''),
              timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
              sources: Array.isArray(obj.sources) ? (obj.sources as unknown[]).map(s => {
                const si = s as Record<string, unknown>;
                return { id: String(si?.id ?? ''), title: String(si?.title ?? '') };
              }) : undefined,
            };
          };

          const safeDocs = Array.isArray(loadedDocs) ? loadedDocs.map(normalizeDoc) : [];
          const safeChat = Array.isArray(loadedChat) ? loadedChat.map(normalizeMsg) : [];

          if (hasLocalChangesRef.current) {
            return;
          }

          setDocuments(safeDocs);
          setChatHistory(safeChat);

          if (safeDocs.length === 0 && safeChat.length === 0) {
            toast.info('Welcome! Add some documents to get started.');
          } else if (safeDocs.length > 0) {
            const syncTimeout = setTimeout(() => {
              syncDocumentsToBackend(safeDocs);
            }, 1000);
            return () => clearTimeout(syncTimeout);
          }
      } catch {
        toast.error('Failed to load data. Starting with empty state.');
        setDocuments([]);
        hasLocalChangesRef.current = true;
      setChatHistory([]);
      }
    };

    initializeData();
  }, [loadData, syncDocumentsToBackend]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatHistory, activeTab]);

  const addDocument = useCallback(async (doc: { title: string; content: string; category: string }) => {
    const newDoc = {
      id: uuidv4(),
      ...doc,
      createdAt: new Date().toISOString()
    };
    
    const updatedDocs = [...documents, newDoc];
    hasLocalChangesRef.current = true;
    setDocuments(updatedDocs);
    
    try {
      await saveDocuments(updatedDocs, chatHistory);

      if (pendingDocSyncRef.current) {
        clearTimeout(pendingDocSyncRef.current);
      }

      pendingDocSyncRef.current = setTimeout(async () => {
        try {
          await api.addDocument(newDoc);
          toast.success('Document added and synced for AI search');
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          toast.error(msg.includes('Failed to fetch') ? 'Document saved locally. Cannot connect to server.' : (msg || 'Document saved locally. Sync failed.'));
        } finally {
          pendingDocSyncRef.current = null;
        }
      }, 200);

      setShowAddDoc(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg.includes('Failed to fetch') ? 'Document saved locally. Cannot connect to server.' : (msg || 'Document saved locally. Sync failed.'));
      setShowAddDoc(false);
    }
  }, [documents, chatHistory, saveDocuments]);

  const deleteDocument = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    const updatedDocs = documents.filter(doc => doc.id !== id);
    hasLocalChangesRef.current = true;
    setDocuments(updatedDocs);
    
    try {
      await saveDocuments(updatedDocs);
      toast.success('Document deleted');
    } catch {
      setDocuments(documents);
      toast.error('Failed to delete document');
    }
  }, [documents, saveDocuments]);

  const filteredDocs = React.useMemo(() => {
    if (!searchTerm.trim()) return documents;
    const q = searchTerm.toLowerCase();
    return documents.filter(doc => 
      String(doc.title || '').toLowerCase().includes(q) ||
      String(doc.content || '').toLowerCase().includes(q) ||
      String(doc.category || '').toLowerCase().includes(q)
    );
  }, [documents, searchTerm]);

  const queryAI = useCallback(async () => {
    if (!currentQuery.trim()) {
      toast.error('Please enter a question');
      return;
    }

    if (documents.length === 0) {
      toast.error('Please add at least one document first');
      return;
    }

    const userMsg: ChatMsg = {
      id: uuidv4(),
      type: 'user',
      content: currentQuery,
      timestamp: new Date().toISOString()
    };

    if (pendingDocSyncRef.current) {
      clearTimeout(pendingDocSyncRef.current);
      pendingDocSyncRef.current = null;
    }

    hasLocalChangesRef.current = true;
    setChatHistory(prev => [...prev, userMsg]);
    const queryToSubmit = currentQuery;
    setCurrentQuery('');
    setPendingRequests(prev => prev + 1);

    try {
      const timeoutMs = 30000;
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Request timed out. Please try again.'));
        }, timeoutMs);
      });
      let data: Awaited<ReturnType<typeof api.query>>;
      try {
        data = await Promise.race([
          api.query(queryToSubmit, controller.signal),
          timeoutPromise
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      const aiResponse = String(data.answer ?? (data as { content?: string }).content ?? '');
      setChatHistory((prev) => {
        const finalHistory: ChatMsg[] = [
          ...prev,
          {
            id: uuidv4(),
            type: 'ai',
            content: aiResponse,
            timestamp: new Date().toISOString()
          }
        ];
        Promise.resolve(saveChatHistory(finalHistory, documents)).catch(console.error);
        return finalHistory;
      });
      toast.success('Response received');

    } catch (error: unknown) {
      setCurrentQuery(queryToSubmit);
      const emsg = error instanceof Error ? error.message : String(error);
      toast.error(emsg.includes('Request timed out') || emsg.includes('AbortError') || emsg.includes('aborted')
        ? 'Request timed out. Please try again.'
        : (emsg.includes('Failed to fetch') ? 'Cannot connect to server.' : emsg));
    } finally {
      setPendingRequests(prev => Math.max(0, prev - 1));
    }
  }, [currentQuery, documents, saveChatHistory]);

  const clearChat = useCallback(async () => {
    if (!confirm('Are you sure you want to clear the chat history?')) return;
    try {
      hasLocalChangesRef.current = true;
      setChatHistory([]);
      await saveChatHistory([], documents);
      toast.success('Chat history cleared');
    } catch {
      toast.error('Failed to clear chat history');
    }
  }, [documents, saveChatHistory]);

  const handleCloudBackup = useCallback(async () => {
    try {
      setPendingRequests(prev => prev + 1);
      toast.info('در حال پشتیبان‌گیری ابری...');
      const result = await api.cloudBackup();
      if (result.success) {
        toast.success('پشتیبان‌گیری موفق: پایگاه داده با گوگل درایو همگام شد');
      } else {
        toast.error(`خطا در پشتیبان‌گیری: ${result.error || 'خطای ناشناخته'}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد';
      toast.error(`خطا در اتصال: ${message}`);
    } finally {
      setPendingRequests(prev => Math.max(0, prev - 1));
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <BookOpen className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  سیستم مدیریت دانش هوشمند
                </h1>
                <p className="text-sm text-gray-500">
                  {documents.length} سند | {chatHistory.filter((m) => m.type === 'user').length} پرسش
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCloudBackup}
                disabled={isLoading}
                title="Backup database to Google Drive"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                <Cloud size={20} className="text-blue-500" />
                <span>پشتیبان‌گیری ابری</span>
              </button>
              <button
                onClick={() => setShowAddDoc(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
              >
                <Plus size={20} />
                <span>افزودن سند</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="lg:hidden bg-white border-b border-gray-200">
        <div className="flex">
          <button onClick={() => setActiveTab('documents')} className={`flex-1 py-3 text-center font-medium ${activeTab === 'documents' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
            <FileText className="inline ml-2" size={18} /> اسناد ({documents.length})
          </button>
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-center font-medium ${activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
            <MessageSquare className="inline ml-2" size={18} /> چت ({chatHistory.filter((m) => m.type === 'user').length})
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <DocumentList 
          documents={filteredDocs} 
          searchTerm={rawSearchTerm} 
          setSearchTerm={setRawSearchTerm} 
          onDelete={deleteDocument} 
          onQueryAI={queryAI} 
          isLoading={isLoading} 
          activeTab={activeTab} 
        />
        <ChatInterface 
          chatHistory={chatHistory} 
          isLoading={isLoading} 
          currentQuery={currentQuery} 
          setCurrentQuery={setCurrentQuery} 
          onQueryAI={queryAI} 
          onClearChat={clearChat} 
          activeTab={activeTab} 
          hasDocuments={documents.length > 0} 
          chatEndRef={chatEndRef as React.RefObject<HTMLDivElement>} 
        />
      </div>

      {showAddDoc && <AddDocumentModal onClose={() => setShowAddDoc(false)} onAdd={addDocument} />}
    </div>
  );
}

export default function AIKB() {
  return (
    <ErrorBoundary>
      <AIKBContent />
    </ErrorBoundary>
  );
}
