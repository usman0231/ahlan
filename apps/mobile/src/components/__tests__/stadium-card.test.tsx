import { fireEvent, screen } from '@testing-library/react-native';

import { StadiumCard, stadiumPhotoSource } from '../stadium-card';
import { renderWithProviders } from '../../test/render';
import { stadiumImage } from '../../features/admin/stadium-images';

// Lucide ships ESM-only .mjs that this Jest setup does not transform; the
// icons are decoration here, so any named icon renders nothing.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('StadiumCard', () => {
  it('shows the venue, the assignee and the three figures, and opens on press', () => {
    const onOpen = jest.fn();
    renderWithProviders(
      <StadiumCard
        code="KDA"
        name="Kingdom Arena"
        city="Riyadh"
        assignee="Inspector 05"
        stats={{
          inspections: 4,
          inspectionsExpected: 6,
          findings: 2,
          compliancePercent: 92,
          progress: 0.67,
          progressLabel: 'Inspection progress',
        }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText('KDA')).toBeTruthy();
    expect(screen.getByText('Kingdom Arena')).toBeTruthy();
    expect(screen.getByText('Inspector 05')).toBeTruthy();
    expect(screen.getByText('4/6')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /Open stadium/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says so when nobody is assigned', () => {
    renderWithProviders(
      <StadiumCard code="NEW" name="New Venue" assignee={null} stats={null} onOpen={jest.fn()} />,
    );
    expect(screen.getByText('Nobody assigned')).toBeTruthy();
  });
});

describe('stadiumImage', () => {
  it('resolves the client venues by code, case-insensitively', () => {
    for (const code of ['KAS', 'PAF', 'ARM', 'KFS', 'KSU', 'KDA', 'IMU', 'shb']) {
      expect(stadiumImage(code)).not.toBeNull();
    }
  });

  it('falls back to the placeholder for an unknown code', () => {
    expect(stadiumImage('XYZ')).toBeNull();
    expect(stadiumImage(null)).toBeNull();
  });
});

describe('stadiumPhotoSource', () => {
  it('prefers the uploaded photo, keyed on the path so re-signed URLs share a cache entry', () => {
    expect(stadiumPhotoSource('KAS', 'http://s3/stadiums/a/1.jpg?X-Amz-Signature=abc')).toEqual({
      uri: 'http://s3/stadiums/a/1.jpg?X-Amz-Signature=abc',
      cacheKey: 'http://s3/stadiums/a/1.jpg',
    });
  });

  it('falls back to the bundled photo, then to none', () => {
    expect(stadiumPhotoSource('KAS', null)).toBe(stadiumImage('KAS'));
    expect(stadiumPhotoSource('KAS', 'http://s3/x.jpg', true)).toBe(stadiumImage('KAS'));
    expect(stadiumPhotoSource('NEW', 'http://s3/x.jpg', true)).toBeNull();
    expect(stadiumPhotoSource('NEW', undefined)).toBeNull();
  });
});
