"use client";

import { useRouter } from "next/navigation";
import { useToast } from "./toast/ToastContext";

// Every client-invoked Server Action should go through this. Two jobs:
// 1. A thrown action (network drop, suspended session, server error) becomes a visible toast
//    instead of an unhandled promise rejection and a dead-looking button.
// 2. router.refresh() after success — the Next 16 quirk where a client-invoked action's
//    revalidatePath doesn't refresh the client (see ARCHITECTURE.md) — so call sites can't
//    forget it. Pass { refresh: false } when the caller navigates or refreshes itself.
//
// Returns the action's result, or undefined when it threw (callers can bail on undefined).
export function useRunAction() {
  const router = useRouter();
  const { showToast } = useToast();
  return async function run<T>(fn: () => Promise<T>, opts?: { refresh?: boolean; errorMessage?: string }): Promise<T | undefined> {
    try {
      const result = await fn();
      if (opts?.refresh !== false) router.refresh();
      return result;
    } catch {
      showToast(opts?.errorMessage ?? "That didn't go through — check your connection and try again.");
      return undefined;
    }
  };
}
