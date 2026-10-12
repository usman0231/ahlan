import { fitWithin, JPEG_QUALITY, MAX_DIMENSION } from '../resize';

describe('fitWithin', () => {
  it('targets 1600px on the long edge at JPEG 0.7', () => {
    expect(MAX_DIMENSION).toBe(1600);
    expect(JPEG_QUALITY).toBe(0.7);
  });

  it('scales a landscape photo by its width', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales a portrait photo by its height, not to 1600 wide', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('scales a square photo to 1600x1600', () => {
    expect(fitWithin(2000, 2000)).toEqual({ width: 1600, height: 1600 });
  });

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600)).toBeNull();
    expect(fitWithin(1600, 900)).toBeNull();
  });

  it('rounds the short edge and keeps it at least 1px', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3001, 1999)).toEqual({ width: 1600, height: 1066 });
    expect(fitWithin(100_000, 10)).toEqual({ width: 1600, height: 1 });
  });

  it('ignores nonsense dimensions', () => {
    expect(fitWithin(0, 100)).toBeNull();
    expect(fitWithin(Number.NaN, 4000)).toBeNull();
  });
});
