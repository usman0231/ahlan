jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../../api/client', () => ({ api: {}, uploadToPresignedUrl: jest.fn() }));

import {
  MAX_STADIUM_PHOTO_BYTES,
  StadiumPhotoError,
  stadiumPhotoProblem,
  uploadStadiumPhoto,
  type StadiumPhotoDeps,
} from '../stadium-photo';

function deps(sizeBytes: number, calls: string[]): StadiumPhotoDeps {
  return {
    compress: jest.fn(async (uri: string) => {
      calls.push(`compress:${uri}`);
      return { uri: 'file://small.jpg', body: new Uint8Array(sizeBytes), width: 1600, height: 900 };
    }),
    presign: jest.fn(async (stadiumId, input) => {
      calls.push(`presign:${stadiumId}:${input.contentType}:${input.sizeBytes}`);
      return {
        uploadUrl: 'http://s3/put',
        headers: { 'content-type': 'image/jpeg' },
        objectKey: `stadiums/${stadiumId}/k.jpg`,
        expiresAt: new Date(),
      };
    }),
    put: jest.fn(async (input) => {
      calls.push(`put:${input.uploadUrl}:${input.body.byteLength}`);
    }),
    attach: jest.fn(async (stadiumId, objectKey) => {
      calls.push(`attach:${stadiumId}:${objectKey}`);
      return { id: stadiumId, imageUrl: 'http://s3/get' } as never;
    }),
  };
}

describe('uploadStadiumPhoto', () => {
  it('compresses, presigns with the real size, PUTs the bytes, then attaches the key', async () => {
    const calls: string[] = [];
    const result = await uploadStadiumPhoto(
      { stadiumId: 's1', sourceUri: 'file://big.jpg' },
      deps(300_000, calls),
    );
    expect(calls).toEqual([
      'compress:file://big.jpg',
      'presign:s1:image/jpeg:300000',
      'put:http://s3/put:300000',
      'attach:s1:stadiums/s1/k.jpg',
    ]);
    expect(result.previewUri).toBe('file://small.jpg');
  });

  it('refuses a photo still over the limit after compression, before presigning', async () => {
    const calls: string[] = [];
    await expect(
      uploadStadiumPhoto(
        { stadiumId: 's1', sourceUri: 'file://huge.png' },
        deps(MAX_STADIUM_PHOTO_BYTES + 1, calls),
      ),
    ).rejects.toBeInstanceOf(StadiumPhotoError);
    expect(calls).toEqual(['compress:file://huge.png']);
  });

  it('does not attach when the upload fails', async () => {
    const calls: string[] = [];
    const failing = deps(1000, calls);
    failing.put = jest.fn(async () => {
      throw new Error('network');
    });
    await expect(
      uploadStadiumPhoto({ stadiumId: 's1', sourceUri: 'file://a.jpg' }, failing),
    ).rejects.toThrow('network');
    expect(failing.attach).not.toHaveBeenCalled();
  });
});

describe('stadiumPhotoProblem', () => {
  it('flags empty and oversized files and accepts the rest', () => {
    expect(stadiumPhotoProblem(0)).toBe('empty');
    expect(stadiumPhotoProblem(MAX_STADIUM_PHOTO_BYTES + 1)).toBe('tooLarge');
    expect(stadiumPhotoProblem(MAX_STADIUM_PHOTO_BYTES)).toBeNull();
  });
});
