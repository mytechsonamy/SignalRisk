import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../session/session';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    manager = new SessionManager();
  });

  it('getOrCreateSessionId creates a new session ID when none exists', () => {
    const id = manager.getOrCreateSessionId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getOrCreateSessionId stores the ID in sessionStorage', () => {
    const id = manager.getOrCreateSessionId();
    expect(sessionStorage.getItem('sr_session_id')).toBe(id);
  });

  it('second call to getOrCreateSessionId returns the same ID', () => {
    const first = manager.getOrCreateSessionId();
    const second = manager.getOrCreateSessionId();
    expect(first).toBe(second);
  });

  it('different SessionManager instances share the session ID from storage', () => {
    const id = manager.getOrCreateSessionId();

    // New instance should read from the same sessionStorage
    const manager2 = new SessionManager();
    const id2 = manager2.getOrCreateSessionId();

    expect(id2).toBe(id);
  });

  it('getDeviceId returns null when not set', () => {
    expect(manager.getDeviceId()).toBeNull();
  });

  it('setDeviceId stores the device ID in localStorage', () => {
    manager.setDeviceId('device-abc-123');
    expect(localStorage.getItem('sr_device_id')).toBe('device-abc-123');
  });

  it('getDeviceId returns the stored device ID', () => {
    manager.setDeviceId('device-xyz-456');
    expect(manager.getDeviceId()).toBe('device-xyz-456');
  });

  it('getDeviceId reflects value set by a different instance', () => {
    const manager2 = new SessionManager();
    manager2.setDeviceId('device-shared');

    expect(manager.getDeviceId()).toBe('device-shared');
  });

  it('generated session IDs look like UUIDs', () => {
    const id = manager.getOrCreateSessionId();
    // UUID v4 pattern
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('setDeviceId overwrites previous device ID', () => {
    manager.setDeviceId('old-id');
    manager.setDeviceId('new-id');
    expect(manager.getDeviceId()).toBe('new-id');
  });
});
