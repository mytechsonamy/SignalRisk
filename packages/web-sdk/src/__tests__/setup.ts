/**
 * Test setup — provide proper localStorage and sessionStorage mocks
 * since the jsdom environment may not have them fully functional
 * (e.g. when node is started with --localstorage-file without a valid path).
 */

function makeStorageMock(): Storage {
  let store: Record<string, string> = {};

  return {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null;
    },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      store = {};
    },
  };
}

// Install mocks unconditionally so tests always have working storage
const _localStorage = makeStorageMock();
const _sessionStorage = makeStorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: _localStorage,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: _sessionStorage,
  writable: true,
  configurable: true,
});
