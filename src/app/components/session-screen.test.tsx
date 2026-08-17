// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionView } from '@/server/dto/session-view';
import { SessionScreen } from './session-screen';

// Not using @testing-library/react here (kept the dependency footprint to
// just jsdom for this one file), so React's act() needs this flag set
// manually — otherwise correct act()-wrapped updates still print a warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next/link reaches for App Router context on mount (prefetching) that
// doesn't exist in a bare jsdom render — stub it out so this stays a test
// of SessionScreen's own timer lifecycle, not of next/link's internals.
vi.mock('next/link', () => ({
  default: (props: { children?: React.ReactNode }) => props.children,
}));

function makeSession(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: 'session_1',
    agentId: 'agent_1',
    status: 'RUNNING',
    metrics: { attempted: 2, connected: 0, failed: 0, canceled: 0 },
    winnerCallId: null,
    queueRemaining: 0,
    lines: [],
    calls: [],
    ...overrides,
  };
}

describe('SessionScreen timer lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs exactly two timers (poll + clock) while RUNNING, and stops both the instant the session goes STOPPED — with nothing left scheduled afterward', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeSession({ status: 'STOPPED' }),
    });

    await act(async () => {
      root = createRoot(container);
      root.render(<SessionScreen sessionId="session_1" initialSession={makeSession({ status: 'RUNNING' })} />);
    });

    expect(vi.getTimerCount()).toBe(2); // poll interval + elapsed-time clock

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // first poll fires, resolves to STOPPED
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); // both effects re-ran against STOPPED and neither re-scheduled

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000); // prove it stays that way, not just momentarily zero
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no further polling
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears both intervals on unmount even while the session is still RUNNING', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => makeSession({ status: 'RUNNING' }) });

    await act(async () => {
      root = createRoot(container);
      root.render(<SessionScreen sessionId="session_1" initialSession={makeSession({ status: 'RUNNING' })} />);
    });

    expect(vi.getTimerCount()).toBe(2);

    act(() => root.unmount());

    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards a stale response that resolves after a newer one already landed', async () => {
    let resolveFirstFetch: (value: unknown) => void = () => {};
    const staleSession = makeSession({
      status: 'RUNNING',
      metrics: { attempted: 1, connected: 0, failed: 0, canceled: 0 },
    });
    const freshSession = makeSession({
      status: 'RUNNING',
      metrics: { attempted: 2, connected: 1, failed: 0, canceled: 0 },
    });

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstFetch = resolve; // 1st poll: fired, deliberately left hanging
          }),
      )
      .mockResolvedValueOnce({ ok: true, json: async () => freshSession }); // 2nd poll: resolves immediately

    await act(async () => {
      root = createRoot(container);
      root.render(
        <SessionScreen
          sessionId="session_1"
          initialSession={makeSession({ status: 'RUNNING', metrics: { attempted: 0, connected: 0, failed: 0, canceled: 0 } })}
        />,
      );
    });

    // MetricsPanel renders its 4 tiles (Attempted, Connected, Failed,
    // Canceled) in that fixed order — the first `.tabular-nums` node is
    // always the "attempted" count.
    const attemptedValue = () => container.querySelectorAll('.tabular-nums')[0]?.textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // 1st poll fires, hangs
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // 2nd poll fires and resolves before the 1st does
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(attemptedValue()).toBe('2'); // fresh response applied

    await act(async () => {
      resolveFirstFetch({ ok: true, json: async () => staleSession }); // the stale 1st response finally lands
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale (older) response must NOT overwrite the fresher state.
    expect(attemptedValue()).toBe('2');
  });
});
