
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include', // Security: Always send auth cookies
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // --- Specialized Methods ---

  async syncDocuments(docs: unknown[]) {
    return this.post<{ stats: { successes: number; failures: number } }>('/documents/sync', { documents: docs });
  }

  async query(query: string, signal?: AbortSignal) {
    return this.request<{ answer: string; sources: any[]; usage: any }>('/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
      signal,
    });
  }

  async addDocument(doc: { title: string; content: string; category: string }) {
    return this.post('/documents/sync', { documents: [doc] });
  }
}

export const api = new ApiClient();
