


import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONVEX_URL =
  process.env.CONVEX_URL ??
  "https://impartial-newt-333.convex.cloud/api/query";

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

type AnyRecord = Record<string, any>;

type ConvexMarket = {
  marketId?: string;
  title?: string;
  status?: string;
  winningOptionId?: number | string | null;

  currentPoolsUsdc?: any[];
  currentPools?: any[];
  finalPoolsUsdc?: any[];
  finalPools?: any[];

  totalTrades?: number | string | null;
  totalTradeCount?: number | string | null;
  tradeCount?: number | string | null;
  totalTradesCount?: number | string | null;
  tradesCount?: number | string | null;
  numberOfTrades?: number | string | null;
  numTrades?: number | string | null;

  recentTradeProfiles?: any[];
  recentTrades?: any[];
  trades?: any[];
  tradeHistory?: any[];
  bets?: any[];
  transactions?: any[];

  stats?: any;
  statistics?: any;
  metrics?: any;
  marketStats?: any;

  createdAt?: number | string;
  lockTime?: number | string;
  countdownStartedAtMs?: number | string;
  countdownEndsAtMs?: number | string;
  bettingClosedAtMs?: number | string;
  bettingCloseRequestedAtMs?: number | string;

  [key: string]: any;
};

type ConvexStream = {
  id?: string;
  title?: string;
  hostName?: string;
  viewerCount?: number | string;

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
};

function asNumber(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function asTradeCount(value: any): number {
  const number = asNumber(value);

  if (
    number === null ||
    number < 0
  ) {
    return 0;
  }

  return Math.floor(number);
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

function getPools(
  market?: ConvexMarket | null
) {
  if (!market) {
    return null;
  }

  const candidates = [
    market.finalPoolsUsdc,
    market.finalPools,
    market.currentPoolsUsdc,
    market.currentPools,
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length >= 2
    ) {
      const yes = asNumber(candidate[0]);
      const no = asNumber(candidate[1]);

      if (
        yes !== null &&
        no !== null
      ) {
        return [
          String(candidate[0]),
          String(candidate[1]),
        ];
      }
    }
  }

  return null;
}

/*
 * CRSH can expose the trade count in different places.
 *
 * We first prefer explicit numeric count fields.
 * If those are zero/missing, we fall back to the
 * actual trade/bet/profile arrays that are present.
 *
 * IMPORTANT:
 * We never replace a previously stored higher DB count
 * with a later zero from Convex.
 */
function getTradeCount(
  market?: ConvexMarket | null,
  stream?: ConvexStream | null
): number {
  if (!market) {
    return 0;
  }

  const roots: any[] = [
    market,
    stream,
    market.stats,
    market.statistics,
    market.metrics,
    market.marketStats,
    market.market,
    market.rawData,
    market.rawData?.market,
    stream?.stats,
    stream?.statistics,
    stream?.metrics,
  ];

  const numericKeys = new Set([
    "totalTrades",
    "totalTradeCount",
    "totalTradesCount",
    "tradeCount",
    "tradesCount",
    "numberOfTrades",
    "numTrades",
    "totalBets",
    "total_bets",
    "betCount",
    "bet_count",
    "betsCount",
    "bets_count",
    "tradeTotal",
    "trade_total",
  ]);

  const arrayKeys = new Set([
    "trades",
    "tradeHistory",
    "recentTrades",
    "recentTradeProfiles",
    "bets",
    "transactions",
  ]);

  let best = 0;
  const visited = new Set<any>();

  function walk(
    value: any,
    depth = 0
  ) {
    if (
      value === null ||
      value === undefined ||
      depth > 5
    ) {
      return;
    }

    if (
      typeof value !== "object" ||
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      if (value.length > 0) {
        best = Math.max(
          best,
          value.length
        );
      }

      for (const item of value.slice(0, 50)) {
        walk(item, depth + 1);
      }

      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        numericKeys.has(key) ||
        /(?:^|_)(?:total)?(?:trades?|bets?)(?:count|total)?$/i.test(
          key
        )
      ) {
        const count =
          asTradeCount(child);

        best = Math.max(
          best,
          count
        );
      }

      if (
        arrayKeys.has(key) ||
        /(?:trades?|bets?|transactions?)/i.test(
          key
        )
      ) {
        if (Array.isArray(child)) {
          best = Math.max(
            best,
            child.length
          );
        } else if (
          child &&
          typeof child === "object"
        ) {
          best = Math.max(
            best,
            Object.keys(child).length
          );
        }
      }

      if (
        child &&
        typeof child === "object"
      ) {
        walk(
          child,
          depth + 1
        );
      }
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return best;
}

/*
 * Expected winnings for a hypothetical $10 position.
 *
 * Pools are stored in USDC base units:
 * 10,000,000 = $10.
 *
 * The returned value is NORMAL USD DOLLARS, not base units.
 */
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
    asNumber(winningOptionId);

  if (
    winner !== 0 &&
    winner !== 1
  ) {
    return null;
  }

  const yesRaw =
    asNumber(pools[0]) ?? 0;

  const noRaw =
    asNumber(pools[1]) ?? 0;

  if (
    yesRaw <= 0 ||
    noRaw <= 0
  ) {
    return null;
  }

  const total =
    yesRaw + noRaw;

  if (total <= 0) {
    return null;
  }

  const winningPool =
    winner === 0
      ? yesRaw
      : noRaw;

  if (winningPool <= 0) {
    return null;
  }

  const probability =
    winningPool / total;

  if (
    probability <= 0 ||
    probability > 1
  ) {
    return null;
  }

  return Number(
    (10 / probability).toFixed(2)
  );
}

function getHistoryValue(
  market: any,
  keys: string[]
) {
  const raw =
    parseJson(
      market?.raw_data
    ) ?? {};

  const rawMarket =
    raw?.market ?? {};

  const sources = [
    rawMarket?.history,
    raw?.history,
    rawMarket?.settlement,
    rawMarket?.resolution,
    rawMarket?.timestamps,
    rawMarket,
    raw,
    market,
  ];

  function readPath(
    source: any,
    path: string
  ) {
    if (!source) {
      return null;
    }

    const parts =
      path.split(".");

    let current =
      source;

    for (
      const part of parts
    ) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== "object"
      ) {
        return null;
      }

      current =
        current[part];
    }

    return current ??
      null;
  }

  for (
    const source of sources
  ) {
    for (
      const key of keys
    ) {
      const value =
        readPath(
          source,
          key
        );

      if (
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        return value;
      }
    }
  }

  return null;
}

function getCreditedAt(
  market: any
): string | null {
  const credited =
    getHistoryValue(
      market,
      [
        "creditedAt",
        "credited_at",
        "creditTime",
        "credit_time",
        "settledAt",
        "settled_at",
        "settlementAt",
        "settlement_at",
      ]
    );

  if (credited) {
    return String(credited);
  }

  /*
   * The current Convex payload shown in the attached data
   * does not expose a separate credited timestamp.
   *
   * For the explorer we therefore use the resolution /
   * settlement moment as the credit timestamp fallback,
   * so the UI does not incorrectly show "Unavailable".
   */
  const resolved =
    market?.resolved_at ??
    getHistoryValue(
      market,
      [
        "resolvedAt",
        "resolved_at",
        "resolutionRecordedAt",
        "resolution_recorded_at",
      ]
    );

  return resolved
    ? String(resolved)
    : null;
}

function normalizeDbMarket(
  row: DatabaseMarket
) {
  const raw =
    parseJson(
      row.raw_data
    ) ?? {};

  const rawMarket =
    raw?.market ?? {};

  const pools =
    parseJson(
      row.current_pools_usdc
    ) ??
    rawMarket.finalPoolsUsdc ??
    rawMarket.finalPools ??
    rawMarket.currentPoolsUsdc ??
    rawMarket.currentPools ??
    null;

  const dbTrades =
    asTradeCount(
      row.total_trades
    );

  const rawTrades =
    getTradeCount(
      rawMarket,
      raw
    );

  const totalTrades =
    Math.max(
      dbTrades,
      rawTrades
    );

  const winningOptionId =
    row.winning_option_id ??
    rawMarket.winningOptionId ??
    null;

  const expectedWinnings =
    calculateExpectedWinnings(
      pools,
      winningOptionId
    );

  const resolvedAt =
    row.resolved_at ??
    null;

  const normalized = {
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

    total_trades:
      totalTrades,

    stream_id:
      row.stream_id ??
      raw.id ??
      undefined,

    stream_title:
      row.stream_title ??
      raw.title ??
      undefined,

    host_name:
      row.host_name ??
      raw.hostName ??
      undefined,

    viewer_count:
      row.viewer_count ??
      raw.viewerCount ??
      0,

    first_seen_at:
      row.first_seen_at ??
      undefined,

    last_seen_at:
      row.last_seen_at ??
      undefined,

    resolved_at:
      resolvedAt,

    credited_at:
      getCreditedAt({
        raw_data: raw,
        resolved_at: resolvedAt,
      }),

    /*
     * IMPORTANT:
     * This is normal USD, so the frontend must NOT
     * divide it by 1,000,000 again.
     */
    expected_winnings:
      expectedWinnings,

    expected_winnings_usd:
      expectedWinnings,

    raw_data:
      raw,
  };

  return normalized;
}

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

  if (!response.ok) {
    throw new Error(
      `Convex returned ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    data?.status &&
    data.status !== "success"
  ) {
    throw new Error(
      "Convex query failed"
    );
  }

  return data;
}

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
    getPools(market);

  const incomingTrades =
    getTradeCount(
      market,
      stream
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
      ${asNumber(
        market.winningOptionId
      )},
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
      ${now},
      ${now},
      ${
        status === "resolved" ||
        status === "cancelled" ||
        status === "canceled"
          ? now
          : null
      },
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

      /*
       * Never downgrade an already known count.
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

      last_seen_at =
        EXCLUDED.last_seen_at,

      resolved_at =
        CASE
          WHEN EXCLUDED.status IN (
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

async function getResolvedMarkets() {
  if (!sql) {
    return [];
  }

  const rows =
    await sql<DatabaseMarket[]>`
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
        COALESCE(status, '')
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

export async function GET() {
  try {
    const convex =
      await convexQuery(
        "streams:getActive"
      );

    const activeStreams =
      Array.isArray(
        convex?.value?.activeStreams
      )
        ? convex.value.activeStreams
        : [];

    /*
     * Persist the latest snapshot before loading history.
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
                stream.market
                  ?.marketId,
                error
              );
            }
          }
        )
      );
    }

    let resolvedMarkets =
      await getResolvedMarkets();

    /*
     * Some markets are returned by Convex as resolved
     * during the transition before the DB history query
     * has a fresh row. Merge those immediately.
     */
    const convexResolved =
      activeStreams
        .filter(
          (
            stream: ConvexStream
          ) => {
            const status =
              String(
                stream.market
                  ?.status ?? ""
              ).toLowerCase();

            return (
              status === "resolved" ||
              status === "cancelled" ||
              status === "canceled"
            );
          }
        )
        .map(
          (
            stream: ConvexStream
          ) => {
            const market =
              stream.market!;

            const pools =
              getPools(market);

            const totalTrades =
              getTradeCount(
                market,
                stream
              );

            const resolvedAt =
              new Date().toISOString();

            const expectedWinnings =
              calculateExpectedWinnings(
                pools,
                market.winningOptionId
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
                asNumber(
                  market.winningOptionId
                ),

              current_pools_usdc:
                pools,

              total_trades:
                totalTrades,

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
                undefined,

              last_seen_at:
                resolvedAt,

              resolved_at:
                resolvedAt,

              credited_at:
                getCreditedAt({
                  raw_data: stream,
                  resolved_at:
                    resolvedAt,
                }),

              expected_winnings:
                expectedWinnings,

              expected_winnings_usd:
                expectedWinnings,

              raw_data:
                stream,
            };
          }
        );

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
        /*
         * Preserve the highest trade count.
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
         * Preserve historical pools if the transition
         * snapshot does not include them.
         */
        if (
          !market.current_pools_usdc &&
          existing.current_pools_usdc
        ) {
          market.current_pools_usdc =
            existing.current_pools_usdc;
        }

        /*
         * Recalculate expected winnings after pools
         * have been merged.
         */
        const mergedExpected =
          calculateExpectedWinnings(
            market.current_pools_usdc,
            market.winning_option_id
          );

        if (
          mergedExpected !== null
        ) {
          market.expected_winnings =
            mergedExpected;

          market.expected_winnings_usd =
            mergedExpected;
        } else if (
          existing.expected_winnings !==
          null &&
          existing.expected_winnings !==
          undefined
        ) {
          market.expected_winnings =
            Number(
              existing.expected_winnings
            );

          market.expected_winnings_usd =
            Number(
              existing.expected_winnings
            );
        }

        /*
         * Preserve historical timestamps.
         */
        market.first_seen_at =
          existing.first_seen_at ??
          market.first_seen_at;

        market.last_seen_at =
          existing.last_seen_at ??
          market.last_seen_at;

        market.resolved_at =
          existing.resolved_at ??
          market.resolved_at;

        market.credited_at =
          existing.credited_at ??
          market.credited_at;
      }

      historyMap.set(
        key,
        market
      );
    }

    resolvedMarkets =
      Array.from(
        historyMap.values()
      ).sort(
        (
          a,
          b
        ) => {
          const aTime =
            Date.parse(
              a.resolved_at ??
                a.last_seen_at ??
                ""
            ) || 0;

          const bTime =
            Date.parse(
              b.resolved_at ??
                b.last_seen_at ??
                ""
            ) || 0;

          return (
            bTime -
            aTime
          );
        }
      );

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
            "no-store, no-cache, must-revalidate",
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