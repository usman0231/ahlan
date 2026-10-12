/**
 * Fixed-point arithmetic for man-hours and any other quantity that ends up in a
 * report. Reports must add up exactly, so values are carried as strings and
 * summed as scaled BigInts rather than as IEEE doubles.
 */

const SCALE = 2;
const FACTOR = 100n;

export type DecimalLike = string | number | bigint;

function parseScaled(value: DecimalLike): bigint {
  if (typeof value === 'bigint') return value * FACTOR;
  const text = typeof value === 'number' ? value.toFixed(SCALE + 1) : value.trim();
  if (text === '') return 0n;
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new TypeError(`Not a decimal: ${String(value)}`);
  const sign = match[1];
  const whole = match[2] ?? '';
  const fractionRaw = match[3] ?? '';
  const fraction = fractionRaw.slice(0, SCALE).padEnd(SCALE, '0');
  let scaled = BigInt(whole === '' ? '0' : whole) * FACTOR + BigInt(fraction);
  // Half-up on the first dropped digit, so device-side rounding matches the API.
  const dropped = fractionRaw.slice(SCALE);
  if (dropped !== '' && Number.parseInt(dropped.charAt(0), 10) >= 5) scaled += 1n;
  return sign === '-' ? -scaled : scaled;
}

function formatScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = (abs / FACTOR).toString();
  const fraction = (abs % FACTOR).toString().padStart(SCALE, '0');
  return (negative ? '-' : '') + whole + '.' + fraction;
}

/** Normalises any decimal input to a fixed 2dp string. */
export function toDecimalString(value: DecimalLike): string {
  return formatScaled(parseScaled(value));
}

export function addDecimals(...values: DecimalLike[]): string {
  let sum = 0n;
  for (const value of values) sum += parseScaled(value);
  return formatScaled(sum);
}

export function subtractDecimals(a: DecimalLike, b: DecimalLike): string {
  return formatScaled(parseScaled(a) - parseScaled(b));
}

export function multiplyDecimalByInt(value: DecimalLike, times: number): string {
  if (!Number.isInteger(times)) throw new TypeError('times must be an integer');
  return formatScaled(parseScaled(value) * BigInt(times));
}

/**
 * Divides by a positive integer, rounding half-up to 2dp. Only used to map a
 * legacy EOD workforce line (total man-hours per headcount) to hours per person.
 */
export function divideDecimalByInt(value: DecimalLike, divisor: number): string {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new TypeError('divisor must be a positive integer');
  }
  const scaled = parseScaled(value);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const big = BigInt(divisor);
  let quotient = abs / big;
  if ((abs % big) * 2n >= big) quotient += 1n;
  return formatScaled(negative ? -quotient : quotient);
}

export function compareDecimals(a: DecimalLike, b: DecimalLike): -1 | 0 | 1 {
  const left = parseScaled(a);
  const right = parseScaled(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** For charts and ratios only - never for a stored total. */
export function decimalToNumber(value: DecimalLike): number {
  return Number(formatScaled(parseScaled(value)));
}
