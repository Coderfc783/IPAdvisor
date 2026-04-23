import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Calculator,
  RefreshCw,
  User,
  ShieldCheck,
  LineChart,
  ArrowRightLeft,
  Bell,
  AlertTriangle,
  CheckCircle2,
  X
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart as ReChart,
  Line,
  Legend,
  ReferenceLine,
  Label
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { signInWithGoogle, auth, db } from './lib/firebase';
import { LogIn, LogOut } from 'lucide-react';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatCurrency = (val: number) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val.toFixed(0)}`;
};

// Asset Classes - Initially empty, populated by live fetch
const INITIAL_ASSET_CLASSES: any[] = [];

function WealthApp() {
  // Persistence Logic
  const { user, loading: authLoading, saveUserProfile, loadUserProfile } = useFirebase();
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentCorpus, setCurrentCorpus] = useState<number>(1000000);
  const [targetCorpus, setTargetCorpus] = useState<number>(5000000);
  const [years, setYears] = useState<number>(10);
  const [inflationRate, setInflationRate] = useState<number>(7);
  const [riskLevel, setRiskLevel] = useState<number>(5);
  const [assetClasses, setAssetClasses] = useState(INITIAL_ASSET_CLASSES);
  const [isUpdatingMarket, setIsUpdatingMarket] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; type: 'success' | 'warning' | 'info'; message: string; timestamp: Date }[]>([]);

  const addAlert = (type: 'success' | 'warning' | 'info', message: string) => {
    const id = Math.random().toString(36).substring(7);
    setAlerts(prev => [{ id, type, message, timestamp: new Date() }, ...prev].slice(0, 5));
  };

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Load from Firestore or localStorage & Trigger Initial Fetch
  useEffect(() => {
    async function initData() {
      if (authLoading) return;

      let sourceData: any = null;

      if (user) {
        // Try Cloud first
        sourceData = await loadUserProfile();
      }

      const saved = localStorage.getItem('wealth_catalyst_data');
      if (!sourceData && saved) {
        try {
          sourceData = JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse local data", e);
        }
      }

      if (sourceData) {
        if (sourceData.currentCorpus) setCurrentCorpus(sourceData.currentCorpus);
        if (sourceData.targetCorpus) setTargetCorpus(sourceData.targetCorpus);
        if (sourceData.years) setYears(sourceData.years);
        if (sourceData.riskLevel) setRiskLevel(sourceData.riskLevel);
        if (sourceData.months) setYears(Math.ceil(sourceData.months / 12));
        if (sourceData.inflationRate) setInflationRate(sourceData.inflationRate);
        if (sourceData.assetClasses) {
          // Allow assets to persist with their last known ROI instead of resetting to 0.
          // This prevents the "Zero ROI" flash during background refresh.
          setAssetClasses(sourceData.assetClasses);
        }
      }

      setIsLoaded(true);
      refreshMarketData();
    }

    initData();
  }, [user, authLoading]);

  // Sync to Cloud & Local
  useEffect(() => {
    if (isLoaded) {
      const dataToSave = {
        currentCorpus,
        targetCorpus,
        years,
        riskLevel,
        inflationRate,
        assetClasses
      };
      
      localStorage.setItem('wealth_catalyst_data', JSON.stringify(dataToSave));
      
      if (user) {
        saveUserProfile(dataToSave);
      }
    }
  }, [currentCorpus, targetCorpus, years, riskLevel, inflationRate, assetClasses, isLoaded, user]);

  // Market Data Integration (Live Grounding via Gemini)
  async function refreshMarketData() {
    setIsUpdatingMarket(true);
    try {
      // Step 1: Try to load from Firestore Cache first to be fast if it's fresh (optional logic)
      // For now, we always fetch Gemini for "Live" accuracy as requested, but we'll save the result.

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
        
        Return STRICTLY JSON.
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              data: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    ticker: { type: Type.STRING },
                    price: { type: Type.STRING },
                    roi: { type: Type.NUMBER },
                    riskScore: { type: Type.NUMBER },
                    color: { type: Type.STRING }
                  },
                  required: ["name", "roi", "ticker", "price", "color", "riskScore"]
                }
              }
            },
            required: ["data"]
          },
          tools: [{ googleSearch: {} }] // Using real-time grounding
        }
      });

      const textOutput = response.text || "";
      const json = JSON.parse(textOutput.trim());
      
      if (json.data && json.data.length > 0) {
        const validData = json.data.map((item: any) => ({
          ...item,
          // Use sensible conservative defaults if AI returns 0 incorrectly
          roi: item.roi && item.roi > 0 ? item.roi : (
            item.name.includes("Bank") ? 0.072 :
            item.name.includes("Index") ? 0.12 :
            item.name.includes("Equity") ? 0.14 :
            item.name.includes("Metals") ? 0.09 :
            item.name.includes("Estate") ? 0.10 : 
            item.name.includes("Debt") ? 0.08 : 0.05
          )
        }));

        // Movement Alerting Logic
        validData.forEach((newAsset: any) => {
          const oldAsset = assetClasses.find(a => a.name === newAsset.name);
          if (oldAsset && oldAsset.roi > 0) {
            const diff = Math.abs(newAsset.roi - oldAsset.roi);
            if (diff > 0.02) {
              addAlert('warning', `Significant shift detected in ${newAsset.name} yields: ${(newAsset.roi * 100).toFixed(1)}%`);
            }
          }
        });

        // India VIX Alerting
        const foAsset = validData.find((a: any) => a.name.includes("F&O"));
        if (foAsset && foAsset.roi > 0.25) {
          addAlert('warning', "High Market Volatility detected. Review Hedging strategies.");
        }

        setAssetClasses(validData);

        // Update Cloud Cache if signed in
        if (user) {
          try {
            await setDoc(doc(db, 'market', 'latest'), {
              assetClasses: validData,
              fetchedAt: serverTimestamp()
            });
          } catch (cacheError) {
            console.warn("Failed to update market cache:", cacheError);
          }
        }
      } else {
        throw new Error("AI returned empty data array");
      }
    } catch (e) {
      console.error("Advanced market sync failed:", e);
      
      // Fallback: Try reading from the global cache if Gemini fails
      try {
        const cacheSnap = await getDoc(doc(db, 'market', 'latest'));
        if (cacheSnap.exists()) {
          setAssetClasses(cacheSnap.data().assetClasses);
          console.log("Loaded market data from cloud cache fallback.");
        }
      } catch (fallbackError) {
        console.error("Cloud cache fallback also failed:", fallbackError);
      }
    } finally {
      setIsUpdatingMarket(false);
    }
  }

  const results = useMemo(() => {
    const yearsArr = Array.from({ length: Math.ceil(years) + 1 }, (_, i) => i);
    const inflation = inflationRate / 100;

    return assetClasses.map(asset => {
      const annualROI = asset.roi;
      
      const chartData = yearsArr.map(yr => {
        const value = currentCorpus * Math.pow(1 + annualROI, yr);
        const inflationAdjustedValue = value / Math.pow(1 + inflation, yr);
        return {
          year: yr,
          [asset.name]: Math.round(value),
          [`${asset.name}_Real`]: Math.round(inflationAdjustedValue)
        };
      });

      const finalValue = currentCorpus * Math.pow(1 + annualROI, years);
      const finalRealValue = finalValue / Math.pow(1 + inflation, years);
      const gap = targetCorpus - finalRealValue;

      return {
        ...asset,
        finalValue,
        finalRealValue,
        gap,
        isSuccess: finalRealValue >= targetCorpus,
        chartData
      };
    });
  }, [currentCorpus, targetCorpus, years, inflationRate, assetClasses]);

  const combinedChartData = useMemo(() => {
    const yearsArr = Array.from({ length: Math.ceil(years) + 1 }, (_, i) => i);
    return yearsArr.map(yr => {
      const dataPoint: any = { year: `Year ${yr}` };
      results.forEach(res => {
        dataPoint[res.name] = res.chartData[yr][res.name];
      });
      return dataPoint;
    });
  }, [results, years]);

  const bestAsset = results.length > 0 ? [...results].sort((a, b) => b.finalRealValue - a.finalRealValue)[0] : null;

  const personalizedRecommendation = useMemo(() => {
    if (results.length === 0) return null;
    
    // Algorithm: Filter assets where riskScore <= user risk level (with some buffer)
    // Then pick the one that gets closest to or exceeds the target.
    const eligibleAssets = results.filter(asset => asset.riskScore <= (riskLevel + 1));
    
    if (eligibleAssets.length === 0) {
      // If no asset is safe enough, return the one with the lowest riskScore
      return [...results].sort((a, b) => a.riskScore - b.riskScore)[0];
    }
    
    // Of the eligible ones, find the one with best performance
    return [...eligibleAssets].sort((a, b) => b.finalRealValue - a.finalRealValue)[0];
  }, [results, riskLevel]);

  const successRate = results.length > 0 ? (results.filter(r => r.isSuccess).length / results.length) * 100 : 0;

  // Threshold Alert Logic
  useEffect(() => {
    if (results.length > 0) {
      const successful = results.filter(r => r.isSuccess);
      if (successful.length > 0) {
        const best = successful.sort((a, b) => b.finalRealValue - a.finalRealValue)[0];
        if (best.finalRealValue > targetCorpus * 1.5) {
          addAlert('success', `Exceptional Target Overflow: ${best.name} projected to exceed 150% of your goal.`);
        }
      }
    }
  }, [results, targetCorpus]);

  const portfolioStrategy = useMemo(() => {
    if (results.length === 0) return null;

    let allocations: Record<string, number> = {
      'Index Funds': 0,
      'General Equity': 0,
      'Metals': 0,
      'Estates': 0,
      'F&O': 0,
      'Bank Schemes': 0,
      'Debt Funds': 0
    };

    // 1. THE BASE SHIELD
    if (riskLevel <= 5) {
      const shield = (10 - riskLevel) * 10;
      allocations['Bank Schemes'] = shield / 2;
      allocations['Metals'] = shield / 2;
    } else {
      allocations['Metals'] = 15;
    }

    // 5. STABILITY LAYER (Debt)
    if (riskLevel >= 4 && riskLevel <= 8) {
      allocations['Debt Funds'] = 20;
    }

    // 3. HEDGING (F&O) - Priority add-on
    if (riskLevel > 7) {
      allocations['F&O'] = 5;
    }

    // 4. INFLATION OFFSET (Estates)
    if (inflationRate > 5) {
      allocations['Estates'] = 10;
    }

    // 2. GROWTH ENGINE (Remaining)
    const used = Object.values(allocations).reduce((a, b) => a + b, 0);
    const remaining = Math.max(0, 100 - used);
    
    if (remaining > 0) {
      if (years > 5) {
        allocations['Index Funds'] += remaining * 0.7;
        allocations['General Equity'] += remaining * 0.3;
      } else {
        allocations['General Equity'] += remaining;
      }
    }

    // Advice Logic
    const most = Object.entries(allocations).sort((a, b) => b[1] - a[1])[0];
    const least = Object.entries(allocations).filter(a => a[1] > 0).sort((a, b) => a[1] - b[1])[0];
    const isAchievable = results.some(r => r.isSuccess);

    return {
      allocations: Object.entries(allocations).filter(a => a[1] > 0).map(([name, pct]) => ({
        name,
        pct,
        advice: name === 'Metals' || name === 'Bank Schemes' ? 'Shields capital against volatility.' :
                name === 'F&O' ? 'Hedges downside risk via Protective Puts.' :
                name === 'Estates' ? 'Offsets inflation debasement.' : 
                name === 'Debt Funds' ? 'Provides stable yields while bridging fixed-income and equity.' :
                'Core growth engine for corpus target.'
      })),
      shieldPct: (allocations['Bank Schemes'] || 0) + (allocations['Metals'] || 0),
      most,
      least,
      isAchievable
    };
  }, [results, riskLevel, years, inflationRate]);

  return (
    <div className="min-h-screen bg-surface-base text-text-primary p-8 relative overflow-hidden font-sans">
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />

      <header className="flex justify-between items-center mb-6 relative z-10 font-sans">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Wealth Catalyst
          </h1>
          <p className="text-text-secondary text-sm italic">Advanced Multi-Asset Projection Simulator</p>
        </div>
        <div className="flex items-center gap-4">
          {!user ? (
            <button 
              onClick={signInWithGoogle}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-full hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
            >
              <LogIn size={14} /> Sign In
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">{user.displayName}</span>
                <button 
                  onClick={() => auth.signOut()}
                  className="text-[8px] text-rose-400 font-black uppercase tracking-[0.2em] hover:text-rose-300"
                >
                  Disconnect
                </button>
              </div>
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border border-white/10"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md flex items-center gap-2 text-text-secondary">
            <span className="text-[10px] uppercase tracking-widest ">Feed: </span>
            <span className="text-[10px] font-mono text-brand-secondary">ACTIVE</span>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-6 relative z-10">
        <aside className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <section className="p-6 glass-panel h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calculator size={20} className="text-brand-primary" />
                Configuration
              </h2>
              <div className="flex gap-2">
                {alerts.length > 0 && (
                   <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-primary/10 rounded-lg text-brand-primary animate-pulse">
                     <Bell size={12} />
                     <span className="text-[10px] font-bold">{alerts.length}</span>
                   </div>
                )}
                <button 
                  onClick={refreshMarketData}
                  disabled={isUpdatingMarket}
                  className={cn(
                    "p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-brand-secondary",
                    isUpdatingMarket && "animate-spin opacity-50"
                  )}
                  title="Refresh Market ROI Feed"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-5 flex-1">
              <InputField 
                label="Current Corpus (₹)" 
                value={currentCorpus} 
                onChange={(v) => setCurrentCorpus(Number(v))} 
                min={0}
              />
              <InputField 
                label="Target Corpus (₹)" 
                value={targetCorpus} 
                onChange={(v) => setTargetCorpus(Number(v))} 
                min={0}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField 
                  label="Duration (Years)" 
                  value={years} 
                  onChange={(v) => setYears(Number(v))} 
                  min={1}
                />
                <InputField 
                  label="Inflation (%)" 
                  value={inflationRate} 
                  onChange={(v) => setInflationRate(Number(v))} 
                  min={0}
                />
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold">Risk Appetite ({riskLevel}/10)</p>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded",
                    riskLevel <= 3 ? "bg-green-500/10 text-green-400" :
                    riskLevel <= 7 ? "bg-orange-500/10 text-orange-400" :
                    "bg-rose-500/10 text-rose-400"
                  )}>
                    {riskLevel <= 3 ? 'Conservative' : riskLevel <= 7 ? 'Moderate' : 'Aggressive'}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  step="1" 
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-1">Target Success Rate</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-black text-brand-secondary">{successRate.toFixed(1)}%</span>
                  <span className="text-[10px] text-text-secondary font-mono">({results.filter(r => r.isSuccess).length}/{results.length} Goals Met)</span>
                </div>
                <div className="w-full bg-white/5 border border-white/5 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${successRate}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="bg-brand-secondary h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
                  />
                </div>
              </div>

              <button className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] mt-2 shadow-lg shadow-indigo-900/20 transition-all text-white flex items-center justify-center gap-2">
                <ArrowRightLeft size={14} /> Calculate returns over investment options
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                <p className="text-[9px] uppercase tracking-widest font-black text-brand-primary mb-1">Data Sovereignty</p>
                <p className="text-[10px] text-indigo-100/60 leading-tight">
                  {user 
                    ? "Secured on Cloud Firestore via gen-lang project in asia-southeast1." 
                    : "Browsing in Guest Mode. Local persistence active."}
                </p>
              </div>
            </div>
          </section>

          <div className={cn(
            "p-4 rounded-2xl border backdrop-blur-md transition-all duration-500",
            personalizedRecommendation?.isSuccess 
              ? "bg-brand-secondary/10 border-brand-secondary/20" 
              : "bg-indigo-500/10 border-indigo-500/20"
          )}>
            <p className="text-[10px] uppercase tracking-tighter text-brand-primary mb-1 opacity-70 flex justify-between items-center font-bold">
              <span className="flex items-center gap-1"><TrendingUp size={10} /> Smart Recommendation</span>
              {personalizedRecommendation && (
                <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded tabular-nums">Risk: {personalizedRecommendation.riskScore}/10</span>
              )}
            </p>
            <div className="text-xs text-indigo-100 leading-relaxed font-medium">
              {isUpdatingMarket || !personalizedRecommendation 
                ? "Calibrating your ideal portfolio path..." 
                : (
                  <div className="space-y-1.5">
                    <p>Based on your <span className="text-brand-secondary font-bold italic">{riskLevel <= 3 ? 'Conservative' : riskLevel <= 7 ? 'Moderate' : 'Aggressive'}</span> profile, your best fit is <span className="font-bold underline" style={{ color: personalizedRecommendation.color }}>{personalizedRecommendation.name}</span>.</p>
                    <p className="text-[10px] text-text-secondary">Expected yield: <span className="text-white">{(personalizedRecommendation.roi * 100).toFixed(1)}%</span>. {personalizedRecommendation.isSuccess ? "This option is compatible with your target corpus." : "Note: This may fall short of your target; consider increasing duration."}</p>
                  </div>
                )
              }
            </div>
          </div>

          {/* Alert Terminal */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[9px] uppercase tracking-widest text-text-muted font-black px-2 mb-1 flex items-center gap-2">
                 <Bell size={10} /> Intelligence Alerts
              </p>
              {alerts.map(alert => (
                <motion.div 
                  key={alert.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "p-3 rounded-xl border flex gap-3 items-start relative group",
                    alert.type === 'success' ? "bg-emerald-500/5 border-emerald-500/20" :
                    alert.type === 'warning' ? "bg-amber-500/5 border-amber-500/20" :
                    "bg-blue-500/5 border-blue-500/20"
                  )}
                >
                  <div className={cn(
                    "mt-0.5",
                    alert.type === 'success' ? "text-emerald-400" :
                    alert.type === 'warning' ? "text-amber-400" :
                    "text-blue-400"
                  )}>
                    {alert.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] leading-tight text-white/90 pr-4">{alert.message}</p>
                    <p className="text-[8px] text-text-muted font-mono mt-1 uppercase">
                      {alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button 
                    onClick={() => removeAlert(alert.id)}
                    className="absolute top-2 right-2 p-1 text-text-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </aside>

        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
          <section className="h-[380px] p-6 glass-panel relative flex flex-col">
            <h3 className="text-[10px] font-semibold text-text-secondary mb-8 uppercase tracking-widest flex items-center gap-2">
              <LineChart size={14} className="text-brand-primary" />
              Dynamic Portfolio Run ({years}-Years)
            </h3>
            
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ReChart data={combinedChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="year" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }} 
                    dy={10} 
                    interval="preserveStartEnd"
                    minTickGap={30}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }} 
                    tickFormatter={(val) => formatCurrency(val)} 
                    domain={[0, (dataMax: number) => Math.max(dataMax, targetCorpus * 1.1)]}
                  />
                  <ReferenceLine 
                    y={targetCorpus} 
                    stroke="#10b981" 
                    strokeDasharray="5 5" 
                    strokeWidth={1}
                  >
                    <Label 
                      value="Target Goal" 
                      position="insideRight" 
                      fill="#10b981" 
                      fontSize={10} 
                      fontWeight="bold"
                      offset={10}
                    />
                  </ReferenceLine>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '10px', color: '#f8fafc' }}
                    itemStyle={{ padding: '2px 0' }}
                    formatter={(val: number) => [formatCurrency(val), '']}
                  />
                  {assetClasses.map((asset) => (
                    <Line 
                      key={asset.name}
                      type="monotone" 
                      dataKey={asset.name} 
                      stroke={asset.color} 
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={1500}
                    />
                  ))}
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    content={({ payload }) => (
                      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 mb-4">
                        {payload?.map((entry: any) => (
                          <div key={entry.value} className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                </ReChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="flex-1 p-1 glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-[10px] text-text-secondary uppercase tracking-widest font-semibold">
                    <th className="px-6 py-4">Asset Class (Ticker)</th>
                    <th className="px-6 py-4 text-center">Live Price/Rate</th>
                    <th className="px-6 py-4 text-center">Market ROI</th>
                    <th className="px-6 py-4 text-right">Future Val</th>
                    <th className="px-6 py-4 text-right">Real Val</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-mono divide-y divide-white/5">
                  {assetClasses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw size={24} className="text-brand-secondary animate-spin" />
                          <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Synchronizing with live markets...</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    results.map((res) => (
                      <tr key={res.name} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-3 font-sans font-medium">
                          <div className="flex flex-col">
                            <span style={{ color: res.color }}>{res.name}</span>
                            <span className="text-[9px] text-text-muted opacity-60">{res.ticker}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center text-text-secondary text-xs">{res.price}</td>
                        <td className="px-6 py-3 text-center text-brand-secondary font-bold">
                          {isUpdatingMarket && res.roi === 0 ? (
                            <span className="text-[10px] animate-pulse text-text-muted italic">Syncing...</span>
                          ) : (
                            `${(res.roi * 100).toFixed(1)}%`
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-[11px]">{formatCurrency(res.finalValue)}</td>
                        <td className="px-6 py-3 text-right text-text-primary text-[11px] font-bold">{formatCurrency(res.finalRealValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {portfolioStrategy && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 glass-panel flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-widest text-brand-primary flex items-center gap-2">
                  <ShieldCheck size={18} />
                  Intelligent Portfolio Strategy
                </h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-brand-secondary/10 border border-brand-secondary/20 rounded-full">
                  <span className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">Base Shield: {portfolioStrategy.shieldPct}%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="overflow-hidden border border-white/5 rounded-xl bg-white/[0.02]">
                   <table className="w-full text-left">
                    <thead>
                      <tr className="bg-white/5 text-[9px] text-text-secondary uppercase tracking-widest font-bold">
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-4 py-3 text-center">Alloc %</th>
                        <th className="px-4 py-3">Strategy Advice</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-medium divide-y divide-white/5">
                      {portfolioStrategy.allocations.map((item) => (
                        <tr key={item.name} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-text-primary">{item.name}</td>
                          <td className="px-4 py-3 text-center font-bold text-brand-secondary">{item.pct.toFixed(0)}%</td>
                          <td className="px-4 py-3 text-text-secondary italic">{item.advice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/20">
                    <p className="text-[10px] font-black uppercase text-brand-primary mb-2 flex items-center gap-1">
                      <ShieldCheck size={12} /> Principal Protection (Base Shield)
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      Your {portfolioStrategy.shieldPct}% shield in <span className="text-white font-bold">Bank Schemes & Metals</span> acts as a financial buffer. This allocation is mathematically designed to prevent erosion of your starting <span className="text-white font-bold">{formatCurrency(currentCorpus)}</span> by prioritizing liquidity and non-correlated assets, ensuring you survive market drawdowns.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[9px] uppercase font-bold text-text-secondary mb-1">Invest MOST In</p>
                        <p className="text-sm font-black text-brand-secondary">{portfolioStrategy.most[0]}</p>
                     </div>
                     <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[9px] uppercase font-bold text-text-secondary mb-1">Invest LEAST In</p>
                        <p className="text-sm font-black text-rose-400">{portfolioStrategy.least[0]}</p>
                     </div>
                  </div>

                  <div className={cn(
                    "p-4 rounded-xl border flex items-center gap-3",
                    portfolioStrategy.isAchievable ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30"
                  )}>
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      portfolioStrategy.isAchievable ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {portfolioStrategy.isAchievable ? <ShieldCheck size={20} /> : <Calculator size={20} />}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-widest mb-0.5">Real-World Check</p>
                      <p className="text-[11px] font-medium leading-normal">
                        {portfolioStrategy.isAchievable 
                          ? `With a ${years}-year horizon and current inflation of ${inflationRate}%, reaching ${formatCurrency(targetCorpus)} is realistic within this hybrid framework.`
                          : `Warning: Your target corpus appears aggressive for a ${years}-year timeframe. Consider extending the horizon or adjusting the risk appetite.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </div>
      </main>

      <footer className="mt-8 flex justify-between items-center text-[10px] text-text-muted uppercase tracking-[0.2em] relative z-10">
        <p>© 2024 Quantum Finance Simulations</p>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-1 text-brand-secondary">
             <ShieldCheck size={12} />
             <span>{user ? 'Cloud Protected' : 'Local Guard Active'}</span>
          </div>
          <p className="opacity-40">|</p>
          <p>Engine: Gemini 3 Advanced Feed</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <WealthApp />
    </FirebaseProvider>
  );
}

function InputField({ label, value, onChange, min, max }: { label: string, value: number, onChange: (v: string) => void, min?: number, max?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-[10px] font-medium text-text-secondary uppercase tracking-wider">{label}</label>
      <input 
        type="number" 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="glass-input text-lg font-mono"
      />
    </div>
  );
}
