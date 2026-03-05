/**
 * djb2 hash — stable, no external dependencies, works synchronously.
 * hash = ((hash << 5) + hash) + char.charCodeAt(i)
 */
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    // Keep within 32-bit signed integer range
    hash = hash | 0;
  }
  // Convert to unsigned hex string
  return (hash >>> 0).toString(16);
}

export interface FingerprintAttributes {
  screenResolution: string;  // e.g. "1920x1080"
  gpuRenderer: string;       // WebGL RENDERER string or "unknown"
  timezone: string;          // Intl.DateTimeFormat().resolvedOptions().timeZone
  language: string;          // navigator.language
  webglHash: string;         // djb2 hash of WebGL parameters joined
  canvasHash: string;        // djb2 hash of canvas.toDataURL() output
  platform: 'web';
}

export class FingerprintCollector {
  collect(): FingerprintAttributes {
    return {
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      gpuRenderer: this.getGpuRenderer(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      webglHash: this.getWebglHash(),
      canvasHash: this.getCanvasHash(),
      platform: 'web',
    };
  }

  private getGpuRenderer(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

      if (!gl) return 'unknown';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return 'unknown';

      return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private getWebglHash(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

      if (!gl) return djb2('no-webgl');

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = debugInfo
        ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string)
        : (gl.getParameter(gl.VENDOR) as string);
      const renderer = debugInfo
        ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
        : (gl.getParameter(gl.RENDERER) as string);
      const extensions = gl.getSupportedExtensions() ?? [];

      const combined = [vendor, renderer, ...extensions.sort()].join('|');
      return djb2(combined);
    } catch {
      return djb2('webgl-error');
    }
  }

  private getCanvasHash(): string {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return djb2('no-canvas');

      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SignalRisk!', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('SignalRisk!', 4, 17);

      const dataUrl = canvas.toDataURL();
      return djb2(dataUrl);
    } catch {
      return djb2('canvas-error');
    }
  }
}
