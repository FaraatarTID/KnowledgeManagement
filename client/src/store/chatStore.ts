import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  cleanupOldMessages: () => void;
}

// SECURITY: Memory leak prevention - maximum messages to store
const MAX_MESSAGES = 50;
// SECURITY: Maximum age for messages (24 hours in milliseconds)
const MAX_MESSAGE_AGE = 24 * 60 * 60 * 1000;

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      isLoading: false,
      
      addMessage: (message) => set((state) => {
        const newMessage = { 
          ...message, 
          id: crypto.randomUUID(), 
          timestamp: new Date() 
        };
        
        const updatedMessages = [...state.messages, newMessage];
        
        // SECURITY: Apply retention policy immediately
        const cleanedMessages = applyRetentionPolicy(updatedMessages);
        
        return { messages: cleanedMessages };
      }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      clearMessages: () => set({ messages: [] }),
      
      // SECURITY: Explicit cleanup method for manual calls
      cleanupOldMessages: () => set((state) => ({
        messages: applyRetentionPolicy(state.messages)
      }))
    }),
    {
      name: 'aikb-chat-history',
      // SECURITY: Apply retention policy on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert timestamps back to Date objects
          state.messages = state.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          
          // Apply retention policy to existing data
          state.messages = applyRetentionPolicy(state.messages);
        }
      }
    }
  )
);

/**
 * SECURITY: Apply message retention policy to prevent memory leaks
 * 1. Remove messages older than MAX_MESSAGE_AGE
 * 2. Keep only the most recent MAX_MESSAGES
 */
function applyRetentionPolicy(messages: ChatMessage[]): ChatMessage[] {
  const now = Date.now();
  
  // Filter by age
  const recentMessages = messages.filter(msg => {
    const age = now - msg.timestamp.getTime();
    return age < MAX_MESSAGE_AGE;
  });
  
  // Keep only the most recent N messages
  if (recentMessages.length > MAX_MESSAGES) {
    return recentMessages.slice(-MAX_MESSAGES);
  }
  
  return recentMessages;
}
