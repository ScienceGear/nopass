import { useEffect, useState } from "react";

const KEY = "novabank.session";

export interface StoredSession {
  token: string;
  name: string;
}

export function saveSession(s: StoredSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("novabank:session"));
  } catch {
    /* storage unavailable */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("novabank:session"));
  } catch {
    /* noop */
  }
}

function read(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/** Client-only session read — never touched during SSR to avoid hydration drift. */
export function useSession() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSession(read());
    sync();
    setReady(true);
    window.addEventListener("novabank:session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("novabank:session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { session, ready };
}
