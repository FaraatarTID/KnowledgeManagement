'use client';

import React, { memo } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
}

/**
 * Optimized Chat Input Component
 * - Memoized to prevent re-renders on parent state changes
 * - Handles keyboard events internally
 * - Provides clear accessibility attributes
 */
export const ChatInput = memo(({ value, onChange, onSend, isLoading }: ChatInputProps) => {
  const disabled = !value.trim() || isLoading;
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[28px] blur-md opacity-0 group-focus-within:opacity-20 transition-all duration-500"></div>
      <div className="relative bg-white border border-[#E2E8F0] rounded-[24px] shadow-xl shadow-blue-500/5 transition-all outline-none">
        <input 
          type="text" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          disabled={isLoading}
          aria-label="Ask a question to the knowledge base"
          aria-describedby="input-hint"
          aria-busy={isLoading}
          className="w-full px-8 py-6 bg-transparent border-none focus:ring-2 focus:ring-blue-500/20 rounded-[24px] text-lg text-[#0F172A] placeholder-[#94A3B8] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button 
            onClick={onSend}
            disabled={disabled}
            aria-label={isLoading ? "Processing..." : !value.trim() ? "Type a message to send" : "Send message"}
            aria-disabled={isLoading || !value.trim()}
            className="bg-[#0F172A] text-white p-3 rounded-2xl hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            title={isLoading ? "Processing..." : !value.trim() ? "Type a message to send" : "Send message"}
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';