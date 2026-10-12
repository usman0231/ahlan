import type { ChecklistCompletion } from '@ahlan/shared';

import {
  completionRatio,
  sortCompletionInspectors,
  summariseCompletion,
  templateTone,
} from '../completion-summary';

function row(expected: number, completed: number): ChecklistCompletion {
  return {
    checklistId: `c-${expected}-${completed}`,
    title: 'Outer Perimeter',
    titleAr: null,
    category: 'READINESS',
    itemCount: 12,
    expected,
    completed,
    pending: expected - completed,
    inspectors: [],
  };
}

describe('summariseCompletion', () => {
  it('adds up every checklist', () => {
    expect(summariseCompletion([row(8, 5), row(8, 8), row(8, 0)])).toEqual({
      expected: 24,
      completed: 13,
      pending: 11,
      percent: 54.17,
    });
  });

  it('has no percentage when nothing is expected', () => {
    expect(summariseCompletion([])).toEqual({
      expected: 0,
      completed: 0,
      pending: 0,
      percent: null,
    });
  });

  it('never counts more completed than expected', () => {
    expect(summariseCompletion([row(2, 3)]).completed).toBe(2);
  });
});

describe('completionRatio', () => {
  it('is 0..1 and safe on zero', () => {
    expect(completionRatio({ expected: 4, completed: 1 })).toBe(0.25);
    expect(completionRatio({ expected: 0, completed: 0 })).toBe(0);
    expect(completionRatio({ expected: 2, completed: 5 })).toBe(1);
  });
});

describe('sortCompletionInspectors', () => {
  it('puts pending first, then stadium code, then name', () => {
    const sorted = sortCompletionInspectors([
      { status: 'COMPLETED' as const, stadiumCode: 'ARM', fullName: 'B' },
      { status: 'PENDING' as const, stadiumCode: 'SHB', fullName: 'A' },
      { status: 'PENDING' as const, stadiumCode: 'KAS', fullName: 'Z' },
      { status: 'PENDING' as const, stadiumCode: 'KAS', fullName: 'M' },
    ]);
    expect(sorted.map((r) => `${r.status[0]}${r.stadiumCode}${r.fullName}`)).toEqual([
      'PKASM',
      'PKASZ',
      'PSHBA',
      'CARMB',
    ]);
  });
});

describe('templateTone', () => {
  it('cycles the four mockup tints', () => {
    expect([0, 1, 2, 3, 4, 5].map(templateTone)).toEqual([
      'info',
      'warning',
      'success',
      'danger',
      'info',
      'warning',
    ]);
    expect(templateTone(-3)).toBe('info');
  });
});
