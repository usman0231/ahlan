import {
  DISCIPLINE_ICON_NAMES,
  isColorToken,
  slugFromName,
  tournamentRangeProblem,
} from '../catalog-form';
import { disciplineIcon } from '../../observations/discipline-icon';

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => String(name) }));

describe('slugFromName', () => {
  it('builds the API slug from a display name', () => {
    expect(slugFromName('Work at Height')).toBe('work-at-height');
    expect(slugFromName('Overlay / Temporary Infrastructure')).toBe(
      'overlay-temporary-infrastructure',
    );
    expect(slugFromName('  Fire & Life Safety! ')).toBe('fire-and-life-safety');
    expect(slugFromName('x'.repeat(60))).toHaveLength(48);
  });
});

describe('discipline pickers', () => {
  it('only offers icons the tiles can render', () => {
    for (const name of DISCIPLINE_ICON_NAMES) expect(disciplineIcon(name)).not.toBe('ShieldCheck');
  });

  it('accepts palette tokens only', () => {
    expect(isColorToken('accent')).toBe(true);
    expect(isColorToken('#ff0000')).toBe(false);
    expect(isColorToken(null)).toBe(false);
  });
});

describe('tournamentRangeProblem', () => {
  it('checks format and order', () => {
    expect(tournamentRangeProblem('2026-01-01', '2026-02-01')).toBeNull();
    expect(tournamentRangeProblem('2026-01-01', '2026-01-01')).toBeNull();
    expect(tournamentRangeProblem('2026-02-01', '2026-01-01')).toBe('order');
    expect(tournamentRangeProblem('2026-1-1', '2026-01-01')).toBe('format');
  });
});
