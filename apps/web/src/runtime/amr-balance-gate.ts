// Pre-run balance gate for the Open Design Cloud agent (PRD: block task
// initiation when the wallet can't cover a run, instead of letting the run
// spawn and fail with AMR_INSUFFICIENT_BALANCE minutes later).
//
// The gate only blocks on a DEFINITIVE insufficient wallet: the snapshot must
// be `available` and its balance parseable and at or below the run minimum.
// Signed-out, unavailable, or unparseable snapshots never block — those states
// already have their own recovery paths (AMR_AUTH_REQUIRED authorize flow,
// run-time failure cards), and a flaky wallet endpoint must never lock users
// out of starting tasks.

import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';

/**
 * Minimum wallet balance (USD) required to start a run. A single design task
 * costs well over $0.10, so balances at or below this line are guaranteed to
 * fail mid-run — blocking them up front is protection, not friction. Tune
 * from data: the starting-balance distribution of AMR_INSUFFICIENT_BALANCE
 * failures tells you where this line should actually sit.
 */
export const AMR_RUN_MIN_BALANCE_USD = 0.1;

export type AmrBalanceGateResult =
  | { blocked: false }
  | { blocked: true; snapshot: AmrWalletSnapshot };

/**
 * Whether a wallet snapshot definitively shows a balance too low to start a
 * run (<= {@link AMR_RUN_MIN_BALANCE_USD}). Anything short of a definitive
 * answer returns false.
 */
export function amrWalletBalanceInsufficient(
  snapshot: AmrWalletSnapshot | null | undefined,
): boolean {
  if (!snapshot || snapshot.status !== 'available') return false;
  // Trim before the emptiness check: Number(' ') is 0, so an untrimmed
  // whitespace-only balance would read as a definitive $0 and block instead
  // of failing open like every other unparseable answer.
  const raw = snapshot.balanceUsd?.trim();
  if (raw == null || raw === '') return false;
  const balance = Number(raw);
  if (!Number.isFinite(balance)) return false;
  return balance <= AMR_RUN_MIN_BALANCE_USD;
}

/**
 * Decide whether an Open Design Cloud run may start. Fast path first: the
 * daemon-cached snapshot answers without an upstream roundtrip, so runs with
 * a sufficient cached balance start with no added latency. Only when the
 * cached snapshot says "insufficient" do we confirm against the live wallet
 * (refresh=1) — the cache may predate a recharge or plan subscription, and a
 * just-topped-up user must never be blocked.
 */
export async function checkAmrBalanceGate(): Promise<AmrBalanceGateResult> {
  try {
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    if (!amrWalletBalanceInsufficient(cached)) return { blocked: false };
    const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (!fresh || !amrWalletBalanceInsufficient(fresh)) return { blocked: false };
    return { blocked: true, snapshot: fresh };
  } catch {
    // Fail open: an unexpected wallet-path error must never block task starts.
    return { blocked: false };
  }
}
