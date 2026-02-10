import axios from 'axios';
import { resolveApiBaseUrl } from './apiBaseUrl';

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true // Important for cookies
});

// Request interceptor: No longer needed for token injection (cookies handled by browser)
// Keeping it simple if we need to add other headers later
api.interceptors.request.use((config) => {
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (err: unknown) => {
    // Narrow to AxiosError when possible
    if (axios.isAxiosError(err)) {
      const error = err;
      // If 401, redirect to login unless we are already there
      if (error.response?.status === 401) {
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          // Clear user data (browser handles cookie)
          localStorage.removeItem('user');
          window.location.href = '/login?expired=true';
        }
      } else if (error.response?.status === 500) {
        console.error('Server Error', error);
        // Optional: Dispatch a global 'toast' event here for "System Hiccup, please try again"
      }
    } else {
      console.error('Unknown network error', err);
    }

    return Promise.reject(err);
  }
);

// User type used across client for auth responses
export interface User {
  id: string;
  email?: string;
  role?: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER' | string;
  [key: string]: unknown;
}

export const authApi = {
  // Request deduplication cache
  _pendingGetMe: null as Promise<User | null> | null,

  login: async (credentials: { email: string, password: string }) => {
    const response = await api.post('/auth/login', credentials);
    
    if (response.data.user) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    }
    return response.data;
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout').catch(() => {
        // Don't throw - we want to clean up regardless
        console.warn('Backend logout failed, proceeding with local cleanup');
      });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user');
        }
      } catch (cleanupError) {
        console.error('Local storage cleanup failed:', cleanupError);
        // Force clear as last resort
        if (typeof window !== 'undefined') {
          try {
            localStorage.clear();
          } catch (e) {
            // Browser might be in a bad state
            console.error('CRITICAL: Cannot clear localStorage', e);
          }
        }
      }

      // Dispatch logout event for cross-tab sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('user-logout'));
        // Always redirect, even if cleanup failed
        window.location.href = '/login';
      }
    }
  },
  
  getMe: async (): Promise<User | null> => {
    // SECURITY: Request deduplication - return existing promise if pending
    if (authApi._pendingGetMe) {
      return authApi._pendingGetMe;
    }

    authApi._pendingGetMe = api.get('/auth/me')
      .then(async (response) => {
        const data = response.data as User | null;
        if (data && typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(data));
        }
        return data;
      })
      .catch((err: unknown) => {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          // Treat auth/bootstrap/network/server hiccups as no active session for this call.
          // This prevents uncaught promise noise in page initialization flows.
          if (!status || status === 401 || status === 403 || status === 404 || status === 500 || status === 503) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('user');
            }
            return null;
          }
        }
        throw err;
      })
      .finally(() => {
        authApi._pendingGetMe = null;
      });

    return authApi._pendingGetMe;
  }
};

export default api;
