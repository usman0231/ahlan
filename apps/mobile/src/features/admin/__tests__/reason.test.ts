import { REASON_MAX, REASON_MIN, reasonProblem } from '../reason';

describe('reasonProblem', () => {
  it('requires a reason', () => {
    expect(reasonProblem('')).toBe('required');
    expect(reasonProblem('   ')).toBe('required');
  });

  it('measures the trimmed text against the minimum', () => {
    expect(reasonProblem(' abc ')).toBe('tooShort');
    expect(reasonProblem('x'.repeat(REASON_MIN))).toBeNull();
    expect(reasonProblem('short', 10)).toBe('tooShort');
  });

  it('caps the length', () => {
    expect(reasonProblem('x'.repeat(REASON_MAX + 1))).toBe('tooLong');
  });
});
