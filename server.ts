import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinanceClass from 'yahoo-finance2';
import dotenv from "dotenv";

dotenv.config();

// Resilient initialization for yahoo-finance2
const YahooFinance = (YahooFinanceClass as any).YahooFinance || YahooFinanceClass;
const yahooFinance = new YahooFinance();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to calculate 1Y ROI with ticker averaging
async function getAverage1YReturn(symbols: string[]): Promise<number> {
  const returns = await Promise.all(symbols.map(async (symbol) => {
    try {
      const today = new Date();
      const lastYear = new Date();
      lastYear.setFullYear(today.getFullYear() - 1);

      // Fetch chart with 1wk interval for stability
      const queryOptions: any = {
          period1: lastYear,
          period2: today,
          interval: '1wk'
      };

      const results: any = await yahooFinance.chart(symbol, queryOptions);
      const quotes = results.quotes;
      
      if (quotes && quotes.length >= 20) {
        const startPrice = quotes[0].close;
        const endPrice = quotes[quotes.length - 1].close;
        if (startPrice && endPrice) {
          return (endPrice - startPrice) / startPrice;
        }
      }
      
      // Secondary Fallback: Trailing 12M Return from quote summary if chart fails
      const summary: any = await yahooFinance.quote(symbol);
      const fiftyTwoWeekChange = summary.fiftyTwoWeekHighChangePercent || summary.regularMarketChangePercent || 0.12;
      return typeof fiftyTwoWeekChange === 'number' ? fiftyTwoWeekChange : 0.12;
    } catch (e) {
      console.error(`Error fetching ROI for ${symbol}:`, e);
      return 0.10; 
    }
  }));

  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

async function getMFReturn(schemeCodes: string[]): Promise<number> {
  const returns = await Promise.all(schemeCodes.map(async (code) => {
    try {
      const response = await fetch(`https://api.mfapi.in/mf/${code}`);
      const res: any = await response.json();
      const data = res.data;
      if (data && data.length > 250) {
        const latestNav = parseFloat(data[0].nav);
        const yearAgoNav = parseFloat(data[250].nav);
        return (latestNav - yearAgoNav) / yearAgoNav;
      }
      return 0.075;
    } catch (e) {
      return 0.072;
    }
  }));
  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API Route for Market Data
app.get("/api/market-data", async (req, res) => {
  try {
    const [
      indexReturn,
      equityReturn,
      goldReturn,
      estateReturn,
      debtReturn,
      vixData,
      qqqReturn, 
      cryptoReturn,
      bondData,
      niftyData 
    ] = await Promise.all([
      getAverage1YReturn(['^NSEI', '^GSPC', 'URTH']).catch(() => 0.12),
      getAverage1YReturn(['VTI', 'ACWI', 'HDFCBANK.NS', 'RELIANCE.NS']).catch(() => 0.14),
      getAverage1YReturn(['GC=F', 'GLD']).catch(() => 0.08),
      getAverage1YReturn(['VNQ', 'IYR', 'DLF.NS']).catch(() => 0.09),
      getMFReturn(['119551', '120503']).catch(() => 0.072),
      yahooFinance.quote('^INDIAVIX').catch(() => ({ regularMarketPrice: 15.2 } as any)),
      getAverage1YReturn(['QQQ', 'SMH']).catch(() => 0.22),
      getAverage1YReturn(['BTC-USD', 'ETH-USD']).catch(() => 0.45),
      yahooFinance.quote('^TNX').catch(() => ({ regularMarketPrice: 4.2 } as any)),
      yahooFinance.quote('^NSEI').catch(() => ({ regularMarketPrice: 22100 } as any))
    ]);

    const data = [
      {
        name: "Index Funds",
        ticker: "Nifty 50, S&P 500, MSCI World",
        price: "Institutional Average",
        roi: indexReturn,
        riskScore: 4,
        color: "#6366f1"
      },
      {
        name: "General Equity",
        ticker: "Global & Domestic Large Cap",
        price: "Nifty: " + (niftyData.regularMarketPrice?.toLocaleString('en-IN') || "Live"),
        roi: equityReturn,
        riskScore: 6,
        color: "#8b5cf6"
      },
      {
        name: "Metals",
        ticker: "Gold, Silver, Commodities",
        price: "Global Spot Index",
        roi: goldReturn,
        riskScore: 3,
        color: "#f59e0b"
      },
      {
        name: "Estates",
        ticker: "REITs & Real Estate Leaders",
        price: "Yield Benchmarks",
        roi: estateReturn,
        riskScore: 5,
        color: "#10b981"
      },
      {
        name: "F&O",
        ticker: "Volatility Hedging (^VIX)",
        price: "VIX: " + (vixData.regularMarketPrice?.toString() || "15.2"),
        roi: (vixData.regularMarketPrice || 15) > 18 ? 0.22 : 0.08,
        riskScore: 9,
        color: "#ef4444"
      },
      {
        name: "Bank Schemes",
        ticker: "Fixed Deposits & Term Schemes",
        price: "7.1% - 7.5% Range",
        roi: 0.073,
        riskScore: 1,
        color: "#3b82f6"
      },
      {
        name: "Debt Funds",
        ticker: "Liquid & Short-Duration Debt",
        price: "Institutional MF Yields",
        roi: debtReturn,
        riskScore: 2,
        color: "#06b6d4"
      },
      {
        name: "ETFs",
        ticker: "Nasdaq 100, Tech & Growth",
        price: "Sector Aggregates",
        roi: qqqReturn,
        riskScore: 6,
        color: "#ec4899"
      },
      {
        name: "Cryptocurrency",
        ticker: "BTC, ETH & High-Caps",
        price: "Global Digital Assets",
        roi: cryptoReturn,
        riskScore: 10,
        color: "#f97316"
      },
      {
        name: "Government Bonds",
        ticker: "Sovereign 10Y (US & India)",
        price: (bondData.regularMarketPrice || 4.2).toString() + "% Yield",
        roi: (bondData.regularMarketPrice || 4.2) / 100,
        riskScore: 2,
        color: "#64748b"
      }
    ];

    res.json({ data, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("Critical Market API Error:", error);
    res.status(500).json({ error: "Internal Server Error in Market Data Aggregator" });
  }
});

// For production (including Vercel), serve static files
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Development setup with Vite
async function startDevServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startDevServer();

export default app;
