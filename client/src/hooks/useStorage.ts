import { get, set, del } from 'idb-keyval';

interface StorageData {
  documents: any[];
  chatHistory: any[];
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
    
    try {
      const [docsResult, chatResult, backupResult] = await Promise.all([
        get('aikb-documents'),
        get('aikb-chat-history'),
        get('aikb-backup')
      ]);

      let documents: any[] = [];
      let chatHistory: any[] = [];

      // Parse documents with validation
      if (docsResult) {
        try {
          const parsed = JSON.parse(docsResult);
          if (Array.isArray(parsed)) {
            documents = parsed;
          } else {
            throw new Error('Invalid document format: not an array');
          }
        } catch (e: any) {
          console.error('STORAGE_CORRUPTION', JSON.stringify({
            type: 'documents',
            error: e.message,
            timestamp: new Date().toISOString()
          }));
          throw new Error('DOCUMENTS_CORRUPTED');
        }
      }

      // Parse chat history with validation
      if (chatResult) {
        try {
          const parsed = JSON.parse(chatResult);
          if (Array.isArray(parsed)) {
            chatHistory = parsed;
          } else {
            throw new Error('Invalid chat format: not an array');
          }
        } catch (e: any) {
          console.error('STORAGE_CORRUPTION', JSON.stringify({
            type: 'chatHistory',
            error: e.message,
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

    } catch (error: any) {
      console.warn('STORAGE_LOAD_FAILED', JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }));

      // Attempt recovery from backup
      if (backupResult) {
        try {
          const backup = JSON.parse(backupResult);
          const recoveredData = {
            documents: Array.isArray(backup.docs) ? backup.docs : [],
            chatHistory: Array.isArray(backup.chat) ? backup.chat : [],
            timestamp: backup.timestamp || Date.now()
          };

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
        } catch (backupError: any) {
          console.error('STORAGE_RECOVERY_FAILED', JSON.stringify({
            error: backupError.message,
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
      } catch (cleanupError) {
        console.error('STORAGE_CLEANUP_FAILED', cleanupError);
      }

      return { documents: [], chatHistory: [], timestamp: Date.now() };
    }
  };

  /**
   * Save documents with atomic backup
   * SECURITY FIX: Add telemetry and error handling
   */
  const saveDocuments = async (documents: any[]) => {
    const startTime = Date.now();
    try {
      const json = JSON.stringify(documents);
      await set('aikb-documents', json);
      
      // Create backup for recovery
      const currentData = await loadData();
      await set('aikb-backup', JSON.stringify({
        docs: documents,
        chat: currentData.chatHistory,
        timestamp: Date.now()
      }));

      console.log('STORAGE_SAVE_SUCCESS', JSON.stringify({
        type: 'documents',
        count: documents.length,
        duration: `${Date.now() - startTime}ms`
      }));
    } catch (error: any) {
      console.error('STORAGE_SAVE_FAILED', JSON.stringify({
        type: 'documents',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
      throw error;
    }
  };

  /**
   * Save chat history with atomic backup
   * SECURITY FIX: Add telemetry and error handling
   */
  const saveChatHistory = async (chatHistory: any[]) => {
    const startTime = Date.now();
    try {
      const json = JSON.stringify(chatHistory);
      await set('aikb-chat-history', json);
      
      // Create backup for recovery
      const currentData = await loadData();
      await set('aikb-backup', JSON.stringify({
        docs: currentData.documents,
        chat: chatHistory,
        timestamp: Date.now()
      }));

      console.log('STORAGE_SAVE_SUCCESS', JSON.stringify({
        type: 'chatHistory',
        count: chatHistory.length,
        duration: `${Date.now() - startTime}ms`
      }));
    } catch (error: any) {
      console.error('STORAGE_SAVE_FAILED', JSON.stringify({
        type: 'chatHistory',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
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