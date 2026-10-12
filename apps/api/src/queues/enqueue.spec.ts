import type { Queue } from 'bullmq';
import { enqueue, toJobId } from './enqueue';

describe('toJobId', () => {
  it('strips every colon, whatever the number of parts', () => {
    expect(toJobId('report:01a121ce-7d3f-7000-a99a-cc6b0fe57030')).toBe(
      'report-01a121ce-7d3f-7000-a99a-cc6b0fe57030',
    );
    expect(toJobId('eod-missing:2026-10-10T00')).toBe('eod-missing-2026-10-10T00');
    expect(toJobId('report:a:b')).toBe('report-a-b');
  });
});

describe('enqueue', () => {
  it('passes a colon-free job id to BullMQ', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { name: 'reports', add } as unknown as Queue;

    await enqueue(queue, 'generate-report', { reportId: 'x' }, { jobId: 'report:x' });

    expect(add).toHaveBeenCalledWith('generate-report', { reportId: 'x' }, { jobId: 'report-x' });
  });
});
