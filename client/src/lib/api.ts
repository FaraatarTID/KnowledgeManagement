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
         // Clear user data but NOT token (browser handles cookie)
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

export const authApi = {
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    }
    return response.data;
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout failed', e);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
  }
};

export default api;
