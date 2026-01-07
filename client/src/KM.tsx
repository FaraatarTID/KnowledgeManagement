import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Search, Plus, Trash2, Send, BookOpen, MessageSquare, Loader2, X, FileText, AlertTriangle } from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import { useDebounce } from '@/hooks/useDebounce';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastContainer, toast } from '@/components/ToastContainer';

function AIKBContent() {
  const [documents, setDocuments] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [rawSearchTerm, setRawSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('documents');
  
  const chatEndRef = useRef(null);
  const { loadData, saveDocuments, saveChatHistory } = useStorage();
  
  // Debounced search term (300ms delay)
  const searchTerm = useDebounce(rawSearchTerm, 300);

  // Sync existing documents to backend (for first-time load or recovery)
  // Moved to useEffect to avoid stale closures - see useDocumentSync below
  const syncDocumentsToBackend = useCallback(async (docsToSync: any[]) => {
    if (docsToSync.length === 0) return;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const response = await fetch(`${baseUrl}/documents/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documents: docsToSync }),
      });

      if (!response.ok) {
        throw new Error('Backend sync failed');
      }

      const result = await response.json();
      
      if (result.stats && result.stats.successes > 0) {
        toast.success(`Synced ${result.stats.successes} documents to AI search`);
      }
      
      if (result.stats && result.stats.failures > 0) {
        toast.error(`${result.stats.failures} documents failed to sync`);
      }
    } catch (error) {
      console.warn('Could not sync documents to backend:', error);
      // Don't show error toast - this is background sync
    }
  }, []); // Empty deps is OK here - it's a pure API call helper

  // Load data on mount with corruption recovery
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { documents: loadedDocs, chatHistory: loadedChat } = await loadData();
        setDocuments(loadedDocs);
        setChatHistory(loadedChat);
        
        if (loadedDocs.length === 0 && loadedChat.length === 0) {
          toast.info('Welcome! Add some documents to get started.');
        } else if (loadedDocs.length > 0) {
          // Sync existing documents to backend in background
          // Use a small delay to avoid blocking initial render
          const syncTimeout = setTimeout(() => {
            // Capture docs at this moment to avoid stale closure
            syncDocumentsToBackend(loadedDocs);
          }, 1000);

          // Cleanup timeout if component unmounts
          return () => clearTimeout(syncTimeout);
        }
      } catch (error) {
        toast.error('Failed to load data. Starting with empty state.');
        setDocuments([]);
        setChatHistory([]);
      }
    };

    initializeData();
  }, [loadData]); // Removed syncDocumentsToBackend - it's memoized with empty deps

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatHistory, activeTab]);

  // Optimistic document addition with backend sync
  const addDocument = useCallback(async (doc) => {
    const newDoc = {
      id: uuidv4(),
      ...doc,
      createdAt: new Date().toISOString()
    };
    
    // Optimistic update
    const updatedDocs = [...documents, newDoc];
    setDocuments(updatedDocs);
    
    try {
      // 1. Save to local IndexedDB
      await saveDocuments(updatedDocs);
      
      // 2. Sync to backend Vector Database
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const response = await fetch(`${baseUrl}/documents/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documents: [newDoc] }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to sync with backend');
      }

      const result = await response.json();
      
      if (result.stats && result.stats.failures > 0) {
        toast.error(`Document saved locally, but ${result.stats.failures} failed to sync to AI`);
      } else {
        toast.success('Document added and synced for AI search');
      }
      
      setShowAddDoc(false);
      
    } catch (error) {
      console.error('Document sync error:', error);
      
      // Rollback on failure
      setDocuments(documents);
      
      // Show appropriate error
      if (error.message.includes('Failed to fetch')) {
        toast.error('Document saved locally. Cannot connect to server for AI sync.');
      } else {
        toast.error(error.message || 'Failed to save document');
      }
    }
  }, [documents, saveDocuments]); // Fixed: Now properly depends on documents state

  // Optimistic document deletion
  const deleteDocument = useCallback(async (id) => {
    const docToDelete = documents.find(doc => doc.id === id);
    if (!docToDelete) return;

    // Optimistic update
    const updatedDocs = documents.filter(doc => doc.id !== id);
    setDocuments(updatedDocs);
    
    try {
      await saveDocuments(updatedDocs);
      toast.success('Document deleted');
    } catch (error) {
      // Rollback on failure
      setDocuments(documents);
      toast.error('Failed to delete document');
    }
  }, [documents, saveDocuments]);

  // Debounced search with main thread protection
  const filteredDocs = React.useMemo(() => {
    if (!searchTerm.trim()) return documents;
    
    return documents.filter(doc => 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  // Optimistic AI query with proper RAG architecture and race condition prevention
  const queryAI = useCallback(async () => {
    if (!currentQuery.trim()) {
      toast.error('Please enter a question');
      return;
    }

    if (documents.length === 0) {
      toast.error('Please add at least one document first');
      return;
    }

    // Generate unique query ID for tracking
    const queryId = uuidv4();
    
    // Create optimistic user message
    const userMsg = {
      id: queryId,
      type: 'user',
      content: currentQuery,
      timestamp: new Date().toISOString()
    };

    // Optimistic UI update
    setChatHistory(prev => [...prev, userMsg]);
    const queryToSubmit = currentQuery; // Capture before clearing
    setCurrentQuery('');
    setIsLoading(true);

    try {
      // CRITICAL FIX: Only send query, NOT documents
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: queryToSubmit }), // Use captured query
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Server error');
      }

      const data = await response.json();
      const aiResponse = data.content;

      // CRITICAL FIX: Only update if this query is still the latest
      setChatHistory(prev => {
        // Check if our optimistic user message is still there
        const hasThisQuery = prev.some(msg => msg.id === queryId);
        if (!hasThisQuery) {
          console.warn('Query was cleared or replaced, skipping update');
          return prev;
        }

        // Remove optimistic message and add real response
        const withoutOptimistic = prev.filter(msg => msg.id !== queryId);
        const finalHistory = [
          ...withoutOptimistic,
          userMsg,
          {
            id: uuidv4(),
            type: 'ai',
            content: aiResponse,
            timestamp: new Date().toISOString()
          }
        ];

        // Save to storage in background
        saveChatHistory(finalHistory).catch(err => {
          console.error('Failed to save chat history:', err);
        });

        return finalHistory;
      });
      
      toast.success('Response received');

    } catch (error) {
      console.error('Error querying AI:', error);
      
      // CRITICAL FIX: Remove only this query's optimistic message
      setChatHistory(prev => prev.filter(msg => msg.id !== queryId));
      
      // Show user-friendly error
      if (error.name === 'AbortError') {
        toast.error('Request timed out. Please try again.');
      } else if (error.message.includes('Failed to fetch')) {
        toast.error('Cannot connect to server. Please check if backend is running.');
      } else if (error.message.includes('413')) {
        toast.error('Request too large. This should not happen with proper RAG.');
      } else {
        toast.error(error.message || 'Failed to get AI response');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentQuery, documents.length, saveChatHistory]); // Fixed dependencies

  // Clear chat with confirmation
  const clearChat = useCallback(async () => {
    if (!confirm('Are you sure you want to clear the chat history?')) {
      return;
    }

    try {
      setChatHistory([]);
      await saveChatHistory([]);
      toast.success('Chat history cleared');
    } catch (error) {
      toast.error('Failed to clear chat history');
    }
  }, [saveChatHistory]);

  // Handle Enter key in search
  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      queryAI();
    }
  };

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
                  {documents.length} سند | {chatHistory.filter(m => m.type === 'user').length} پرسش
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddDoc(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
              >
                <Plus size={20} />
                <span>افزودن سند</span>
              </button>
              {documents.length > 0 && (
                <button
                  onClick={() => syncDocumentsToBackend(documents)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all"
                  title="Sync all documents to AI backend"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>همگام‌سازی</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="lg:hidden bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'documents'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500'
            }`}
          >
            <FileText className="inline ml-2" size={18} />
            اسناد ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'chat'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500'
            }`}
          >
            <MessageSquare className="inline ml-2" size={18} />
            چت ({chatHistory.filter(m => m.type === 'user').length})
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`${
          activeTab === 'documents' ? 'flex' : 'hidden'
        } lg:flex flex-col w-full lg:w-2/5 bg-white border-l border-gray-200`}>
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="جستجو در اسناد..."
                value={rawSearchTerm}
                onChange={(e) => setRawSearchTerm(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {rawSearchTerm && (
              <p className="text-xs text-gray-500 mt-1">
                جستجوی اولیه: {rawSearchTerm} | نتایج: {filteredDocs.length}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredDocs.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="mx-auto text-gray-300" size={48} />
                <p className="mt-4 text-gray-500">
                  {documents.length === 0 
                    ? 'هنوز سندی اضافه نشده است'
                    : 'نتیجه‌ای یافت نشد'}
                </p>
              </div>
            ) : (
              filteredDocs.map(doc => (
                <div key={doc.id} className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">{doc.title}</h3>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title="Delete document"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{doc.content}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      {doc.category}
                    </span>
                    <span className="text-gray-400">
                      {new Date(doc.createdAt).toLocaleDateString('fa-IR')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${
          activeTab === 'chat' ? 'flex' : 'hidden'
        } lg:flex flex-col flex-1 bg-gradient-to-br from-gray-50 to-blue-50`}>
          <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <MessageSquare className="text-blue-600" size={24} />
              چت هوشمند
            </h2>
            {chatHistory.length > 0 && (
              <button
                onClick={clearChat}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                پاک کردن تاریخچه
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="mx-auto text-gray-300" size={48} />
                <p className="mt-4 text-gray-500">سوال خود را بپرسید</p>
                <p className="text-sm text-gray-400 mt-2">من بر اساس اسناد موجود پاسخ می‌دهم</p>
                <p className="text-xs text-gray-400 mt-4">
                  <AlertTriangle className="inline w-4 h-4" /> 
                  {' '}فقط پرسش خود را وارد کنید - سیستم به صورت خودکار اسناد را جستجو می‌کند
                </p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-lg p-4 ${
                    msg.type === 'user'
                      ? 'bg-white border border-gray-200'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-2 ${
                      msg.type === 'user' ? 'text-gray-400' : 'text-blue-100'
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString('fa-IR')}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && queryAI()}
                placeholder="سوال خود را بپرسید..."
                disabled={isLoading || documents.length === 0}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
              <button
                onClick={queryAI}
                disabled={isLoading || !currentQuery.trim() || documents.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                <span>{isLoading ? 'در حال پردازش...' : 'ارسال'}</span>
              </button>
            </div>
            {documents.length === 0 && (
              <p className="text-sm text-amber-600 mt-2 text-center">
                ⚠️ برای استفاده از چت، ابتدا حداقل یک سند اضافه کنید
              </p>
            )}
          </div>
        </div>
      </div>

      {showAddDoc && (
        <AddDocumentModal onClose={() => setShowAddDoc(false)} onAdd={addDocument} />
      )}
    </div>
  );
}

function AddDocumentModal({ onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = () => {
    if (!title.trim() || !content.trim() || !category.trim()) {
      toast.error('Please fill all fields');
      return;
    }

    onAdd({ title, content, category });
    setTitle('');
    setContent('');
    setCategory('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">افزودن سند جدید</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">عنوان سند</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: راهنمای استفاده از سیستم"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">دسته‌بندی</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: فنی، اداری، آموزشی"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">محتوای سند</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="محتوای کامل سند را اینجا وارد کنید..."
            />
            <p className="text-xs text-gray-500 mt-1">Ctrl+Enter برای ذخیره سریع</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSubmit}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all font-medium"
            >
              ذخیره سند
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              انصراف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main wrapper with Error Boundary
export default function AIKB() {
  return (
    <ErrorBoundary>
      <AIKBContent />
    </ErrorBoundary>
  );
}