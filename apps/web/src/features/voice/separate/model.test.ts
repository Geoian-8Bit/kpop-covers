import { describe, expect, it } from 'vitest';
import { cachedComplete, downloadComplete, expectedFileBytes, MODELS } from './model';

describe('model files', () => {
  it('the per-file sizes add up to the advertised download', () => {
    for (const model of Object.values(MODELS)) {
      const sum = Object.values(model.fileBytes ?? {}).reduce((a, b) => a + b, 0);
      expect(sum).toBe(model.bytes);
    }
  });

  it('knows the exact size of each pinned file, and nothing else', () => {
    const fp16 = MODELS.fp16;
    expect(expectedFileBytes(fp16, fp16.baseUrl + 'htdemucs_p13.onnx')).toBe(22007636);
    expect(expectedFileBytes(fp16, fp16.manifestUrl!)).toBe(5318);
    expect(expectedFileBytes(fp16, 'https://example.com/htdemucs_p13.onnx')).toBeUndefined();
    expect(expectedFileBytes(MODELS.fp32, MODELS.fp32.pieces![0]!.url)).toBe(MODELS.fp32.bytes);
  });
});

describe('downloadComplete', () => {
  it('a whole download is kept', () => {
    expect(downloadComplete({ read: 1000, contentLength: '1000', contentEncoding: null, expected: 1000 })).toBe(true);
    expect(downloadComplete({ read: 1000, contentLength: null, contentEncoding: null })).toBe(true);
  });

  it('a download cut short is never kept', () => {
    expect(downloadComplete({ read: 600, contentLength: '1000', contentEncoding: null })).toBe(false);
    expect(downloadComplete({ read: 600, contentLength: null, contentEncoding: null, expected: 1000 })).toBe(false);
    expect(downloadComplete({ read: 0, contentLength: '0', contentEncoding: null })).toBe(false);
  });

  it('a compressed body is measured by the expected size only', () => {
    expect(downloadComplete({ read: 1000, contentLength: '400', contentEncoding: 'gzip' })).toBe(true);
    expect(downloadComplete({ read: 1000, contentLength: '400', contentEncoding: 'gzip', expected: 1200 })).toBe(false);
    expect(downloadComplete({ read: 400, contentLength: '400', contentEncoding: 'identity' })).toBe(true);
  });
});

describe('cachedComplete', () => {
  it('a cached copy that does not add up is thrown away', () => {
    expect(cachedComplete({ bytes: 1000, stored: '1000', expected: 1000 })).toBe(true);
    expect(cachedComplete({ bytes: 1000, stored: null })).toBe(true);
    expect(cachedComplete({ bytes: 600, stored: '1000' })).toBe(false);
    expect(cachedComplete({ bytes: 1000, stored: null, expected: 1200 })).toBe(false);
    expect(cachedComplete({ bytes: 0, stored: null })).toBe(false);
  });
});
