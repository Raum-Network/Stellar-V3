
export interface PriceData {
    xlm: number;
    usdc: number;
    change24h: number;
}

interface PriceCacheEntry {
    value: PriceData;
    expiresAt: number;
}

interface HistoryPoint {
    timestamp: number;
    time: string;
    price: number;
}

interface HistoryCacheEntry {
    value: HistoryPoint[];
    expiresAt: number;
}

interface CoinGeckoSimplePriceResponse {
    stellar?: {
        usd?: number;
        usd_24h_change?: number;
    };
    "usd-coin"?: {
        usd?: number;
    };
}

interface CoinGeckoHistoryResponse {
    prices?: Array<[number, number]>;
}

export class PriceService {
    private static API_URL = "https://api.coingecko.com/api/v3/simple/price";
    private static PRICE_CACHE_TTL_MS = 30_000;
    private static HISTORY_CACHE_TTL_MS = 60_000;
    private static priceCache: PriceCacheEntry | null = null;
    private static historyCache = new Map<string, HistoryCacheEntry>();

    static clearCache(): void {
        this.priceCache = null;
        this.historyCache.clear();
    }

    static async getPrices(): Promise<PriceData> {
        const now = Date.now();
        if (this.priceCache && this.priceCache.expiresAt > now) {
            return this.priceCache.value;
        }

        try {
            const response = await fetch(
                `${this.API_URL}?ids=stellar,usd-coin&vs_currencies=usd&include_24hr_change=true`
            );
            if (!response.ok) {
                throw new Error(`Price API error: ${response.status}`);
            }

            const data: CoinGeckoSimplePriceResponse = await response.json();
            const xlm = data.stellar?.usd;
            const usdc = data["usd-coin"]?.usd;
            const change24h = data.stellar?.usd_24h_change;

            if (
                typeof xlm !== "number" ||
                typeof usdc !== "number" ||
                typeof change24h !== "number"
            ) {
                throw new Error("Price API payload missing expected numeric fields");
            }

            const prices: PriceData = {
                xlm,
                usdc,
                change24h
            };
            this.priceCache = {
                value: prices,
                expiresAt: now + this.PRICE_CACHE_TTL_MS
            };

            return prices;
        } catch (error) {
            console.error("Failed to fetch prices:", error);
            // Fallback to semi-realistic mock data if API fails
            return {
                xlm: 0.1258,
                usdc: 1.00,
                change24h: 1.25
            };
        }
    }

    static async getHistory(
        id: string = "stellar",
        options?: {
            days?: number;
            interval?: "hourly" | "daily";
        }
    ): Promise<HistoryPoint[]> {
        const now = Date.now();
        const days = Math.max(1, Math.floor(options?.days ?? 1));
        const interval = options?.interval ?? "hourly";
        const cacheKey = `${id}:${days}:${interval}`;
        const cached = this.historyCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }

        try {
            const response = await fetch(
                `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
            );
            if (!response.ok) {
                throw new Error(`History API error: ${response.status}`);
            }

            const data: CoinGeckoHistoryResponse = await response.json();
            if (!Array.isArray(data.prices)) {
                throw new Error("History API payload missing prices array");
            }

            const history = data.prices.map((p) => ({
                timestamp: p[0],
                time: days > 1
                    ? new Date(p[0]).toLocaleDateString([], { month: "short", day: "numeric" })
                    : new Date(p[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                price: p[1]
            }));
            this.historyCache.set(cacheKey, {
                value: history,
                expiresAt: now + this.HISTORY_CACHE_TTL_MS
            });

            return history;
        } catch (error) {
            console.error("Failed to fetch history:", error);
            return [];
        }
    }
}
