export interface PendingToken {
  token: string;
  createdAt: Date;
  apiKeyId?: string;
  apiKeyRaw?: string;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const pendingTokens = new Map<string, PendingToken>();

function isExpired(entry: PendingToken): boolean {
  return Date.now() - entry.createdAt.getTime() > TEN_MINUTES_MS;
}

export function cleanExpiredTokens(): void {
  for (const [token, entry] of pendingTokens.entries()) {
    if (isExpired(entry)) {
      pendingTokens.delete(token);
    }
  }
}

export function createPendingToken(token: string): void {
  cleanExpiredTokens();
  pendingTokens.set(token, {
    token,
    createdAt: new Date(),
  });
}

export function getPendingToken(token: string): PendingToken | undefined {
  cleanExpiredTokens();
  const entry = pendingTokens.get(token);
  if (!entry) {
    return undefined;
  }

  if (isExpired(entry)) {
    pendingTokens.delete(token);
    return undefined;
  }

  return entry;
}

export function fulfillToken(token: string, apiKeyId: string, apiKeyRaw: string): void {
  const entry = getPendingToken(token);
  if (!entry) {
    return;
  }

  pendingTokens.set(token, {
    ...entry,
    apiKeyId,
    apiKeyRaw,
  });
}

export function deletePendingToken(token: string): void {
  pendingTokens.delete(token);
}
