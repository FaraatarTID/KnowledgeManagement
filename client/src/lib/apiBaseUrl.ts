function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window !== 'undefined') {
    // Browser default: same-origin API path (works with reverse proxy / ingress)
    return '/api/v1';
  }

  // SSR / tests fallback for local backend
  return 'http://localhost:3001/api/v1';
}
