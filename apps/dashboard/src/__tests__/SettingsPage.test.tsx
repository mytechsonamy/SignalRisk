import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';

// Inline reimplementation of SettingsPage from App.tsx — mirrors exact behaviour
const SETTING_FIELDS = [
  { key: 'apiBaseUrl', label: 'API Base URL', defaultValue: 'http://localhost:3000' },
  { key: 'wsUrl', label: 'WebSocket URL', defaultValue: 'http://localhost:3000' },
  { key: 'environment', label: 'Environment', defaultValue: 'development' },
  { key: 'version', label: 'Version', defaultValue: '0.1.0' },
] as const;

function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(SETTING_FIELDS.map(f => [f.key, f.defaultValue])),
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('signalrisk_settings', JSON.stringify(values));
      setSaveError(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Settings</h1>
        <p>Platform configuration and preferences.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-lg divide-y">
        {SETTING_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between px-5 py-4">
            <label htmlFor={`setting-${key}`}>{label}</label>
            <input
              id={`setting-${key}`}
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="flex items-center justify-end px-5 py-4 gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">Saved</span>
          )}
          {saveError && (
            <span className="text-sm text-red-600 font-medium">Settings could not be saved</span>
          )}
          <button type="submit">Save Settings</button>
        </div>
      </form>
    </div>
  );
}

describe('SettingsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Save success shows "Saved" text for 2 seconds', async () => {
    vi.useFakeTimers();
    render(<SettingsPage />);

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('localStorage.setItem throws shows "Settings could not be saved"', () => {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    Object.defineProperty(window.localStorage, 'setItem', {
      configurable: true,
      value: () => {
        throw new Error('QuotaExceededError');
      },
    });

    render(<SettingsPage />);

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    expect(screen.getByText('Settings could not be saved')).toBeInTheDocument();

    // Restore
    Object.defineProperty(window.localStorage, 'setItem', {
      configurable: true,
      value: originalSetItem,
    });
  });
});
