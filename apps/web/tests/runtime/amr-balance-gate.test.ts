import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  AMR_RUN_MIN_BALANCE_USD,
  amrWalletBalanceInsufficient,
  checkAmrBalanceGate,
} from '../../src/runtime/amr-balance-gate';
import { fetchAmrWalletSnapshot } from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchAmrWalletSnapshot: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAmrWalletSnapshot);

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: '2026-07-02T00:00:00.000Z',
    fetchedAt: '2026-07-02T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
    ...overrides,
  };
}

afterEach(() => {
  mockedFetch.mockReset();
});

describe('amrWalletBalanceInsufficient', () => {
  it('is true only for a definitive balance at or below the run minimum', () => {
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '-1.25' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '12.3' }))).toBe(false);
  });

  it('blocks up to the redundancy threshold, not just an empty wallet', () => {
    // A run costs far more than the minimum, so a few residual cents must
    // still block — the run would be guaranteed to fail mid-flight.
    expect(AMR_RUN_MIN_BALANCE_USD).toBeCloseTo(0.1);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.05' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.1' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.1000' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.11' }))).toBe(false);
  });

  it('never blocks on an indefinite answer', () => {
    expect(amrWalletBalanceInsufficient(null)).toBe(false);
    expect(amrWalletBalanceInsufficient(undefined)).toBe(false);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: null }))).toBe(false);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: 'not-a-number' }))).toBe(false);
    // Number(' ') is 0 — a whitespace-only balance must fail open, not read
    // as a definitive $0.
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: ' ' }))).toBe(false);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '\n\t' }))).toBe(false);
    expect(
      amrWalletBalanceInsufficient(snapshot({ status: 'signed_out', balanceUsd: '0' })),
    ).toBe(false);
    expect(
      amrWalletBalanceInsufficient(snapshot({ status: 'unavailable', balanceUsd: '0' })),
    ).toBe(false);
  });
});

describe('checkAmrBalanceGate', () => {
  it('allows on a sufficient cached balance without a refresh roundtrip', async () => {
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '5.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ blocked: false });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith();
  });

  it('confirms an insufficient cached balance against the live wallet before blocking', async () => {
    const fresh = snapshot({ balanceUsd: '0.08' });
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0.08', source: 'daemon_cache' }))
      .mockResolvedValueOnce(fresh);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      blocked: true,
      snapshot: fresh,
    });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, { refresh: true });
  });

  it('lets a just-recharged wallet through (stale-low cache, sufficient refresh)', async () => {
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(snapshot({ balanceUsd: '20.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ blocked: false });
  });

  it('never blocks when the wallet endpoint fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ blocked: false });
  });
});
