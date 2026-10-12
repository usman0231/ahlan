import { screen, userEvent } from '@testing-library/react-native';

import { AnswerToggle } from '../answer-toggle';
import { renderWithProviders } from '../../test/render';

/**
 * The checklist answer control.
 *
 * Tested for the things an inspector depends on: that the three answers are
 * reachable, that NA disappears on an item that forbids it, and that the
 * selection is announced to a screen reader rather than being colour alone.
 */
describe('AnswerToggle', () => {
  it('offers Yes, No and N/A', () => {
    renderWithProviders(<AnswerToggle value={null} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Yes')).toBeOnTheScreen();
    expect(screen.getByLabelText('No')).toBeOnTheScreen();
    expect(screen.getByLabelText('N/A')).toBeOnTheScreen();
  });

  it('hides N/A when the item does not allow it', () => {
    renderWithProviders(<AnswerToggle value={null} onChange={jest.fn()} allowNa={false} />);

    expect(screen.getByLabelText('Yes')).toBeOnTheScreen();
    expect(screen.queryByLabelText('N/A')).toBeNull();
  });

  it('reports the answer that was tapped', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AnswerToggle value={null} onChange={onChange} />);

    await user.press(screen.getByLabelText('No'));

    expect(onChange).toHaveBeenCalledWith('NO');
  });

  it('marks the chosen answer as selected for assistive tech', () => {
    renderWithProviders(<AnswerToggle value="YES" onChange={jest.fn()} />);

    expect(screen.getByLabelText('Yes')).toBeSelected();
    expect(screen.getByLabelText('No')).not.toBeSelected();
  });

  it('does not fire while disabled', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AnswerToggle value="YES" onChange={onChange} disabled />);

    await user.press(screen.getByLabelText('No'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes each answer as a radio, so the group reads as a choice', () => {
    renderWithProviders(<AnswerToggle value={null} onChange={jest.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
