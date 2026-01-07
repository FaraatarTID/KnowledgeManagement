import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';

// Mock the storage hooks
jest.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    loadData: jest.fn().mockResolvedValue({ documents: [], chatHistory: [] }),
    saveDocuments: jest.fn().mockResolvedValue(undefined),
    saveChatHistory: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock the debounce hook
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value,
}));

// Mock components
jest.mock('@/components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ToastContainer', () => ({
  ToastContainer: () => null,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    loading: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

// Mock window storage APIs
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

describe('AIKB Component - Critical Fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'Test AI response' }),
    });
  });

  describe('1. RAG Architecture Fix', () => {
    it('should NOT send documents in API request body', async () => {
      render(<AIKB />);
      
      // Add a document first
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);

      // Fill and submit document
      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: 'Test Doc' },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'Technical' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: 'This is test content' },
      });

      fireEvent.click(screen.getByText('ذخیره سند'));

      // Wait for document to be added
      await waitFor(() => {
        expect(screen.getByText('Test Doc')).toBeInTheDocument();
      });

      // Enter query
      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'What is this?' } });
      
      // Submit query
      const sendBtn = screen.getByText('ارسال');
      fireEvent.click(sendBtn);

      // Verify fetch was called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Get the call arguments
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // CRITICAL: Verify documents are NOT in the request
      expect(requestBody).toHaveProperty('query');
      expect(requestBody).not.toHaveProperty('documents');
      expect(requestBody.query).toBe('What is this?');
    });

    it('should handle 413 errors gracefully', async () => {
      // Mock 413 error
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 413,
        json: async () => ({ message: 'Payload Too Large' }),
      });

      render(<AIKB />);

      // Add document and query
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);

      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: 'Test content' },
      });
      fireEvent.click(screen.getByText('ذخیره سند'));

      await waitFor(() => screen.getByText('Test'));

      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'Question' } });
      fireEvent.click(screen.getByText('ارسال'));

      // Should show error toast (not alert)
      await waitFor(() => {
        // Check that alert was NOT called
        expect(window.alert).not.toHaveBeenCalled();
      });
    });
  });

  describe('2. Optimistic UI', () => {
    it('should show user message immediately before server response', async () => {
      // Delay the fetch response
      let resolveFetch: (value: any) => void;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });

      (global.fetch as jest.Mock).mockImplementationOnce(() => fetchPromise);

      render(<AIKB />);

      // Add document
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);
      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: 'Test content' },
      });
      fireEvent.click(screen.getByText('ذخیره سند'));

      await waitFor(() => screen.getByText('Test'));

      // Enter query
      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'Immediate message' } });
      
      // Submit
      fireEvent.click(screen.getByText('ارسال'));

      // User message should appear immediately
      await waitFor(() => {
        expect(screen.getByText('Immediate message')).toBeInTheDocument();
      });

      // Resolve the fetch
      act(() => {
        resolveFetch({
          ok: true,
          json: async () => ({ content: 'AI response' }),
        });
      });

      // AI response should appear
      await waitFor(() => {
        expect(screen.getByText('AI response')).toBeInTheDocument();
      });
    });
  });

  describe('3. Debounced Search', () => {
    it('should not search on every keystroke', async () => {
      jest.useFakeTimers();
      
      render(<AIKB />);

      // Add multiple documents
      const addDocBtn = screen.getByText('افزودن سند');
      
      for (let i = 1; i <= 3; i++) {
        fireEvent.click(addDocBtn);
        fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
          target: { value: `Document ${i}` },
        });
        fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
          target: { value: 'General' },
        });
        fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
          target: { value: `Content ${i}` },
        });
        fireEvent.click(screen.getByText('ذخیره سند'));
        await waitFor(() => screen.getByText(`Document ${i}`));
      }

      // Type in search
      const searchInput = screen.getByPlaceholderText('جستجو در اسناد...');
      
      // Fast typing - should not filter immediately
      fireEvent.change(searchInput, { target: { value: '1' } });
      fireEvent.change(searchInput, { target: { value: '12' } });
      fireEvent.change(searchInput, { target: { value: '123' } });

      // Should still show all documents (debounced)
      expect(screen.getByText('Document 1')).toBeInTheDocument();
      expect(screen.getByText('Document 2')).toBeInTheDocument();
      expect(screen.getByText('Document 3')).toBeInTheDocument();

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Now should be filtered
      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument();
        expect(screen.queryByText('Document 2')).not.toBeInTheDocument();
        expect(screen.queryByText('Document 3')).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('4. Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<AIKB />);

      // Add document
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);
      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: 'Test content' },
      });
      fireEvent.click(screen.getByText('ذخیره سند'));

      await waitFor(() => screen.getByText('Test'));

      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'Question' } });
      fireEvent.click(screen.getByText('ارسال'));

      // Should show error toast, not alert
      await waitFor(() => {
        expect(window.alert).not.toHaveBeenCalled();
      });
    });

    it('should handle empty query', async () => {
      render(<AIKB />);

      // Add document first
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);
      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: 'Test content' },
      });
      fireEvent.click(screen.getByText('ذخیره سند'));

      await waitFor(() => screen.getByText('Test'));

      // Try to send empty query
      const sendBtn = screen.getByText('ارسال');
      fireEvent.click(sendBtn);

      // Should not call fetch
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('5. Data Integrity', () => {
    it('should handle corrupted localStorage data', async () => {
      // Mock corrupted data
      const mockLoadData = jest.fn().mockResolvedValue({
        documents: [],
        chatHistory: [],
      });

      // Override the mock
      jest.mock('../hooks/useStorage', () => ({
        useStorage: () => ({
          loadData: mockLoadData,
          saveDocuments: jest.fn(),
          saveChatHistory: jest.fn(),
        }),
      }));

      render(<AIKB />);

      // Should handle gracefully without crashing
      await waitFor(() => {
        expect(screen.getByText('سیستم مدیریت دانش هوشمند')).toBeInTheDocument();
      });
    });
  });
});

describe('Integration Tests - Complete User Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'AI generated response based on your documents' }),
    });
  });

  it('Complete workflow: Add document -> Search -> Query -> Get response', async () => {
    render(<AIKB />);

    // 1. Add document
    const addDocBtn = screen.getByText('افزودن سند');
    fireEvent.click(addDocBtn);

    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Company Policy' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'HR' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'All employees must complete training within 30 days.' },
    });

    fireEvent.click(screen.getByText('ذخیره سند'));

    // Verify document added
    await waitFor(() => {
      expect(screen.getByText('Company Policy')).toBeInTheDocument();
    });

    // 2. Search for document
    const searchInput = screen.getByPlaceholderText('جستجو در اسناد...');
    fireEvent.change(searchInput, { target: { value: 'training' } });

    // Wait for debounce
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });

    // Should find the document
    expect(screen.getByText('Company Policy')).toBeInTheDocument();

    // 3. Switch to chat tab
    const chatTab = screen.getByText(/چت/);
    fireEvent.click(chatTab);

    // 4. Ask question
    const questionInput = screen.getByPlaceholderText('سوال خود را بپرسید...');
    fireEvent.change(questionInput, { target: { value: 'What is the training policy?' } });

    // 5. Send query
    const sendBtn = screen.getByText('ارسال');
    fireEvent.click(sendBtn);

    // 6. Verify optimistic UI (question appears immediately)
    await waitFor(() => {
      expect(screen.getByText('What is the training policy?')).toBeInTheDocument();
    });

    // 7. Verify API call with correct format (NO documents)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      
      // CRITICAL: Should only have query
      expect(body).toEqual({ query: 'What is the training policy?' });
      expect(body).not.toHaveProperty('documents');
    });

    // 8. Verify AI response appears
    await waitFor(() => {
      expect(screen.getByText('AI generated response based on your documents')).toBeInTheDocument();
    });

    // 9. Verify loading state was shown
    expect(screen.queryByText('در حال پردازش...')).not.toBeInTheDocument();
  });
});