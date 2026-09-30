// React hook wrapping the backend email-verification actor calls plus the
// localStorage verified state. The gate component uses this to send OTP codes,
// verify them, and remember the verified email across visits.

import { type Backend, createActor } from "@/backend";
import {
  isEmailVerified as isEmailVerifiedFn,
  sendVerificationCode as sendVerificationCodeFn,
  verifyEmailCode as verifyEmailCodeFn,
} from "@/lib/canister";
import {
  clearVerifiedEmail,
  getVerifiedEmail,
  setVerifiedEmail,
} from "@/lib/verification-storage";
import { upsertCustomer } from "@/lib/vps-client";
import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useState } from "react";

export interface EmailVerificationState {
  /** Email remembered from a previous successful verification, if any. */
  verifiedEmail: string | null;
  /** True when a verified email is already stored locally (menu unlocked). */
  isVerified: boolean;
  /** True while the canister actor is still loading. */
  isInitializing: boolean;
  /** Send a 6-digit OTP to the given email. Rejects with a Vietnamese message on failure. */
  sendCode: (email: string) => Promise<void>;
  /** Verify the OTP for the given email. On success, persists verified state. */
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Check with the backend whether the email is already verified. */
  checkVerified: (email: string) => Promise<boolean>;
  /** Forget the locally stored verified email (e.g. on logout / reset). */
  reset: () => void;
}

export function useEmailVerification(): EmailVerificationState {
  const { actor, isFetching } = useActor(createActor);
  const [verifiedEmail, setVerifiedEmailState] = useState<string | null>(() => {
    const stored = getVerifiedEmail();
    return stored ? stored.email : null;
  });

  const sendCode = useCallback(
    async (email: string) => {
      if (!actor)
        throw new Error("Chưa kết nối được máy chủ. Vui lòng thử lại.");
      await sendVerificationCodeFn(actor, email);
    },
    [actor],
  );

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      if (!actor)
        throw new Error("Chưa kết nối được máy chủ. Vui lòng thử lại.");
      await verifyEmailCodeFn(actor, email, code);
      setVerifiedEmail(email);
      setVerifiedEmailState(email);
      // Best-effort background sync: create the customer record by email (if
      // not already present). Non-blocking — a failure here never blocks the
      // customer from entering the menu.
      void upsertCustomer(email);
    },
    [actor],
  );

  const checkVerified = useCallback(
    async (email: string) => {
      if (!actor) return false;
      return isEmailVerifiedFn(actor, email);
    },
    [actor],
  );

  const reset = useCallback(() => {
    clearVerifiedEmail();
    setVerifiedEmailState(null);
  }, []);

  return {
    verifiedEmail,
    isVerified: verifiedEmail !== null,
    isInitializing: isFetching,
    sendCode,
    verifyCode,
    checkVerified,
    reset,
  };
}
