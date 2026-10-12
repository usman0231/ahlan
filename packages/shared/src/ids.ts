/**
 * UUID v7 generation.
 *
 * Anything an inspector can create offline gets its id on the device, so a retried
 * push can never insert the same record twice. v7 is time-ordered, which keeps the
 * Postgres primary-key index append-only.
 */

const HEX = '0123456789abcdef';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  // Last resort (should not happen: Node >= 18 and RN both expose WebCrypto).
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] as number;
    out += HEX[byte >> 4];
    out += HEX[byte & 0x0f];
  }
  return out;
}

/** Monotonic counter so ids created inside the same millisecond stay ordered. */
let lastTimestamp = -1;
let sequence = 0;

export function uuidv7(now: number = Date.now()): string {
  if (now === lastTimestamp) {
    sequence += 1;
  } else {
    lastTimestamp = now;
    sequence = 0;
  }

  const bytes = randomBytes(16);

  // 48-bit big-endian unix millisecond timestamp.
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7 in the high nibble of byte 6, 12 bits of sequence after it.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  // RFC 4122 variant bits.
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Milliseconds encoded in a v7 id, or `null` for any other UUID version. */
export function uuidv7Timestamp(id: string): number | null {
  if (!isUuid(id)) return null;
  const hex = id.replace(/-/g, '');
  if (hex[12] !== '7') return null;
  return Number.parseInt(hex.slice(0, 12), 16);
}
