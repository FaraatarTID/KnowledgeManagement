import { get, set, del } from 'idb-keyval';
import { useCallback, useRef } from 'react';

interface StorageData {
  documents: unknown[];
  chatHistory: unknown[];
  timestamp: number;
}

/**
 * Secure storage hook with corruption recovery
 * Uses IndexedDB for persistent client-side storage
 * Optimized with debounced writes to prevent I/O bottlenecks
 */
export const useStorage = () => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Load data with corruption detection and recovery
   */
  const loadData = async (): Promise<StorageData> => {
    let docsResult: unknown | undefined;
    let chatResult: unknown | undefined;
    let backupResult: unknown | undefined;

    try {
      const results = await Promise.all([
        get('aikb-documents'),
        get('aikb-chat-history'),
        get('aikb-backup')
      ]);

      [docsResult, chatResult, backupResult] = results;

      let documents: unknown[] = [];
      if (typeof docsResult === 'string') {
        try {
          documents = JSON.parse(docsResult);
        } catch (e) {
          console.error('STORAGE_CORRUPTION', { type: 'documents', error: e });
        }
      } else {
        documents = (docsResult as unknown[]) || [];
      }

      let chatHistory: unknown[] = [];
      if (typeof chatResult === 'string') {
        try {
          chatHistory = JSON.parse(chatResult);
        } catch (e) {
          console.error('STORAGE_CORRUPTION', { type: 'chatHistory', error: e });
        }
      } else {
        chatHistory = (chatResult as unknown[]) || [];
      }

      return { documents, chatHistory, timestamp: Date.now() };

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('STORAGE_LOAD_FAILED', { error: message });

      if (backupResult) {
        try {
          const backup = backupResult as {
            docs?: unknown[];
            chat?: unknown[];
            timestamp?: number;
          };
          const recovered = {
            documents: Array.isArray(backup.docs) ? backup.docs : [],
            chatHistory: Array.isArray(backup.chat) ? backup.chat : [],
            timestamp: typeof backup.timestamp === 'number' ? backup.timestamp : Date.now()
          };
          
          await Promise.all([
            set('aikb-documents', recovered.documents),
            set('aikb-chat-history', recovered.chatHistory)
          ]);
          
          return recovered;
        } catch (e) {
             console.error('RECOVERY_FAILED', e);
        }
      }

      return { documents: [], chatHistory: [], timestamp: Date.now() };
    }
  };

  /**
   * Internal helper for debounced persistence
   */
  const persist = useCallback((docs: unknown[], chat: unknown[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await Promise.all([
           set('aikb-documents', docs),
           set('aikb-chat-history', chat),
           set('aikb-backup', { docs, chat, timestamp: Date.now() })
        ]);
        console.log('STORAGE_PERSISTED');
      } catch (err) {
        console.error('STORAGE_PERSIST_FAILED', err);
      }
    }, 1000); // 1 second debounce
  }, []);

  /**
   * Save documents (Debounced)
   */
  const saveDocuments = useCallback(async (documents: unknown[], currentChatHistory: unknown[] = []) => {
     persist(documents, currentChatHistory);
  }, [persist]);

  /**
   * Save chat history (Debounced)
   */
  const saveChatHistory = useCallback(async (chatHistory: unknown[], currentDocuments: unknown[] = []) => {
     persist(currentDocuments, chatHistory);
  }, [persist]);

  const clearAll = async () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    await Promise.all([
      del('aikb-documents'),
      del('aikb-chat-history'),
      del('aikb-backup')
    ]);
  };

  return {
    loadData,
    saveDocuments,
    saveChatHistory,
    clearAll
  };
};
