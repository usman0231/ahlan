import { BarChart, computeBarScale, labelStride } from '../bar-chart';
import { screen } from '@testing-library/react-native';

import { renderWithProviders as render } from '../../test/render';

describe('computeBarScale', () => {
  it('scales to the largest value', () => {
    expect(computeBarScale([2, 4, 1])).toEqual({ max: 4, ratios: [0.5, 1, 0.25] });
  });

  it('never divides by zero', () => {
    expect(computeBarScale([0, 0])).toEqual({ max: 1, ratios: [0, 0] });
    expect(computeBarScale([])).toEqual({ max: 1, ratios: [] });
  });

  it('draws negative and non-finite values as empty bars', () => {
    expect(computeBarScale([-3, Number.NaN, 5]).ratios).toEqual([0, 0, 1]);
  });

  it('honours a pinned max and clamps above it', () => {
    expect(computeBarScale([50, 150], 100)).toEqual({ max: 150, ratios: [50 / 150, 1] });
    expect(computeBarScale([25, 50], 100).ratios).toEqual([0.25, 0.5]);
  });
});

describe('labelStride', () => {
  it('prints every label when they fit', () => {
    expect(labelStride(7, 7)).toBe(1);
  });

  it('thins a long series', () => {
    expect(labelStride(30, 7)).toBe(5);
    expect(labelStride(14, 7)).toBe(2);
  });
});

describe('BarChart', () => {
  it('prints labels and values and summarises them for screen readers', () => {
    render(
      <BarChart
        data={[
          { key: 'a', label: 'Unsafe act', value: 3 },
          { key: 'b', label: 'Near miss', value: 1 },
        ]}
      />,
    );
    expect(screen.getByText('Unsafe act')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByLabelText('Unsafe act: 3, Near miss: 1')).toBeTruthy();
  });

  it('shows an empty state instead of zero-height bars', () => {
    render(<BarChart data={[{ key: 'a', label: 'Unsafe act', value: 0 }]} emptyLabel="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });
});
