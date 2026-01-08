/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIKB from '@/KM';

// Mock storage
jest.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    loadData: jest.fn().mockResolvedValue({ documents: [], chatHistory: [] }),
    saveDocuments: jest.fn().mockResolvedValue(undefined),
    saveChatHistory: jest.fn().mockResolvedValue(undefined),
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

// Mock fetch
global.fetch = jest.fn();

describe('Document Sync Logic Gap Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should sync document to backend when added', async () => {
    // Mock successful sync
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        stats: { total: 1, successes: 1, failures: 0 }
      }),
    });

    render(<AIKB />);

    // Open add document modal
    const addBtn = screen.getByText('افزودن سند');
    fireEvent.click(addBtn);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: 'Test Document' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: 'Technical' },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: 'This is test content for sync' },
    });

    // Submit
    fireEvent.click(screen.getByText('ذخیره سند'));

    // Verify fetch was called for sync
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      
      // Check the sync endpoint was called
      const syncCall = (global.fetch as jest.Mock).mock.calls.find(
        call => call[0].includes('/documents/sync')
      );
      
      expect(syncCall).toBeDefined();
      
      // Verify it's NOT the legacy endpoint
      expect(syncCall[0]).not.toContain('/chat');
      
      // Verify body contains documents
      const body = JSON.parse(syncCall[1].body);
      expect(body.documents).toBeDefined();
      expect(body.documents).toHaveLength(1);
      expect(body.documents[0].title).toBe('Test Document');
    });

    // Should show success toast
    await waitFor(() => {
      expect(screen.getByText(/Document added and synced/)).toBeInTheDocument();
    });
  });

  it('should handle sync failure gracefully', async () => {
    // Mock network failure
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<AIKB />);

    const addBtn = screen.getByText('افزودن سند');
    fireEvent.click(addBtn);

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

    // Should show error but still save locally
    await waitFor(() => {
      expect(screen.getByText(/saved locally/)).toBeInTheDocument();
    });

    // Document should still appear in UI
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should sync existing documents on load', async () => {
    // Mock existing documents in storage
    const mockLoadData = jest.fn().mockResolvedValue({
      documents: [
        { id: 'doc1', title: 'Existing Doc', content: 'Content', category: 'General', createdAt: new Date().toISOString() }
      ],
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

    // Mock successful sync
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        stats: { total: 1, successes: 1, failures: 0 }
      }),
    });

    render(<AIKB />);

    // Wait for load and sync
    await waitFor(() => {
      expect(screen.getByText('Existing Doc')).toBeInTheDocument();
    });

    // Verify sync was called
    await waitFor(() => {
      const syncCall = (global.fetch as jest.Mock).mock.calls.find(
        call => call[0].includes('/documents/sync')
      );
      expect(syncCall).toBeDefined();
    });
  });

  it('should have manual sync button', async () => {
    // Mock existing documents
    const mockLoadData = jest.fn().mockResolvedValue({
      documents: [
        { id: 'doc1', title: 'Test Doc', content: 'Content', category: 'General', createdAt: new Date().toISOString() }
      ],
      chatHistory: [],
    });

    jest.mock('../hooks/useStorage', () => ({
      useStorage: () => ({
        loadData: mockLoadData,
        saveDocuments: jest.fn(),
        saveChatHistory: jest.fn(),
      }),
    }));

    // Mock successful sync
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        stats: { total: 1, successes: 1, failures: 0 }
      }),
    });

    render(<AIKB />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByText('Test Doc')).toBeInTheDocument();
    });

    // Find sync button
    const syncBtn = screen.getByText('همگام‌سازی');
    expect(syncBtn).toBeInTheDocument();

    // Click sync
    fireEvent.click(syncBtn);

    // Should call sync endpoint
    await waitFor(() => {
      const syncCall = (global.fetch as jest.Mock).mock.calls.find(
        call => call[0].includes('/documents/sync')
      );
      expect(syncCall).toBeDefined();
    });
  });

  it('should send correct format to backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, stats: { total: 1, successes: 1, failures: 0 } }),
    });

    render(<AIKB />);

    const addBtn = screen.getByText('افزودن سند');
    fireEvent.click(addBtn);

    const testDoc = {
      title: 'API Test',
      category: 'API',
      content: 'Testing API format'
    };

    fireEvent.change(screen.getByPlaceholderText('مثال: راهنمای استفاده از سیستم'), {
      target: { value: testDoc.title },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: فنی، اداری، آموزشی'), {
      target: { value: testDoc.category },
    });
    fireEvent.change(screen.getByPlaceholderText('محتوای کامل سند را اینجا وارد کنید...'), {
      target: { value: testDoc.content },
    });

    fireEvent.click(screen.getByText('ذخیره سند'));

    await waitFor(() => {
      const syncCall = (global.fetch as jest.Mock).mock.calls.find(
        call => call[0].includes('/documents/sync')
      );
      
      const body = JSON.parse(syncCall[1].body);
      
      // Verify structure
      expect(body).toHaveProperty('documents');
      expect(Array.isArray(body.documents)).toBe(true);
      expect(body.documents).toHaveLength(1);
      
      const doc = body.documents[0];
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('title', testDoc.title);
      expect(doc).toHaveProperty('content', testDoc.content);
      expect(doc).toHaveProperty('category', testDoc.category);
      expect(doc).toHaveProperty('createdAt');
    });
  });
});