


import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONVEX_URL =
  process.env.CONVEX_URL ??
  "https://impartial-newt-333.convex.cloud/api/query";

/*
 * Production-safe database configuration.
 *
 * Vercel/Neon setups can expose different postgres
 * environment variable names, so support all common ones.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  null;

const sql = DATABASE_URL
  ? neon(DATABASE_URL)
  : null;

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

type DatabaseMarket = {
  market_id: string;

  title?: string | null;
  status?: string | null;

  winning_option_id?: number | null;

  current_pools_usdc?: any;

  total_trades?: number | null;

  stream_id?: string | null;
  stream_title?: string | null;
  host_name?: string | null;
  viewer_count?: number | null;

  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;

  raw_data?: any;

  stream_url?: string | null;
  stream_embed_url?: string | null;
  resolution_proof_url?: string | null;
};

/* =========================================================
   GENERIC HELPERS
========================================================= */

function asNumber(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function asTradeCount(value: any): number {
  const n = asNumber(value);

  if (
    n === null ||
    n < 0
  ) {
    return 0;
  }

  return Math.floor(n);
}

function parseJson(value: any): any {
  if (
    typeof value !== "string"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isResolvedStatus(
  status: any
): boolean {
  const value =
    String(status ?? "")
      .trim()
      .toLowerCase();

  return (
    value === "resolved" ||
    value === "cancelled" ||
    value === "canceled" ||
    value === "settled" ||
    value === "complete" ||
    value === "completed" ||
    value === "finalized"
  );
}

function toIso(
  value: any
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  if (Number.isFinite(n)) {
    const ms =
      n < 10_000_000_000
        ? n * 1000
        : n;

    const date = new Date(ms);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date.toISOString();
    }
  }

  const date =
    new Date(
      String(value)
    );

  if (
    !Number.isNaN(
      date.getTime()
    )
  ) {
    return date.toISOString();
  }

  return null;
}

function baseUnitsToUsd(
  value: any
): number {
  const n =
    asNumber(value) ?? 0;

  return n / USDC_BASE;
}

function normalizePoolRaw(
  value: any
): number {
  const n =
    asNumber(value) ?? 0;

  if (n === 0) {
    return 0;
  }

  if (
    Number.isInteger(n) &&
    Math.abs(n) >= USDC_BASE
  ) {
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

  const resolved =
    isResolvedStatus(
      market.status
    );

  const candidates =
    resolved
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

  for (
    const candidateRaw of candidates
  ) {
    const candidate =
      parseJson(candidateRaw);

    if (
      Array.isArray(candidate) &&
      candidate.length >= 2
    ) {
      const yes =
        normalizePoolRaw(
          candidate[0]
        );

      const no =
        normalizePoolRaw(
          candidate[1]
        );

      if (
        yes > 0 ||
        no > 0
      ) {
        return [
          String(yes),
          String(no),
        ];
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

      if (
        yes !== undefined &&
        no !== undefined
      ) {
        const yesRaw =
          normalizePoolRaw(yes);

        const noRaw =
          normalizePoolRaw(no);

        if (
          yesRaw > 0 ||
          noRaw > 0
        ) {
          return [
            String(yesRaw),
            String(noRaw),
          ];
        }
      }
    }
  }

  return null;
}

/* =========================================================
   WINNER
========================================================= */

function normalizeWinner(
  value: any
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numeric =
    asNumber(value);

  if (
    numeric === 0 ||
    numeric === 1
  ) {
    return numeric;
  }

  const text =
    String(value)
      .trim()
      .toLowerCase();

  if (
    text === "yes" ||
    text === "true" ||
    text === "0"
  ) {
    return 0;
  }

  if (
    text === "no" ||
    text === "false" ||
    text === "1"
  ) {
    return 1;
  }

  if (
    text.includes("yes")
  ) {
    return 0;
  }

  if (
    text.includes("no")
  ) {
    return 1;
  }

  if (
    typeof value === "object"
  ) {
    const nested =
      value.optionId ??
      value.optionID ??
      value.id ??
      value.value ??
      value.side ??
      value.name ??
      value.label;

    return normalizeWinner(
      nested
    );
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

    market.stats
      ?.winningOptionId,

    market.statistics
      ?.winningOptionId,

    market.metrics
      ?.winningOptionId,

    market.marketStats
      ?.winningOptionId,

    market.rawData
      ?.winningOptionId,

    market.rawData
      ?.winner,

    market.rawData
      ?.winningOption,

    market.rawData
      ?.winningSide,
  ];

  for (
    const candidate of candidates
  ) {
    const normalized =
      normalizeWinner(
        candidate
      );

    if (
      normalized === 0 ||
      normalized === 1
    ) {
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

  for (
    const source of sources
  ) {
    if (
      !source ||
      typeof source !== "object"
    ) {
      continue;
    }

    for (
      const key of numericKeys
    ) {
      const count =
        asTradeCount(
          source[key]
        );

      if (
        count > best
      ) {
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

    market.rawData
      ?.recentTradeProfiles,

    market.rawData
      ?.recentTrades,

    market.rawData?.trades,

    market.rawData
      ?.tradeHistory,

    market.rawData?.bets,
  ];

  for (
    const value of arrays
  ) {
    const parsed =
      parseJson(value);

    if (
      Array.isArray(parsed)
    ) {
      best =
        Math.max(
          best,
          parsed.length
        );
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
  if (
    !Array.isArray(pools) ||
    pools.length < 2
  ) {
    return null;
  }

  const winner =
    normalizeWinner(
      winningOptionId
    );

  if (
    winner !== 0 &&
    winner !== 1
  ) {
    return null;
  }

  const yesRaw =
    normalizePoolRaw(
      pools[0]
    );

  const noRaw =
    normalizePoolRaw(
      pools[1]
    );

  /*
   * Don't show a fake $0.00 when one side
   * is unavailable.
   */
  if (
    yesRaw <= 0 ||
    noRaw <= 0
  ) {
    return null;
  }

  const total =
    yesRaw + noRaw;

  const winningPool =
    winner === 0
      ? yesRaw
      : noRaw;

  if (
    total <= 0 ||
    winningPool <= 0
  ) {
    return null;
  }

  const payout =
    HYPOTHETICAL_BET *
    (total / winningPool);

  if (
    !Number.isFinite(
      payout
    )
  ) {
    return null;
  }

  return Number(
    payout.toFixed(2)
  );
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

  for (
    const candidate of candidates
  ) {
    const result =
      toIso(candidate);

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

  for (
    const candidate of candidates
  ) {
    const result =
      toIso(candidate);

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

  for (
    const candidate of candidates
  ) {
    const result =
      toIso(candidate);

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

  for (
    const candidate of candidates
  ) {
    const result =
      toIso(candidate);

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
  const response =
    await fetch(
      CONVEX_URL,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body: JSON.stringify({
          path,
          args,
          format: "json",
        }),

        cache: "no-store",
      }
    );

  const data =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    const detail =
      data?.error ??
      data?.message ??
      `HTTP ${response.status}`;

    throw new Error(
      `Convex returned ${response.status}: ${String(
        detail
      )}`
    );
  }

  if (
    data?.status &&
    data.status !== "success"
  ) {
    throw new Error(
      data?.error
        ? `Convex query failed: ${String(
            data.error
          )}`
        : "Convex query failed"
    );
  }

  return data;
}

/* =========================================================
   KICK DETECTION
========================================================= */

function isKickHost(
  value: any
): boolean {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return false;
  }

  try {
    const url =
      new URL(
        value.trim()
      );

    return /(^|\.)kick\.com$/i.test(
      url.hostname
    );
  } catch {
    return false;
  }
}

function isKickChannelUrl(
  value: string
): boolean {
  try {
    const url =
      new URL(value);

    if (
      !/(^|\.)kick\.com$/i.test(
        url.hostname
      )
    ) {
      return false;
    }

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    return (
      parts.length === 1 &&
      !parts[0].includes(".")
    );
  } catch {
    return false;
  }
}

function cleanKickChannel(
  value: any
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  let text =
    value.trim();

  try {
    if (
      text.startsWith(
        "http://"
      ) ||
      text.startsWith(
        "https://"
      )
    ) {
      const url =
        new URL(text);

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
          const playerParts =
            url.pathname
              .split("/")
              .filter(Boolean);

          return playerParts[0]
            ? decodeURIComponent(
                playerParts[0]
              )
            : null;
        }

        return null;
      }

      const parts =
        url.pathname
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

      return decodeURIComponent(
        parts[0]
      );
    }
  } catch {
    // Continue as slug.
  }

  text =
    text
      .replace(
        /^@/,
        ""
      )
      .replace(
        /\s+/g,
        ""
      )
      .replace(
        /\/+$/,
        ""
      );

  if (
    !text ||
    text.includes("/")
  ) {
    return null;
  }

  return text;
}

function getKickChannel(
  stream: any
): string | null {
  const raw =
    parseJson(
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

  for (
    const candidate of candidates
  ) {
    const channel =
      cleanKickChannel(
        candidate
      );

    if (channel) {
      return channel;
    }
  }

  return null;
}

/* =========================================================
   PLAYBACK URLS
========================================================= */

function getPlayback(
  stream: any
): {
  originalUrl: string | null;
  embedUrl: string | null;
} {
  const raw =
    parseJson(
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

    raw?.recastPlayback?.originalUrl,
    raw?.recastPlayback?.original_url,
    raw?.recastPlayback?.streamUrl,
    raw?.recastPlayback?.stream_url,

    raw?.recast_playback?.originalUrl,
    raw?.recast_playback?.original_url,
    raw?.recast_playback?.streamUrl,
    raw?.recast_playback?.stream_url,
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

    raw?.recastPlayback?.embedUrl,
    raw?.recastPlayback?.embed_url,

    raw?.recast_playback?.embedUrl,
    raw?.recast_playback?.embed_url,
  ];

  const findUrl = (
    candidates: any[]
  ): string | null => {
    for (
      const value of candidates
    ) {
      if (
        typeof value === "string" &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return null;
  };

  let originalUrl =
    findUrl(
      originalCandidates
    );

  let embedUrl =
    findUrl(
      embedCandidates
    );

  const kickChannel =
    getKickChannel(stream);

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
   RECORDING URL
========================================================= */

function getSpecificRecordingUrl(
  stream: any
): string | null {
  const raw =
    parseJson(
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

    stream?.recastPlayback?.vodUrl,
    stream?.recastPlayback?.vod_url,
    stream?.recastPlayback?.replayUrl,
    stream?.recastPlayback?.replay_url,
    stream?.recastPlayback?.recordingUrl,
    stream?.recastPlayback?.recording_url,
    stream?.recastPlayback?.videoUrl,
    stream?.recastPlayback?.video_url,

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

    raw?.recastPlayback?.vodUrl,
    raw?.recastPlayback?.vod_url,
    raw?.recastPlayback?.replayUrl,
    raw?.recastPlayback?.replay_url,

    raw?.recast_playback?.vodUrl,
    raw?.recast_playback?.vod_url,
    raw?.recast_playback?.replayUrl,
    raw?.recast_playback?.replay_url,
  ];

  for (
    const value of candidates
  ) {
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
   CRSHMARKET RESOLUTION PROOF
========================================================= */

function buildMarketActivityUrl(
  marketId: any
): string | null {
  if (
    marketId === null ||
    marketId === undefined
  ) {
    return null;
  }

  const id =
    String(marketId).trim();

  if (!id) {
    return null;
  }

  return (
    `https://app.crshmarket.com/market-activity?market=${encodeURIComponent(
      id
    )}`
  );
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
  if (
    specificRecordingUrl
  ) {
    return specificRecordingUrl;
  }

  if (!originalUrl) {
    return null;
  }

  if (
    isKickChannelUrl(
      originalUrl
    )
  ) {
    return null;
  }

  const start =
    toIso(startedAt);

  const resolved =
    toIso(resolvedAt);

  if (
    !start ||
    !resolved
  ) {
    return originalUrl;
  }

  const offsetSeconds =
    Math.max(
      0,
      Math.floor(
        (
          Date.parse(
            resolved
          ) -
          Date.parse(
            start
          )
        ) / 1000
      )
    );

  if (
    !Number.isFinite(
      offsetSeconds
    )
  ) {
    return originalUrl;
  }

  const hostname =
    (() => {
      try {
        return new URL(
          originalUrl
        ).hostname;
      } catch {
        return "";
      }
    })();

  if (
    /(^|\.)youtube\.com$/i.test(
      hostname
    ) ||
    /(^|\.)youtu\.be$/i.test(
      hostname
    )
  ) {
    try {
      const url =
        new URL(
          originalUrl
        );

      url.searchParams.set(
        "t",
        String(
          offsetSeconds
        )
      );

      return url.toString();
    } catch {
      return originalUrl;
    }
  }

  return originalUrl;
}

/* =========================================================
   KICK VOD HELPERS
========================================================= */

function getKickVideoArray(
  payload: any
): any[] {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  const candidates = [
    payload?.videos,
    payload?.data,
    payload?.data?.videos,
    payload?.data?.data,
    payload?.items,
    payload?.results,
  ];

  for (
    const value of candidates
  ) {
    if (
      Array.isArray(value)
    ) {
      return value;
    }
  }

  return [];
}

function getKickPagination(
  payload: any
): any {
  return (
    payload?.pagination ??
    payload?.meta?.pagination ??
    payload?.data?.pagination ??
    payload?.data?.meta?.pagination ??
    payload?.meta ??
    {}
  );
}

function getNextKickCursor(
  payload: any
): string | null {
  const pagination =
    getKickPagination(
      payload
    );

  const candidates = [
    pagination?.next_cursor,
    pagination?.nextCursor,
    pagination?.next,
    pagination?.cursor,
  ];

  for (
    const value of candidates
  ) {
    if (
      value !== null &&
      value !== undefined &&
      String(value).trim()
    ) {
      return String(value);
    }
  }

  return null;
}

function getKickVideoId(
  video: any
): string | null {
  const candidates = [
    video?.id,
    video?.uuid,
    video?.video_id,
    video?.videoId,
  ];

  for (
    const value of candidates
  ) {
    if (
      value !== null &&
      value !== undefined &&
      String(value).trim()
    ) {
      return String(value);
    }
  }

  return null;
}

function getKickVideoUrl(
  video: any,
  channel: string,
  id: string
): string {
  const explicitCandidates = [
    video?.url,
    video?.video_url,
    video?.videoUrl,
    video?.vod_url,
    video?.vodUrl,
    video?.permalink,
    video?.share_url,
    video?.shareUrl,
    video?.href,
  ];

  for (
    const value of explicitCandidates
  ) {
    if (
      typeof value !== "string" ||
      !value.trim()
    ) {
      continue;
    }

    try {
      const url =
        new URL(
          value.trim()
        );

      if (
        /(^|\.)kick\.com$/i.test(
          url.hostname
        ) &&
        /\/videos?\//i.test(
          url.pathname
        )
      ) {
        return url.toString();
      }
    } catch {
      // Ignore.
    }
  }

  return (
    `https://kick.com/${encodeURIComponent(
      channel
    )}/videos/${encodeURIComponent(
      id
    )}`
  );
}

function getKickVideoTimestamp(
  value: any
): number | null {
  const iso =
    toIso(value);

  if (!iso) {
    return null;
  }

  return Date.parse(
    iso
  );
}

function getKickVideoDurationMs(
  video: any
): number {
  const value =
    video?.duration ??
    video?.duration_ms ??
    video?.durationMs ??
    0;

  const n =
    Number(value);

  if (
    !Number.isFinite(n) ||
    n <= 0
  ) {
    return 0;
  }

  return n < 100000
    ? n * 1000
    : n;
}

function normalizeText(
  value: any
): string {
  return String(
    value ?? ""
  )
    .toLowerCase()
    .replace(
      /https?:\/\/\S+/g,
      " "
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function titleSimilarity(
  a: any,
  b: any
): number {
  const first =
    normalizeText(a);

  const second =
    normalizeText(b);

  if (
    !first ||
    !second
  ) {
    return 0;
  }

  const aWords =
    new Set(
      first
        .split(/\s+/)
        .filter(
          (
            word
          ) =>
            word.length >= 3
        )
    );

  const bWords =
    new Set(
      second
        .split(/\s+/)
        .filter(
          (
            word
          ) =>
            word.length >= 3
        )
    );

  if (
    !aWords.size ||
    !bWords.size
  ) {
    return 0;
  }

  let common = 0;

  for (
    const word of aWords
  ) {
    if (
      bWords.has(word)
    ) {
      common++;
    }
  }

  return (
    common /
    Math.max(
      aWords.size,
      bWords.size
    )
  );
}

function getKickVideoTitle(
  video: any
): string {
  return (
    video?.session_title ??
    video?.sessionTitle ??
    video?.title ??
    video?.name ??
    ""
  );
}

/* =========================================================
   FETCH KICK VODS
========================================================= */

async function fetchKickVideos(
  channel: string
): Promise<any[]> {
  const allVideos: any[] = [];

  const cursors =
    new Set<string>();

  let cursor = "0";

  for (
    let page = 0;
    page < 12;
    page++
  ) {
    const url =
      `${KICK_API_BASE}/api/v2/channels/${encodeURIComponent(
        channel
      )}/videos?cursor=${encodeURIComponent(
        cursor
      )}&sort=date&time=all`;

    try {
      const response =
        await fetch(
          url,
          {
            headers: {
              accept:
                "application/json, text/plain, */*",

              "user-agent":
                "Mozilla/5.0 (compatible; CRSHMARKET/1.0)",

              referer:
                `https://kick.com/${encodeURIComponent(
                  channel
                )}`,
            },

            cache: "no-store",

            signal:
              AbortSignal.timeout(
                10000
              ),
          }
        );

      if (
        !response.ok
      ) {
        console.error(
          "Kick VOD request failed:",
          channel,
          response.status
        );

        break;
      }

      const payload =
        await response.json();

      const videos =
        getKickVideoArray(
          payload
        );

      if (
        !videos.length
      ) {
        break;
      }

      allVideos.push(
        ...videos
      );

      const nextCursor =
        getNextKickCursor(
          payload
        );

      if (
        !nextCursor ||
        nextCursor === cursor ||
        cursors.has(
          nextCursor
        )
      ) {
        break;
      }

      cursors.add(
        cursor
      );

      cursor =
        nextCursor;
    } catch (error) {
      console.error(
        "Kick VOD fetch error:",
        channel,
        error
      );

      break;
    }
  }

  const unique =
    new Map<
      string,
      any
    >();

  for (
    const video of allVideos
  ) {
    const id =
      getKickVideoId(
        video
      );

    if (!id) {
      continue;
    }

    unique.set(
      String(id),
      video
    );
  }

  return Array.from(
    unique.values()
  );
}

/* =========================================================
   MATCH KICK VOD TO MARKET
========================================================= */

function getMarketRaw(
  market: any
): any {
  return parseJson(
    market?.raw_data ??
    market?.rawData ??
    {}
  );
}

function getMarketStreamTitle(
  market: any
): string {
  const raw =
    getMarketRaw(
      market
    );

  return (
    market?.stream_title ??
    market?.streamTitle ??
    raw?.title ??
    raw?.streamTitle ??
    raw?.stream_title ??
    raw?.livestream
      ?.session_title ??
    raw?.livestream
      ?.sessionTitle ??
    raw?.livestream
      ?.title ??
    ""
  );
}

function getKickMatchScore(
  market: any,
  video: any
): number | null {
  const openedMs =
    getKickVideoTimestamp(
      market?.opened_at ??
      market?.openedAt ??
      market?.first_seen_at
    );

  const closedMs =
    getKickVideoTimestamp(
      market?.closed_at ??
      market?.closedAt
    );

  const resolvedMs =
    getKickVideoTimestamp(
      market?.resolved_at ??
      market?.resolvedAt
    );

  const createdMs =
    getKickVideoTimestamp(
      video?.created_at ??
      video?.createdAt ??
      video?.start_time ??
      video?.startTime ??
      video?.started_at ??
      video?.startedAt
    );

  if (!createdMs) {
    return null;
  }

  const durationMs =
    getKickVideoDurationMs(
      video
    );

  const videoStart =
    createdMs;

  const videoEnd =
    durationMs > 0
      ? createdMs +
        durationMs
      : createdMs;

  const targetStart =
    openedMs ??
    resolvedMs;

  const targetEnd =
    closedMs ??
    resolvedMs ??
    openedMs;

  let timeDistance =
    Number.MAX_SAFE_INTEGER;

  if (
    targetStart &&
    targetEnd &&
    videoStart <= targetEnd &&
    videoEnd >= targetStart
  ) {
    timeDistance = 0;
  } else {
    const distances: number[] =
      [];

    if (
      targetStart
    ) {
      distances.push(
        Math.abs(
          targetStart -
          videoStart
        )
      );

      if (
        durationMs > 0
      ) {
        distances.push(
          Math.abs(
            targetStart -
            videoEnd
          )
        );
      }
    }

    if (
      targetEnd
    ) {
      distances.push(
        Math.abs(
          targetEnd -
          videoStart
        )
      );

      if (
        durationMs > 0
      ) {
        distances.push(
          Math.abs(
            targetEnd -
            videoEnd
          )
        );
      }
    }

    if (
      distances.length
    ) {
      timeDistance =
        Math.min(
          ...distances
        );
    }
  }

  const marketTitle =
    getMarketStreamTitle(
      market
    );

  const videoTitle =
    getKickVideoTitle(
      video
    );

  const similarity =
    titleSimilarity(
      marketTitle,
      videoTitle
    );

  if (
    timeDistance ===
    Number.MAX_SAFE_INTEGER
  ) {
    if (
      similarity <= 0
    ) {
      return null;
    }

    return (
      10_000_000 -
      similarity *
        1_000_000
    );
  }

  const MAX_DISTANCE =
    6 *
    60 *
    60 *
    1000;

  if (
    timeDistance >
      MAX_DISTANCE &&
    similarity < 0.55
  ) {
    return null;
  }

  return (
    timeDistance -
    similarity *
      30 *
      60 *
      1000
  );
}

async function resolveKickProofs(
  markets: any[]
): Promise<void> {
  const channelCache =
    new Map<
      string,
      Promise<any[]>
    >();

  const getVideos = (
    channel: string
  ) => {
    const key =
      channel
        .trim()
        .toLowerCase();

    const existing =
      channelCache.get(
        key
      );

    if (existing) {
      return existing;
    }

    const request =
      fetchKickVideos(
        channel
      );

    channelCache.set(
      key,
      request
    );

    return request;
  };

  await Promise.all(
    markets.map(
      async (
        market
      ) => {
        const raw =
          getMarketRaw(
            market
          );

        if (
          market.resolution_proof_url &&
          !isKickChannelUrl(
            market.resolution_proof_url
          )
        ) {
          return;
        }

        const source = {
          ...raw,
          ...market,

          raw_data:
            raw,

          rawData:
            raw,

          hostName:
            market.host_name ??
            raw?.hostName,

          host_name:
            market.host_name ??
            raw?.host_name,
        };

        const channel =
          getKickChannel(
            source
          );

        if (!channel) {
          console.warn(
            "Kick proof: channel not found",
            {
              marketId:
                market.market_id,
              host:
                market.host_name,
              streamUrl:
                market.stream_url,
            }
          );

          return;
        }

        const videos =
          await getVideos(
            channel
          );

        if (
          !videos.length
        ) {
          console.warn(
            "Kick proof: no VODs returned",
            {
              marketId:
                market.market_id,
              channel,
            }
          );

          return;
        }

        let best: {
          id: string;
          score: number;
          url: string;
          title: string;
        } | null =
          null;

        for (
          const video of videos
        ) {
          const id =
            getKickVideoId(
              video
            );

          if (!id) {
            continue;
          }

          const score =
            getKickMatchScore(
              market,
              video
            );

          if (
            score === null
          ) {
            continue;
          }

          const url =
            getKickVideoUrl(
              video,
              channel,
              id
            );

          if (
            isKickChannelUrl(
              url
            )
          ) {
            continue;
          }

          const candidate = {
            id,
            score,
            url,
            title:
              getKickVideoTitle(
                video
              ),
          };

          if (
            !best ||
            candidate.score <
              best.score
          ) {
            best =
              candidate;
          }
        }

        if (!best) {
          console.warn(
            "Kick proof: matching VOD not found",
            {
              marketId:
                market.market_id,

              channel,

              openedAt:
                market.opened_at,

              closedAt:
                market.closed_at,

              resolvedAt:
                market.resolved_at,

              marketTitle:
                getMarketStreamTitle(
                  market
                ),
            }
          );

          return;
        }

        market.resolution_proof_url =
          best.url;

        if (
          !market.stream_url
        ) {
          market.stream_url =
            `https://kick.com/${encodeURIComponent(
              channel
            )}`;
        }

        if (
          !market.stream_embed_url
        ) {
          market.stream_embed_url =
            `https://player.kick.com/${encodeURIComponent(
              channel
            )}`;
        }

        console.log(
          "Kick proof resolved:",
          {
            marketId:
              market.market_id,

            channel,

            stream:
              market.stream_url,

            vod:
              best.url,

            title:
              best.title,

            score:
              best.score,
          }
        );
      }
    )
  );
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

  const market =
    stream.market;

  if (
    !market?.marketId
  ) {
    return;
  }

  const marketId =
    String(
      market.marketId
    );

  const pools =
    getPools(
      market
    );

  const incomingTrades =
    getTradeCount(
      market
    );

  const status =
    String(
      market.status ??
      "unknown"
    );

  const winner =
    getWinningOptionId(
      market
    );

  const now =
    new Date().toISOString();

  const openedAt =
    getOpenedAt(
      market,
      now
    );

  const resolved =
    isResolvedStatus(
      status
    );

  const resolvedAt =
    resolved
      ? (
          toIso(
            market.resolvedAt
          ) ??
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
          ? JSON.stringify(
              pools
            )
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

    ON CONFLICT (
      market_id
    )

    DO UPDATE SET

      title =
        COALESCE(
          EXCLUDED.title,
          markets.title
        ),

      /*
       * Once a market is resolved, never let a later
       * incomplete/active snapshot turn it back into a live row.
       */
      status =
        CASE
          WHEN LOWER(
            COALESCE(
              markets.status,
              ''
            )
          ) IN (
            'resolved',
            'cancelled',
            'canceled',
            'settled',
            'complete',
            'completed',
            'finalized'
          )
          THEN markets.status
          ELSE EXCLUDED.status
        END,

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

      /*
       * NEVER allow a later incomplete snapshot
       * to reduce the stored trade count.
       */
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

      /*
       * Keep original opening timestamp.
       */
      first_seen_at =
        COALESCE(
          markets.first_seen_at,
          EXCLUDED.first_seen_at
        ),

      /*
       * Always move last_seen forward.
       */
      last_seen_at =
        EXCLUDED.last_seen_at,

      /*
       * Once resolved, NEVER erase resolved_at.
       */
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
            'canceled',
            'settled',
            'complete',
            'completed',
            'finalized'
          )
          THEN COALESCE(
            markets.resolved_at,
            EXCLUDED.resolved_at
          )

          ELSE markets.resolved_at
        END,

      /*
       * Keep latest raw snapshot.
       */
      raw_data =
        EXCLUDED.raw_data
  `;

  /*
   * IMPORTANT: resolved history is copied into the permanent
   * archive immediately. A later active snapshot can never remove it.
   */
  if (resolved) {
    await archiveResolvedMarket({
      market_id: marketId,
      title: market.title ?? null,
      status,
      winning_option_id: winner,
      current_pools_usdc: pools,
      total_trades: incomingTrades,
      stream_id: stream.id ?? null,
      stream_title: stream.title ?? null,
      host_name: stream.hostName ?? null,
      viewer_count: asNumber(stream.viewerCount),
      first_seen_at: openedAt,
      last_seen_at: now,
      resolved_at: resolvedAt,
      raw_data: stream,
    });
  }
}

/* =========================================================
   DB NORMALIZATION
========================================================= */

function normalizeDbMarket(
  row: Record<string, any>
) {
  const raw =
    parseJson(
      row.raw_data
    ) ?? {};

  const rawMarket =
    raw?.market ??
    {};

  const syntheticMarket:
    ConvexMarket = {
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
    };

  const pools =
    getPools(
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
          baseUnitsToUsd(
            pools[0]
          ),
          baseUnitsToUsd(
            pools[1]
          ),
        ]
      : null;

  const playback =
    getPlayback({
      ...raw,

      raw_data:
        raw,

      rawData:
        raw,

      hostName:
        row.host_name ??
        raw?.hostName,

      host_name:
        row.host_name ??
        raw?.host_name,

      stream_url:
        raw?.stream_url,

      streamUrl:
        raw?.streamUrl,
    });

  const kickChannel =
    getKickChannel({
      ...raw,

      raw_data:
        raw,

      rawData:
        raw,

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
      buildMarketActivityUrl(
        row.market_id
      ),

    raw_data:
      raw,
  };
}

/* =========================================================
   PERMANENT RESOLVED HISTORY ARCHIVE

   `markets` is mutable live state. Resolved history is copied into
   this append-only archive so a later live snapshot can never make
   an already-resolved market disappear from history.
========================================================= */

async function ensureResolvedHistoryArchive() {
  if (!sql) {
    throw new Error(
      "DATABASE_URL / POSTGRES_URL is missing. Market history cannot be loaded."
    );
  }

  await sql`
    CREATE TABLE IF NOT EXISTS crsh_resolved_markets (
      market_id TEXT NOT NULL,
      title TEXT,
      status TEXT,
      winning_option_id INTEGER,
      current_pools_usdc JSONB,
      total_trades INTEGER,
      stream_id TEXT,
      stream_title TEXT,
      host_name TEXT,
      viewer_count INTEGER,
      first_seen_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      raw_data JSONB
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS
      crsh_resolved_markets_market_id_uidx
    ON crsh_resolved_markets (market_id)
  `;

  /*
   * One-time/self-healing migration:
   * anything that is already resolved in `markets` is copied into
   * the permanent archive. Existing archive rows are never deleted.
   */
  await sql`
    INSERT INTO crsh_resolved_markets (
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
      COALESCE(
        resolved_at,
        last_seen_at,
        first_seen_at,
        NOW()
      ),
      raw_data
    FROM markets
    WHERE
      LOWER(COALESCE(status, '')) IN (
        'resolved',
        'cancelled',
        'canceled',
        'settled',
        'complete',
        'completed',
        'finalized'
      )
      OR resolved_at IS NOT NULL
      OR LOWER(
        COALESCE(
          raw_data->'market'->>'status',
          raw_data->>'status',
          ''
        )
      ) IN (
        'resolved',
        'cancelled',
        'canceled',
        'settled',
        'complete',
        'completed',
        'finalized'
      )
    ON CONFLICT (market_id)
    DO UPDATE SET
      title = COALESCE(
        EXCLUDED.title,
        crsh_resolved_markets.title
      ),
      status = COALESCE(
        EXCLUDED.status,
        crsh_resolved_markets.status
      ),
      winning_option_id = COALESCE(
        EXCLUDED.winning_option_id,
        crsh_resolved_markets.winning_option_id
      ),
      current_pools_usdc = COALESCE(
        EXCLUDED.current_pools_usdc,
        crsh_resolved_markets.current_pools_usdc
      ),
      total_trades = GREATEST(
        COALESCE(crsh_resolved_markets.total_trades, 0),
        COALESCE(EXCLUDED.total_trades, 0)
      ),
      stream_id = COALESCE(
        EXCLUDED.stream_id,
        crsh_resolved_markets.stream_id
      ),
      stream_title = COALESCE(
        EXCLUDED.stream_title,
        crsh_resolved_markets.stream_title
      ),
      host_name = COALESCE(
        EXCLUDED.host_name,
        crsh_resolved_markets.host_name
      ),
      viewer_count = COALESCE(
        EXCLUDED.viewer_count,
        crsh_resolved_markets.viewer_count
      ),
      first_seen_at = COALESCE(
        crsh_resolved_markets.first_seen_at,
        EXCLUDED.first_seen_at
      ),
      last_seen_at = COALESCE(
        EXCLUDED.last_seen_at,
        crsh_resolved_markets.last_seen_at
      ),
      resolved_at = COALESCE(
        crsh_resolved_markets.resolved_at,
        EXCLUDED.resolved_at
      ),
      raw_data = COALESCE(
        EXCLUDED.raw_data,
        crsh_resolved_markets.raw_data
      )
  `;
}

async function archiveResolvedMarket(market: any) {
  if (!sql || !market?.market_id) {
    return;
  }

  await sql`
    INSERT INTO crsh_resolved_markets (
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
      ${String(market.market_id)},
      ${market.title ?? null},
      ${market.status ?? 'resolved'},
      ${market.winning_option_id ?? null},
      ${market.current_pools_usdc
        ? JSON.stringify(market.current_pools_usdc)
        : null}::jsonb,
      ${asTradeCount(market.total_trades)},
      ${market.stream_id ?? null},
      ${market.stream_title ?? null},
      ${market.host_name ?? null},
      ${asNumber(market.viewer_count)},
      ${market.first_seen_at ?? market.opened_at ?? null},
      ${market.last_seen_at ?? market.resolved_at ?? null},
      ${market.resolved_at ?? new Date().toISOString()},
      ${JSON.stringify(market.raw_data ?? {})}::jsonb
    )
    ON CONFLICT (market_id)
    DO UPDATE SET
      title = COALESCE(
        EXCLUDED.title,
        crsh_resolved_markets.title
      ),
      status = COALESCE(
        EXCLUDED.status,
        crsh_resolved_markets.status
      ),
      winning_option_id = COALESCE(
        EXCLUDED.winning_option_id,
        crsh_resolved_markets.winning_option_id
      ),
      current_pools_usdc = COALESCE(
        EXCLUDED.current_pools_usdc,
        crsh_resolved_markets.current_pools_usdc
      ),
      total_trades = GREATEST(
        COALESCE(crsh_resolved_markets.total_trades, 0),
        COALESCE(EXCLUDED.total_trades, 0)
      ),
      stream_id = COALESCE(
        EXCLUDED.stream_id,
        crsh_resolved_markets.stream_id
      ),
      stream_title = COALESCE(
        EXCLUDED.stream_title,
        crsh_resolved_markets.stream_title
      ),
      host_name = COALESCE(
        EXCLUDED.host_name,
        crsh_resolved_markets.host_name
      ),
      viewer_count = COALESCE(
        EXCLUDED.viewer_count,
        crsh_resolved_markets.viewer_count
      ),
      first_seen_at = COALESCE(
        crsh_resolved_markets.first_seen_at,
        EXCLUDED.first_seen_at
      ),
      last_seen_at = COALESCE(
        EXCLUDED.last_seen_at,
        EXCLUDED.resolved_at,
        crsh_resolved_markets.last_seen_at
      ),
      resolved_at = COALESCE(
        crsh_resolved_markets.resolved_at,
        EXCLUDED.resolved_at
      ),
      raw_data = COALESCE(
        EXCLUDED.raw_data,
        crsh_resolved_markets.raw_data
      )
  `;
}

/* =========================================================
   LOAD RESOLVED MARKETS
========================================================= */

async function getResolvedMarkets() {
  if (!sql) {
    throw new Error(
      "DATABASE_URL / POSTGRES_URL is missing. Market history cannot be loaded."
    );
  }

  await ensureResolvedHistoryArchive();

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
    FROM crsh_resolved_markets
    ORDER BY
      COALESCE(
        resolved_at,
        last_seen_at,
        first_seen_at
      ) DESC
  `;

  return rows.map(
    normalizeDbMarket
  );
}

/* =========================================================
   OPTIONAL CONVEX RESOLVED HISTORY

   Resolved markets can disappear from streams:getActive
   immediately after settlement. These queries are used only
   for persistence/history. The live UI still uses getActive.
========================================================= */

function extractStreamArray(
  payload: any
): ConvexStream[] {
  const candidates = [
    payload?.value?.resolvedStreams,
    payload?.value?.streams,
    payload?.value?.markets,
    payload?.value?.history,
    payload?.resolvedStreams,
    payload?.streams,
    payload?.markets,
    payload?.history,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate
      .map((item: any) => {
        if (item?.market?.marketId) {
          return {
            ...item,
            market: {
              ...item.market,
              status:
                item.market.status ??
                "resolved",
            },
          } as ConvexStream;
        }

        if (item?.marketId) {
          return {
            market: {
              ...item,
              status:
                item.status ??
                "resolved",
            },
          } as ConvexStream;
        }

        return null;
      })
      .filter(Boolean) as ConvexStream[];
  }

  return [];
}

async function getOptionalConvexResolvedStreams(): Promise<ConvexStream[]> {
  const paths = [
    "streams:getResolved",
    "streams:getResolvedMarkets",
    "streams:getHistory",
  ];

  for (const path of paths) {
    try {
      const response =
        await convexQuery(path);

      const streams =
        extractStreamArray(response);

      if (streams.length) {
        console.log(
          "CRSHMARKET: Convex resolved history loaded:",
          path,
          streams.length
        );

        return streams;
      }
    } catch (error) {
      console.warn(
        "CRSHMARKET: optional Convex history query unavailable:",
        path,
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  return [];
}

/* =========================================================
   LIVE STREAM NORMALIZATION
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
    getPools(
      market
    );

  const winner =
    getWinningOptionId(
      market
    );

  const expected =
    calculateExpectedWinnings(
      pools,
      winner
    );

  const poolUsd =
    pools
      ? [
          baseUnitsToUsd(
            pools[0]
          ),
          baseUnitsToUsd(
            pools[1]
          ),
        ]
      : null;

  const playback =
    getPlayback(
      stream
    );

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
        getTradeCount(
          market
        ),

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
   CONVEX RESOLVED MARKET NORMALIZATION
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
    getPools(
      market
    );

  const winner =
    getWinningOptionId(
      market
    );

  const tradeCount =
    getTradeCount(
      market
    );

  const poolUsd =
    pools
      ? [
          baseUnitsToUsd(
            pools[0]
          ),
          baseUnitsToUsd(
            pools[1]
          ),
        ]
      : null;

  /*
   * Use the real resolved timestamp whenever
   * Convex gives us one.
   */
  const resolvedNow =
    toIso(
      market.resolvedAt
    ) ??
    new Date().toISOString();

  const openedAt =
    getOpenedAt(
      market
    );

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
    getPlayback(
      stream
    );

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
      buildMarketActivityUrl(
        market.marketId
      ),

    raw_data:
      stream,
  };
}

/* =========================================================
   MAIN API
========================================================= */

export async function GET() {
  try {
    /*
     * Initialize and backfill the permanent resolved-history archive
     * before doing anything else. This is global DB state, not browser state.
     */
    if (sql) {
      await ensureResolvedHistoryArchive();
    }

    /*
     * Fail early in production if database
     * configuration is missing.
     */
    if (!sql) {
      console.error(
        "CRSHMARKET PRODUCTION ERROR: DATABASE_URL / POSTGRES_URL is missing."
      );
    }

    /*
     * Get currently active Convex streams.
     */
    const convex =
      await convexQuery(
        "streams:getActive"
      );

    const activeSourceStreams: ConvexStream[] =
      Array.isArray(
        convex?.value?.activeStreams
      )
        ? convex.value.activeStreams
        : [];

    /*
     * Resolved markets may disappear from getActive immediately.
     * Pull the optional history source as well, but never expose it
     * as a live market.
     */
    const optionalResolvedStreams =
      await getOptionalConvexResolvedStreams();

    const sourceStreams =
      activeSourceStreams;

    const allPersistenceStreams =
      new Map<string, ConvexStream>();

    for (const stream of [
      ...activeSourceStreams,
      ...optionalResolvedStreams,
    ]) {
      const id =
        stream?.market?.marketId;

      if (id !== null && id !== undefined) {
        allPersistenceStreams.set(
          String(id),
          stream
        );
      }
    }

    const persistenceStreams =
      Array.from(
        allPersistenceStreams.values()
      );

    /* -----------------------------------------
       Normalize live streams
    ----------------------------------------- */

    const activeStreams =
      sourceStreams.map(
        normalizeLiveStream
      );

    /* -----------------------------------------
       SAVE EVERY CURRENT SNAPSHOT

       This is what makes history persistent.
    ----------------------------------------- */

    if (sql) {
      await Promise.all(
        persistenceStreams.map(
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

    /* -----------------------------------------
       LOAD PERMANENT DB HISTORY
    ----------------------------------------- */

    let resolvedMarkets:
      any[] = [];

    resolvedMarkets =
      await getResolvedMarkets();

    /* -----------------------------------------
       FRESH RESOLVED MARKETS FROM CONVEX
       
       If Convex still includes a resolved
       market, merge it with DB.
    ----------------------------------------- */

    const resolvedCandidates =
      Array.from(
        new Map(
          [
            ...activeSourceStreams,
            ...optionalResolvedStreams,
          ]
            .filter(
              (stream) =>
                stream?.market?.marketId !==
                  null &&
                stream?.market?.marketId !==
                  undefined
            )
            .map((stream) => [
              String(
                stream.market!.marketId
              ),
              stream,
            ])
        ).values()
      );

    const convexResolved =
      resolvedCandidates
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
        .filter(
          Boolean
        );

    /* -----------------------------------------
       MERGE DB + CONVEX
    ----------------------------------------- */

    const historyMap =
      new Map<
        string,
        any
      >();

    /*
     * DB is the persistent source of truth.
     */
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
     * Fresh Convex data can update existing
     * history, but must NEVER destroy stored
     * values such as trade count/timestamps.
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
        historyMap.get(
          key
        );

      if (existing) {
        /*
         * NEVER decrease trade count.
         */
        market.total_trades =
          Math.max(
            asTradeCount(
              existing.total_trades
            ),
            asTradeCount(
              market.total_trades
            )
          );

        /*
         * Preserve stored pools if fresh
         * Convex snapshot doesn't have them.
         */
        if (
          !market.current_pools_usdc &&
          existing.current_pools_usdc
        ) {
          market.current_pools_usdc =
            existing.current_pools_usdc;
        }

        if (
          !market.current_pools_usd &&
          existing.current_pools_usd
        ) {
          market.current_pools_usd =
            existing.current_pools_usd;
        }

        if (
          market.expected_winnings ===
            null ||
          market.expected_winnings ===
            undefined
        ) {
          market.expected_winnings =
            existing.expected_winnings;
        }

        if (
          market.winning_option_id ===
            null ||
          market.winning_option_id ===
            undefined
        ) {
          market.winning_option_id =
            existing.winning_option_id;
        }

        if (
          !market.stream_url
        ) {
          market.stream_url =
            existing.stream_url;
        }

        if (
          !market.stream_embed_url
        ) {
          market.stream_embed_url =
            existing.stream_embed_url;
        }

        if (
          !market.resolution_proof_url
        ) {
          market.resolution_proof_url =
            existing.resolution_proof_url;
        }

        /*
         * Preserve all original timestamps.
         */
        market.opened_at =
          existing.opened_at ??
          market.opened_at;

        market.closed_at =
          existing.closed_at ??
          market.closed_at;

        market.recorded_at =
          existing.recorded_at ??
          market.recorded_at;

        market.credited_at =
          existing.credited_at ??
          market.credited_at;

        market.first_seen_at =
          existing.first_seen_at ??
          market.first_seen_at;

        market.last_seen_at =
          existing.last_seen_at ??
          market.last_seen_at;

        market.resolved_at =
          existing.resolved_at ??
          market.resolved_at;
      }

      historyMap.set(
        key,
        market
      );
    }

    resolvedMarkets =
      Array.from(
        historyMap.values()
      );

    /* -----------------------------------------
       KICK VOD RESOLUTION
    ----------------------------------------- */

    await resolveKickProofs(
      resolvedMarkets
    );

    /* -----------------------------------------
       Persist any proof updates
       
       This makes VOD proof survive refreshes
       instead of only existing in memory.
    ----------------------------------------- */

    if (sql) {
      await Promise.all(
        resolvedMarkets.map(
          async (
            market
          ) => {
            if (
              !market?.market_id
            ) {
              return;
            }

            try {
              const proof =
                market.resolution_proof_url ??
                null;

              const streamUrl =
                market.stream_url ??
                null;

              const embedUrl =
                market.stream_embed_url ??
                null;

              await sql`
                UPDATE markets
                SET
                  raw_data =
                    CASE
                      WHEN raw_data IS NULL
                      THEN ${JSON.stringify(
                        market.raw_data ??
                          {}
                      )}::jsonb

                      ELSE raw_data
                    END
                WHERE market_id =
                  ${String(
                    market.market_id
                  )}
              `;

              try {
                await sql`
                  UPDATE crsh_resolved_markets
                  SET raw_data =
                    CASE
                      WHEN raw_data IS NULL
                      THEN ${JSON.stringify(
                        market.raw_data ?? {}
                      )}::jsonb
                      ELSE raw_data
                    END
                  WHERE market_id =
                    ${String(
                      market.market_id
                    )}
                `;
              } catch (archiveRawError) {
                console.warn(
                  "Could not persist resolved archive raw_data:",
                  archiveRawError
                );
              }

              /*
               * Only update proof columns if those
               * columns exist in the user's schema.
               *
               * The main raw_data remains untouched.
               */
              if (
                proof ||
                streamUrl ||
                embedUrl
              ) {
                try {
                  await sql`
                    UPDATE markets
                    SET
                      raw_data =
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              COALESCE(
                                raw_data,
                                '{}'::jsonb
                              ),
                              '{_crshmarket_stream_url}',
                              ${JSON.stringify(
                                streamUrl
                              )}::jsonb,
                              true
                            ),
                            '{_crshmarket_stream_embed_url}',
                            ${JSON.stringify(
                              embedUrl
                            )}::jsonb,
                            true
                          ),
                          '{_crshmarket_resolution_proof_url}',
                          ${JSON.stringify(
                            proof
                          )}::jsonb,
                          true
                        )
                    WHERE market_id =
                      ${String(
                        market.market_id
                      )}
                  `;

                  try {
                    await sql`
                      UPDATE crsh_resolved_markets
                      SET
                        raw_data =
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                COALESCE(
                                  raw_data,
                                  '{}'::jsonb
                                ),
                                '{_crshmarket_stream_url}',
                                ${JSON.stringify(
                                  streamUrl
                                )}::jsonb,
                                true
                              ),
                              '{_crshmarket_stream_embed_url}',
                              ${JSON.stringify(
                                embedUrl
                              )}::jsonb,
                              true
                            ),
                            '{_crshmarket_resolution_proof_url}',
                            ${JSON.stringify(
                              proof
                            )}::jsonb,
                            true
                          )
                      WHERE market_id =
                        ${String(
                          market.market_id
                        )}
                    `;
                  } catch (archiveProofError) {
                    console.warn(
                      "Could not persist proof metadata to resolved archive:",
                      archiveProofError
                    );
                  }
                } catch (proofError) {
                  console.warn(
                    "Could not persist proof metadata:",
                    proofError
                  );
                }
              }
            } catch (error) {
              console.warn(
                "Resolved market persistence update failed:",
                market.market_id,
                error
              );
            }
          }
        )
      );
    }

    /* -----------------------------------------
       Sort history newest first
    ----------------------------------------- */

    resolvedMarkets =
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

          return (
            bTime -
            aTime
          );
        }
      );

    /* -----------------------------------------
       Final response
    ----------------------------------------- */

    return NextResponse.json(
      {
        status:
          "success",

        value: {
          activeStreams,
          resolvedMarkets,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
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
        status:
          "error",

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