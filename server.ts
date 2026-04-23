import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Market Data
  app.get("/api/market-data", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
      }

      const genAI: any = new GoogleGenAI({ apiKey });
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest",
        tools: [{ googleSearch: {} }] as any
      });

      const prompt = `
        Perform a comprehensive market audit for April 2026. 
        Fetch specific current yields or trailing 12-month returns for these categories:
        1. Index Funds: Blended return from ^NSEI and ^GSPC.
        2. General Equity: Weighted return of VTI and NQ=F.
        3. Metals: Annualized performance of Gold (GC=F) and Silver (SI=F).
        4. Estates: Yields from Real Estate ETFs (VNQ, IYR).
        5. F&O: Calculate speculative return potential based on current ^INDIAVIX (Volatility Index) level.
        6. Bank Schemes: Current 5-Year fixed deposit rates (approx 7.2-7.5%).
        7. Debt Funds: Analyze Liquid/Debt fund benchmarks (e.g., HDFC Liquid Fund or similar Indian Debt MF proxies).
        
        CRITICAL INSTRUCTIONS:
        - Identify the most recent annual growth or yield percentages.
        - If precise 2026 ROI data is missing for a specific category, use the 2025 trailing 12-month return as a proxy.
        - NEVER return 0.0 unless the specific asset class has literally stopped yielding.
        - Ensure ROIs are realistic (e.g., 0.05 - 0.25 range for most equities).
        
        For each category, return:
        - name: The friendly category name (e.g., "Index Funds")
        - ticker: The symbols you analyzed (e.g., "^NSEI, ^GSPC")
        - price: Current average price or benchmark rate (as string, e.g. "₹22,100")
        - roi: The annual ROI decimal (e.g., 0.125 for 12.5%)
        - riskScore: A value from 1 to 10
        - color: A hex color code
        
        Return STRICTLY JSON as an object with a "data" array.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Clean the JSON if Gemini wraps it in markdown blocks
      const cleanedJson = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanedJson);

      res.json(parsed);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
