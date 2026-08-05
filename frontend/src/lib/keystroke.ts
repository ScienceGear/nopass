import * as React from "react";

export interface KeystrokeSample {
  prev: number;
  curr: number;
  delta: number;
}

const MAX_SAMPLES = 600;

/**
 * Capture key-press dwell times from an input. Attach `onKeyDown` to the input
 * and call `getSamples()` when submitting. Samples feed the backend's
 * behavioural risk scoring.
 */
export function useKeystrokeCapture() {
  const samples = React.useRef<KeystrokeSample[]>([]);
  const last = React.useRef<{ key: number; time: number } | null>(null);

  const onKeyDown = React.useCallback((e: React.KeyboardEvent<Element>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Tab" || e.key === "CapsLock") return;
    const code = e.keyCode;
    const now = performance.now();
    const prev = last.current;
    if (prev && prev.time > 0 && now - prev.time > 0 && samples.current.length < MAX_SAMPLES) {
      samples.current.push({ prev: prev.key, curr: code, delta: Math.round(now - prev.time) });
    }
    last.current = { key: code, time: now };
  }, []);

  const getSamples = React.useCallback((): KeystrokeSample[] => {
    const out = samples.current.slice();
    samples.current = [];
    last.current = null;
    return out;
  }, []);

  return { onKeyDown, getSamples };
}
