import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';

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

describe('Document Sync Logic Gap Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        stats: { total: 1, successes: 1, failures: 0 }
      }), { status: 200 })
    );
  });

  it('should sync document to backend when added', async () => {
    render(<AIKB />);

    const addBtn = screen.getByText('افزودن سند');
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Test Document' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'Technical' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'This is test content for sync' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('ذخیره سند'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should handle sync failure gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(<AIKB />);

    const addBtn = screen.getByText('افزودن سند');
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Test Fail' },
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

    // Check if the document still appears in UI despite sync error
    await waitFor(() => {
      expect(screen.getByText('Test Fail')).toBeInTheDocument();
    });
  });
});
