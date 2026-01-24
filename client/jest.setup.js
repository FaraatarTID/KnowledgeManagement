// Jest setup file
import '@testing-library/jest-dom';

// Mock global fetch
global.fetch = jest.fn();

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock window.location
delete window.location;
window.location = {
  href: '',
  pathname: '/',
  search: '',
  replace: jest.fn(),
};
