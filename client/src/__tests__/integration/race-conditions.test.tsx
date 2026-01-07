import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';
import { toast } from '@/components/ToastContainer';

// Mock storage
jest.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    loadData: jest.fn().mockResolvedValue({ documents: [], chatHistory: [] }),
    saveDocuments: jest.fn().mockResolvedValue(undefined),
    saveChatHistory: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock debounce
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

describe('QueryAI Race Condition Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle rapid-fire queries without message corruption', async () => {
    // Track fetch calls and their order
    const fetchCalls: Array<{ query: string; timestamp: number; response: string }> = [];
    
    // Mock fetch with variable delays to simulate network race conditions
    global.fetch = jest.fn((url: string, options?: any) => {
      const body = JSON.parse(options.body);
      const query = body.query;
      
      // Variable delay (50-200ms) to create race conditions
      const delay = Math.random() * 150 + 50;
      
      return new Promise(resolve => {
        setTimeout(() => {
          const response = `AI response for: ${query}`;
          fetchCalls.push({ query, timestamp: Date.now(), response });
          
          resolve({
            ok: true,
            json: async () => ({ content: response })
          });
        }, delay);
      });
    }) as any;

    render(<AIKB />);

    // Add a document first
    const addDocBtn = screen.getByText('افزودن سند');
    fireEvent.click(addDocBtn);
    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Test Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'Technical' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'Test content' },
    });
    fireEvent.click(screen.getByText('ذخیره سند'));

    await waitFor(() => screen.getByText('Test Doc'));

    // Rapidly send 3 queries
    const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
    const sendBtn = screen.getByText('ارسال');

    // Query 1
    fireEvent.change(input, { target: { value: 'Query 1' } });
    fireEvent.click(sendBtn);

    // Small delay to create overlap
    await act(async () => await new Promise(r => setTimeout(r, 10)));

    // Query 2
    fireEvent.change(input, { target: { value: 'Query 2' } });
    fireEvent.click(sendBtn);

    await act(async () => await new Promise(r => setTimeout(r, 10)));

    // Query 3
    fireEvent.change(input, { target: { value: 'Query 3' } });
    fireEvent.click(sendBtn);

    // Wait for all to complete
    await waitFor(() => {
      expect(screen.getAllByText(/AI response for:/)).toHaveLength(3);
    }, { timeout: 5000 });

    // Verify all 3 queries were sent
    expect(fetchCalls.length).toBe(3);
    
    // Verify all 3 responses appear in the chat
    const responses = screen.getAllByText(/AI response for:/);
    expect(responses.length).toBe(3);
  }, 10000);

  it('should handle query cancellation when new query is sent', async () => {
    let firstQueryResolved = false;
    
    global.fetch = jest.fn((url: string, options?: any) => {
      const body = JSON.parse(options.body);
      const query = body.query;
      
      return new Promise(resolve => {
        setTimeout(() => {
          if (query === 'First Query') {
            firstQueryResolved = true;
          }
          resolve({
            ok: true,
            json: async () => ({ content: `Response: ${query}` })
          });
        }, 200); // Long delay for first query
      });
    }) as any;

    render(<AIKB />);

    // Add document
    const addDocBtn = screen.getByText('افزودن سند');
    fireEvent.click(addDocBtn);
    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'Tech' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'Content' },
    });
    fireEvent.click(screen.getByText('ذخیره سند'));
    await waitFor(() => screen.getByText('Doc'));

    // Send first query
    const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
    const sendBtn = screen.getByText('ارسال');
    
    fireEvent.change(input, { target: { value: 'First Query' } });
    fireEvent.click(sendBtn);

    // Wait a bit, then send second query (should clear first)
    await act(async () => await new Promise(r => setTimeout(r, 50)));
    
    fireEvent.change(input, { target: { value: 'Second Query' } });
    fireEvent.click(sendBtn);

    // Wait for completion
    await waitFor(() => {
      expect(screen.getByText(/Response: Second Query/)).toBeInTheDocument();
    }, { timeout: 3000 });

    // First query should resolve but be ignored
    await waitFor(() => {
      expect(firstQueryResolved).toBe(true);
    }, { timeout: 500 });

    // Should only show second query response
    expect(screen.queryByText(/Response: First Query/)).not.toBeInTheDocument();
  }, 10000);

  it('should handle fetch timeout gracefully', async () => {
    global.fetch = jest.fn(() => {
      return new Promise((resolve) => {
        // Never resolve - simulating timeout
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ content: 'Too late' })
          });
        }, 50000);
      });
    }) as any;

    render(<AIKB />);

    // Add document
    const addDocBtn = screen.getByText('افزودن سند');
    fireEvent.click(addDocBtn);
    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'Tech' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'Content' },
    });
    fireEvent.click(screen.getByText('ذخیره سند'));
    await waitFor(() => screen.getByText('Doc'));

    // Send query
    const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
    const sendBtn = screen.getByText('ارسال');
    
    fireEvent.change(input, { target: { value: 'Test query' } });
    fireEvent.click(sendBtn);

    // Should show loading
    expect(screen.getByText('ارسال')).toBeDisabled();

    // Wait for timeout (30s in code)
    await waitFor(() => {
      expect(screen.getByText('ارسال')).not.toBeDisabled();
    }, { timeout: 35000 });

    // Should show timeout error
    expect(toast.error).toHaveBeenCalledWith('Request timed out. Please try again.');
  }, 40000);
});

describe('Document Sync Race Conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle rapid document additions without sync conflicts', async () => {
    const syncCalls: Array<{ documents: any[]; timestamp: number }> = [];
    
    global.fetch = jest.fn((url: string, options?: any) => {
      if (url.includes('/documents/sync')) {
        const body = JSON.parse(options.body);
        syncCalls.push({
          documents: body.documents,
          timestamp: Date.now()
        });
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ stats: { successes: body.documents.length, failures: 0 } })
        });
      }
      
      return Promise.resolve({
        ok: true,
        json: async () => ({ content: 'test' })
      });
    }) as any;

    render(<AIKB />);

    // Rapidly add 5 documents
    for (let i = 1; i <= 5; i++) {
      const addDocBtn = screen.getByText('افزودن سند');
      fireEvent.click(addDocBtn);
      
      fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
        target: { value: `Doc ${i}` },
      });
      fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
        target: { value: 'General' },
      });
      fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
        target: { value: `Content ${i}` },
      });
      
      fireEvent.click(screen.getByText('ذخیره سند'));
      
      // Small delay between additions
      await act(async () => await new Promise(r => setTimeout(r, 50)));
    }

    // Wait for all syncs to complete
    await waitFor(() => {
      expect(syncCalls.length).toBeGreaterThanOrEqual(5);
    }, { timeout: 5000 });

    // Verify all documents were synced
    const totalSynced = syncCalls.reduce((sum, call) => sum + call.documents.length, 0);
    expect(totalSynced).toBe(5);
  }, 10000);
});