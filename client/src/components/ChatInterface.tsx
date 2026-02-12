import React from 'react';
import { MessageSquare, AlertTriangle, Send, Loader2 } from 'lucide-react';

interface ChatMsg {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  sources?: { id: string; title?: string }[];
}

interface ChatInterfaceProps {
  chatHistory: ChatMsg[];
  isLoading: boolean;
  currentQuery: string;
  setCurrentQuery: (query: string) => void;
  onQueryAI: () => void;
  onClearChat: () => void;
  activeTab: string;
  hasDocuments: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export function ChatInterface({
  chatHistory,
  isLoading,
  currentQuery,
  setCurrentQuery,
  onQueryAI,
  onClearChat,
  activeTab,
  hasDocuments,
  chatEndRef
}: ChatInterfaceProps) {
  return (
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
            onClick={onClearChat}
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
            onKeyPress={(e) => e.key === 'Enter' && onQueryAI()}
            placeholder="سوال خود را بپرسید..."
            disabled={!hasDocuments}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          />
          <button
            onClick={onQueryAI}
            disabled={!currentQuery.trim() || !hasDocuments}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
            <span>ارسال</span>
          </button>
        </div>
        {!hasDocuments && (
          <p className="text-sm text-amber-600 mt-2 text-center">
            ⚠️ برای استفاده از چت، ابتدا حداقل یک سند اضافه کنید
          </p>
        )}
      </div>
    </div>
  );
}
