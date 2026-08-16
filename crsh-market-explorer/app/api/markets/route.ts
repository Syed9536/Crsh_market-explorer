import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONVEX_URL =
  process.env.CONVEX_URL ??
  "https://impartial-newt-333.convex.cloud/api/query";

const DATABASE_URL = process.env.DATABASE_URL;

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
  const value = String(status ?? "").toLowerCase();

  return (
    value === "resolved" ||
    value === "cancelled" ||
    value === "canceled"
  );
}

function toIso(value: any): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
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

    if (
      Array.isArray(candidate) &&
      candidate.length >= 2
    ) {
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

      if (
        yes !== undefined &&
        no !== undefined
      ) {
        const yesRaw = normalizePoolRaw(yes);
        const noRaw = normalizePoolRaw(no);

        if (yesRaw > 0 || noRaw > 0) {
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

function normalizeWinner(value: any): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numeric = asNumber(value);

  if (
    numeric === 0 ||
    numeric === 1
  ) {
    return numeric;
  }

  const text = String(value)
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

  if (text.includes("yes")) {
    return 0;
  }

  if (text.includes("no")) {
    return 1;
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
    const normalized =
      normalizeWinner(candidate);

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

  for (const source of sources) {
    if (
      !source ||
      typeof source !== "object"
    ) {
      continue;
    }

    for (const key of numericKeys) {
      const count =
        asTradeCount(source[key]);

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
      best = Math.max(
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
    normalizeWinner(winningOptionId);

  if (
    winner !== 0 &&
    winner !== 1
  ) {
    return null;
  }

  const yesRaw =
    normalizePoolRaw(pools[0]);

  const noRaw =
    normalizePoolRaw(pools[1]);

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

  if (!Number.isFinite(payout)) {
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
      new URL(value.trim());

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
      text.startsWith("http://") ||
      text.startsWith("https://")
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

          return (
            playerParts[0]
              ? decodeURIComponent(
                  playerParts[0]
                )
              : null
          );
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
    // Continue as a slug.
  }

  text =
    text
      .replace(/^@/, "")
      .replace(/\s+/g, "")
      .replace(/\/+$/, "");

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
    // Direct URLs
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

    // Objects
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

    // Host name is the final fallback.
    stream?.hostName,
    stream?.host_name,
    raw?.hostName,
    raw?.host_name,
  ];

  for (const candidate of candidates) {
    const channel =
      cleanKickChannel(candidate);

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

  let originalUrl =
    findUrl(
      originalCandidates
    );

  let embedUrl =
    findUrl(
      embedCandidates
    );

  /*
   * IMPORTANT:
   *
   * If Convex did not give us a Kick URL,
   * reconstruct it from the Kick channel.
   */
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

  /*
   * Never use a live Kick channel as historical proof.
   * It must be replaced by a VOD.
   */
  if (
    isKickChannelUrl(originalUrl)
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
          Date.parse(resolved) -
          Date.parse(start)
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

  /*
   * YouTube timestamp support.
   */
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
        String(offsetSeconds)
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
  if (Array.isArray(payload)) {
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

  for (const value of candidates) {
    if (Array.isArray(value)) {
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
    getKickPagination(payload);

  const candidates = [
    pagination?.next_cursor,
    pagination?.nextCursor,
    pagination?.next,
    pagination?.cursor,
  ];

  for (const value of candidates) {
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

  for (const value of candidates) {
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

  for (const value of explicitCandidates) {
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

  /*
   * Current normal Kick VOD URL.
   *
   * Example:
   * https://kick.com/channel/videos/uuid
   */
  return (
    `https://kick.com/${encodeURIComponent(
      channel
    )}/videos/${encodeURIComponent(id)}`
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

  return Date.parse(iso);
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

  /*
   * Kick has historically returned duration
   * in milliseconds.
   */
  return n < 100000
    ? n * 1000
    : n;
}

function normalizeText(
  value: any
): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
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
          (word) =>
            word.length >= 3
        )
    );

  const bWords =
    new Set(
      second
        .split(/\s+/)
        .filter(
          (word) =>
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

  for (const word of aWords) {
    if (bWords.has(word)) {
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

  const cursors = new Set<string>();
  let cursor = "0";

  for (let page = 0; page < 12; page++) {
    const url =
      `${KICK_API_BASE}/api/v2/channels/${encodeURIComponent(
        channel
      )}/videos?cursor=${encodeURIComponent(
        cursor
      )}&sort=date&time=all`;

    try {
      const response = await fetch(url, {
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
          AbortSignal.timeout(10000),
      });

      if (!response.ok) {
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
        getKickVideoArray(payload);

      if (!videos.length) {
        break;
      }

      allVideos.push(
        ...videos
      );

      /*
       * Kick has returned both array-style and
       * paginated responses at different times.
       */
      const nextCursor =
        getNextKickCursor(payload);

      if (
        !nextCursor ||
        nextCursor === cursor ||
        cursors.has(nextCursor)
      ) {
        break;
      }

      cursors.add(cursor);

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

  /*
   * Remove duplicate VODs.
   */
  const unique =
    new Map<string, any>();

  for (const video of allVideos) {
    const id =
      getKickVideoId(video);

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
    raw?.livestream?.session_title ??
    raw?.livestream?.sessionTitle ??
    raw?.livestream?.title ??
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
    getKickVideoDurationMs(video);

  const videoStart =
    createdMs;

  const videoEnd =
    durationMs > 0
      ? createdMs + durationMs
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

  /*
   * If market timestamps overlap the VOD,
   * this is by far the strongest match.
   */
  if (
    targetStart &&
    targetEnd &&
    videoStart <= targetEnd &&
    videoEnd >= targetStart
  ) {
    timeDistance = 0;
  } else {
    const distances: number[] = [];

    if (targetStart) {
      distances.push(
        Math.abs(
          targetStart -
          videoStart
        )
      );

      if (durationMs > 0) {
        distances.push(
          Math.abs(
            targetStart -
            videoEnd
          )
        );
      }
    }

    if (targetEnd) {
      distances.push(
        Math.abs(
          targetEnd -
          videoStart
        )
      );

      if (durationMs > 0) {
        distances.push(
          Math.abs(
            targetEnd -
            videoEnd
          )
        );
      }
    }

    if (distances.length) {
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

  /*
   * If we have no market time at all,
   * title matching can still find the VOD.
   */
  if (
    timeDistance ===
    Number.MAX_SAFE_INTEGER
  ) {
    if (similarity <= 0) {
      return null;
    }

    return (
      10_000_000 -
      similarity * 1_000_000
    );
  }

  /*
   * Six-hour tolerance.
   */
  const MAX_DISTANCE =
    6 * 60 * 60 * 1000;

  if (
    timeDistance >
    MAX_DISTANCE &&
    similarity < 0.55
  ) {
    return null;
  }

  /*
   * Time is primary.
   * Title similarity is a meaningful bonus.
   */
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
      channelCache.get(key);

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
      async (market) => {
        const raw =
          getMarketRaw(
            market
          );

        /*
         * Keep an already-valid non-Kick proof.
         */
        if (
          market.resolution_proof_url &&
          !isKickChannelUrl(
            market.resolution_proof_url
          )
        ) {
          /*
           * If this is a YouTube or other real
           * recording, don't overwrite it.
           */
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

        if (!videos.length) {
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
        } | null = null;

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

          /*
           * Never accept a channel URL as proof.
           */
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

        /*
         * REAL KICK VOD
         */
        market.resolution_proof_url =
          best.url;

        /*
         * REAL KICK LIVE CHANNEL
         */
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
    return;
  }

  const market =
    stream.market;

  if (!market?.marketId) {
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

  const now =
    new Date().toISOString();

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
      ${getWinningOptionId(market)},
      ${
        pools
          ? JSON.stringify(pools)
          : null
      }::jsonb,
      ${incomingTrades},
      ${stream.id ?? null},
      ${stream.title ?? null},
      ${stream.hostName ?? null},
      ${asNumber(stream.viewerCount)},
      ${now},
      ${now},
      ${
        isResolvedStatus(status)
          ? now
          : null
      },
      ${JSON.stringify(stream)}::jsonb
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
      buildResolutionProofUrl(
        finalStreamUrl,
        raw?.startedAt ??
          raw?.started_at ??
          openedAt,
        closedAt,
        getSpecificRecordingUrl(
          raw
        )
      ),

    raw_data:
      raw,
  };
}

/* =========================================================
   LOAD RESOLVED MARKETS
========================================================= */

async function getResolvedMarkets() {
  if (!sql) {
    return [];
  }

  try {
    const rows =
      await sql`
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
  } catch (error) {
    console.error(
      "Market history DB load failed:",
      error
    );

    return [];
  }
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
   MAIN API
========================================================= */

export async function GET() {
  try {
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

    /* -----------------------------------------
       Normalize live streams
    ----------------------------------------- */

    const activeStreams =
      sourceStreams.map(
        normalizeLiveStream
      );

    /* -----------------------------------------
       Save snapshots
    ----------------------------------------- */

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

    /* -----------------------------------------
       Load DB history
    ----------------------------------------- */

    let resolvedMarkets: any[] =
      [];

    try {
      resolvedMarkets =
        await getResolvedMarkets();
    } catch (error) {
      console.error(
        "Resolved market history load failed:",
        error
      );
    }

    /* -----------------------------------------
       Fresh resolved markets from Convex
    ----------------------------------------- */

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
          (
            stream: ConvexStream
          ) => {
            const market =
              stream.market!;

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

            const resolvedNow =
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
                buildResolutionProofUrl(
                  playback.originalUrl,
                  stream.startedAt ??
                    openedAt,
                  closedAt,
                  getSpecificRecordingUrl(
                    stream
                  )
                ),

              raw_data:
                stream,
            };
          }
        );

    /* -----------------------------------------
       Merge DB + Convex
    ----------------------------------------- */

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

    for (
      const market of convexResolved
    ) {
      const key =
        String(
          market.market_id
        );

      const existing =
        historyMap.get(
          key
        );

      if (existing) {
        market.total_trades =
          Math.max(
            asTradeCount(
              existing.total_trades
            ),
            asTradeCount(
              market.total_trades
            )
          );

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
       Sort history
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
        status:
          500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}