import { toPushPayload } from '../push-payload';

describe('toPushPayload', () => {
  it('drops device-only evidence columns such as a data: URI', () => {
    const changes = {
      evidence: {
        created: [{ id: 'e1', context: 'OBSERVATION', local_uri: 'data:image/jpeg;base64,AAAA', upload_attempts: 1 }],
        updated: [{ id: 'e2', local_uri: 'file:///x.jpg', upload_error: 'NETWORK' }],
        deleted: [],
      },
    };

    const payload = toPushPayload(changes);

    expect(payload.evidence?.created[0]).toEqual({ id: 'e1', context: 'OBSERVATION' });
    expect(payload.evidence?.updated[0]).toEqual({ id: 'e2' });
    // The local database rows are untouched.
    expect(changes.evidence.created[0]?.local_uri).toBe('data:image/jpeg;base64,AAAA');
  });

  it('passes other tables through unchanged', () => {
    const inspections = { created: [{ id: 'i1', status: 'SUBMITTED' }], updated: [], deleted: [] };
    expect(toPushPayload({ inspections }).inspections).toBe(inspections);
  });
});
