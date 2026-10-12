import { ApiError } from '../../../api/client';
import {
  MAX_ATTEMPTS,
  classifyUploadError,
  retryFailedEvidence,
  uploadErrorCode,
  uploadPendingEvidence,
} from '../upload-queue';

/* ---------------------------------------------------------------- mocks --- */

type Cond =
  | { column: string; op: 'eq' | 'notEq' | 'oneOf' | 'gte'; value: unknown }
  | null;

jest.mock('@nozbe/watermelondb', () => {
  const wrap = (op: string) => (value: unknown) => ({ op, value });
  return {
    Q: {
      where: (column: string, cond: unknown) =>
        cond && typeof cond === 'object' && 'op' in (cond as object)
          ? { column, ...(cond as object) }
          : { column, op: 'eq', value: cond },
      notEq: wrap('notEq'),
      oneOf: wrap('oneOf'),
      gte: wrap('gte'),
      sortBy: () => null,
      asc: 'asc',
    },
  };
});

const mockRows: FakeEvidence[] = [];

const mockColumn: Record<string, keyof FakeEvidence> = {
  upload_status: 'uploadStatus',
  id: 'id',
  upload_attempts: 'uploadAttempts',
};

function mockMatches(row: FakeEvidence, cond: Cond): boolean {
  if (!cond) return true;
  const value = row[mockColumn[cond.column] as keyof FakeEvidence];
  switch (cond.op) {
    case 'eq':
      return value === cond.value;
    case 'notEq':
      return value !== cond.value;
    case 'oneOf':
      return (cond.value as unknown[]).includes(value);
    case 'gte':
      return (value as number) >= (cond.value as number);
  }
}

jest.mock('../../../db', () => ({
  collections: {
    evidence: () => ({
      query: (...conds: Cond[]) => ({
        fetch: async () => mockRows.filter((row) => conds.every((cond) => mockMatches(row, cond))),
        fetchCount: async () =>
          mockRows.filter((row) => conds.every((cond) => mockMatches(row, cond))).length,
      }),
    }),
  },
}));

jest.mock('../local-files', () => ({
  localFileExists: jest.fn(() => true),
  readLocalFile: jest.fn(async () => new Uint8Array(4321)),
}));

jest.mock('../local-cleanup', () => ({
  purgeUploadedLocalCopies: jest.fn(async () => 0),
}));

jest.mock('../../../store/settings', () => ({
  useSettingsStore: { getState: () => ({ wifiOnlyUploads: false }) },
}));

const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../../../api/client', () => {
  const actual = jest.requireActual('../../../api/client');
  return {
    ...actual,
    api: { post: (...args: unknown[]) => mockPost(...args) },
    uploadToPresignedUrl: (...args: unknown[]) => mockPut(...args),
  };
});

/* ------------------------------------------------------------ fixtures --- */

/** Mirrors EvidenceModel's writers, so the queue's calls have real effects. */
class FakeEvidence {
  kind = 'PHOTO';
  context = 'OBSERVATION';
  contextId: string | null = 'ctx';
  objectKey: string | null = null;
  contentType = 'image/jpeg';
  sizeBytes = 0;
  width = 1600;
  height = 1200;
  caption: string | null = null;
  localUri: string | null;
  capturedAt: number | null = null;
  latitude: number | null = null;
  longitude: number | null = null;
  uploadStatus: 'PENDING' | 'UPLOADED' | 'FAILED' = 'PENDING';
  uploadAttempts = 0;
  uploadError: string | null = null;
  stadiumId = 'stadium';

  constructor(readonly id: string) {
    this.localUri = `file:///evidence/${id}.jpg`;
  }

  markUploading = jest.fn(async () => {
    this.uploadStatus = 'PENDING';
    this.uploadError = null;
  });
  setSizeBytes = jest.fn(async (size: number) => {
    this.sizeBytes = size;
  });
  markUploaded = jest.fn(async (objectKey: string) => {
    this.uploadStatus = 'UPLOADED';
    this.objectKey = objectKey;
  });
  markAttemptFailed = jest.fn(
    async (error: string, options: { permanent?: boolean; maxAttempts: number }) => {
      this.uploadStatus = 'FAILED';
      this.uploadError = error;
      this.uploadAttempts = options.permanent
        ? Math.max(options.maxAttempts, this.uploadAttempts)
        : this.uploadAttempts + 1;
    },
  );
  resetForRetry = jest.fn(async () => {
    this.uploadStatus = 'PENDING';
    this.uploadAttempts = 0;
    this.uploadError = null;
  });
}

const offline = () => new ApiError('NETWORK', 'Could not reach the server', 0);

function presignOk(id: string) {
  return {
    evidenceId: id,
    objectKey: `evidence/${id}.jpg`,
    uploadUrl: `http://storage.test/${id}`,
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '4321' },
    expiresAt: new Date().toISOString(),
  };
}

/** API answers presign + complete; storage accepts every PUT. */
function serverHappy() {
  mockPost.mockImplementation(async (path: string, body: { id: string }) =>
    path === '/evidence/presign' ? presignOk(body.id) : { uploadStatus: 'UPLOADED' },
  );
  mockPut.mockResolvedValue(undefined);
}

beforeEach(() => {
  mockRows.length = 0;
  mockPost.mockReset();
  mockPut.mockReset();
});

/* --------------------------------------------------------------- tests --- */

describe('classifyUploadError', () => {
  it.each([
    ['offline at presign', offline(), 'presign', 'deferred'],
    ['offline at complete (bytes may have landed)', offline(), 'complete', 'deferred'],
    ['storage unreachable at PUT', offline(), 'put', 'unreachable'],
    ['signed out', new ApiError('TOKEN_EXPIRED', 'x', 401), 'presign', 'deferred'],
    ['rate limited', new ApiError('RATE_LIMITED', 'x', 429), 'presign', 'deferred'],
    ['storage refused', new ApiError('STORAGE_REJECTED', 'x', 403), 'put', 'transient'],
    ['server error', new ApiError('INTERNAL_ERROR', 'x', 500), 'presign', 'transient'],
    ['object missing on complete', new ApiError('CONFLICT', 'x', 409), 'complete', 'transient'],
    ['invalid presign', new ApiError('VALIDATION_FAILED', 'x', 422), 'presign', 'permanent'],
    ['stadium unassigned', new ApiError('STADIUM_OUT_OF_SCOPE', 'x', 403), 'presign', 'permanent'],
    ['unreadable file', new Error('gone'), 'read', 'permanent'],
  ] as const)('%s -> %s', (_label, error, stage, expected) => {
    expect(classifyUploadError(error, stage)).toBe(expected);
  });

  it('extracts the stored error code for i18n', () => {
    expect(uploadErrorCode('STORAGE_REJECTED: refused (403)')).toBe('STORAGE_REJECTED');
    expect(uploadErrorCode('something odd')).toBe('UNKNOWN');
    expect(uploadErrorCode(null)).toBeNull();
  });
});

describe('uploadPendingEvidence', () => {
  it('uploads, signing the real byte length rather than the stored size', async () => {
    serverHappy();
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    const summary = await uploadPendingEvidence();

    expect(summary).toMatchObject({ uploaded: 1, failed: 0, deferred: false });
    expect(mockPost).toHaveBeenCalledWith(
      '/evidence/presign',
      expect.objectContaining({ id: 'a', sizeBytes: 4321 }),
    );
    expect(mockPost).toHaveBeenCalledWith('/evidence/a/complete', { sizeBytes: 4321 });
    expect(photo.uploadStatus).toBe('UPLOADED');
    expect(photo.objectKey).toBe('evidence/a.jpg');
  });

  it('does not count an offline pass and stops the batch', async () => {
    mockPost.mockRejectedValue(offline());
    const first = new FakeEvidence('a');
    const second = new FakeEvidence('b');
    mockRows.push(first, second);

    const summary = await uploadPendingEvidence();

    expect(summary).toMatchObject({ uploaded: 0, failed: 0, skipped: 2, deferred: true });
    expect(first.uploadAttempts).toBe(0);
    expect(first.uploadStatus).toBe('PENDING');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('survives many offline passes and still uploads once back online', async () => {
    mockPost.mockRejectedValue(offline());
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    for (let pass = 0; pass < MAX_ATTEMPTS + 3; pass += 1) await uploadPendingEvidence();
    expect(photo.uploadAttempts).toBe(0);

    serverHappy();
    const summary = await uploadPendingEvidence();
    expect(summary.uploaded).toBe(1);
  });

  it('counts a storage rejection, records why, and moves on to the next photo', async () => {
    serverHappy();
    mockPut
      .mockRejectedValueOnce(new ApiError('STORAGE_REJECTED', 'refused (403)', 403))
      .mockResolvedValue(undefined);
    const bad = new FakeEvidence('a');
    const good = new FakeEvidence('b');
    mockRows.push(bad, good);

    const summary = await uploadPendingEvidence();

    expect(summary).toMatchObject({ uploaded: 1, failed: 1 });
    expect(bad.uploadStatus).toBe('FAILED');
    expect(bad.uploadAttempts).toBe(1);
    expect(uploadErrorCode(bad.uploadError)).toBe('STORAGE_REJECTED');
    expect(good.uploadStatus).toBe('UPLOADED');
  });

  it('counts unreachable storage once and stops the batch', async () => {
    serverHappy();
    mockPut.mockRejectedValue(offline());
    const first = new FakeEvidence('a');
    const second = new FakeEvidence('b');
    mockRows.push(first, second);

    const summary = await uploadPendingEvidence();

    expect(summary).toMatchObject({ failed: 1, skipped: 1 });
    expect(first.uploadAttempts).toBe(1);
    expect(uploadErrorCode(first.uploadError)).toBe('STORAGE_UNREACHABLE');
    expect(second.markUploading).not.toHaveBeenCalled();
  });

  it('auto-retries a FAILED photo with attempts left', async () => {
    serverHappy();
    const photo = new FakeEvidence('a');
    photo.uploadStatus = 'FAILED';
    photo.uploadAttempts = MAX_ATTEMPTS - 1;
    mockRows.push(photo);

    const summary = await uploadPendingEvidence();

    expect(summary.uploaded).toBe(1);
    expect(photo.uploadStatus).toBe('UPLOADED');
  });

  it('leaves an exhausted photo for the manual retry, which resets and uploads it', async () => {
    serverHappy();
    const photo = new FakeEvidence('a');
    photo.uploadStatus = 'FAILED';
    photo.uploadAttempts = MAX_ATTEMPTS;
    mockRows.push(photo);

    const automatic = await uploadPendingEvidence();
    expect(automatic).toMatchObject({ uploaded: 0, skipped: 1, exhausted: 1 });
    expect(mockPost).not.toHaveBeenCalled();

    const manual = await retryFailedEvidence([photo.id]);
    expect(photo.resetForRetry).toHaveBeenCalled();
    expect(manual.uploaded).toBe(1);
    expect(photo.uploadStatus).toBe('UPLOADED');
  });

  it('gives up immediately on a permanent rejection', async () => {
    mockPost.mockRejectedValue(new ApiError('VALIDATION_FAILED', 'bad', 422));
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    await uploadPendingEvidence();

    expect(photo.uploadAttempts).toBe(MAX_ATTEMPTS);
    expect(photo.uploadStatus).toBe('FAILED');
  });

  it('treats ALREADY_EXISTS on presign as success (lost complete response)', async () => {
    mockPost.mockRejectedValue(
      new ApiError('ALREADY_EXISTS', 'already', 409, { objectKey: 'evidence/a.jpg' }),
    );
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    const summary = await uploadPendingEvidence();

    expect(summary.uploaded).toBe(1);
    expect(mockPut).not.toHaveBeenCalled();
    expect(photo.uploadStatus).toBe('UPLOADED');
    expect(photo.objectKey).toBe('evidence/a.jpg');
  });

  it('does not count a lost complete call (the bytes are in storage)', async () => {
    mockPost.mockImplementation(async (path: string, body: { id: string }) => {
      if (path === '/evidence/presign') return presignOk(body.id);
      throw offline();
    });
    mockPut.mockResolvedValue(undefined);
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    const summary = await uploadPendingEvidence();

    expect(summary.deferred).toBe(true);
    expect(photo.uploadAttempts).toBe(0);
    expect(photo.uploadStatus).toBe('PENDING');
  });

  it('flags a photo whose file is gone as permanently failed', async () => {
    const files = jest.requireMock('../local-files') as { localFileExists: jest.Mock };
    files.localFileExists.mockReturnValueOnce(false);
    const photo = new FakeEvidence('a');
    mockRows.push(photo);

    await uploadPendingEvidence();

    expect(uploadErrorCode(photo.uploadError)).toBe('FILE_MISSING');
    expect(photo.uploadAttempts).toBe(MAX_ATTEMPTS);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
