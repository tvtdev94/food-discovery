/**
 * Haptic feedback helpers — guarded navigator.vibrate wrappers.
 * No-ops on desktop / browsers without Vibration API support.
 *
 * Usage: call from interaction handlers (press, submit, toggle).
 * Keep pattern short so it never annoys the user.
 */

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

/** Light tap — 10ms. Use for press feedback on buttons, chips, cards. */
export function hapticLight(): void {
  if (canVibrate()) {
    navigator.vibrate(10);
  }
}

/** Success pattern — short-pause-short. Use for confirmations (favorited, sent). */
export function hapticSuccess(): void {
  if (canVibrate()) {
    navigator.vibrate([8, 40, 8]);
  }
}

/** Warning — single slightly-longer pulse. Use for destructive confirm. */
export function hapticWarning(): void {
  if (canVibrate()) {
    navigator.vibrate(24);
  }
}
