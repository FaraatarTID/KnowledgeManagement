import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';
import { toast } from '@/components/ToastContainer';

// Mock storage
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    loadData: vi.fn().mockResolvedValue({ documents: [], chatHistory: [] }),
    saveDocuments: vi.fn(),
    saveChatHistory: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

// Mock debounce
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

// Mock components
vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ToastContainer', () => ({
  ToastContainer: () => null,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  },
}));

describe('QueryAI Race Condition Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should handle rapid-fire queries without message corruption', async () => {
    const fetchCalls: Array<{ query: string; timestamp: number; response: string }> = [];
    
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: RequestInfo, options?: RequestInit) => {
      const body = JSON.parse(options?.body as string);
      const query = body.query;
      const delay = Math.random() * 150 + 50;
      
      return new Promise<Response>(resolve => {
        setTimeout(() => {
          const response = `AI response for: ${query}`;
          fetchCalls.push({ query, timestamp: Date.now(), response });
          
          resolve(new Response(JSON.stringify({ content: response }), { status: 200 }));
        }, delay);
      });
    });

    render(<AIKB />);

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

    const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
    const sendBtn = screen.getByText('ارسال');

    fireEvent.change(input, { target: { value: 'Query 1' } });
    fireEvent.click(sendBtn);
    await act(async () => await new Promise(r => setTimeout(r, 10)));

    fireEvent.change(input, { target: { value: 'Query 2' } });
    fireEvent.click(sendBtn);
    await act(async () => await new Promise(r => setTimeout(r, 10)));

    fireEvent.change(input, { target: { value: 'Query 3' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/AI response for:/)).toHaveLength(3);
    }, { timeout: 5000 });

    expect(fetchCalls.length).toBe(3);
  }, 10000);

  it('should handle fetch timeout gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ content: 'Too late' }), { status: 200 }));
        }, 50000);
      });
    });

    render(<AIKB />);

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

    const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
    const sendBtn = screen.getByText('ارسال');
    
    fireEvent.change(input, { target: { value: 'Test query' } });
    fireEvent.click(sendBtn);

    expect(screen.getByRole('button', { name: /ارسال/ })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ارسال/ })).not.toBeDisabled();
    }, { timeout: 35000 });

    expect(toast.error).toHaveBeenCalledWith('Request timed out. Please try again.');
  }, 40000);
});
