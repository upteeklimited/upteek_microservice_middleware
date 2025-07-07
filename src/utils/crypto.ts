// src/utils/crypto.ts
import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env.SHARED_SECRET;
  if (!secret) {
    throw new Error('SHARED_SECRET is not set in environment variables!');
  }
  if (secret.length !== 64) {
    throw new Error('SHARED_SECRET must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(secret, 'hex');
}

export function encrypt(plain: string): {
  data: string;
  iv: string;
  tag: string;
} {
  const KEY = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(plain, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return {
    data: encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decrypt({
  data,
  iv,
  tag,
}: {
  data: string;
  iv: string;
  tag: string;
}): string {
  const KEY = getKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    KEY,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
