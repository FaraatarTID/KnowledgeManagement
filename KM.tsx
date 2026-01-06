import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, Send, BookOpen, MessageSquare, Loader2, X, FileText } from 'lucide-react';

export default function AIKB() {
  const [documents, setDocuments] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('documents');
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const loadData = async () => {
    try {
      const docsResult = await window.storage.get('aikb-documents');
      const chatResult = await window.storage.get('aikb-chat-history');
      
      if (docsResult?.value) {
        setDocuments(JSON.parse(docsResult.value));
      }
      if (chatResult?.value) {
        setChatHistory(JSON.parse(chatResult.value));
      }
    } catch (error) {
      console.log('Loading initial state');
    }
  };

  const saveDocuments = async (docs) => {
    try {
      await window.storage.set('aikb-documents', JSON.stringify(docs));
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  const saveChatHistory = async (history) => {
    try {
      await window.storage.set('aikb-chat-history', JSON.stringify(history));
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  };

  const addDocument = async (doc) => {
    const newDoc = {
      id: Date.now().toString(),
      ...doc,
      createdAt: new Date().toISOString()
    };
    const updatedDocs = [...documents, newDoc];
    setDocuments(updatedDocs);
    await saveDocuments(updatedDocs);
    setShowAddDoc(false);
  };

  const deleteDocument = async (id) => {
    const updatedDocs = documents.filter(doc => doc.id !== id);
    setDocuments(updatedDocs);
    await saveDocuments(updatedDocs);
  };

  const queryAI = async () => {
    if (!currentQuery.trim() || documents.length === 0) {
      alert(documents.length === 0 
        ? 'لطفا ابتدا حداقل یک سند اضافه کنید'
        : 'لطفا سوال خود را بنویسید');
      return;
    }

    setIsLoading(true);

    const context = documents.map((doc, idx) => 
      `[سند ${idx + 1}: ${doc.title}]\nدسته‌بندی: ${doc.category}\nمحتوا: ${doc.content}\n`
    ).join('\n---\n\n');

    const prompt = `شما یک دستیار دانشی هستید که فقط بر اساس اسناد ارائه شده پاسخ می‌دهید.

اسناد موجود:
${context}

سوال کاربر: ${currentQuery}

دستورالعمل‌ها:
- فقط بر اساس اسناد ارائه شده پاسخ دهید
- حتما ذکر کنید از کدام سند(ها) استفاده کرده‌اید
- اگر اطلاعات در اسناد نیست، صریحا بگویید
- پاسخ را به زبان فارسی و واضح بدهید

پاسخ:`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const aiResponse = data.content[0].text;

      const newHistory = [
        ...chatHistory,
        { type: 'user', content: currentQuery, timestamp: new Date().toISOString() },
        { type: 'ai', content: aiResponse, timestamp: new Date().toISOString() }
      ];

      setChatHistory(newHistory);
      await saveChatHistory(newHistory);
      setCurrentQuery('');
    } catch (error) {
      alert('خطا در ارتباط با AI: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (confirm('آیا مطمئن هستید که می‌خواهید تاریخچه چت را پاک کنید؟')) {
      setChatHistory([]);
      await window.storage.delete('aikb-chat-history');
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <button
              onClick={() => setShowAddDoc(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <Plus size={20} />
              <span>افزودن سند</span>
            </button>
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
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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
    if (title.trim() && content.trim() && category.trim()) {
      onAdd({ title, content, category });
      setTitle('');
      setContent('');
      setCategory('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">افزودن سند جدید</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: راهنمای استفاده از سیستم"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">دسته‌بندی</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: فنی، اداری، آموزشی"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">محتوای سند</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="محتوای کامل سند را اینجا وارد کنید..."
            />
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