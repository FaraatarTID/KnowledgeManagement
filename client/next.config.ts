import type { NextConfig } from "next";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function normalizeBackendBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value.trim());
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -7) : trimmed;
}

function resolveBackendBaseUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) {
    return normalizeBackendBaseUrl(internal);
  }

  const publicApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicApi) {
    return normalizeBackendBaseUrl(publicApi);
  }

  return 'http://localhost:3001';
}

function resolveConnectSources(): string[] {
  const base = [
    "'self'",
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://localhost:3000',
    'https://localhost:3001'
  ];

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) {
    return base;
  }

  try {
    const origin = new URL(configured).origin;
    if (!base.includes(origin)) {
      base.push(origin);
    }
  } catch {
    // Ignore invalid NEXT_PUBLIC_API_URL here; runtime API client will still surface clear errors.
  }

  return base;
}

const connectSrc = resolveConnectSources().join(' ');
const backendBaseUrl = resolveBackendBaseUrl();

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendBaseUrl}/api/v1/:path*`
      }
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${connectSrc};`
          }
        ]
      }
    ];
  },
  output: 'standalone',
};

export default nextConfig;
