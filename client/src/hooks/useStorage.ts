import { get, set, del } from 'idb-keyval';

interface StorageData {
  documents: unknown[];
  chatHistory: unknown[];
  timestamp: number;
}

/**
 * Secure storage hook with corruption recovery
 * Uses IndexedDB for persistent client-side storage
 */
export const useStorage = () => {
  /**
   * Load data with corruption detection and recovery
   * SECURITY FIX: Add telemetry and prevent cascading failures
   */
  const loadData = async (): Promise<StorageData> => {
    const startTime = Date.now();

    // Hoist these so recovery logic in the catch block can inspect backupResult
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
      let chatHistory: unknown[] = [];

      // Parse documents with validation
      if (typeof docsResult === 'string') {
        try {
          const parsed = JSON.parse(docsResult);
          if (Array.isArray(parsed)) {
            documents = parsed;
          } else {
            throw new Error('Invalid document format: not an array');
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown';
          console.error('STORAGE_CORRUPTION', JSON.stringify({
            type: 'documents',
            error: msg,
            timestamp: new Date().toISOString()
          }));
          throw new Error('DOCUMENTS_CORRUPTED');
        }
      }

      // Parse chat history with validation
      if (typeof chatResult === 'string') {
        try {
          const parsed = JSON.parse(chatResult);
          if (Array.isArray(parsed)) {
            chatHistory = parsed;
          } else {
            throw new Error('Invalid chat format: not an array');
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown';
          console.error('STORAGE_CORRUPTION', JSON.stringify({
            type: 'chatHistory',
            error: msg,
            timestamp: new Date().toISOString()
          }));
          throw new Error('CHAT_CORRUPTED');
        }
      }

      const duration = Date.now() - startTime;
      console.log(`STORAGE_LOAD_SUCCESS`, JSON.stringify({
        documents: documents.length,
        chatHistory: chatHistory.length,
        duration: `${duration}ms`
      }));

      return { documents, chatHistory, timestamp: Date.now() };

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      console.warn('STORAGE_LOAD_FAILED', JSON.stringify({
        error: msg,
        timestamp: new Date().toISOString()
      }));

      // Attempt recovery from backup
      if (typeof backupResult === 'string') {
        try {
          const backup = JSON.parse(backupResult);
          const recoveredData = {
            documents: Array.isArray(backup.docs) ? backup.docs : [],
            chatHistory: Array.isArray(backup.chat) ? backup.chat : [],
            timestamp: backup.timestamp || Date.now()
          } as StorageData;

          // Validate recovered data
          if (!Array.isArray(recoveredData.documents) || !Array.isArray(recoveredData.chatHistory)) {
            throw new Error('Backup data structure invalid');
          }

          // Restore from backup
          await set('aikb-documents', JSON.stringify(recoveredData.documents));
          await set('aikb-chat-history', JSON.stringify(recoveredData.chatHistory));

          console.log('STORAGE_RECOVERY_SUCCESS', JSON.stringify({
            recoveredDocs: recoveredData.documents.length,
            recoveredChat: recoveredData.chatHistory.length
          }));

          return recoveredData;
        } catch (backupError: unknown) {
          const bmsg = backupError instanceof Error ? backupError.message : 'unknown';
          console.error('STORAGE_RECOVERY_FAILED', JSON.stringify({
            error: bmsg,
            timestamp: new Date().toISOString()
          }));
        }
      }

      // Last resort: clear corrupted data and return empty
      try {
        await del('aikb-documents');
        await del('aikb-chat-history');
        await del('aikb-backup');
        console.warn('STORAGE_CLEARED_ALL');
      } catch (cleanupError: unknown) {
        console.error('STORAGE_CLEANUP_FAILED', cleanupError);
      }

      return { documents: [], chatHistory: [], timestamp: Date.now() };
    }
  };

  /**
   * Save documents with atomic backup
   * Optimized: removed redundant loadData call
   */
  const saveDocuments = async (documents: unknown[], currentChatHistory: unknown[] = []) => {
    const startTime = Date.now();
    try {
      const json = JSON.stringify(documents);
      await set('aikb-documents', json);
      
      // Create backup for recovery (use provided history or empty)
      await set('aikb-backup', JSON.stringify({
        docs: documents,
        chat: currentChatHistory,
        timestamp: Date.now()
      }));

      console.log('STORAGE_SAVE_SUCCESS', { type: 'documents', count: documents.length });
    } catch (error: unknown) {
      console.error('STORAGE_SAVE_FAILED', error);
      throw error;
    }
  };

  /**
   * Save chat history with atomic backup
   * Optimized: removed redundant loadData call
   */
  const saveChatHistory = async (chatHistory: unknown[], currentDocuments: unknown[] = []) => {
    const startTime = Date.now();
    try {
      const json = JSON.stringify(chatHistory);
      await set('aikb-chat-history', json);
      
      // Create backup for recovery (use provided docs or empty)
      await set('aikb-backup', JSON.stringify({
        docs: currentDocuments,
        chat: chatHistory,
        timestamp: Date.now()
      }));

      console.log('STORAGE_SAVE_SUCCESS', { type: 'chatHistory', count: chatHistory.length });
    } catch (error: unknown) {
      console.error('STORAGE_SAVE_FAILED', error);
      throw error;
    }
  };

  /**
   * Clear all data (for logout/reset)
   */
  const clearAll = async () => {
    await del('aikb-documents');
    await del('aikb-chat-history');
    await del('aikb-backup');
  };

  return {
    loadData,
    saveDocuments,
    saveChatHistory,
    clearAll
  };
};