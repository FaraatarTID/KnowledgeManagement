import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
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
  (error) => {
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
    return Promise.reject(error);
  }
);

// SECURITY: Mutex lock to prevent race conditions in localStorage operations
let localStorageMutex: Promise<void> = Promise.resolve();

/**
 * Atomic localStorage operation with mutex
 */
async function atomicLocalStorageOperation<T>(
  operation: () => T,
  key?: string
): Promise<T> {
  // Wait for previous operation to complete
  await localStorageMutex;
  
  // Create new promise for this operation
  let resolve: (value: void) => void;
  localStorageMutex = new Promise(r => resolve = r);
  
  try {
    const result = operation();
    return result;
  } finally {
    // Release the lock
    if (resolve) resolve();
  }
}

export const authApi = {
  // Request deduplication cache
  _pendingGetMe: null as Promise<any> | null,

  // Updated to accept type for role simulation (legacy/demo support)
  // Real auth will use email/password in body, but keeping signature compatible for now
  login: async (credentialsOrType?: { email: string, password: string } | 'admin' | 'user') => {
    let credentials;
    
    if (typeof credentialsOrType === 'object') {
      credentials = credentialsOrType;
    } else {
      // Auto-map for legacy/demo support
      const type = credentialsOrType || 'user';
      credentials = type === 'admin' 
        ? { email: 'alice@aikb.com', password: 'admin123' }
        : { email: 'david@aikb.com', password: 'admin123' };
    }

    const response = await api.post('/auth/login', credentials);
    
    if (response.data.user) {
      await atomicLocalStorageOperation(() => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
      });
    }
    return response.data;
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout failed', e);
    } finally {
      await atomicLocalStorageOperation(() => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user');
        }
      });
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  },
  
  getMe: async () => {
    // SECURITY: Request deduplication - return existing promise if pending
    if (authApi._pendingGetMe) {
      return authApi._pendingGetMe;
    }

    authApi._pendingGetMe = api.get('/auth/me')
      .then(async (response) => {
        if (response.data) {
          await atomicLocalStorageOperation(() => {
            if (typeof window !== 'undefined') {
              localStorage.setItem('user', JSON.stringify(response.data));
            }
          });
        }
        return response.data;
      })
      .finally(() => {
        authApi._pendingGetMe = null;
      });

    return authApi._pendingGetMe;
  }
};

export default api;
