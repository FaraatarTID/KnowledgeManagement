'use client';

import React, { memo } from 'react';
import { Bot, User, FileText } from 'lucide-react';

interface MessageSource {
  id: string;
  title: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: MessageSource[];
}

interface MessageProps {
  msg: ChatMessage;
}

/**
 * Optimized Message Component
 * - Memoized to prevent re-renders when parent updates
 * - Handles all message rendering internally
 * - Includes source display and timestamp
 */
export const Message = memo(({ msg }: MessageProps) => {
  const isUser = msg.role === 'user';
  
  return (
    <div className={`flex gap-6 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
        isUser 
          ? 'bg-white border border-[#E2E8F0]' 
          : 'bg-gradient-to-br from-blue-600 to-indigo-600'
      }`}>
        {isUser ? (
          <User size={20} className="text-[#64748B]" />
        ) : (
          <Bot size={20} className="text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col space-y-2 max-w-[80%] ${isUser ? 'items-end' : ''}`}>
        <div className={`p-6 rounded-2xl shadow-sm border ${
          isUser 
            ? 'bg-white border-[#E2E8F0] text-[#0F172A]' 
            : 'bg-white border-blue-100 text-[#0F172A]'
        }`}>
          <div className="prose prose-slate max-w-none whitespace-pre-wrap leading-relaxed overflow-hidden text-ellipsis">
            {msg.content}
          </div>
        </div>

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap" role="list" aria-label="Source documents">
            {msg.sources.map((s) => (
              <div 
                key={s.id} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100"
                role="listitem"
              >
                <FileText size={12} aria-hidden="true" />
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mt-1">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
});

Message.displayName = 'Message';