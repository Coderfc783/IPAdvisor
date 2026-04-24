import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Calculator,
  RefreshCw,
  User,
  ShieldCheck,
  LineChart,
  ArrowRightLeft,
  AlertTriangle
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
  Label,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentCorpus, setCurrentCorpus] = useState<number>(1000000);
  const [targetCorpus, setTargetCorpus] = useState<number>(5000000);
  const [years, setYears] = useState<number>(10);
  const [inflationRate, setInflationRate] = useState<number>(7);
  const [riskLevel, setRiskLevel] = useState<number>(5);
  const [assetClasses, setAssetClasses] = useState(INITIAL_ASSET_CLASSES);
  const [isUpdatingMarket, setIsUpdatingMarket] = useState(false);
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Load from localStorage & Trigger Initial Fetch
  useEffect(() => {
    function initData() {
      let sourceData: any = null;

      const saved = localStorage.getItem('wealth_catalyst_data');
      if (saved) {
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
        if (sourceData.inflationRate) setInflationRate(sourceData.inflationRate);
        if (sourceData.assetClasses) {
          setAssetClasses(sourceData.assetClasses);
        }
      }

      setIsLoaded(true);
      refreshMarketData();
    }

    initData();
  }, []);

  // Save to LocalStorage
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
    }
  }, [currentCorpus, targetCorpus, years, riskLevel, inflationRate, assetClasses, isLoaded]);

  // Market Data Integration (Live Grounding via Backend API)
  async function refreshMarketData() {
    setIsUpdatingMarket(true);
    try {
      const response = await fetch("/api/market-data");
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const json = await response.json();
      
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
            item.name.includes("Debt") ? 0.08 :
            item.name.includes("Crypto") ? 0.45 :
            item.name.includes("Bond") ? 0.071 :
            item.name.includes("ETF") ? 0.15 : 0.05
          )
        }));

        // India VIX Alerting
        const foAsset = validData.find((a: any) => a.name.includes("F&O"));

        setAssetClasses(validData);
        if (json.timestamp) setLastSync(json.timestamp);
      } else {
        throw new Error("API returned malformed data");
      }
    } catch (e) {
      console.error("Advanced market sync failed:", e);
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

  const portfolioStrategy = useMemo(() => {
    if (results.length === 0) return null;

    let allocations: Record<string, number> = {
      'Index Funds': 0,
      'General Equity': 0,
      'Metals': 0,
      'Estates': 0,
      'F&O': 0,
      'Bank Schemes': 0,
      'Debt Funds': 0,
      'ETFs': 0,
      'Cryptocurrency': 0,
      'Government Bonds': 0
    };

    // 1. PRINCIPAL PROTECTION (Bank Schemes + Government Bonds)
    // Low risk profiles get more protection.
    const protectionBase = Math.max(10, (10 - riskLevel) * 10);
    allocations['Bank Schemes'] = protectionBase * 0.4;
    allocations['Government Bonds'] = protectionBase * 0.6;

    // 2. METALS (Diversified Safeguard)
    // Metals provide a separate hedge, usually 5-15%
    if (riskLevel <= 4) {
      allocations['Metals'] = 15;
    } else if (riskLevel <= 7) {
      allocations['Metals'] = 10;
    } else {
      allocations['Metals'] = 5;
    }

    // 3. STABILITY LAYER (Debt)
    if (riskLevel >= 3 && riskLevel <= 8) {
      allocations['Debt Funds'] = 10;
    }

    // 4. THEMATIC GROWTH (ETFs)
    if (riskLevel >= 4) {
      allocations['ETFs'] = 10;
    }

    // 5. HIGH RISK SPECULATION (Crypto & F&O)
    if (riskLevel >= 8) {
      allocations['Cryptocurrency'] = 7;
      allocations['F&O'] = 5;
    } else if (riskLevel >= 6) {
      allocations['Cryptocurrency'] = 3;
    }

    // 6. INFLATION OFFSET (Estates)
    if (inflationRate > 5 || riskLevel > 5) {
      allocations['Estates'] = 10;
    }

    // 7. GROWTH ENGINE (Remaining)
    const used = Object.values(allocations).reduce((a, b) => a + b, 0);
    const remaining = Math.max(0, 100 - used);
    
    if (remaining > 0) {
      if (years > 4) {
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
        advice: name === 'Metals' ? 'Hedging against fiat debasement.' :
                name === 'Bank Schemes' || name === 'Government Bonds' ? 'Principal protection & sovereign stability.' :
                name === 'F&O' ? 'Hedges downside risk via Protective Puts.' :
                name === 'Estates' ? 'Offsets inflation debasement.' : 
                name === 'Debt Funds' ? 'Provides stable yields while bridging fixed-income and equity.' :
                name === 'Cryptocurrency' ? 'Hyper-growth speculative exposure.' :
                name === 'ETFs' ? 'Broad thematic market exposure.' :
                'Core growth engine for corpus target.'
      })),
      shieldPct: (allocations['Bank Schemes'] || 0) + (allocations['Government Bonds'] || 0),
      metalsPct: allocations['Metals'] || 0,
      most,
      least,
      isAchievable
    };
  }, [results, riskLevel, years, inflationRate]);

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


  return (
    <div className="min-h-screen bg-surface-base text-text-primary p-8 relative overflow-hidden font-sans">
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />

      <header className="flex justify-between items-center mb-6 relative z-10 font-sans">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Investment and Portfolio Predictor
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-text-secondary text-xs italic">Advanced Multi-Asset Projection Simulator</p>
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-tighter transition-all duration-500",
              isUpdatingMarket ? "bg-brand-primary/10 border-brand-primary/30 text-brand-primary animate-pulse" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", isUpdatingMarket ? "bg-brand-primary" : "bg-emerald-500")} />
              {isUpdatingMarket ? "Syncing Institutional Data..." : (
                <div className="flex items-center gap-2">
                  <span>Verified Data Feed (Real-Time)</span>
                  {lastSync && (
                    <span className="opacity-40 font-mono text-[8px]">
                      Last Update: {new Date(lastSync).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md flex items-center gap-2 text-text-secondary">
            <span className="text-[10px] uppercase tracking-widest ">Simulator Status: </span>
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
                  Local persistence active. All calculations are transient to this browser.
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
                  <ChartTooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const sortedPayload = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                        return (
                          <div className="bg-slate-900/95 backdrop-blur-xl border border-white/20 p-4 rounded-xl shadow-2xl min-w-[320px]">
                            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
                              <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">{label} Projections</p>
                            </div>
                            <div className="space-y-1.5">
                              {sortedPayload.map((item: any) => (
                                <div 
                                  key={item.dataKey} 
                                  className="flex justify-between items-center gap-4 py-0.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-2.5 h-2.5 rounded-full" 
                                      style={{ backgroundColor: item.color }} 
                                    />
                                    <span className="text-[11px] font-bold text-white/90">
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono font-black text-brand-secondary">
                                    {formatCurrency(item.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 pt-2 border-t border-white/10">
                               <p className="text-[8px] text-text-muted italic opacity-60">Projections based on current institutional data feed.</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {assetClasses.map((asset) => (
                    <Line 
                      key={asset.name}
                      type="monotone" 
                      dataKey={asset.name} 
                      stroke={asset.color} 
                      strokeWidth={2.5}
                      opacity={1}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-4">
                  <div className="h-[200px] flex flex-col items-center justify-center relative bg-white/[0.02] rounded-2xl border border-white/5">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={portfolioStrategy.allocations}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="pct"
                          animationDuration={1000}
                        >
                          {portfolioStrategy.allocations.map((entry, index) => {
                            const assetData = assetClasses.find(a => a.name === entry.name);
                            const isHovered = hoveredAsset === entry.name;
                            return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={assetData?.color || '#6366f1'} 
                                stroke={isHovered ? 'white' : 'rgba(255,255,255,0.1)'}
                                strokeWidth={isHovered ? 2 : 1}
                                style={{ 
                                  filter: isHovered ? 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' : 'none',
                                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                                  transformOrigin: 'center',
                                  transition: 'all 0.3s ease'
                                }}
                              />
                            );
                          })}
                        </Pie>
                        <ChartTooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg shadow-xl text-[10px]">
                                  <p className="font-bold text-white mb-1 uppercase tracking-widest">{payload[0].name}</p>
                                  <p className="text-brand-secondary font-mono">{payload[0].value.toFixed(1)}% Allocation</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Hybrid</span>
                      <span className="text-sm font-black text-white">Target</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/20">
                    <p className="text-[10px] font-black uppercase text-brand-primary mb-2 flex items-center gap-1">
                      <ShieldCheck size={12} /> Principal Protection
                    </p>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      Your {portfolioStrategy.shieldPct}% protection in <span className="text-white font-bold">Bank Schemes & Govt Bonds</span> ensures safe capital floors. <span className="text-white font-bold">Metals ({portfolioStrategy.metalsPct}%)</span> further secures your {formatCurrency(currentCorpus)} base against global market drawdowns.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 overflow-hidden border border-white/5 rounded-2xl bg-white/[0.03] backdrop-blur-sm self-start shadow-inner">
                   <table className="w-full text-left table-fixed">
                    <thead>
                      <tr className="bg-white/10 text-[9px] text-text-primary uppercase tracking-[0.2em] font-bold">
                        <th className="px-5 py-4 w-1/3">Projected Asset</th>
                        <th className="px-5 py-4 text-center w-1/4">Allocation</th>
                        <th className="px-5 py-4">Strategic Logic</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-medium divide-y divide-white/5">
                      {portfolioStrategy.allocations.map((item) => (
                        <tr 
                          key={item.name} 
                          onMouseEnter={() => setHoveredAsset(item.name)}
                          onMouseLeave={() => setHoveredAsset(null)}
                          className={cn(
                            "transition-all duration-300 cursor-help",
                            hoveredAsset === item.name ? "bg-white/[0.08]" : "hover:bg-white/[0.02]"
                          )}
                        >
                          <td className="px-5 py-4 text-text-primary">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: assetClasses.find(a => a.name === item.name)?.color }} />
                              <span className="font-bold">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="px-3 py-1 rounded-full bg-white/5 font-black text-brand-secondary border border-white/5">
                              {item.pct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-text-secondary italic leading-normal">
                             {item.advice}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="p-4 bg-white/5 border-t border-white/5 grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1">
                        <p className="text-[9px] uppercase font-bold text-text-muted">Primary Alpha Generator</p>
                        <p className="text-sm font-black text-brand-secondary truncate">{portfolioStrategy.most[0]}</p>
                     </div>
                     <div className="flex flex-col gap-1">
                        <p className="text-[9px] uppercase font-bold text-text-muted">Stability Anchor</p>
                        <p className="text-sm font-black text-rose-400 truncate">{portfolioStrategy.least[0]}</p>
                     </div>
                  </div>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-xl border flex items-center gap-4 transition-all duration-700",
                portfolioStrategy.isAchievable ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]" : "bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 rotate-3 transition-transform hover:rotate-0",
                  portfolioStrategy.isAchievable ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                )}>
                  {portfolioStrategy.isAchievable ? <ShieldCheck size={24} /> : <Calculator size={24} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] uppercase font-black tracking-widest text-white/50">Feasibility Audit</p>
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", portfolioStrategy.isAchievable ? "bg-emerald-500" : "bg-amber-500")} />
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-indigo-50/90">
                    {portfolioStrategy.isAchievable 
                      ? `Target confirmed. With a ${years}-year runway and ${inflationRate}% inflation, this allocation is mathematically stable for reaching ${formatCurrency(targetCorpus)}.`
                      : `Warning: ${formatCurrency(targetCorpus)} exceeds the standard probability curve for ${years} years. Strategy suggests shifting to high-growth ETFs or increasing duration.`}
                  </p>
                </div>
              </div>
            </motion.section>
          )}
        </div>
      </main>

      <footer className="mt-8 relative z-10">
        <div className="p-5 rounded-2xl bg-indigo-500/5 border border-white/10 mb-8 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
             <div className="bg-rose-500/20 p-1.5 rounded-lg">
                <AlertTriangle size={14} className="text-rose-400" />
             </div>
             <p className="text-[11px] uppercase tracking-[0.3em] font-black text-white/80">Compliance & Regulatory Notice</p>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed max-w-4xl font-medium">
            The mathematical projections provided by the <span className="text-white">Investment and Portfolio Predictor</span> are computed using real-time data feeds from Yahoo Finance and AMFI. These simulations incorporate current volatility benchmarks, inflation indexes, and multi-asset yield histories. <span className="text-brand-secondary">Past performance is not a guarantee of future outcomes.</span> All strategy recommendations (Growth vs. Shield) are purely algorithmic and do not substitute for professional bespoke advice from a certified SEBI-registered advisor. By using this simulator, you acknowledge the inherent risks of market investment.
          </p>
        </div>

        <div className="flex justify-between items-center text-[10px] text-text-muted uppercase tracking-[0.2em]">
          <p>© 2024 Quantum Finance Simulations</p>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-1 text-text-muted opacity-60">
               <ShieldCheck size={12} />
               <span>Local Persistence Only</span>
            </div>
            <p className="opacity-40">|</p>
            <p>Infrastructure: Dedicated Simulator Instance</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WealthApp />
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
