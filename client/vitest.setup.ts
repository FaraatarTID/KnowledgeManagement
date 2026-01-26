import '@testing-library/jest-dom';
import { vi, expect } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

// Mock useStorage
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    loadData: vi.fn().mockResolvedValue({ documents: [], chatHistory: [] }),
    saveDocuments: vi.fn().mockResolvedValue(undefined),
    saveChatHistory: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
  },
});

// Mock scrollIntoView
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
const locationMock = {
  href: '',
  pathname: '/',
  search: '',
  replace: vi.fn(),
  assign: vi.fn(),
  reload: vi.fn(),
};
// Use defineProperty because assignment is restricted in jsdom
Object.defineProperty(window, 'location', {
  value: locationMock,
  writable: true,
});
