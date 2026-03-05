const SESSION_KEY = 'sr_session_id';
const DEVICE_KEY = 'sr_device_id';

export class SessionManager {
  getOrCreateSessionId(): string {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;

      const newId = this.generateId();
      sessionStorage.setItem(SESSION_KEY, newId);
      return newId;
    } catch {
      // sessionStorage may be unavailable (e.g. private browsing restrictions)
      return this.generateId();
    }
  }

  getDeviceId(): string | null {
    try {
      return localStorage.getItem(DEVICE_KEY);
    } catch {
      return null;
    }
  }

  setDeviceId(id: string): void {
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      // localStorage may be unavailable
    }
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
