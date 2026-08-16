"use client";

import { useEffect, useMemo, useState } from "react";

type Market = {
  marketId?: string;
  title?: string;
  status?: string;
  winningOptionId?: number;
  currentPoolsUsdc?: string[];
  totalTrades?: number;
};

type Stream = {
  id?: string;
  title?: string;
  hostName?: string;
  viewerCount?: number;
  market?: Market;
};

type ResolvedMarket = {
  market_id: string;
  title?: string;
  status?: string;
  winning_option_id?: number;
  current_pools_usdc?: string[];
  total_trades?: number;
  stream_id?: string;
  stream_title?: string;
  host_name?: string;
  viewer_count?: number;
  resolved_at?: string;
};

type ApiResponse = {
  status?: string;
  value?: {
    activeStreams?: Stream[];
    resolvedMarkets?: ResolvedMarket[];
  };
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"live" | "resolved">("live");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [resolvedMarkets, setResolvedMarkets] = useState<ResolvedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [resolvedLimit, setResolvedLimit] = useState(10);

  useEffect(() => {
    async function loadMarkets() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/markets", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data: ApiResponse = await response.json();

        setStreams(data.value?.activeStreams ?? []);
        setResolvedMarkets(data.value?.resolvedMarkets ?? []);
      } catch (err) {
        console.error(err);
        setError("Failed to load markets.");
      } finally {
        setLoading(false);
      }
    }

    loadMarkets();
  }, []);

  const liveMarkets = useMemo(
    () =>
      streams.filter(
        (stream) =>
          stream.market?.status === "open" ||
          stream.market?.status === "active"
      ),
    [streams]
  );

  const filteredResolved = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return resolvedMarkets;

    return resolvedMarkets.filter((market) => {
      return (
        market.market_id.toLowerCase().includes(query) ||
        market.title?.toLowerCase().includes(query) ||
        market.stream_title?.toLowerCase().includes(query) ||
        market.host_name?.toLowerCase().includes(query)
      );
    });
  }, [resolvedMarkets, search]);

  const visibleResolvedMarkets = useMemo(
    () => filteredResolved.slice(0, resolvedLimit),
    [filteredResolved, resolvedLimit]
  );

  function getResult(market: ResolvedMarket) {
    if (market.status === "cancelled") return "CANCELLED";

    if (market.winning_option_id === 0) return "YES";
    if (market.winning_option_id === 1) return "NO";

    return "RESOLVED";
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setResolvedLimit(10);
  }

  function handleLoadMore() {
    setResolvedLimit((current) => current + 10);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-bold">
          CRSH Market Explorer
        </h1>

        <p className="mt-3 text-gray-400">
          Explore live and resolved CRSH markets.
        </p>

        <div className="mt-8 flex w-fit gap-2 rounded-xl border border-gray-800 bg-gray-950 p-1">
          <button
            onClick={() => setActiveTab("live")}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              activeTab === "live"
                ? "bg-white text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Live Markets
          </button>

          <button
            onClick={() => setActiveTab("resolved")}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              activeTab === "resolved"
                ? "bg-white text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Resolved Markets
          </button>
        </div>

        {activeTab === "live" && (
          <section className="mt-8">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">
                Live Markets
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Currently open markets
              </p>
            </div>

            {loading ? (
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-8 text-center text-gray-500">
                Loading live markets...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-900 bg-red-950/30 p-8 text-center text-red-400">
                {error}
              </div>
            ) : liveMarkets.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-8 text-center text-gray-500">
                No live markets found.
              </div>
            ) : (
              <div className="space-y-4">
                {liveMarkets.map((stream) => {
                  const market = stream.market;

                  return (
                    <div
                      key={market?.marketId ?? stream.id}
                      className="rounded-xl border border-gray-800 bg-gray-950 p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-gray-500">
                            {stream.title}
                          </p>

                          <h3 className="mt-2 text-lg font-semibold">
                            {market?.title}
                          </h3>
                        </div>

                        <span className="rounded-full border border-green-800 bg-green-950 px-3 py-1 text-xs font-medium text-green-400">
                          LIVE
                        </span>
                      </div>

                      <div className="mt-5 flex gap-8 text-sm text-gray-400">
                        <span>
                          Market #{market?.marketId}
                        </span>

                        <span>
                          Viewers: {stream.viewerCount ?? 0}
                        </span>

                        <span>
                          Trades: {market?.totalTrades ?? 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "resolved" && (
          <section className="mt-8">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">
                Resolved Markets
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Search previous markets and check their results
              </p>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search market question, market ID, game..."
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-5 py-4 text-white outline-none placeholder:text-gray-600 focus:border-gray-600"
            />

            <div className="mt-5">
              {loading ? (
                <div className="rounded-xl border border-gray-800 bg-gray-950 p-8 text-center text-gray-500">
                  Loading resolved markets...
                </div>
              ) : filteredResolved.length === 0 ? (
                <div className="rounded-xl border border-gray-800 bg-gray-950 p-8 text-center text-gray-500">
                  No resolved markets found.
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {visibleResolvedMarkets.map((market) => {
                      return (
                        <div
                          key={market.market_id}
                          className="rounded-xl border border-gray-800 bg-gray-950 p-6"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm text-gray-500">
                                {market.stream_title}
                              </p>

                              <h3 className="mt-2 text-lg font-semibold">
                                {market.title}
                              </h3>

                              <p className="mt-3 text-sm text-gray-500">
                                Market #{market.market_id}
                              </p>
                            </div>

                            <span
  className={`rounded-full border px-3 py-1 text-xs font-medium ${
    market.status === "cancelled"
      ? "border-yellow-800 bg-yellow-950 text-yellow-400"
      : market.winning_option_id === 0
        ? "border-green-800 bg-green-950 text-green-400"
        : market.winning_option_id === 1
          ? "border-red-800 bg-red-950 text-red-400"
          : "border-gray-700 bg-gray-900 text-gray-300"
  }`}
>
  {getResult(market)}
</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {resolvedLimit < filteredResolved.length && (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={handleLoadMore}
                        className="rounded-xl border border-gray-700 bg-gray-950 px-6 py-3 text-sm font-medium text-white transition hover:border-gray-500 hover:bg-gray-900"
                      >
                        Load More
                      </button>
                    </div>
                  )}

                  {resolvedLimit >= filteredResolved.length &&
                    filteredResolved.length > 10 && (
                      <p className="mt-8 text-center text-sm text-gray-600">
                        All resolved markets loaded.
                      </p>
                    )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}