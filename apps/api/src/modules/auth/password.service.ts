import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password and opaque-token hashing.
 *
 * Passwords use bcrypt at cost 12. Refresh tokens are long random strings, so
 * they only need a fast SHA-256 digest at rest - bcrypt on every token refresh
 * would cost real latency for no extra protection against a 256-bit secret.
 */
@Injectable()
export class PasswordService {
  private readonly cost = 12;

  hashPassword(plain: string): Promise<string> {
    return hash(plain, this.cost);
  }

  verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }

  /** URL-safe opaque token, used for refresh tokens and password resets. */
  generateToken(bytes = 48): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time comparison, so a hash cannot be probed byte by byte. */
  tokenMatches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
