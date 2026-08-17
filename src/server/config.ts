function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw !== 'false';
}

export const config = {
  seed: envInt('DIALER_SEED', 42),
  tickIntervalMs: envInt('DIALER_TICK_MS', 250),
  ringDelayMsRange: [envInt('DIALER_RING_MIN_MS', 2000), envInt('DIALER_RING_MAX_MS', 6000)] as [
    number,
    number,
  ],
  talkDurationMsRange: [
    envInt('DIALER_TALK_MIN_MS', 4000),
    envInt('DIALER_TALK_MAX_MS', 10000),
  ] as [number, number],
  outcomeWeights: {
    CONNECTED: envInt('DIALER_WEIGHT_CONNECTED', 35),
    NO_ANSWER: envInt('DIALER_WEIGHT_NO_ANSWER', 35),
    BUSY: envInt('DIALER_WEIGHT_BUSY', 15),
    VOICEMAIL: envInt('DIALER_WEIGHT_VOICEMAIL', 15),
  },
  // Scenario mode: force a specific dial (0-based, counted per provider instance)
  // to connect quickly so a demo never has to wait out the random distribution.
  guaranteedConnectOnDialIndex: envInt('DIALER_GUARANTEED_CONNECT_INDEX', 0),
  guaranteedConnectDelayMs: envInt('DIALER_GUARANTEED_CONNECT_DELAY_MS', 2000),
  // Fixed by the brief ("one requeue per lead per session"), kept as a named
  // constant rather than hardcoded inline so the rule is easy to find.
  requeueCap: 1,
  // Decision #3: CANCELED_BY_DIALER is terminal and does produce a CRM
  // activity, but behind this flag (default on) since it'd be noise in a
  // real CRM.
  syncCanceledByDialer: envBool('DIALER_SYNC_CANCELED_BY_DIALER', true),
};
