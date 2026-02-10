'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  FileText,
  ChevronRight, 
  Loader2
} from 'lucide-react';

import { useChatStore } from '@/store/chatStore';
import api, { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const { messages, isLoading, addMessage, setLoading } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // user state is intentionally unused here; session is validated but not stored

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [modelName, setModelName] = useState('Gemini 2.5 Flash');

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
          router.push('/login');
          return;
        }

        // Verify session with server
        const me = await authApi.getMe();
        if (!me) {
          router.push('/login');
          return;
        }

        // Fetch config for model name
        const configRes = await api.get('/config');
        if (configRes.data.model) {
          setModelName(configRes.data.model);
        }
      } catch (e) {
        console.error('Auth check failed', e);
        router.push('/login');
      }
    };
    initAuth();
  }, [router]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setInput('');
    addMessage({ role: 'user', content: userMessage });
    
    setLoading(true);
    
    try {
      const response = await api.post('/query', { query: userMessage });
      const data = response.data;

      addMessage({ 
        role: 'assistant', 
        content: data.answer || "I'm sorry, I couldn't process your request.",
        sources: Array.isArray(data.sources)
          ? data.sources.map((s: unknown) => {
              if (typeof s === 'object' && s !== null) {
                const so = s as Record<string, unknown>;
                const id = typeof so.id === 'string' ? so.id : (typeof so.docId === 'string' ? so.docId : 'unknown');
                const title = typeof so.metadata === 'object' && so.metadata !== null && typeof (so.metadata as Record<string, unknown>).title === 'string'
                  ? (so.metadata as Record<string, unknown>).title as string
                  : (typeof so.docId === 'string' ? so.docId : 'Unknown Source');
                return { id, title };
              }
              return { id: 'unknown', title: 'Unknown Source' };
            })
          : undefined
      });
    } catch (error) {
      console.error('Query failed', error);
      addMessage({ 
        role: 'assistant', 
        content: "I'm sorry, I encountered an error while searching the knowledge base. Please try again." 
      });
    } finally {
      setLoading(false);
    }
  };

  // Logout handled by Sidebar; no-op here

  return (
    <div className="flex flex-col h-full">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-[#E2E8F0] flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#0F172A]">Intelligent Retrieval</h2>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Live</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
              <Bot size={14} className="text-blue-600" />
              <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">{modelName}</span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div 
          className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth" 
          role="log" 
          aria-live="polite" 
          aria-label="Chat messages"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-4" aria-hidden="true">
                <Bot className="text-blue-600" size={40} />
              </div>
              <h3 className="text-3xl font-bold text-[#0F172A]">How can I help you today?</h3>
              <p className="text-[#64748B] text-lg">
                I can help you search through company documents, explain processes, or access technical specifications.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full pt-8" role="group" aria-label="Example questions">
                {[
                  "What's our security policy?",
                  "How to set up Product Alpha?",
                  "Who is the owner of HR docs?",
                  "Onboarding checklist for devs"
                ].map((q) => (
                  <button 
                    key={q}
                    onClick={() => setInput(q)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setInput(q);
                      }
                    }}
                    className="p-4 bg-white border border-[#E2E8F0] rounded-2xl text-left hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 transition-all group focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    aria-label={`Use example question: ${q}`}
                  >
                    <p className="text-sm font-medium text-[#0F172A] group-hover:text-blue-600">{q}</p>
                    <ChevronRight size={16} className="text-[#94A3B8] mt-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-white border border-[#E2E8F0]' 
                      : 'bg-gradient-to-br from-blue-600 to-indigo-600'
                  }`}>
                    {msg.role === 'user' ? <User size={20} className="text-[#64748B]" /> : <Bot size={20} className="text-white" />}
                  </div>
                  <div className={`flex flex-col space-y-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                    <div className={`p-6 rounded-2xl shadow-sm border ${
                      msg.role === 'user' 
                        ? 'bg-white border-[#E2E8F0] text-[#0F172A]' 
                        : 'bg-white border-blue-100 text-[#0F172A]'
                    }`}>
                      <div className="prose prose-slate max-w-none whitespace-pre-wrap leading-relaxed overflow-hidden text-ellipsis">
                        {msg.content}
                      </div>
                    </div>
                    {msg.sources && (
                      <div className="flex gap-2 mt-2">
                        {Array.isArray(msg.sources) && msg.sources.map((s: unknown) => {
                          if (typeof s === 'object' && s !== null) {
                            const so = s as Record<string, unknown>;
                            return (
                              <div key={String(so.id ?? Math.random())} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100">
                                <FileText size={12} />
                                <span>{String(so.title ?? 'Unknown')}</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                    <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mt-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-6 animate-pulse" role="status" aria-live="polite" aria-label="AI is thinking">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center" aria-hidden="true">
                    <Loader2 size={20} className="text-blue-600 animate-spin" />
                  </div>
                  <div className="bg-white border border-blue-100 p-6 rounded-2xl w-full max-w-lg" aria-busy="true">
                    <div className="h-4 bg-slate-100 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent">
          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[28px] blur-md opacity-0 group-focus-within:opacity-20 transition-all duration-500"></div>
            <div className="relative bg-white border border-[#E2E8F0] rounded-[24px] shadow-xl shadow-blue-500/5 transition-all outline-none">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask me anything..."
                disabled={isLoading}
                aria-label="Ask a question to the knowledge base"
                aria-describedby="input-hint"
                aria-busy={isLoading}
                className="w-full px-8 py-6 bg-transparent border-none focus:ring-2 focus:ring-blue-500/20 rounded-[24px] text-lg text-[#0F172A] placeholder-[#94A3B8] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  aria-label={isLoading ? "Processing..." : !input.trim() ? "Type a message to send" : "Send message"}
                  aria-disabled={isLoading || !input.trim()}
                  className="bg-[#0F172A] text-white p-3 rounded-2xl hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                  title={isLoading ? "Processing..." : !input.trim() ? "Type a message to send" : "Send message"}
                >
                  <Send size={24} />
                </button>
              </div>
            </div>
            <p id="input-hint" className="text-center text-[10px] text-[#94A3B8] mt-4 font-bold uppercase tracking-[0.2em]">
              Powered by Gemini 2.5 Flash-Lite · Security Level: Internal
            </p>
          </div>
        </div>
    </div>
  );
}
