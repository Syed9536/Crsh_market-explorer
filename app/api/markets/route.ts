import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONVEX_URL =
  process.env.CONVEX_URL ??
  "https://impartial-newt-333.convex.cloud/api/query";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  null;

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

const USDC_BASE = 1_000_000;
const HYPOTHETICAL_BET = 10;

const KICK_API_BASE = "https://kick.com";

type AnyObject = Record<string, any>;

type ConvexMarket = {
  marketId?: string;
  title?: string;
  status?: string;

  winningOptionId?: number | string | null;
  winner?: any;
  winningOption?: any;
  winningSide?: any;
  outcome?: any;
  result?: any;

  currentPoolsUsdc?: any;
  currentPools?: any;
  finalPoolsUsdc?: any;
  finalPools?: any;

  totalTrades?: number | string | null;
  totalTradeCount?: number | string | null;
  tradeCount?: number | string | null;
  totalTradesCount?: number | string | null;
  tradesCount?: number | string | null;
  numberOfTrades?: number | string | null;
  numTrades?: number | string | null;

  recentTradeProfiles?: any;
  recentTrades?: any;
  trades?: any;
  tradeHistory?: any;
  bets?: any;
  transactions?: any;

  stats?: any;
  statistics?: any;
  metrics?: any;
  marketStats?: any;

  createdAt?: number | string;
  openedAt?: number | string;

  lockTime?: number | string;
  closedAt?: number | string;
  bettingClosedAtMs?: number | string;
  bettingCloseRequestedAtMs?: number | string;

  recordedAt?: number | string;
  creditedAt?: number | string;
  resolvedAt?: number | string;

  countdownStartedAtMs?: number;
  countdownEndsAtMs?: number;

  rawData?: any;

  [key: string]: any;
};

type ConvexStream = {
  id?: string;
  title?: string;
  hostName?: string;
  viewerCount?: number | string;

  startedAt?: number | string;

  market?: ConvexMarket;

  [key: string]: any;
};

/* =========================================================
   GENERIC HELPERS
========================================================= */

function asNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function asTradeCount(value: any): number {
  const n = asNumber(value);

  if (n === null || n < 0) {
    return 0;
  }

  return Math.floor(n);
}

function parseJson(value: any): any {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isResolvedStatus(status: any): boolean {
  const value = String(status ?? "")
    .trim()
    .toLowerCase();

  return (
    value === "resolved" ||
    value === "cancelled" ||
    value === "canceled"
  );
}

function toIso(value: any): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);

  if (Number.isFinite(n)) {
    const ms = n < 10_000_000_000 ? n * 1000 : n;

    const date = new Date(ms);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const date = new Date(String(value));

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  return null;
}

function baseUnitsToUsd(value: any): number {
  const n = asNumber(value) ?? 0;

  return n / USDC_BASE;
}

function normalizePoolRaw(value: any): number {
  const n = asNumber(value) ?? 0;

  if (n === 0) {
    return 0;
  }

  if (Number.isInteger(n) && Math.abs(n) >= USDC_BASE) {
    return n;
  }

  return n * USDC_BASE;
}

/* =========================================================
   POOLS
========================================================= */

function getPools(
  market?: ConvexMarket | null
): [string, string] | null {
  if (!market) {
    return null;
  }

  const resolved = isResolvedStatus(market.status);

  const candidates = resolved
    ? [
        market.finalPoolsUsdc,
        market.finalPools,
        market.currentPoolsUsdc,
        market.currentPools,
      ]
    : [
        market.currentPoolsUsdc,
        market.currentPools,
        market.finalPoolsUsdc,
        market.finalPools,
      ];

  for (const candidateRaw of candidates) {
    const candidate = parseJson(candidateRaw);

    if (Array.isArray(candidate) && candidate.length >= 2) {
      const yes = normalizePoolRaw(candidate[0]);
      const no = normalizePoolRaw(candidate[1]);

      if (yes > 0 || no > 0) {
        return [String(yes), String(no)];
      }
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      const yes =
        candidate.yes ??
        candidate.YES ??
        candidate[0];

      const no =
        candidate.no ??
        candidate.NO ??
        candidate[1];

      if (yes !== undefined && no !== undefined) {
        const yesRaw = normalizePoolRaw(yes);
        const noRaw = normalizePoolRaw(no);

        if (yesRaw > 0 || noRaw > 0) {
          return [String(yesRaw), String(noRaw)];
        }
      }
    }
  }

  return null;
}

/* =========================================================
   WINNER
========================================================= */

function normalizeWinner(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    const nested =
      value.optionId ??
      value.optionID ??
      value.id ??
      value.value ??
      value.side ??
      value.name ??
      value.label;

    return normalizeWinner(nested);
  }

  const text = String(value).trim().toLowerCase();

  if (text === "yes" || text === "true") {
    return 0;
  }

  if (text === "no" || text === "false") {
    return 1;
  }

  const numeric = Number(value);

  if (numeric === 0 || numeric === 1) {
    return numeric;
  }

  if (text.includes("yes")) {
    return 0;
  }

  if (text.includes("no")) {
    return 1;
  }

  return null;
}

function getWinningOptionId(
  market?: ConvexMarket | null
): number | null {
  if (!market) {
    return null;
  }

  const candidates = [
    market.winningOptionId,
    market.winner,
    market.winningOption,
    market.winningSide,
    market.outcome,
    market.result,

    market.stats?.winningOptionId,
    market.statistics?.winningOptionId,
    market.metrics?.winningOptionId,
    market.marketStats?.winningOptionId,

    market.rawData?.winningOptionId,
    market.rawData?.winner,
    market.rawData?.winningOption,
    market.rawData?.winningSide,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWinner(candidate);

    if (normalized === 0 || normalized === 1) {
      return normalized;
    }
  }

  return null;
}

/* =========================================================
   TRADES
========================================================= */

function getTradeCount(
  market?: ConvexMarket | null
): number {
  if (!market) {
    return 0;
  }

  const sources: any[] = [
    market,
    market.stats,
    market.statistics,
    market.metrics,
    market.marketStats,
    market.rawData,
    market.rawData?.market,
  ];

  const numericKeys = [
    "totalTrades",
    "totalTradeCount",
    "totalTradesCount",
    "tradeCount",
    "tradesCount",
    "numberOfTrades",
    "numTrades",
    "total_bets",
    "totalBets",
    "betCount",
    "betsCount",
  ];

  let best = 0;

  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }

    for (const key of numericKeys) {
      const count = asTradeCount(source[key]);

      if (count > best) {
        best = count;
      }
    }
  }

  const arrays = [
    market.recentTradeProfiles,
    market.recentTrades,
    market.trades,
    market.tradeHistory,
    market.bets,
    market.transactions,

    market.stats?.trades,
    market.statistics?.trades,
    market.metrics?.trades,
    market.marketStats?.trades,

    market.rawData?.recentTradeProfiles,
    market.rawData?.recentTrades,
    market.rawData?.trades,
    market.rawData?.tradeHistory,
    market.rawData?.bets,
  ];

  for (const value of arrays) {
    const parsed = parseJson(value);

    if (Array.isArray(parsed)) {
      best = Math.max(best, parsed.length);
    }
  }

  return best;
}

/* =========================================================
   EXPECTED WINNINGS
========================================================= */

function calculateExpectedWinnings(
  pools: any,
  winningOptionId: any
): number | null {
  if (!Array.isArray(pools) || pools.length < 2) {
    return null;
  }

  const winner = normalizeWinner(winningOptionId);

  if (winner !== 0 && winner !== 1) {
    return null;
  }

  const yesRaw = normalizePoolRaw(pools[0]);
  const noRaw = normalizePoolRaw(pools[1]);

  if (yesRaw <= 0 || noRaw <= 0) {
    return null;
  }

  const total = yesRaw + noRaw;

  const winningPool =
    winner === 0 ? yesRaw : noRaw;

  if (total <= 0 || winningPool <= 0) {
    return null;
  }

  const payout =
    HYPOTHETICAL_BET *
    (total / winningPool);

  if (!Number.isFinite(payout)) {
    return null;
  }

  return Number(payout.toFixed(2));
}

/* =========================================================
   TIMESTAMPS
========================================================= */

function getRecordedAt(
  market: ConvexMarket,
  fallback?: any
): string | null {
  const candidates = [
    market.recordedAt,
    market.recorded_at,
    market.stats?.recordedAt,
    market.statistics?.recordedAt,
    market.rawData?.recordedAt,
    fallback,
  ];

  for (const candidate of candidates) {
    const result = toIso(candidate);

    if (result) {
      return result;
    }
  }

  return null;
}

function getCreditedAt(
  market: ConvexMarket,
  fallback?: any
): string | null {
  const candidates = [
    market.creditedAt,
    market.credited_at,
    market.stats?.creditedAt,
    market.statistics?.creditedAt,
    market.rawData?.creditedAt,
    fallback,
  ];

  for (const candidate of candidates) {
    const result = toIso(candidate);

    if (result) {
      return result;
    }
  }

  return null;
}

function getOpenedAt(
  market: ConvexMarket,
  fallback?: any
): string | null {
  const candidates = [
    market.createdAt,
    market.openedAt,
    market.rawData?.createdAt,
    fallback,
  ];

  for (const candidate of candidates) {
    const result = toIso(candidate);

    if (result) {
      return result;
    }
  }

  return null;
}

function getClosedAt(
  market: ConvexMarket,
  fallback?: any
): string | null {
  const candidates = [
    market.bettingClosedAtMs,
    market.bettingCloseRequestedAtMs,
    market.closedAt,
    market.lockTime,
    market.rawData?.bettingClosedAtMs,
    fallback,
  ];

  for (const candidate of candidates) {
    const result = toIso(candidate);

    if (result) {
      return result;
    }
  }

  return null;
}

/* =========================================================
   CONVEX
========================================================= */

async function convexQuery(
  path: string,
  args: Record<string, any> = {}
) {
  const response = await fetch(
    CONVEX_URL,
    {
      method: "POST",

      headers: {
        "content-type": "application/json",
      },

      body: JSON.stringify({
        path,
        args,
        format: "json",
      }),

      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      data?.error ??
      data?.message ??
      `HTTP ${response.status}`;

    throw new Error(
      `Convex returned ${response.status}: ${String(detail)}`
    );
  }

  if (
    data?.status &&
    data.status !== "success"
  ) {
    throw new Error(
      data?.error
        ? `Convex query failed: ${String(data.error)}`
        : "Convex query failed"
    );
  }

  return data;
}

/* =========================================================
   KICK
========================================================= */

function cleanKickChannel(value: any): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  let text = value.trim();

  try {
    if (
      text.startsWith("http://") ||
      text.startsWith("https://")
    ) {
      const url = new URL(text);

      if (
        !/(^|\.)kick\.com$/i.test(
          url.hostname
        )
      ) {
        if (
          /(^|\.)player\.kick\.com$/i.test(
            url.hostname
          )
        ) {
          const parts = url.pathname
            .split("/")
            .filter(Boolean);

          return parts[0]
            ? decodeURIComponent(parts[0])
            : null;
        }

        return null;
      }

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      if (!parts.length) {
        return null;
      }

      if (
        parts[0] === "video" ||
        parts[0] === "videos"
      ) {
        return null;
      }

      return decodeURIComponent(parts[0]);
    }
  } catch {}

  text = text
    .replace(/^@/, "")
    .replace(/\s+/g, "")
    .replace(/\/+$/, "");

  if (!text || text.includes("/")) {
    return null;
  }

  return text;
}

function getKickChannel(
  stream: any
): string | null {
  const raw = parseJson(
    stream?.raw_data ??
    stream?.rawData ??
    {}
  );

  const candidates = [
    stream?.stream_url,
    stream?.streamUrl,
    stream?.originalUrl,
    stream?.original_url,
    stream?.kick_url,
    stream?.kickUrl,
    stream?.kick_stream_url,
    stream?.kickStreamUrl,
    stream?.kick_live_url,
    stream?.kickLiveUrl,
    stream?.live_url,
    stream?.liveUrl,

    raw?.stream_url,
    raw?.streamUrl,
    raw?.originalUrl,
    raw?.original_url,
    raw?.kick_url,
    raw?.kickUrl,
    raw?.kick_stream_url,
    raw?.kickStreamUrl,
    raw?.kick_live_url,
    raw?.kickLiveUrl,
    raw?.live_url,
    raw?.liveUrl,

    raw?.channel_url,
    raw?.channelUrl,
    raw?.kick_channel_url,
    raw?.kickChannelUrl,

    stream?.channel?.slug,
    stream?.channel?.username,
    stream?.channel?.name,

    raw?.channel?.slug,
    raw?.channel?.username,
    raw?.channel?.name,

    raw?.user?.username,
    raw?.user?.name,

    raw?.broadcaster?.username,
    raw?.broadcaster?.name,

    raw?.streamer?.username,
    raw?.streamer?.name,

    raw?.creator?.username,
    raw?.creator?.name,

    stream?.hostName,
    stream?.host_name,
    raw?.hostName,
    raw?.host_name,
  ];

  for (const candidate of candidates) {
    const channel = cleanKickChannel(candidate);

    if (channel) {
      return channel;
    }
  }

  return null;
}

/* =========================================================
   PLAYBACK
========================================================= */

function getPlayback(
  stream: any
): {
  originalUrl: string | null;
  embedUrl: string | null;
} {
  const raw = parseJson(
    stream?.raw_data ??
    stream?.rawData ??
    {}
  );

  const playback =
    stream?.recastPlayback ??
    stream?.recast_playback ??
    raw?.recastPlayback ??
    raw?.recast_playback ??
    {};

  const originalCandidates = [
    stream?.stream_url,
    stream?.streamUrl,
    stream?.originalUrl,
    stream?.original_url,

    stream?.kick_url,
    stream?.kickUrl,
    stream?.kick_stream_url,
    stream?.kickStreamUrl,
    stream?.kick_live_url,
    stream?.kickLiveUrl,
    stream?.live_url,
    stream?.liveUrl,

    playback?.originalUrl,
    playback?.original_url,
    playback?.streamUrl,
    playback?.stream_url,
    playback?.liveUrl,
    playback?.live_url,

    raw?.stream_url,
    raw?.streamUrl,
    raw?.originalUrl,
    raw?.original_url,

    raw?.kick_url,
    raw?.kickUrl,
    raw?.kick_stream_url,
    raw?.kickStreamUrl,
    raw?.kick_live_url,
    raw?.kickLiveUrl,

    raw?._crshmarket_stream_url,
  ];

  const embedCandidates = [
    stream?.stream_embed_url,
    stream?.streamEmbedUrl,
    stream?.embedUrl,
    stream?.embed_url,

    playback?.embedUrl,
    playback?.embed_url,

    raw?.stream_embed_url,
    raw?.streamEmbedUrl,
    raw?.embedUrl,
    raw?.embed_url,

    raw?._crshmarket_stream_embed_url,
  ];

  const findUrl = (
    candidates: any[]
  ): string | null => {
    for (const value of candidates) {
      if (
        typeof value === "string" &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return null;
  };

  let originalUrl = findUrl(originalCandidates);
  let embedUrl = findUrl(embedCandidates);

  const kickChannel = getKickChannel(stream);

  if (
    kickChannel &&
    !originalUrl
  ) {
    originalUrl =
      `https://kick.com/${encodeURIComponent(
        kickChannel
      )}`;
  }

  if (
    kickChannel &&
    !embedUrl
  ) {
    embedUrl =
      `https://player.kick.com/${encodeURIComponent(
        kickChannel
      )}`;
  }

  return {
    originalUrl,
    embedUrl,
  };
}

/* =========================================================
   RECORDING
========================================================= */

function getSpecificRecordingUrl(
  stream: any
): string | null {
  const raw = parseJson(
    stream?.raw_data ??
    stream?.rawData ??
    {}
  );

  const candidates = [
    stream?.resolution_proof_url,
    stream?.resolutionProofUrl,

    stream?.vod_url,
    stream?.vodUrl,

    stream?.replay_url,
    stream?.replayUrl,

    stream?.recording_url,
    stream?.recordingUrl,

    stream?.video_url,
    stream?.videoUrl,

    stream?.archive_url,
    stream?.archiveUrl,

    raw?.resolution_proof_url,
    raw?.resolutionProofUrl,

    raw?.vod_url,
    raw?.vodUrl,

    raw?.replay_url,
    raw?.replayUrl,

    raw?.recording_url,
    raw?.recordingUrl,

    raw?.video_url,
    raw?.videoUrl,

    raw?.archive_url,
    raw?.archiveUrl,

    raw?._crshmarket_resolution_proof_url,
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

/* =========================================================
   RESOLUTION PROOF
========================================================= */

function buildResolutionProofUrl(
  originalUrl: string | null,
  startedAt: any,
  resolvedAt: any,
  specificRecordingUrl: string | null = null
): string | null {
  if (specificRecordingUrl) {
    return specificRecordingUrl;
  }

  if (!originalUrl) {
    return null;
  }

  const start = toIso(startedAt);
  const resolved = toIso(resolvedAt);

  if (!start || !resolved) {
    return originalUrl;
  }

  const offsetSeconds = Math.max(
    0,
    Math.floor(
      (
        Date.parse(resolved) -
        Date.parse(start)
      ) / 1000
    )
  );

  if (!Number.isFinite(offsetSeconds)) {
    return originalUrl;
  }

  try {
    const url = new URL(originalUrl);

    if (
      /(^|\.)youtube\.com$/i.test(
        url.hostname
      ) ||
      /(^|\.)youtu\.be$/i.test(
        url.hostname
      )
    ) {
      url.searchParams.set(
        "t",
        String(offsetSeconds)
      );

      return url.toString();
    }
  } catch {}

  return originalUrl;
}

/* =========================================================
   SAVE MARKET
========================================================= */

async function saveMarket(
  stream: ConvexStream
) {
  if (!sql) {
    console.error(
      "CRSHMARKET DB: No PostgreSQL environment variable found."
    );

    return;
  }

  const market = stream.market;

  if (!market?.marketId) {
    return;
  }

  const marketId = String(
    market.marketId
  );

  const pools = getPools(market);
  const incomingTrades = getTradeCount(market);

  const status = String(
    market.status ?? "unknown"
  );

  const winner = getWinningOptionId(market);

  const now = new Date().toISOString();

  const openedAt = getOpenedAt(
    market,
    now
  );

  const resolved = isResolvedStatus(status);

  const resolvedAt = resolved
    ? (
        toIso(market.resolvedAt) ??
        now
      )
    : null;

  await sql`
    INSERT INTO markets (
      market_id,
      title,
      status,
      winning_option_id,
      current_pools_usdc,
      total_trades,
      stream_id,
      stream_title,
      host_name,
      viewer_count,
      first_seen_at,
      last_seen_at,
      resolved_at,
      raw_data
    )
    VALUES (
      ${marketId},
      ${market.title ?? null},
      ${status},
      ${winner},

      ${
        pools
          ? JSON.stringify(pools)
          : null
      }::jsonb,

      ${incomingTrades},

      ${stream.id ?? null},
      ${stream.title ?? null},
      ${stream.hostName ?? null},

      ${asNumber(
        stream.viewerCount
      )},

      ${openedAt},
      ${now},
      ${resolvedAt},

      ${JSON.stringify(
        stream
      )}::jsonb
    )

    ON CONFLICT (market_id)

    DO UPDATE SET

      title =
        COALESCE(
          EXCLUDED.title,
          markets.title
        ),

      status =
        EXCLUDED.status,

      winning_option_id =
        COALESCE(
          EXCLUDED.winning_option_id,
          markets.winning_option_id
        ),

      current_pools_usdc =
        COALESCE(
          EXCLUDED.current_pools_usdc,
          markets.current_pools_usdc
        ),

      total_trades =
        GREATEST(
          COALESCE(
            markets.total_trades,
            0
          ),
          COALESCE(
            EXCLUDED.total_trades,
            0
          )
        ),

      stream_id =
        COALESCE(
          EXCLUDED.stream_id,
          markets.stream_id
        ),

      stream_title =
        COALESCE(
          EXCLUDED.stream_title,
          markets.stream_title
        ),

      host_name =
        COALESCE(
          EXCLUDED.host_name,
          markets.host_name
        ),

      viewer_count =
        COALESCE(
          EXCLUDED.viewer_count,
          markets.viewer_count
        ),

      first_seen_at =
        COALESCE(
          markets.first_seen_at,
          EXCLUDED.first_seen_at
        ),

      last_seen_at =
        EXCLUDED.last_seen_at,

      resolved_at =
        CASE
          WHEN LOWER(
            COALESCE(
              EXCLUDED.status,
              ''
            )
          ) IN (
            'resolved',
            'cancelled',
            'canceled'
          )
          THEN COALESCE(
            markets.resolved_at,
            EXCLUDED.resolved_at
          )
          ELSE markets.resolved_at
        END,

      raw_data =
        EXCLUDED.raw_data
  `;
}

/* =========================================================
   NORMALIZE DB MARKET
========================================================= */

function normalizeDbMarket(
  row: Record<string, any>
) {
  const raw = parseJson(
    row.raw_data
  ) ?? {};

  const rawMarket =
    raw?.market ?? {};

  const syntheticMarket: ConvexMarket = {
    ...rawMarket,

    winningOptionId:
      row.winning_option_id ??
      rawMarket.winningOptionId,

    currentPoolsUsdc:
      row.current_pools_usdc ??
      rawMarket.currentPoolsUsdc,

    status:
      row.status ??
      rawMarket.status,

    rawData: raw,
  };

  const pools = getPools(
    syntheticMarket
  );

  const dbTrades =
    asTradeCount(
      row.total_trades
    );

  const rawTrades =
    getTradeCount(
      syntheticMarket
    );

  const totalTrades =
    Math.max(
      dbTrades,
      rawTrades
    );

  const winningOptionId =
    getWinningOptionId(
      syntheticMarket
    );

  const expectedWinnings =
    calculateExpectedWinnings(
      pools,
      winningOptionId
    );

  const openedAt =
    getOpenedAt(
      syntheticMarket,
      row.first_seen_at
    );

  const closedAt =
    getClosedAt(
      syntheticMarket,
      row.resolved_at
    );

  const recordedAt =
    getRecordedAt(
      syntheticMarket,
      row.resolved_at
    );

  const creditedAt =
    getCreditedAt(
      syntheticMarket,
      recordedAt ??
        row.resolved_at
    );

  const poolUsd =
    pools
      ? [
          baseUnitsToUsd(pools[0]),
          baseUnitsToUsd(pools[1]),
        ]
      : null;

  const playback =
    getPlayback({
      ...raw,

      raw_data: raw,
      rawData: raw,

      hostName:
        row.host_name ??
        raw?.hostName,

      host_name:
        row.host_name ??
        raw?.host_name,
    });

  const kickChannel =
    getKickChannel({
      ...raw,

      raw_data: raw,
      rawData: raw,

      hostName:
        row.host_name ??
        raw?.hostName,

      host_name:
        row.host_name ??
        raw?.host_name,

      stream_url:
        playback.originalUrl,
    });

  const finalStreamUrl =
    playback.originalUrl ??
    (
      kickChannel
        ? `https://kick.com/${encodeURIComponent(
            kickChannel
          )}`
        : null
    );

  const finalEmbedUrl =
    playback.embedUrl ??
    (
      kickChannel
        ? `https://player.kick.com/${encodeURIComponent(
            kickChannel
          )}`
        : null
    );

  return {
    market_id:
      row.market_id,

    title:
      row.title ??
      rawMarket.title ??
      undefined,

    status:
      row.status ??
      rawMarket.status ??
      undefined,

    winning_option_id:
      winningOptionId,

    current_pools_usdc:
      pools,

    current_pools_usd:
      poolUsd,

    yes_pool_usd:
      poolUsd?.[0] ??
      null,

    no_pool_usd:
      poolUsd?.[1] ??
      null,

    total_trades:
      totalTrades,

    stream_id:
      row.stream_id ??
      raw?.id ??
      undefined,

    stream_title:
      row.stream_title ??
      raw?.title ??
      undefined,

    host_name:
      row.host_name ??
      raw?.hostName ??
      raw?.host_name ??
      undefined,

    viewer_count:
      row.viewer_count ??
      raw?.viewerCount ??
      0,

    first_seen_at:
      row.first_seen_at ??
      openedAt ??
      undefined,

    opened_at:
      openedAt,

    closed_at:
      closedAt,

    recorded_at:
      recordedAt,

    credited_at:
      creditedAt,

    last_seen_at:
      row.last_seen_at ??
      undefined,

    resolved_at:
      row.resolved_at ??
      undefined,

    expected_winnings:
      expectedWinnings,

    stream_url:
      finalStreamUrl,

    stream_embed_url:
      finalEmbedUrl,

    resolution_proof_url:
      getSpecificRecordingUrl(raw) ??
      raw?._crshmarket_resolution_proof_url ??
      buildResolutionProofUrl(
        finalStreamUrl,
        raw?.startedAt ??
          raw?.started_at ??
          openedAt,
        closedAt,
        null
      ),

    raw_data:
      raw,
  };
}

/* =========================================================
   LOAD PERMANENT HISTORY
========================================================= */

async function getResolvedMarkets() {
  if (!sql) {
    console.error(
      "CRSHMARKET HISTORY: Database connection missing."
    );

    return [];
  }

  const rows = await sql`
    SELECT
      market_id,
      title,
      status,
      winning_option_id,
      current_pools_usdc,
      total_trades,
      stream_id,
      stream_title,
      host_name,
      viewer_count,
      first_seen_at,
      last_seen_at,
      resolved_at,
      raw_data
    FROM markets

    WHERE LOWER(
      COALESCE(
        status,
        ''
      )
    ) IN (
      'resolved',
      'cancelled',
      'canceled'
    )

    ORDER BY
      COALESCE(
        resolved_at,
        last_seen_at,
        first_seen_at
      ) DESC

    LIMIT 500
  `;

  return rows.map(
    normalizeDbMarket
  );
}

/* =========================================================
   LIVE STREAM
========================================================= */

function normalizeLiveStream(
  stream: ConvexStream
) {
  const market =
    stream.market;

  if (!market) {
    return stream;
  }

  const pools =
    getPools(market);

  const winner =
    getWinningOptionId(market);

  const expected =
    calculateExpectedWinnings(
      pools,
      winner
    );

  const poolUsd =
    pools
      ? [
          baseUnitsToUsd(pools[0]),
          baseUnitsToUsd(pools[1]),
        ]
      : null;

  const playback =
    getPlayback(stream);

  return {
    ...stream,

    market: {
      ...market,

      winningOptionId:
        winner,

      currentPoolsUsdc:
        pools,

      currentPoolsUsd:
        poolUsd,

      yesPoolUsd:
        poolUsd?.[0] ??
        null,

      noPoolUsd:
        poolUsd?.[1] ??
        null,

      totalTrades:
        getTradeCount(market),

      expectedWinnings:
        expected,
    },

    stream_url:
      playback.originalUrl,

    stream_embed_url:
      playback.embedUrl,

    resolution_proof_url:
      null,
  };
}

/* =========================================================
   CONVEX RESOLVED
========================================================= */

function normalizeConvexResolvedMarket(
  stream: ConvexStream
) {
  const market =
    stream.market;

  if (!market?.marketId) {
    return null;
  }

  const pools =
    getPools(market);

  const winner =
    getWinningOptionId(market);

  const tradeCount =
    getTradeCount(market);

  const poolUsd =
    pools
      ? [
          baseUnitsToUsd(pools[0]),
          baseUnitsToUsd(pools[1]),
        ]
      : null;

  const resolvedNow =
    toIso(market.resolvedAt) ??
    new Date().toISOString();

  const openedAt =
    getOpenedAt(market);

  const closedAt =
    getClosedAt(
      market,
      resolvedNow
    );

  const recordedAt =
    getRecordedAt(
      market,
      resolvedNow
    );

  const creditedAt =
    getCreditedAt(
      market,
      recordedAt ??
        resolvedNow
    );

  const playback =
    getPlayback(stream);

  return {
    market_id:
      String(
        market.marketId
      ),

    title:
      market.title,

    status:
      market.status,

    winning_option_id:
      winner,

    current_pools_usdc:
      pools,

    current_pools_usd:
      poolUsd,

    yes_pool_usd:
      poolUsd?.[0] ??
      null,

    no_pool_usd:
      poolUsd?.[1] ??
      null,

    total_trades:
      tradeCount,

    stream_id:
      stream.id,

    stream_title:
      stream.title,

    host_name:
      stream.hostName,

    viewer_count:
      asNumber(
        stream.viewerCount
      ) ?? 0,

    first_seen_at:
      openedAt ??
      undefined,

    opened_at:
      openedAt,

    closed_at:
      closedAt,

    recorded_at:
      recordedAt,

    credited_at:
      creditedAt,

    last_seen_at:
      resolvedNow,

    resolved_at:
      resolvedNow,

    expected_winnings:
      calculateExpectedWinnings(
        pools,
        winner
      ),

    stream_url:
      playback.originalUrl,

    stream_embed_url:
      playback.embedUrl,

    resolution_proof_url:
      buildResolutionProofUrl(
        playback.originalUrl,
        stream.startedAt ??
          openedAt,
        closedAt,
        getSpecificRecordingUrl(stream)
      ),

    raw_data:
      stream,
  };
}

/* =========================================================
   MERGE HISTORY SAFELY
========================================================= */

function mergeHistoryMarkets(
  existing: any,
  incoming: any
) {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,

    ...incoming,

    /*
     * NEVER lose trade history.
     */
    total_trades:
      Math.max(
        asTradeCount(
          existing.total_trades
        ),
        asTradeCount(
          incoming.total_trades
        )
      ),

    /*
     * NEVER lose winner.
     */
    winning_option_id:
      incoming.winning_option_id ??
      existing.winning_option_id ??
      null,

    /*
     * NEVER lose pools.
     */
    current_pools_usdc:
      incoming.current_pools_usdc ??
      existing.current_pools_usdc ??
      null,

    current_pools_usd:
      incoming.current_pools_usd ??
      existing.current_pools_usd ??
      null,

    yes_pool_usd:
      incoming.yes_pool_usd ??
      existing.yes_pool_usd ??
      null,

    no_pool_usd:
      incoming.no_pool_usd ??
      existing.no_pool_usd ??
      null,

    /*
     * NEVER lose timestamps.
     */
    opened_at:
      existing.opened_at ??
      incoming.opened_at ??
      null,

    closed_at:
      existing.closed_at ??
      incoming.closed_at ??
      null,

    recorded_at:
      existing.recorded_at ??
      incoming.recorded_at ??
      null,

    credited_at:
      existing.credited_at ??
      incoming.credited_at ??
      null,

    first_seen_at:
      existing.first_seen_at ??
      incoming.first_seen_at ??
      null,

    last_seen_at:
      incoming.last_seen_at ??
      existing.last_seen_at ??
      null,

    resolved_at:
      existing.resolved_at ??
      incoming.resolved_at ??
      null,

    /*
     * NEVER lose URLs/proof.
     */
    stream_url:
      incoming.stream_url ??
      existing.stream_url ??
      null,

    stream_embed_url:
      incoming.stream_embed_url ??
      existing.stream_embed_url ??
      null,

    resolution_proof_url:
      incoming.resolution_proof_url ??
      existing.resolution_proof_url ??
      null,

    expected_winnings:
      incoming.expected_winnings ??
      existing.expected_winnings ??
      null,

    raw_data:
      incoming.raw_data ??
      existing.raw_data ??
      {},
  };
}

/* =========================================================
   MAIN API
========================================================= */

export async function GET() {
  try {
    if (!sql) {
      console.error(
        "CRSHMARKET PRODUCTION ERROR: DATABASE_URL / POSTGRES_URL is missing."
      );
    }

    /*
     * Get current Convex streams.
     */
    const convex =
      await convexQuery(
        "streams:getActive"
      );

    const sourceStreams =
      Array.isArray(
        convex?.value?.activeStreams
      )
        ? convex.value.activeStreams
        : [];

    /*
     * Normalize current streams.
     */
    const activeStreams =
      sourceStreams.map(
        normalizeLiveStream
      );

    /*
     * SAVE EVERY SNAPSHOT.
     *
     * IMPORTANT:
     * This remains persistent in Postgres.
     */
    if (sql) {
      await Promise.all(
        activeStreams.map(
          async (
            stream: ConvexStream
          ) => {
            try {
              await saveMarket(
                stream
              );
            } catch (error) {
              console.error(
                "Market save failed:",
                stream.market?.marketId,
                error
              );
            }
          }
        )
      );
    }

    /*
     * Load ALL permanent resolved history
     * from Postgres.
     *
     * This is now the primary source of truth.
     */
    let resolvedMarkets =
      await getResolvedMarkets();

    /*
     * If Convex still exposes resolved markets,
     * merge them with DB.
     */
    const convexResolved =
      activeStreams
        .filter(
          (
            stream: ConvexStream
          ) =>
            isResolvedStatus(
              stream.market?.status
            )
        )
        .map(
          normalizeConvexResolvedMarket
        )
        .filter(Boolean);

    /*
     * DB first.
     */
    const historyMap =
      new Map<string, any>();

    for (
      const market of resolvedMarkets
    ) {
      historyMap.set(
        String(
          market.market_id
        ),
        market
      );
    }

    /*
     * Convex can update DB history,
     * but it can NEVER destroy stored values.
     */
    for (
      const market of convexResolved
    ) {
      if (!market) {
        continue;
      }

      const key =
        String(
          market.market_id
        );

      const existing =
        historyMap.get(key);

      historyMap.set(
        key,
        mergeHistoryMarkets(
          existing,
          market
        )
      );
    }

    /*
     * Final persistent history.
     */
    resolvedMarkets =
      Array.from(
        historyMap.values()
      );

    /*
     * Sort newest first.
     */
    resolvedMarkets.sort(
      (
        a,
        b
      ) => {
        const aTime =
          Date.parse(
            a.resolved_at ??
              a.credited_at ??
              a.recorded_at ??
              a.last_seen_at ??
              ""
          ) || 0;

        const bTime =
          Date.parse(
            b.resolved_at ??
              b.credited_at ??
              b.recorded_at ??
              b.last_seen_at ??
              ""
          ) || 0;

        return bTime - aTime;
      }
    );

    /*
     * Final response.
     */
    return NextResponse.json(
      {
        status: "success",

        value: {
          activeStreams,
          resolvedMarkets,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma: "no-cache",

          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "GET /api/markets failed:",
      error
    );

    return NextResponse.json(
      {
        status: "error",

        error:
          error instanceof Error
            ? error.message
            : "Failed to load markets",

        value: {
          activeStreams: [],
          resolvedMarkets: [],
        },
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}