import { screen } from '@testing-library/react-native';

import { Badge, SeverityBadge, StatusBadge, SyncBadge, CountBadge } from '../badge';
import { renderWithProviders } from '../../test/render';

describe('SeverityBadge', () => {
  it('names the severity rather than relying on colour alone', () => {
    renderWithProviders(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText('Critical')).toBeOnTheScreen();
  });
});

describe('StatusBadge', () => {
  it('shows the stored status', () => {
    renderWithProviders(<StatusBadge status="PENDING_VERIFICATION" />);
    expect(screen.getByText('Pending verification')).toBeOnTheScreen();
  });

  /**
   * OVERDUE is derived from the due date, never stored, so the badge takes it
   * as a separate flag. These two cases are what keep that rule visible.
   */
  it('shows OVERDUE for a late, unfinished action', () => {
    renderWithProviders(<StatusBadge status="IN_PROGRESS" isOverdue />);
    expect(screen.getByText('Overdue')).toBeOnTheScreen();
    expect(screen.queryByText('In progress')).toBeNull();
  });

  it('never shows OVERDUE on a closed finding', () => {
    renderWithProviders(<StatusBadge status="CLOSED" isOverdue />);
    expect(screen.getByText('Closed')).toBeOnTheScreen();
    expect(screen.queryByText('Overdue')).toBeNull();
  });
});

describe('SyncBadge', () => {
  it.each([
    ['LOCAL', 'Saved on device'],
    ['SYNCING', 'Syncing'],
    ['SYNCED', 'Synced'],
    ['FAILED', 'Sync failed'],
  ] as const)('reads %s as "%s"', (state, label) => {
    renderWithProviders(<SyncBadge state={state} />);
    expect(screen.getByText(label)).toBeOnTheScreen();
  });
});

describe('CountBadge', () => {
  it('renders nothing at zero', () => {
    renderWithProviders(<CountBadge count={0} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('caps at 99+', () => {
    renderWithProviders(<CountBadge count={140} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it('uppercases through the overline style without mangling the label', () => {
    renderWithProviders(<Badge label="Weekly" tone="primary" />);
    expect(screen.getByText('Weekly')).toBeOnTheScreen();
  });
});
