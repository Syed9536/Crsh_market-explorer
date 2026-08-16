"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Market = {
  market_id: string;
  title?: string;
  status?: string;

  winning_option_id?: number | null;

  current_pools_usdc?: any;
  current_pools_usd?: number[] | null;

  yes_pool_usd?: number | null;
  no_pool_usd?: number | null;

  total_trades?: number;
  viewer_count?: number;

  stream_id?: string;
  stream_title?: string;
  host_name?: string;

  opened_at?: string | null;
  closed_at?: string | null;
  recorded_at?: string | null;
  credited_at?: string | null;

  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;

  expected_winnings?: number | null;

  raw_data?: any;

  stream_url?: string | null;
  stream_embed_url?: string | null;
  resolution_proof_url?: string | null;
};

type LiveStream = {
  id?: string;
  title?: string;
  hostName?: string;
  viewerCount?: number;

  stream_url?: string | null;
  stream_embed_url?: string | null;
  resolution_proof_url?: string | null;

  market?: {
    marketId?: string;
    title?: string;
    status?: string;

    winningOptionId?: number | null;

    currentPoolsUsdc?: any;
    currentPoolsUsd?: number[] | null;

    yesPoolUsd?: number | null;
    noPoolUsd?: number | null;

    totalTrades?: number;

    expectedWinnings?: number | null;

    [key: string]: any;
  };
};

type ApiResponse = {
  status: string;

  value: {
    activeStreams: LiveStream[];
    resolvedMarkets: Market[];
  };
};

const REFRESH_MS = 2000;

const usdFormatter = new Intl.NumberFormat(
  "en-US",
  {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
);

function formatUsd(
  value: any
): string {
  const n = Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return "$0.00";
  }

  return usdFormatter.format(n);
}

function formatDate(
  value?: string | null
): string {
  if (!value) {
    return "Unavailable";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unavailable";
  }

  return date.toLocaleString(
    "en-US",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  );
}

function normalizeStatus(
  status?: string
): string {
  return String(
    status ?? ""
  ).toLowerCase();
}

function isResolved(
  status?: string
): boolean {
  const value =
    normalizeStatus(status);

  return (
    value === "resolved" ||
    value === "cancelled" ||
    value === "canceled"
  );
}

function getWinnerLabel(
  winner?: number | null
): string {
  if (winner === 0) {
    return "YES";
  }

  if (winner === 1) {
    return "NO";
  }

  return "N/A";
}

function getPool(
  market: Market,
  side: 0 | 1
): number {
  if (
    side === 0 &&
    market.yes_pool_usd !==
      null &&
    market.yes_pool_usd !==
      undefined
  ) {
    return Number(
      market.yes_pool_usd
    );
  }

  if (
    side === 1 &&
    market.no_pool_usd !==
      null &&
    market.no_pool_usd !==
      undefined
  ) {
    return Number(
      market.no_pool_usd
    );
  }

  if (
    Array.isArray(
      market.current_pools_usd
    )
  ) {
    return Number(
      market.current_pools_usd[
        side
      ] ?? 0
    );
  }

  return 0;
}

function getLivePool(
  stream: LiveStream,
  side: 0 | 1
): number {
  const market =
    stream.market;

  if (!market) {
    return 0;
  }

  if (
    side === 0 &&
    market.yesPoolUsd !==
      null &&
    market.yesPoolUsd !==
      undefined
  ) {
    return Number(
      market.yesPoolUsd
    );
  }

  if (
    side === 1 &&
    market.noPoolUsd !==
      null &&
    market.noPoolUsd !==
      undefined
  ) {
    return Number(
      market.noPoolUsd
    );
  }

  if (
    Array.isArray(
      market.currentPoolsUsd
    )
  ) {
    return Number(
      market.currentPoolsUsd[
        side
      ] ?? 0
    );
  }

  return 0;
}

function getPlaybackUrl(
  stream: any,
  kind: "originalUrl" | "embedUrl"
): string | null {
  const direct =
    stream?.[kind] ??
    stream?.recastPlayback?.[kind] ??
    stream?.raw_data?.[kind] ??
    stream?.raw_data?.recastPlayback?.[kind];

  return typeof direct === "string" && direct.trim()
    ? direct.trim()
    : null;
}

function getStreamUrl(
  stream: LiveStream | Market
): string | null {
  const direct =
    (stream as any).stream_url ??
    (stream as any).streamUrl;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  return getPlaybackUrl(
    stream,
    "originalUrl"
  );
}

function getResolutionProofUrl(
  market: Market
): string | null {
  const marketId =
    String(
      market.market_id ??
      ""
    ).trim();

  if (!marketId) {
    return null;
  }

  return (
    `https://app.crshmarket.com/market-activity?market=${encodeURIComponent(
      marketId
    )}`
  );
}

function calculateLivePercentage(
  yes: number,
  no: number
) {
  const total =
    yes + no;

  if (total <= 0) {
    return {
      yes: 50,
      no: 50,
    };
  }

  return {
    yes:
      (yes / total) * 100,
    no:
      (no / total) * 100,
  };
}

export default function HomePage() {
  const [
    data,
    setData,
  ] = useState<ApiResponse | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    activeTab,
    setActiveTab,
  ] = useState<
    "live" | "history"
  >("live");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    darkMode,
    setDarkMode,
  ] = useState(true);

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState<Date | null>(
    null
  );

  useEffect(() => {
    const saved =
      window.localStorage.getItem(
        "crsh-theme"
      );

    if (
      saved === "light"
    ) {
      setDarkMode(false);
    }

    if (
      saved === "dark"
    ) {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "crsh-theme",
      darkMode
        ? "dark"
        : "light"
    );
  }, [darkMode]);

  const fetchMarkets =
    useCallback(
      async (
        initial = false
      ) => {
        try {
          if (initial) {
            setLoading(true);
          }

          const response =
            await fetch(
              "/api/markets",
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  "Cache-Control":
                    "no-cache",
                },
              }
            );

          if (
            !response.ok
          ) {
            throw new Error(
              `API error ${response.status}`
            );
          }

          const json =
            (await response.json()) as ApiResponse;

          if (
            json.status !==
            "success"
          ) {
            throw new Error(
              "Market API failed"
            );
          }

          setData(json);
          setError(null);
          setLastUpdated(
            new Date()
          );
        } catch (
          err
        ) {
          console.error(err);

          setError(
            err instanceof Error
              ? err.message
              : "Failed to load markets"
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    fetchMarkets(true);

    const interval =
      window.setInterval(
        () => {
          fetchMarkets(false);
        },
        REFRESH_MS
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [fetchMarkets]);

  const activeStreams =
    data?.value
      ?.activeStreams ?? [];

  const resolvedMarkets =
    data?.value
      ?.resolvedMarkets ?? [];

  const filteredHistory =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      if (!q) {
        return resolvedMarkets;
      }

      return resolvedMarkets.filter(
        (market) => {
          return [
            market.market_id,
            market.title,
            market.stream_title,
            market.host_name,
            market.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q);
        }
      );
    },
    [
      resolvedMarkets,
      search,
    ]);

  const themeClass =
    darkMode
      ? "crsh-dark"
      : "crsh-light";

  return (
    <main
      className={`crsh-app ${themeClass}`}
    >
      <div className="crsh-shell">

        <header className="header">
          <div className="brand-wrap">
            <div className="brand-icon">
              C
            </div>

            <div>
              <div className="brand">
                CRSH
                <span>
                  MARKET
                </span>
              </div>

              <div className="brand-sub">
                MARKET EXPLORER
              </div>
            </div>
          </div>

          <div className="header-right">

            <button
              className="theme-toggle"
              onClick={() =>
                setDarkMode(
                  (value) =>
                    !value
                )
              }
              aria-label="Toggle theme"
            >
              <span
                className={
                  darkMode
                    ? "theme-icon active"
                    : "theme-icon"
                }
              >
                ☾
              </span>

              <span
                className={
                  !darkMode
                    ? "theme-icon active"
                    : "theme-icon"
                }
              >
                ☀
              </span>
            </button>

            <div className="live-status">
              <span className="green-dot" />
              Market data live
            </div>
          </div>
        </header>

        <div className="subtitle">
          Explore live prediction markets
          and browse complete market history.
        </div>

        <div className="divider" />

        <div className="tabs-row">
          <div className="tabs">

            <button
              className={
                activeTab === "live"
                  ? "tab active-green"
                  : "tab"
              }
              onClick={() =>
                setActiveTab(
                  "live"
                )
              }
            >
              Live Markets
            </button>

            <button
              className={
                activeTab === "history"
                  ? "tab active-purple"
                  : "tab"
              }
              onClick={() =>
                setActiveTab(
                  "history"
                )
              }
            >
              Market History
            </button>

          </div>

          <div className="update-text">
            {activeTab ===
            "live"
              ? `${activeStreams.length} active`
              : `${resolvedMarkets.length} historical`}

            <span>
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : "Updating..."}
            </span>
          </div>
        </div>

        {activeTab === "live" ? (
          <section>

            <div className="section-heading">
              <h1>
                Live Markets
              </h1>

              <p>
                Currently active prediction
                markets
              </p>
            </div>

            {loading &&
            !data ? (
              <div className="loading-card">
                <div className="spinner" />
                <span>
                  Loading live markets...
                </span>
              </div>
            ) : error ? (
              <div className="error-card">
                {error}
              </div>
            ) : activeStreams.length ===
              0 ? (
              <div className="empty-card">
                No active markets.
              </div>
            ) : (
              <div className="market-grid">
                {activeStreams.map(
                  (
                    stream,
                    index
                  ) => (
                    <LiveMarketCard
                      key={
                        stream.market
                          ?.marketId ??
                        stream.id ??
                        index
                      }
                      stream={
                        stream
                      }
                    />
                  )
                )}
              </div>
            )}

          </section>
        ) : (
          <section>

            <div className="section-heading">
              <h1>
                Market History
              </h1>

              <p>
                Opened, closed, recorded,
                credited and expected winnings
              </p>
            </div>

            <input
              className="search"
              placeholder="Search markets, IDs, games or hosts..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />

            {loading &&
            !data ? (
              <div className="loading-card">
                <div className="spinner" />
                <span>
                  Loading market history...
                </span>
              </div>
            ) : error ? (
              <div className="error-card">
                {error}
              </div>
            ) : filteredHistory.length ===
              0 ? (
              <div className="empty-card">
                No matching markets.
              </div>
            ) : (
              <div className="history-list">
                {filteredHistory.map(
                  (
                    market
                  ) => (
                    <HistoryCard
                      key={
                        market.market_id
                      }
                      market={
                        market
                      }
                    />
                  )
                )}
              </div>
            )}

          </section>
        )}

        <footer>
          <span>
            CRSHMARKET
          </span>

          <span>
            MARKET EXPLORER
          </span>
        </footer>

      </div>

      <style jsx global>{`

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          min-height: 100%;
        }

        body {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        input {
          font: inherit;
        }

        .crsh-app {
          min-height: 100vh;
          transition:
            background 180ms ease,
            color 180ms ease;
        }

        .crsh-dark {
          --bg: #000000;
          --panel: #07020d;
          --panel-2: #0b0312;
          --border: #24102e;
          --border-strong: #53106b;
          --text: #f5f3f7;
          --muted: #647084;
          --muted-2: #3d4657;
          --green: #00d866;
          --green-dark: #003e24;
          --purple: #9b19f5;
          --red: #ff4051;
          --input: #07000c;
        }

        .crsh-light {
          --bg: #f5f5f7;
          --panel: #ffffff;
          --panel-2: #fafafa;
          --border: #dedee5;
          --border-strong: #a52ce0;
          --text: #17131b;
          --muted: #697080;
          --muted-2: #9499a5;
          --green: #00b957;
          --green-dark: #dff9eb;
          --purple: #8d13db;
          --red: #e52c42;
          --input: #ffffff;
        }

        .crsh-app {
          background: var(--bg);
          color: var(--text);
        }

        .crsh-shell {
          width: min(
            1076px,
            calc(100% - 32px)
          );

          margin: 0 auto;
          padding-top: 58px;
          padding-bottom: 80px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand-wrap {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .brand-icon {
          width: 40px;
          height: 40px;
          border: 1px solid #7114a4;
          border-radius: 11px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #b32aff;
          font-weight: 800;
          font-size: 16px;

          background:
            rgba(
              104,
              12,
              156,
              0.12
            );
        }

        .brand {
          font-size: 21px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.4px;
        }

        .brand span {
          color: var(--purple);
        }

        .brand-sub {
          margin-top: 6px;
          color: var(--muted-2);
          font-size: 10px;
          letter-spacing: 1.6px;
          font-weight: 700;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .theme-toggle {
          height: 38px;
          padding: 4px;

          display: flex;
          align-items: center;
          gap: 2px;

          border-radius: 20px;
          border: 1px solid var(--border);

          background: var(--panel);

          cursor: pointer;
        }

        .theme-icon {
          width: 29px;
          height: 29px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          color: var(--muted);
          font-size: 13px;
        }

        .theme-icon.active {
          background: var(--panel-2);
          color: var(--purple);
        }

        .live-status {
          height: 36px;
          padding: 0 15px;

          display: flex;
          align-items: center;
          gap: 8px;

          border: 1px solid
            rgba(
              0,
              216,
              102,
              0.35
            );

          border-radius: 20px;

          color: var(--green);
          font-size: 11px;
          white-space: nowrap;
        }

        .green-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--green);
          box-shadow:
            0 0 8px
            rgba(
              0,
              216,
              102,
              0.65
            );
        }

        .subtitle {
          margin-top: 23px;
          color: var(--muted);
          font-size: 13px;
        }

        .divider {
          height: 1px;
          background: var(--border);
          margin-top: 31px;
          margin-bottom: 28px;
        }

        .tabs-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .tabs {
          display: flex;
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 4px;
          background: var(--panel);
        }

        .tab {
          border: 0;
          background: transparent;
          color: var(--muted);

          padding: 10px 18px;

          border-radius: 8px;

          cursor: pointer;

          font-size: 12px;
          font-weight: 700;

          transition: 150ms ease;
        }

        .tab:hover {
          color: var(--text);
        }

        .active-green {
          background: var(--green);
          color: #001b0d;
          box-shadow:
            0 0 18px
            rgba(
              0,
              216,
              102,
              0.16
            );
        }

        .active-purple {
          background: var(--purple);
          color: white;
          box-shadow:
            0 0 18px
            rgba(
              155,
              25,
              245,
              0.22
            );
        }

        .update-text {
          display: flex;
          align-items: center;
          gap: 12px;

          color: var(--muted);
          font-size: 10px;
        }

        .update-text span {
          color: var(--green);
        }

        .section-heading {
          margin-top: 29px;
          margin-bottom: 19px;
        }

        .section-heading h1 {
          margin: 0;
          font-size: 16px;
          letter-spacing: -0.2px;
        }

        .section-heading p {
          margin: 8px 0 0;
          color: var(--muted);
          font-size: 12px;
        }

        .market-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 14px;
        }

        .market-card {
          border: 1px solid
            rgba(
              154,
              17,
              96,
              0.8
            );

          border-radius: 14px;

          background:
            radial-gradient(
              circle at top left,
              rgba(
                99,
                0,
                130,
                0.08
              ),
              transparent 42%
            ),
            var(--panel);

          padding: 22px;
          min-width: 0;
        }

        .market-card:nth-child(3) {
          grid-column: 1;
        }

        .market-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .game-label {
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .live-pill {
          flex-shrink: 0;

          display: flex;
          align-items: center;
          gap: 6px;

          border: 1px solid
            rgba(
              0,
              216,
              102,
              0.4
            );

          border-radius: 20px;

          padding: 5px 10px;

          color: var(--green);
          font-size: 9px;
          font-weight: 800;
        }

        .question {
          margin-top: 15px;

          color: var(--text);
          font-size: 14px;
          line-height: 1.5;
          font-weight: 700;
        }

        .options {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 10px;
          margin-top: 18px;
        }

        .option {
          border-radius: 11px;
          padding: 15px;

          border: 1px solid
            var(--border);

          background:
            var(--panel-2);
        }

        .option.yes {
          border-color:
            rgba(
              0,
              216,
              102,
              0.25
            );
        }

        .option.no {
          border-color:
            rgba(
              255,
              64,
              81,
              0.3
            );
        }

        .option-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .option-label {
          font-size: 10px;
          font-weight: 800;
        }

        .yes .option-label,
        .yes .percentage {
          color: var(--green);
        }

        .no .option-label,
        .no .percentage {
          color: var(--red);
        }

        .percentage {
          font-size: 15px;
          font-weight: 800;
        }

        .bar {
          height: 6px;
          margin-top: 14px;

          border-radius: 10px;
          background: #252732;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: inherit;
        }

        .yes .bar-fill {
          background: var(--green);
        }

        .no .bar-fill {
          background: var(--red);
        }

        .pool-label {
          margin-top: 9px;
          color: var(--muted);
          font-size: 9px;
        }

        .market-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .market-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 31px;
          padding: 0 11px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--panel-2);
          color: var(--muted);
          text-decoration: none;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
          transition: 150ms ease;
        }

        .market-link:hover {
          color: var(--text);
          border-color: var(--purple);
          box-shadow: 0 0 14px rgba(155, 25, 245, 0.12);
        }

        .market-link.live-link {
          color: var(--green);
          border-color: rgba(0, 216, 102, 0.28);
        }

        .market-link.live-link:hover {
          border-color: var(--green);
          box-shadow: 0 0 14px rgba(0, 216, 102, 0.1);
        }

        .market-link.proof-link {
          color: var(--purple);
          border-color: rgba(155, 25, 245, 0.35);
        }

        .market-link.proof-link:hover {
          border-color: var(--purple);
        }

        .ending-box {
          margin-top: 14px;

          border: 1px solid
            var(--border);

          border-radius: 11px;
          padding: 16px;
        }

        .ending-title {
          color: var(--muted);
          font-size: 9px;
          letter-spacing: 1px;
        }

        .ending-value {
          margin-top: 6px;
          color: var(--red);
          font-size: 16px;
          font-weight: 800;
        }

        .market-meta {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );

          border: 1px solid
            var(--border);

          border-radius: 11px;

          margin-top: 14px;
          overflow: hidden;
        }

        .meta-item {
          padding: 13px 8px;
          text-align: center;
          border-right: 1px solid
            var(--border);
        }

        .meta-item:last-child {
          border-right: 0;
        }

        .meta-label {
          color: var(--muted-2);
          font-size: 8px;
          letter-spacing: 1px;
        }

        .meta-value {
          margin-top: 6px;
          color: var(--text);
          font-size: 11px;
          font-weight: 700;
        }

        .search {
          width: 100%;
          height: 48px;

          border: 1px solid
            var(--border);

          border-radius: 13px;

          background: var(--input);
          color: var(--text);

          padding: 0 17px;

          outline: none;

          margin-bottom: 18px;
        }

        .search::placeholder {
          color: var(--muted);
        }

        .search:focus {
          border-color:
            var(--purple);

          box-shadow:
            0 0 0 3px
            rgba(
              155,
              25,
              245,
              0.08
            );
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .history-card {
          border: 1px solid
            rgba(
              94,
              12,
              110,
              0.8
            );

          border-radius: 14px;

          background:
            radial-gradient(
              circle at top left,
              rgba(
                111,
                0,
                150,
                0.07
              ),
              transparent 40%
            ),
            var(--panel);

          padding: 21px;
        }

        .history-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .history-game {
          color: var(--muted);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
        }

        .history-title {
          margin-top: 13px;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 700;
        }

        .market-id {
          margin-top: 8px;
          color: var(--muted-2);
          font-size: 9px;
        }

        .result-pill {
          flex-shrink: 0;
          border: 1px solid
            rgba(
              255,
              64,
              81,
              0.5
            );

          color: var(--red);

          border-radius: 20px;

          padding: 8px 16px;

          font-size: 9px;
          font-weight: 800;
        }

        .history-info-grid {
          display: grid;

          grid-template-columns:
            repeat(
              5,
              minmax(0, 1fr)
            );

          gap: 10px;

          margin-top: 20px;
        }

        .info-box {
          min-height: 57px;

          border: 1px solid
            var(--border);

          border-radius: 10px;

          padding: 11px;
        }

        .info-box.highlight {
          border-color:
            rgba(
              155,
              25,
              245,
              0.6
            );

          background:
            rgba(
              100,
              0,
              150,
              0.04
            );
        }

        .info-label {
          color: var(--muted);
          font-size: 8px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .info-box.highlight
          .info-label {
          color: var(--purple);
        }

        .info-value {
          margin-top: 7px;
          color: var(--text);
          font-size: 10px;
          font-weight: 600;
        }

        .info-value.payout {
          color: var(--purple);
          font-size: 12px;
        }

        .pool-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 10px;
          margin-top: 10px;
        }

        .pool-box {
          border: 1px solid
            var(--border);

          border-radius: 10px;
          padding: 12px;
        }

        .pool-box .info-value {
          font-size: 11px;
        }

        .history-bottom {
          display: grid;

          grid-template-columns:
            1fr
            1fr
            1fr
            1fr;

          gap: 10px;
          margin-top: 10px;
        }

        .loading-card,
        .empty-card,
        .error-card {
          min-height: 140px;

          border: 1px solid
            var(--border);

          border-radius: 14px;

          background: var(--panel);

          display: flex;
          align-items: center;
          justify-content: center;

          gap: 12px;

          color: var(--muted);
          font-size: 12px;
        }

        .error-card {
          color: var(--red);
        }

        .spinner {
          width: 22px;
          height: 22px;

          border-radius: 50%;

          border: 2px solid
            var(--border);

          border-top-color:
            var(--purple);

          animation:
            crsh-spin
            700ms
            linear
            infinite;
        }

        @keyframes crsh-spin {
          to {
            transform:
              rotate(360deg);
          }
        }

        footer {
          margin-top: 52px;
          padding-top: 25px;

          border-top: 1px solid
            var(--border);

          display: flex;
          justify-content: space-between;

          color: var(--muted-2);

          font-size: 8px;
          letter-spacing: 1.5px;
        }

        @media (
          max-width: 800px
        ) {
          .crsh-shell {
            width: min(
              100% - 22px,
              1076px
            );

            padding-top: 28px;
          }

          .header {
            align-items: flex-start;
          }

          .header-right {
            flex-direction: column;
            align-items: flex-end;
          }

          .market-grid {
            grid-template-columns: 1fr;
          }

          .market-card:nth-child(3) {
            grid-column: auto;
          }

          .history-info-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .pool-grid {
            grid-template-columns: 1fr;
          }

          .history-bottom {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }

        @media (
          max-width: 520px
        ) {
          .brand {
            font-size: 18px;
          }

          .subtitle {
            line-height: 1.5;
          }

          .tabs-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .market-card,
          .history-card {
            padding: 15px;
          }

          .options {
            grid-template-columns: 1fr;
          }

          .history-top {
            flex-direction: column;
          }

          .history-info-grid {
            grid-template-columns: 1fr;
          }

          .history-bottom {
            grid-template-columns: 1fr;
          }
        }

      `}</style>
    </main>
  );
}

function LiveMarketCard({
  stream,
}: {
  stream: LiveStream;
}) {
  const market =
    stream.market;

  if (!market) {
    return null;
  }

  const yes =
    getLivePool(
      stream,
      0
    );

  const no =
    getLivePool(
      stream,
      1
    );

  const percentages =
    calculateLivePercentage(
      yes,
      no
    );

  const status =
    normalizeStatus(
      market.status
    );

  const ending =
    status === "resolved" ||
    status === "cancelled" ||
    status === "canceled";

  return (
    <article className="market-card">

      <div className="market-top">

        <div className="game-label">
          {stream.title ??
            "Market"}
        </div>

        <div className="live-pill">
          <span className="green-dot" />
          LIVE
        </div>

      </div>

      <div className="question">
        {market.title ??
          "Untitled market"}
      </div>

      {getStreamUrl(stream) && (
        <div className="market-links">
          <a
            className="market-link live-link"
            href={getStreamUrl(stream) ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            WATCH STREAM ↗
          </a>
        </div>
      )}

      <div className="options">

        <div className="option yes">

          <div className="option-head">
            <span className="option-label">
              YES
            </span>

            <span className="percentage">
              {percentages.yes.toFixed(
                1
              )}
              %
            </span>
          </div>

          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${percentages.yes}%`,
              }}
            />
          </div>

          <div className="pool-label">
            Pool{" "}
            {formatUsd(
              yes
            )}
          </div>

        </div>

        <div className="option no">

          <div className="option-head">
            <span className="option-label">
              NO
            </span>

            <span className="percentage">
              {percentages.no.toFixed(
                1
              )}
              %
            </span>
          </div>

          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${percentages.no}%`,
              }}
            />
          </div>

          <div className="pool-label">
            Pool{" "}
            {formatUsd(
              no
            )}
          </div>

        </div>

      </div>

      <div className="ending-box">
        <div className="ending-title">
          MARKET ENDS IN
        </div>

        <div className="ending-value">
          {ending
            ? "ENDING"
            : "LIVE"}
        </div>

        <div className="bar">
          <div
            className="bar-fill"
            style={{
              width:
                ending
                  ? "0%"
                  : "100%",
              background:
                "var(--red)",
            }}
          />
        </div>
      </div>

      <div className="market-meta">

        <div className="meta-item">
          <div className="meta-label">
            MARKET
          </div>

          <div className="meta-value">
            #
            {market.marketId ??
              "—"}
          </div>
        </div>

        <div className="meta-item">
          <div className="meta-label">
            VIEWERS
          </div>

          <div className="meta-value">
            {Number(
              stream.viewerCount ??
                0
            ).toLocaleString()}
          </div>
        </div>

        <div className="meta-item">
          <div className="meta-label">
            TRADES
          </div>

          <div className="meta-value">
            {Number(
              market.totalTrades ??
                0
            ).toLocaleString()}
          </div>
        </div>

      </div>

    </article>
  );
}

function HistoryCard({
  market,
}: {
  market: Market;
}) {
  const expected =
    market.expected_winnings;

  const winner =
    getWinnerLabel(
      market.winning_option_id
    );

  return (
    <article className="history-card">

      <div className="history-top">

        <div>
          <div className="history-game">
            {market.stream_title ??
              market.host_name ??
              "CRSHMARKET"}
          </div>

          <div className="history-title">
            {market.title ??
              "Untitled market"}
          </div>

          <div className="market-id">
            MARKET #
            {market.market_id}
          </div>

          {(getResolutionProofUrl(market) ||
            getStreamUrl(market)) && (
            <div className="market-links">
              {getResolutionProofUrl(market) && (
                <a
                  className="market-link proof-link"
                  href={
                    getResolutionProofUrl(market) ??
                    "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  VIEW RESOLUTION PROOF ↗
                </a>
              )}

              {getStreamUrl(market) &&
                getStreamUrl(market) !==
                  getResolutionProofUrl(market) && (
                <a
                  className="market-link"
                  href={
                    getStreamUrl(market) ??
                    "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  VIEW STREAM ↗
                </a>
              )}
            </div>
          )}
        </div>

        <div className="result-pill">
          {winner}
        </div>

      </div>

      <div className="history-info-grid">

        <InfoBox
          label="OPENED"
          value={formatDate(
            market.opened_at ??
              market.first_seen_at
          )}
        />

        <InfoBox
          label="CLOSED"
          value={formatDate(
            market.closed_at ??
              market.resolved_at
          )}
        />

        <InfoBox
          label="RECORDED"
          value={formatDate(
            market.recorded_at ??
              market.resolved_at
          )}
        />

        <InfoBox
          label="CREDITED"
          value={formatDate(
            market.credited_at ??
              market.recorded_at ??
              market.resolved_at
          )}
        />

        <InfoBox
          label="EXPECTED WINNINGS"
          value={
            expected !== null &&
            expected !== undefined
              ? formatUsd(
                  expected
                )
              : "Unavailable"
          }
          highlight
          payout
        />

      </div>

      <div className="pool-grid">

        <div className="pool-box">
          <div className="info-label">
            YES POOL
          </div>

          <div className="info-value">
            {formatUsd(
              getPool(
                market,
                0
              )
            )}
          </div>
        </div>

        <div className="pool-box">
          <div className="info-label">
            NO POOL
          </div>

          <div className="info-value">
            {formatUsd(
              getPool(
                market,
                1
              )
            )}
          </div>
        </div>

      </div>

      <div className="history-bottom">

        <InfoBox
          label="TRADES"
          value={Number(
            market.total_trades ??
              0
          ).toLocaleString()}
        />

        <InfoBox
          label="VIEWERS"
          value={Number(
            market.viewer_count ??
              0
          ).toLocaleString()}
        />

        <InfoBox
          label="RESOLVED"
          value={formatDate(
            market.resolved_at
          )}
        />

        <InfoBox
          label="STATUS"
          value={
            market.status ??
            "unknown"
          }
        />

      </div>

    </article>
  );
}

function InfoBox({
  label,
  value,
  highlight = false,
  payout = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  payout?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "info-box highlight"
          : "info-box"
      }
    >
      <div className="info-label">
        {label}
      </div>

      <div
        className={
          payout
            ? "info-value payout"
            : "info-value"
        }
      >
        {value}
      </div>
    </div>
  );
}