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
   */
  const loadData = async (): Promise<StorageData> => {
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
            throw new Error('Invalid document format');
          }
        } catch (e) {
          console.error('Documents corrupted:', e);
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
            throw new Error('Invalid chat format');
          }
        } catch (e) {
          console.error('Chat history corrupted:', e);
          throw new Error('CHAT_CORRUPTED');
        }
      }

      return { documents, chatHistory, timestamp: Date.now() };

    } catch (error) {
      // Attempt recovery from backup
      if (backupResult) {
        try {
          const backup = JSON.parse(backupResult);
          const recoveredData = {
            documents: Array.isArray(backup.docs) ? backup.docs : [],
            chatHistory: Array.isArray(backup.chat) ? backup.chat : [],
            timestamp: backup.timestamp || Date.now()
          };

          // Restore from backup
          await set('aikb-documents', JSON.stringify(recoveredData.documents));
          await set('aikb-chat-history', JSON.stringify(recoveredData.chatHistory));

          return recoveredData;
        } catch (backupError) {
          console.error('Backup recovery failed:', backupError);
        }
      }

      // Last resort: clear corrupted data and return empty
      await del('aikb-documents');
      await del('aikb-chat-history');
      await del('aikb-backup');

      return { documents: [], chatHistory: [], timestamp: Date.now() };
    }
  };

  /**
   * Save documents with atomic backup
   */
  const saveDocuments = async (documents: any[]) => {
    const json = JSON.stringify(documents);
    await set('aikb-documents', json);
    
    // Create backup for recovery
    const currentData = await loadData();
    await set('aikb-backup', JSON.stringify({
      docs: documents,
      chat: currentData.chatHistory,
      timestamp: Date.now()
    }));
  };

  /**
   * Save chat history with atomic backup
   */
  const saveChatHistory = async (chatHistory: any[]) => {
    const json = JSON.stringify(chatHistory);
    await set('aikb-chat-history', json);
    
    // Create backup for recovery
    const currentData = await loadData();
    await set('aikb-backup', JSON.stringify({
      docs: currentData.documents,
      chat: chatHistory,
      timestamp: Date.now()
    }));
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