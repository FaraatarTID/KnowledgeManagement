export const CANONICAL_ROLES = ['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN'] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

const ROLE_ALIAS_MAP: Record<string, CanonicalRole> = {
  VIEWER: 'VIEWER',
  USER: 'VIEWER',
  IC: 'VIEWER',
  EDITOR: 'EDITOR',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN'
};

export function normalizeRoleToken(role: unknown): CanonicalRole | null {
  if (typeof role !== 'string') {
    return null;
  }

  const normalized = role.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return ROLE_ALIAS_MAP[normalized] ?? null;
}

function parseRoleTokens(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((item) => String(item));
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item));
        }
      } catch {
        // Fall back to comma-separated parsing.
      }
    }

    return trimmed.split(',');
  }

  return [];
}

export function normalizeRoleList(input: unknown, fallback: CanonicalRole[] = ['VIEWER']): CanonicalRole[] {
  const tokens = parseRoleTokens(input);
  const normalized = new Set<CanonicalRole>();

  for (const token of tokens) {
    const normalizedRole = normalizeRoleToken(token);
    if (normalizedRole) {
      normalized.add(normalizedRole);
    }
  }

  if (normalized.size === 0) {
    return [...fallback];
  }

  return CANONICAL_ROLES.filter((role) => normalized.has(role));
}

export function serializeRoleList(input: unknown, fallback: CanonicalRole[] = ['VIEWER']): string {
  return normalizeRoleList(input, fallback).join(',');
}

export function getAllowedRoleTokens(role: unknown): string[] {
  const normalized = normalizeRoleToken(role) ?? 'VIEWER';

  if (normalized === 'ADMIN') {
    return ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER', 'USER', 'IC'];
  }

  if (normalized === 'MANAGER') {
    return ['MANAGER', 'EDITOR', 'VIEWER', 'USER', 'IC'];
  }

  if (normalized === 'EDITOR') {
    return ['EDITOR', 'VIEWER', 'USER', 'IC'];
  }

  return ['VIEWER', 'USER', 'IC'];
}
