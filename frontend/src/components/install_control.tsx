import { useEffect, useState } from 'react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallControl() {
  const [event, set_event] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      set_event(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  return event ? (
    <button
      onClick={() =>
        void event
          .prompt()
          .then(() => event.userChoice)
          .then(() => set_event(null))
      }
    >
      Install workspace
    </button>
  ) : (
    <details>
      <summary>Install on this device</summary>
      <p className="hint">
        Use your browser’s Install app or Add to Home Screen option. Installation requires HTTPS or local
        development. Research and saved server data require a connection; offline notes stay on this device.
      </p>
    </details>
  );
}
export function OfflineNotes() {
  const [online, set_online] = useState(navigator.onLine);
  const [notes, set_notes] = useState(() => localStorage.getItem('research_offline_notes') ?? '');
  useEffect(() => {
    const update = () => set_online(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online) return null;
  return (
    <section className="panel offline_notes">
      <h2>You’re offline</h2>
      <p className="hint">
        AI research, sources and server documents need a connection. You can keep notes here; they are saved
        only in this browser, including after sign-out. Clear them when finished on a shared device.
      </p>
      <label>
        Offline research notes
        <textarea
          className="visual_input"
          value={notes}
          onChange={(event) => {
            set_notes(event.target.value);
            localStorage.setItem('research_offline_notes', event.target.value);
          }}
        />
      </label>
      <button
        className="secondary"
        onClick={() => {
          set_notes('');
          localStorage.removeItem('research_offline_notes');
        }}
      >
        Clear offline notes
      </button>
    </section>
  );
}
