// localStorage helper for the email-verification gate state.
// Stores { email, verified: true } under a single key so the menu can be
// unlocked on subsequent visits without re-entering the OTP.

const STORAGE_KEY = "bbh_verified_email";

export interface VerifiedEmailState {
  email: string;
  verified: true;
}

export function getVerifiedEmail(): VerifiedEmailState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VerifiedEmailState>;
    if (
      parsed &&
      typeof parsed.email === "string" &&
      parsed.email.length > 0 &&
      parsed.verified === true
    ) {
      return { email: parsed.email, verified: true };
    }
    return null;
  } catch {
    return null;
  }
}

export function setVerifiedEmail(email: string): void {
  const state: VerifiedEmailState = { email, verified: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearVerifiedEmail(): void {
  localStorage.removeItem(STORAGE_KEY);
}
