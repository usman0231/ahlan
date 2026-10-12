import {
  MAX_STADIUM_IMAGE_BYTES,
  correctObservationSchema,
  listInspectionsQuerySchema,
  optionalReasonSchema,
  presignStadiumImageSchema,
  restoreRecordSchema,
  softDeleteRecordSchema,
} from '../index';

describe('wave 3 admin schemas', () => {
  it('requires a trimmed reason of at least 5 characters to delete or restore', () => {
    expect(softDeleteRecordSchema.safeParse({ reason: '  dup  ' }).success).toBe(false);
    expect(softDeleteRecordSchema.safeParse({}).success).toBe(false);
    expect(softDeleteRecordSchema.parse({ reason: '  Duplicate entry ' })).toEqual({
      reason: 'Duplicate entry',
    });
    expect(restoreRecordSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('accepts a missing body for optional-reason deletes', () => {
    expect(optionalReasonSchema.parse(undefined)).toEqual({});
    expect(optionalReasonSchema.parse({ reason: 'Wrong period' })).toEqual({ reason: 'Wrong period' });
    expect(optionalReasonSchema.safeParse({ reason: 'no' }).success).toBe(false);
  });

  it('limits stadium photos to jpeg/png/webp up to 8 MB', () => {
    expect(presignStadiumImageSchema.safeParse({ contentType: 'image/webp', sizeBytes: 10 }).success).toBe(
      true,
    );
    expect(presignStadiumImageSchema.safeParse({ contentType: 'image/gif', sizeBytes: 10 }).success).toBe(
      false,
    );
    expect(
      presignStadiumImageSchema.safeParse({
        contentType: 'image/jpeg',
        sizeBytes: MAX_STADIUM_IMAGE_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('parses includeDeleted from a query string', () => {
    expect(listInspectionsQuerySchema.parse({ includeDeleted: 'true' }).includeDeleted).toBe(true);
    expect(listInspectionsQuerySchema.parse({ includeDeleted: 'false' }).includeDeleted).toBe(false);
    expect(listInspectionsQuerySchema.parse({}).includeDeleted).toBeUndefined();
  });

  it('lets an admin correct every observation field', () => {
    const parsed = correctObservationSchema.parse({
      reason: 'Wrong type picked',
      type: 'UNSAFE_ACT',
      locationLabel: 'Gate C',
      immediateAction: 'Cordoned off',
      observedAt: '2026-10-12T10:00:00Z',
    });
    expect(parsed.observedAt).toBeInstanceOf(Date);
    expect(parsed.type).toBe('UNSAFE_ACT');
  });
});
