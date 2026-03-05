import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FingerprintCollector } from '../fingerprint/collector';

describe('FingerprintCollector', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeWebGLContext(renderer = 'NVIDIA GeForce RTX 3080', vendor = 'NVIDIA Corp') {
    return {
      getExtension: vi.fn((name: string) => {
        if (name === 'WEBGL_debug_renderer_info') {
          return {
            UNMASKED_RENDERER_WEBGL: 37446,
            UNMASKED_VENDOR_WEBGL: 37445,
          };
        }
        return null;
      }),
      getParameter: vi.fn((param: number) => {
        if (param === 37446) return renderer;
        if (param === 37445) return vendor;
        return null;
      }),
      getSupportedExtensions: vi.fn(() => ['OES_texture_float', 'WEBGL_debug_renderer_info']),
      VENDOR: 0x1F00,
      RENDERER: 0x1F01,
    };
  }

  function mockCanvas(webglCtx: unknown, dataUrl = 'data:image/png;base64,iVBORw0KGgo=') {
    const ctx2d = {
      textBaseline: '',
      font: '',
      fillStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };

    const canvasMock = {
      getContext: vi.fn((type: string) => {
        if (type === 'webgl' || type === 'experimental-webgl') return webglCtx;
        if (type === '2d') return ctx2d;
        return null;
      }),
      toDataURL: vi.fn(() => dataUrl),
      width: 0,
      height: 0,
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvasMock as unknown as HTMLCanvasElement;
      return document.createElement(tag);
    });

    return canvasMock;
  }

  it('collects all fingerprint attributes', () => {
    const webglCtx = makeWebGLContext();
    mockCanvas(webglCtx);

    const collector = new FingerprintCollector();
    const attrs = collector.collect();

    expect(attrs.platform).toBe('web');
    expect(attrs.screenResolution).toMatch(/^\d+x\d+$/);
    expect(attrs.timezone).toBeTruthy();
    expect(attrs.language).toBeTruthy();
    expect(attrs.gpuRenderer).toBe('NVIDIA GeForce RTX 3080');
    expect(attrs.webglHash).toBeTruthy();
    expect(attrs.canvasHash).toBeTruthy();
  });

  it('produces the same hash for the same attributes (deterministic)', () => {
    const webglCtx = makeWebGLContext();
    const dataUrl = 'data:image/png;base64,fixedValue==';
    mockCanvas(webglCtx, dataUrl);

    const collector = new FingerprintCollector();
    const first = collector.collect();
    const second = collector.collect();

    expect(first.webglHash).toBe(second.webglHash);
    expect(first.canvasHash).toBe(second.canvasHash);
    expect(first.gpuRenderer).toBe(second.gpuRenderer);
  });

  it('returns "unknown" when WebGL is not available', () => {
    // Mock canvas.getContext returning null for webgl
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: vi.fn(() => null),
          toDataURL: vi.fn(() => 'data:image/png;base64,abc'),
          width: 0,
          height: 0,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });

    const collector = new FingerprintCollector();
    const attrs = collector.collect();

    expect(attrs.gpuRenderer).toBe('unknown');
  });

  it('returns "unknown" when WEBGL_debug_renderer_info extension is absent', () => {
    const webglCtxNoDebug = {
      getExtension: vi.fn(() => null),
      getParameter: vi.fn(() => null),
      getSupportedExtensions: vi.fn(() => []),
      VENDOR: 0x1F00,
      RENDERER: 0x1F01,
    };
    mockCanvas(webglCtxNoDebug);

    const collector = new FingerprintCollector();
    const attrs = collector.collect();

    expect(attrs.gpuRenderer).toBe('unknown');
  });

  it('webglHash differs when renderer changes', () => {
    const webglCtx1 = makeWebGLContext('Renderer A', 'Vendor A');
    const webglCtx2 = makeWebGLContext('Renderer B', 'Vendor B');

    mockCanvas(webglCtx1);
    const collector1 = new FingerprintCollector();
    const hash1 = collector1.collect().webglHash;

    vi.restoreAllMocks();

    mockCanvas(webglCtx2);
    const collector2 = new FingerprintCollector();
    const hash2 = collector2.collect().webglHash;

    expect(hash1).not.toBe(hash2);
  });

  it('canvasHash differs when canvas data URL changes', () => {
    const webglCtx = makeWebGLContext();

    mockCanvas(webglCtx, 'data:image/png;base64,AAAA');
    const collector1 = new FingerprintCollector();
    const hash1 = collector1.collect().canvasHash;

    vi.restoreAllMocks();

    mockCanvas(webglCtx, 'data:image/png;base64,BBBB');
    const collector2 = new FingerprintCollector();
    const hash2 = collector2.collect().canvasHash;

    expect(hash1).not.toBe(hash2);
  });

  it('handles errors in WebGL gracefully', () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: vi.fn(() => {
            throw new Error('WebGL not supported');
          }),
          toDataURL: vi.fn(() => 'data:image/png;base64,err'),
          width: 0,
          height: 0,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });

    const collector = new FingerprintCollector();
    expect(() => collector.collect()).not.toThrow();
    const attrs = collector.collect();
    expect(attrs.gpuRenderer).toBe('unknown');
  });
});
