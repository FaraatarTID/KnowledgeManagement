type SentryConfig = {
  host: string;
  protocol: string;
  projectId: string;
  publicKey: string;
};

let sentryConfig: SentryConfig | null = null;

const parseSentryDsn = (dsn: string): SentryConfig => {
  const url = new URL(dsn);
  const projectId = url.pathname.replace('/', '');
  return {
    host: url.host,
    protocol: url.protocol,
    projectId,
    publicKey: url.username
  };
};

export const initErrorTracking = () => {
  if (sentryConfig) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  sentryConfig = parseSentryDsn(dsn);
};

export const captureClientError = (error: Error, context: Record<string, unknown>) => {
  if (!sentryConfig) return;

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: process.env.NODE_ENV,
    level: 'error',
    message: error.message,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: {
            frames: []
          }
        }
      ]
    },
    extra: context,
    tags: {
      service: 'aikb-client'
    },
    release: process.env.NEXT_PUBLIC_APP_VERSION
  };

  const url = `${sentryConfig.protocol}//${sentryConfig.host}/api/${sentryConfig.projectId}/store/`;
  const authHeader = `Sentry sentry_version=7, sentry_key=${sentryConfig.publicKey}, sentry_client=aikb-error-tracker/1.0`;

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': authHeader
    },
    body: JSON.stringify(event)
  }).catch(() => undefined);
};
