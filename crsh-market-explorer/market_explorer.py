import json
import subprocess


def fetch_data():
    result = subprocess.run(
        [
            "curl",
            "https://impartial-newt-333.convex.cloud/api/query",
            "-H",
            "content-type: application/json",
            "--data-raw",
            '{"path":"streams:getActive","args":{},"format":"json"}',
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    return json.loads(result.stdout)


data = fetch_data()
streams = data["value"]["activeStreams"]

print(f"TOTAL STREAMS: {len(streams)}")
print()

for stream in streams:
    market = stream.get("market", {})

    if market.get("status") != "open":
        continue

    pools = market.get("currentPoolsUsdc", [])

    if len(pools) == 2:
        yes = int(pools[0])
        no = int(pools[1])
        total = yes + no

        yes_price = yes / total
        no_price = no / total
    else:
        yes_price = None
        no_price = None

    print("=" * 80)
    print("STREAM   :", stream.get("title"))
    print("HOST     :", stream.get("hostName"))
    print("MARKET   :", market.get("marketId"))
    print("QUESTION :", market.get("title"))
    print("YES      :", f"{yes_price:.2%}" if yes_price is not None else "N/A")
    print("NO       :", f"{no_price:.2%}" if no_price is not None else "N/A")
    print("TRADES   :", market.get("totalTrades"))
    print("VIEWERS  :", stream.get("viewerCount"))
