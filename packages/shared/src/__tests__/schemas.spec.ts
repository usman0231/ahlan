import { uuidv7 } from '../ids';
import { registerSchema } from '../schemas/auth';
import { createChecklistSchema } from '../schemas/checklist';
import { submitEodSchema } from '../schemas/eod';
import { presignEvidenceSchema } from '../schemas/evidence';
import { submitInspectionSchema } from '../schemas/inspection';
import { createObservationSchema } from '../schemas/observation';
import { isClientWritable } from '../schemas/sync';
import {
  adminResetPasswordSchema,
  createUserSchema,
  updateUserSchema,
} from '../schemas/user';

const id = () => uuidv7();

function baseInspection() {
  return {
    id: id(),
    stadiumId: id(),
    checklistId: id(),
    checklistVersionId: id(),
    startedAt: '2026-10-06T06:00:00.000Z',
    submittedAt: '2026-10-06T07:00:00.000Z',
    clientCreatedAt: '2026-10-06T06:00:00.000Z',
    responses: [
      {
        id: id(),
        itemId: id(),
        value: 'YES' as const,
        answeredAt: '2026-10-06T06:10:00.000Z',
        evidenceIds: [],
      },
    ],
  };
}

describe('inspection submit', () => {
  it('accepts a valid payload', () => {
    expect(submitInspectionSchema.safeParse(baseInspection()).success).toBe(true);
  });

  it('rejects a NO without a photo', () => {
    const payload = baseInspection();
    payload.responses[0] = { ...payload.responses[0]!, value: 'NO' as never, evidenceIds: [] };
    const result = submitInspectionSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('at least one photo');
    }
  });

  it('accepts a NO with a photo', () => {
    const payload = baseInspection();
    payload.responses[0] = {
      ...payload.responses[0]!,
      value: 'NO' as never,
      evidenceIds: [id()] as never,
    };
    expect(submitInspectionSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects an empty answer set', () => {
    expect(submitInspectionSchema.safeParse({ ...baseInspection(), responses: [] }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid id, so a client cannot invent a key shape', () => {
    expect(submitInspectionSchema.safeParse({ ...baseInspection(), id: '42' }).success).toBe(false);
  });
});

describe('observation', () => {
  const base = {
    id: id(),
    stadiumId: id(),
    disciplineId: id(),
    title: 'Scaffold missing toe board',
    description: 'North stand scaffold level 3 has no toe board on the working platform.',
    observedAt: '2026-10-06T06:00:00.000Z',
    clientCreatedAt: '2026-10-06T06:00:00.000Z',
  };

  it('requires a photo for an unsafe condition', () => {
    expect(
      createObservationSchema.safeParse({ ...base, type: 'UNSAFE_CONDITION', evidenceIds: [] })
        .success,
    ).toBe(false);
  });

  it('does not require a photo for a positive observation', () => {
    expect(
      createObservationSchema.safeParse({ ...base, type: 'POSITIVE', evidenceIds: [] }).success,
    ).toBe(true);
  });

  it('trims and bounds free text', () => {
    const parsed = createObservationSchema.safeParse({
      ...base,
      type: 'POSITIVE',
      title: '   Good housekeeping   ',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe('Good housekeeping');
  });
});

describe('EOD submit', () => {
  const base = {
    id: id(),
    stadiumId: id(),
    date: '2026-10-06',
    submittedAt: '2026-10-06T19:00:00.000Z',
    clientCreatedAt: '2026-10-06T18:55:00.000Z',
    summary: 'All works completed without incident across the north and east stands.',
    workforce: [{ contractor: 'Alpha Scaffolding', headcount: 24, manHours: '192.00' }],
  };

  it('accepts a valid report', () => {
    expect(submitEodSchema.safeParse(base).success).toBe(true);
  });

  it('maps a legacy line to hours per person as a 2dp decimal string', () => {
    const parsed = submitEodSchema.safeParse({
      ...base,
      workforce: [{ contractor: 'Beta', headcount: 2, manHours: 16 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.workforce[0]).toEqual({ category: 'Beta', personnel: 2, hours: '8.00' });
    }
  });

  it('rejects negative man-hours on a legacy line and negative hours on a current one', () => {
    expect(
      submitEodSchema.safeParse({
        ...base,
        workforce: [{ contractor: 'Beta', headcount: 2, manHours: '-16.00' }],
      }).success,
    ).toBe(false);
    expect(
      submitEodSchema.safeParse({
        ...base,
        workforce: [{ category: 'Beta', personnel: 2, hours: '-8' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a bad date', () => {
    expect(submitEodSchema.safeParse({ ...base, date: '2026-13-40' }).success).toBe(false);
  });
});

describe('registration', () => {
  it('lowercases the email and enforces password strength', () => {
    const parsed = registerSchema.safeParse({
      email: ' Inspector@Example.COM ',
      password: 'Stadium2026!',
      fullName: 'Test Inspector',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe('inspector@example.com');

    expect(
      registerSchema.safeParse({
        email: 'a@b.com',
        password: 'short',
        fullName: 'Test Inspector',
      }).success,
    ).toBe(false);
  });
});

describe('checklist authoring', () => {
  it('rejects duplicate item codes across sections', () => {
    const result = createChecklistSchema.safeParse({
      title: 'Work at Height',
      sections: [
        { title: 'Access', items: [{ code: 'WAH-01', question: 'Ladders secured?' }] },
        { title: 'Edge protection', items: [{ code: 'wah-01', question: 'Guardrails fitted?' }] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('Duplicate item code');
    }
  });

  it('uppercases item codes', () => {
    const result = createChecklistSchema.safeParse({
      title: 'Housekeeping',
      sections: [{ title: 'General', items: [{ code: 'hk-01', question: 'Walkways clear?' }] }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sections[0]?.items[0]?.code).toBe('HK-01');
  });
});

describe('evidence presign', () => {
  it('rejects an unsupported content type', () => {
    expect(
      presignEvidenceSchema.safeParse({
        id: id(),
        context: 'OBSERVATION',
        stadiumId: id(),
        contentType: 'video/mp4',
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it('rejects an oversized file', () => {
    expect(
      presignEvidenceSchema.safeParse({
        id: id(),
        context: 'OBSERVATION',
        stadiumId: id(),
        contentType: 'image/jpeg',
        sizeBytes: 64 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });
});

describe('sync write policy', () => {
  it('allows only field-created tables to be pushed', () => {
    expect(isClientWritable('inspections')).toBe(true);
    expect(isClientWritable('eod_reports')).toBe(true);
    expect(isClientWritable('checklists')).toBe(false);
    expect(isClientWritable('users')).toBe(false);
  });
});

describe('admin user management', () => {
  const base = {
    email: 'Someone@Example.test',
    password: 'Stadium2026!',
    fullName: 'Test Person',
  };

  it('requires a stadium for a supervisor or inspector', () => {
    for (const role of ['SUPERVISOR', 'INSPECTOR'] as const) {
      const result = createUserSchema.safeParse({ ...base, role });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['stadiumIds']);
      expect(createUserSchema.safeParse({ ...base, role, stadiumIds: [id()] }).success).toBe(true);
    }
  });

  it('lets an admin be created without stadiums', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'ADMIN' }).success).toBe(true);
  });

  it('only lets an admin set ACTIVE or SUSPENDED', () => {
    expect(updateUserSchema.safeParse({ status: 'SUSPENDED' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ status: 'ACTIVE' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
  });

  it('applies the normal password rules to an admin reset', () => {
    expect(adminResetPasswordSchema.safeParse({ newPassword: 'Stadium2026!' }).success).toBe(true);
    expect(adminResetPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(adminResetPasswordSchema.safeParse({ newPassword: 'alllowercase123' }).success).toBe(
      false,
    );
  });
});
