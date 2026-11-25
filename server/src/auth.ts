import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** A member's secret: 32 random bytes. Only its hash is stored. */
export const newToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The secret in an invite link: 16 random bytes as 32 hex characters. */
export const newInviteCode = () => randomBytes(16).toString('hex');

export const isInviteCode = (code: string) => /^[0-9a-f]{32}$/.test(code);

export const newId = () => randomUUID();

/** The token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/);
  return match?.[1];
}
