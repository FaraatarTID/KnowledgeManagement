import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';

// Mock the debounce hook
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

describe('AIKB Component - Critical Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: 'Test AI response' }), { status: 200 })
    );
  });

  describe('1. RAG Architecture Fix', () => {
    it('should NOT send documents in API request body', async () => {
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
        target: { value: 'This is test content' },
      });

      await act(async () => {
        fireEvent.click(screen.getByText('ذخیره سند'));
      });

      await waitFor(() => {
        expect(screen.getByText('Test Doc')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'What is this?' } });
      
      const sendBtn = screen.getByText('ارسال');
      await act(async () => {
        fireEvent.click(sendBtn);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const syncCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => !String(c[0]).includes('/sync')
      );
      const chatCall = syncCalls[0];
      
      if (chatCall) {
        const requestBody = JSON.parse((chatCall[1] as RequestInit).body as string);
        expect(requestBody).toHaveProperty('query');
        expect(requestBody).not.toHaveProperty('documents');
        expect(requestBody.query).toBe('What is this?');
      }
    });
  });

  describe('2. Optimistic UI', () => {
    it('should show user message immediately before server response', async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>(resolve => {
        resolveFetch = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => fetchPromise);

      render(<AIKB />);

      // Add doc first (needed for chat)
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
      await act(async () => {
        fireEvent.click(screen.getByText('ذخیره سند'));
      });

      await waitFor(() => screen.getByText('Test'));

      const input = screen.getByPlaceholderText('سوال خود را بپرسید...');
      fireEvent.change(input, { target: { value: 'Immediate message' } });
      
      await act(async () => {
        fireEvent.click(screen.getByText('ارسال'));
      });

      await waitFor(() => {
        expect(screen.getByText('Immediate message')).toBeInTheDocument();
      });

      await act(async () => {
        resolveFetch(new Response(JSON.stringify({ content: 'AI response' }), { status: 200 }));
      });

      await waitFor(() => {
        expect(screen.getByText('AI response')).toBeInTheDocument();
      });
    });
  });
});
