import { create } from 'zustand';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
}

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

import { persist } from 'zustand/middleware';

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      addMessage: (message) => set((state) => ({
        messages: [
          ...state.messages,
          { ...message, id: crypto.randomUUID(), timestamp: new Date() }
        ]
      })),
      setLoading: (loading) => set({ isLoading: loading }),
      clearMessages: () => set({ messages: [] })
    }),
    {
      name: 'aikb-chat-history',
      // Convert timestamps back to Date objects on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.messages = state.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
        }
      }
    }
  )
);
