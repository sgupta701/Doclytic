export const TAB_PULSE_EVENT = "tab:pulse";

export function triggerTabPulse(path: string, durationMs = 5000) {
  if (!path) return;
  window.dispatchEvent(
    new CustomEvent(TAB_PULSE_EVENT, {
      detail: { path, durationMs },
    })
  );
}

