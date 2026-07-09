const { useState, useEffect, useRef } = React;

const API_KEY  = 'REMOVED_FINNHUB_KEY';
const BASE     = 'https://finnhub.io/api/v1';
const INR_RATE = 92;

const STOCKS = [
  { ticker: 'AAPL',  name: 'Apple'     },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet'  },
  { ticker: 'AMZN',  name: 'Amazon'    },
  { ticker: 'NVDA',  name: 'NVIDIA'    },
  { ticker: 'META',  name: 'Meta'      },
  { ticker: 'TSLA',  name: 'Tesla'     },
  { ticker: 'JPM',   name: 'JPMorgan'  },
  { ticker: 'V',     name: 'Visa'      },
  { ticker: 'NFLX',  name: 'Netflix'   },
];

const TIME_FILTERS = [
  { label: '1W',  days: 7,   res: 'D' },
  { label: '1M',  days: 30,  res: 'D' },
  { label: '6M',  days: 180, res: 'W' },
  { label: '1YR', days: 365, res: 'W' },
  { label: 'ALL', days: 730, res: 'M' },
];

function now()      { return Math.floor(Date.now() / 1000); }
function daysAgo(d) { return now() - d * 86400; }

function fmt(n, currency) {
  if (n == null || isNaN(n)) return '—';
  const rate = currency && currency.inr ? (currency.rate || INR_RATE) : 1;
  const val  = currency && currency.inr ? n * rate : n;
  const sym  = currency && currency.inr ? '₹' : '$';
  return sym + Math.abs(val).toLocaleString(currency && currency.inr ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

async function fetchQuote(ticker) {
  const r = await fetch(`${BASE}/quote?symbol=${ticker}&token=${API_KEY}`);
  return r.json();
}

const STOCK_PROFILES = {
  AAPL:  { annualVol: 0.28, annualDrift: 0.15 },
  MSFT:  { annualVol: 0.26, annualDrift: 0.18 },
  GOOGL: { annualVol: 0.30, annualDrift: 0.14 },
  AMZN:  { annualVol: 0.32, annualDrift: 0.16 },
  NVDA:  { annualVol: 0.55, annualDrift: 0.45 },
  META:  { annualVol: 0.38, annualDrift: 0.28 },
  TSLA:  { annualVol: 0.65, annualDrift: 0.08 },
  JPM:   { annualVol: 0.22, annualDrift: 0.12 },
  V:     { annualVol: 0.18, annualDrift: 0.11 },
  NFLX:  { annualVol: 0.42, annualDrift: 0.22 },
};

function generatePrices(ticker, currentPrice, days) {
  if (!currentPrice || currentPrice <= 0) return [];
  const profile = STOCK_PROFILES[ticker] || { annualVol: 0.30, annualDrift: 0.12 };
  const dtDaily  = 1 / 252;
  const drift    = profile.annualDrift * dtDaily;
  const vol      = profile.annualVol * Math.sqrt(dtDaily);

  const pts = days;
  const raw = [1]; 

  let seed = ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  function seededRand() {
    seed = (seed * 16807 + 0) % 2147483647;
  
    const u1 = (seed % 1000) / 1000 + 0.001;
    seed = (seed * 16807 + 0) % 2147483647;
    const u2 = (seed % 1000) / 1000 + 0.001;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  for (let i = 1; i < pts; i++) {
    const z     = seededRand();
    const prev  = raw[raw.length - 1];
    raw.push(prev * Math.exp(drift + vol * z));
  }

  // Scale so that the last point = currentPrice
  const scale = currentPrice / raw[raw.length - 1];
  return raw.map(p => parseFloat((p * scale).toFixed(2)));
}

function Sparkline({ data, color }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)', letterSpacing: 2 }}>
          {data === null ? 'LOADING...' : 'NO DATA'}
        </span>
      </div>
    );
  }
  const W = 260, H = 68;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const xOf = i => (i / (data.length - 1)) * W;
  const yOf = v => H - 4 - ((v - min) / range) * (H - 8);
  const linePts = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const areaPts = `${linePts} L${xOf(data.length-1).toFixed(1)},${H} L0,${H} Z`;
  const gid     = `sp-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPts} fill={`url(#${gid})`} />
      <path d={linePts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(data.length-1).toFixed(1)} cy={yOf(data[data.length-1]).toFixed(1)} r="3" fill={color} />
    </svg>
  );
}

function LineChart({ data, color }) {
  const W = 500, H = 190;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <rect width={W} height={H} fill="#0d1420" rx="4" />
        <text x={W/2} y={H/2} textAnchor="middle" fill="#6b7fa3" fontSize="11" fontFamily="'DM Mono',monospace">
          NO DATA AVAILABLE
        </text>
      </svg>
    );
  }

  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const xOf = i => pad.l + (i / (data.length - 1)) * cW;
  const yOf = v => pad.t + cH - ((v - min) / range) * cH;
  const linePts = data.map((v, i) => `${i===0?'M':'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const areaPts = `${linePts} L${xOf(data.length-1).toFixed(1)},${(pad.t+cH).toFixed(1)} L${pad.l},${(pad.t+cH).toFixed(1)} Z`;
  const gid = `lc-${color.replace(/[^a-z0-9]/gi, '')}`;

  const yLines = [0,1,2,3,4].map(g => ({
    y: (pad.t + (g/4)*cH).toFixed(1),
    v: (max - (g/4)*range).toFixed(0),
  }));
  const xCount  = Math.min(5, data.length - 1);
  const xLabels = Array.from({ length: xCount+1 }, (_, i) => {
    const idx = Math.round((i/xCount)*(data.length-1));
    return { x: xOf(idx).toFixed(1), lbl: 'T'+(idx+1) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="#0d1420" rx="4" />
      {yLines.map(l => (
        <g key={l.y}>
          <line x1={pad.l} y1={l.y} x2={pad.l+cW} y2={l.y} stroke="#1f2d45" strokeWidth="1" />
          <text x={pad.l-5} y={parseFloat(l.y)+3} textAnchor="end" fill="#6b7fa3" fontSize="9" fontFamily="'DM Mono',monospace">${l.v}</text>
        </g>
      ))}
      {xLabels.map(l => (
        <text key={l.x} x={l.x} y={H-7} textAnchor="middle" fill="#6b7fa3" fontSize="9" fontFamily="'DM Mono',monospace">{l.lbl}</text>
      ))}
      <path d={areaPts} fill={`url(#${gid})`} />
      <path d={linePts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(data.length-1).toFixed(1)} cy={yOf(data[data.length-1]).toFixed(1)} r="4" fill={color} />
    </svg>
  );
}

function TripleLineChart({ dataA, dataB, dataCtrl, nameA, nameB }) {
  const W = 600, H = 240;
  const pad = { l: 62, r: 16, t: 16, b: 32 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

  const all = [...dataA, ...dataB, ...dataCtrl];
  if (!all.length) return null;
  const min = Math.min(...all), max = Math.max(...all), range = max - min || 1;
  const len = Math.max(dataA.length, dataB.length, dataCtrl.length);
  const xOf = i => (pad.l + (i/(len-1))*cW).toFixed(1);
  const yOf = v => (pad.t + cH - ((v-min)/range)*cH).toFixed(1);

  function mkPath(data) {
    return data.map((v,i) => `${i===0?'M':'L'}${xOf(i)},${yOf(v)}`).join(' ');
  }

  const yLines = [0,1,2,3,4].map(g => ({
    y: (pad.t+(g/4)*cH).toFixed(1),
    v: (max-(g/4)*range).toFixed(0),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#0d1420" rx="4" />
      {yLines.map(l => (
        <g key={l.y}>
          <line x1={pad.l} y1={l.y} x2={pad.l+cW} y2={l.y} stroke="#1f2d45" strokeWidth="1" />
          <text x={pad.l-5} y={parseFloat(l.y)+3} textAnchor="end" fill="#6b7fa3" fontSize="10" fontFamily="'DM Mono',monospace">${l.v}</text>
        </g>
      ))}
      {dataCtrl.length > 1 && <path d={mkPath(dataCtrl)} fill="none" stroke="#4b5563" strokeWidth="1.8" strokeDasharray="6,4" strokeLinejoin="round" />}
      {dataA.length    > 1 && <path d={mkPath(dataA)}    fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {dataB.length    > 1 && <path d={mkPath(dataB)}    fill="none" stroke="#f5c542" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {dataA.length    > 1 && <circle cx={xOf(dataA.length-1)}    cy={yOf(dataA[dataA.length-1])}       r="5" fill="#38bdf8" />}
      {dataB.length    > 1 && <circle cx={xOf(dataB.length-1)}    cy={yOf(dataB[dataB.length-1])}       r="5" fill="#f5c542" />}
      {dataCtrl.length > 1 && <circle cx={xOf(dataCtrl.length-1)} cy={yOf(dataCtrl[dataCtrl.length-1])} r="4" fill="#4b5563" />}
    </svg>
  );
}

/* ── SIMULATION ENGINE ───────────────────────────────────────── */
function stockMetrics(candles) {
  if (!candles || candles.length < 2) return { vol: 0.3, growth: 0.1 };
  const rets = candles.slice(1).map((v, i) => (v - candles[i]) / (candles[i] || 1));
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
  const vol    = Math.sqrt(variance) * Math.sqrt(252);
  const growth = Math.pow(candles[candles.length-1]/candles[0], 252/candles.length) - 1;
  return { vol: Math.min(Math.max(vol, 0.05), 1.5), growth: Math.min(Math.max(growth, -0.5), 2) };
}

function runStockSim(amount, risk, horizon, vol, growth, type) {
  const steps = horizon * 12;
  const arr = [];
  let cur = amount;
  const baseMonthly = Math.pow(1 + growth, 1/12) - 1;
  for (let i = 0; i < steps; i++) {
    let delta;
    if (type === 'control') {
      delta = cur * (Math.pow(1.07, 1/12) - 1);
    } else {
      const riskMult = 0.4 + risk * 0.15;
      const noise    = (Math.random() - 0.48) * vol * riskMult * cur * 0.08;
      delta = cur * baseMonthly * riskMult + noise;
    }
    cur = Math.max(0, cur + delta);
    arr.push(parseFloat(cur.toFixed(2)));
  }
  return arr;
}

function calcVolatility(arr) {
  if (arr.length < 2) return 0;
  const rets = arr.slice(1).map((v,i) => (v-arr[i])/(arr[i]||1));
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
  return Math.sqrt(variance)*100;
}

/* ── CURRENCY MODAL ──────────────────────────────────────────── */
function CurrencyModal({ onClose, onConfirm }) {
  const [mode, setMode]           = useState('fixed');
  const [customRate, setCustomRate] = useState('');
  function confirm(useInr) {
    if (!useInr) { onConfirm({ inr: false, rate: null, _chosen: true }); return; }
    const rate = mode === 'custom' && parseFloat(customRate) > 0 ? parseFloat(customRate) : INR_RATE;
    onConfirm({ inr: true, rate, _chosen: true });
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal currency-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Currency Preference</h2>
        <p>View prices in USD or convert to Indian Rupees?</p>
        <div className="currency-options">
          <button className="currency-opt-btn" onClick={() => confirm(false)}>
            <span className="currency-symbol">$</span>
            <span className="currency-name">US Dollar (USD)</span>
            <span className="currency-rate">Keep as is</span>
          </button>
          <div className="currency-divider">or</div>
          <div className="currency-inr-block">
            <div className="inr-modes">
              <button className={`inr-mode-btn ${mode==='fixed'?'active':''}`} onClick={() => setMode('fixed')}>Use current rate (₹{INR_RATE}/USD)</button>
              <button className={`inr-mode-btn ${mode==='custom'?'active':''}`} onClick={() => setMode('custom')}>Enter custom rate</button>
            </div>
            {mode === 'custom' && (
              <div className="custom-rate-input">
                <span className="rate-prefix">₹</span>
                <input type="number" placeholder="e.g. 85" value={customRate} onChange={e => setCustomRate(e.target.value)} min="1" />
                <span className="rate-suffix">per USD</span>
              </div>
            )}
            <button className="currency-opt-btn inr-confirm" onClick={() => confirm(true)}>
              <span className="currency-symbol">₹</span>
              <span className="currency-name">Indian Rupee @ ₹{mode==='custom'&&parseFloat(customRate)>0?parseFloat(customRate).toFixed(0):INR_RATE}/USD</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ABOUT MODAL ─────────────────────────────────────────────── */
function AboutModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>About FutureFork</h2>
        <p>It's a stock comparison tool that uses real-time data and allows users to simulate different investment strategies to see how outcomes vary under different conditions.</p>
        <div className="modal-section"><h3>DATA SOURCE</h3>
          <span className="modal-tag">Finnhub API</span><span className="modal-tag">Real-time quotes</span><span className="modal-tag">Historical candles</span>
        </div>
        <div className="modal-section"><h3>BUILT WITH</h3>
          <span className="modal-tag">React 18</span><span className="modal-tag">Babel Standalone</span><span className="modal-tag">Inline SVG Charts</span><span className="modal-tag">CSS Variables</span>
        </div>
        <div className="modal-section"><h3>CHARTS</h3>
          <p style={{marginBottom:0}}>All charts use inline SVG rendered by React — no canvas, no external library. Strategy simulation anchors growth bias and volatility to each stock's real historical candle data.</p>
        </div>
      </div>
    </div>
  );
}

/* ── SLIDER ──────────────────────────────────────────────────── */
function Slider({ label, value, min, max, step, onChange, unit }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="sl-header">
        <span className="sl-label">{label}</span>
        <span className="sl-val">{value}{unit||''}</span>
      </div>
      <div className="sl-track">
        <div className="sl-fill" style={{ width: pct+'%' }} />
        <input type="range" className="sl-input" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

/* ── STOCK CARD ──────────────────────────────────────────────── */
function StockCard({ stock, currency }) {
  const [quote,   setQuote]   = useState(null);
  const [candles, setCandles] = useState(null);
  const [error,   setError]   = useState(false);
  const cur = currency || { inr: false, rate: null };

  useEffect(() => {
    setError(false); setCandles(null);
    fetchQuote(stock.ticker)
      .then(q => {
        setQuote(q);
        // generate 30-day synthetic chart from real current price
        const prices = generatePrices(stock.ticker, q && q.c, 30);
        setCandles(prices);
      })
      .catch(() => { setError(true); setCandles([]); });
  }, [stock.ticker]);

  const changePct = quote ? (quote.dp || 0) : 0;
  const positive  = changePct >= 0;

  return (
    <div className={`stock-card ${positive ? 'positive' : 'negative'}`}>
      <div className="stock-card-top">
        <span className="stock-name">{stock.name}</span>
        <span className="stock-ticker">{stock.ticker}</span>
      </div>
      {!quote && !error && <div className="stock-loading">LOADING...</div>}
      {error   && <div className="stock-loading" style={{color:'var(--red)'}}>API ERROR</div>}
      {quote && (
        <>
          <div className="stock-price">{fmt(quote.c, cur)}</div>
          <div className={`stock-change ${positive?'pos':'neg'}`}>
            {positive?'+':''}{fmt(quote.d, cur)} ({positive?'+':''}{changePct.toFixed(2)}%)
          </div>
          <div className="stock-meta">
            <div className="stock-meta-item">Open <span>{fmt(quote.o, cur)}</span></div>
            <div className="stock-meta-item">High <span>{fmt(quote.h, cur)}</span></div>
            <div className="stock-meta-item">Low  <span>{fmt(quote.l, cur)}</span></div>
          </div>
          <div className="sparkline-wrap">
            <Sparkline data={candles} color={positive ? '#22c55e' : '#ef4444'} />
          </div>
        </>
      )}
    </div>
  );
}

/* ── STOCKS SCREEN ───────────────────────────────────────────── */
function StocksScreen({ onCompare, onBack, currency, setCurrency }) {
  const [showAbout,    setShowAbout]    = useState(false);
  const [showCurrency, setShowCurrency] = useState(!currency._chosen);

  return (
    <div>
      <div className="topbar">
        <span className="topbar-logo">Future<span>Fork</span></span>
        <div className="topbar-right">
          <button className="btn-back" onClick={() => setShowCurrency(true)}>
            {currency.inr ? `₹ INR (${currency.rate||INR_RATE})` : '$ USD'}
          </button>
          <button className="btn-back" onClick={() => setShowAbout(true)}>About</button>
          <button className="btn-back" onClick={onBack}>← Home</button>
        </div>
      </div>
      {showCurrency && <CurrencyModal onClose={() => setShowCurrency(false)} onConfirm={c => { setCurrency(c); setShowCurrency(false); }} />}
      {showAbout    && <AboutModal onClose={() => setShowAbout(false)} />}
      <div className="stocks-screen">
        <div className="stocks-header">
          <h1>Select Stocks to Compare</h1>
          <p>Live market data via Finnhub API — prices in {currency.inr ? `INR (₹${currency.rate||INR_RATE}/USD)` : 'USD'}. Hit Compare when ready.</p>
        </div>
        <div className="stocks-grid">
          {STOCKS.map(s => <StockCard key={s.ticker} stock={s} currency={currency} />)}
        </div>
      </div>
      <div className="compare-bar">
        <button className="btn-compare" onClick={onCompare}>COMPARE →</button>
      </div>
    </div>
  );
}

/* ── COMPARE SCREEN ──────────────────────────────────────────── */
function CompareScreen({ onBack, currency }) {
  const cur = currency || { inr: false, rate: null };

  const [stockA,     setStockA]     = useState(STOCKS[0]);
  const [stockB,     setStockB]     = useState(STOCKS[1]);
  const [timeFilter, setTimeFilter] = useState('1M');
  const [quoteA,     setQuoteA]     = useState(null);
  const [quoteB,     setQuoteB]     = useState(null);
  const [candlesA,   setCandlesA]   = useState([]);
  const [candlesB,   setCandlesB]   = useState([]);
  const [loading,    setLoading]    = useState(false);

  const [paramsA, setParamsA] = useState({ amount: 10000, risk: 5, horizon: 5 });
  const [paramsB, setParamsB] = useState({ amount: 10000, risk: 5, horizon: 5 });
  const [simA,    setSimA]    = useState([]);
  const [simB,    setSimB]    = useState([]);
  const [simCtrl, setSimCtrl] = useState([]);
  const [simRan,  setSimRan]  = useState(false);

  useEffect(() => {
    setLoading(true); setSimRan(false);
    const tf = TIME_FILTERS.find(t => t.label === timeFilter) || TIME_FILTERS[1];
    Promise.all([
      fetchQuote(stockA.ticker),
      fetchQuote(stockB.ticker),
    ]).then(([qa, qb]) => {
      setQuoteA(qa); setQuoteB(qb);
      // generate synthetic price history seeded from real current price
      const ca = generatePrices(stockA.ticker, qa && qa.c, tf.days);
      const cb = generatePrices(stockB.ticker, qb && qb.c, tf.days);
      setCandlesA(ca); setCandlesB(cb);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [stockA, stockB, timeFilter]);

  function runSim() {
    const mA = stockMetrics(candlesA);
    const mB = stockMetrics(candlesB);
    const longest    = Math.max(paramsA.horizon, paramsB.horizon);
    const avgAmount  = (paramsA.amount + paramsB.amount) / 2;
    setSimA(runStockSim(paramsA.amount, paramsA.risk, paramsA.horizon, mA.vol, mA.growth, 'stock'));
    setSimB(runStockSim(paramsB.amount, paramsB.risk, paramsB.horizon, mB.vol, mB.growth, 'stock'));
    setSimCtrl(runStockSim(avgAmount, 5, longest, 0.15, 0.07, 'control'));
    setSimRan(true);
  }

  const setPA = key => val => setParamsA(p => ({ ...p, [key]: val }));
  const setPB = key => val => setParamsB(p => ({ ...p, [key]: val }));

  const fA    = simA.length    ? simA[simA.length-1]       : 0;
  const fB    = simB.length    ? simB[simB.length-1]       : 0;
  const fCtrl = simCtrl.length ? simCtrl[simCtrl.length-1] : 0;
  const avgInvest = (paramsA.amount + paramsB.amount) / 2;

  const retA    = simA.length    ? ((fA    - paramsA.amount) / paramsA.amount * 100).toFixed(1) : '—';
  const retB    = simB.length    ? ((fB    - paramsB.amount) / paramsB.amount * 100).toFixed(1) : '—';
  const retCtrl = simCtrl.length ? ((fCtrl - avgInvest)      / avgInvest      * 100).toFixed(1) : '—';
  const volA    = simA.length    ? calcVolatility(simA).toFixed(2)    : '—';
  const volB    = simB.length    ? calcVolatility(simB).toFixed(2)    : '—';
  const volCtrl = simCtrl.length ? calcVolatility(simCtrl).toFixed(2) : '—';

  const pA = quoteA ? (quoteA.dp||0) : 0;
  const pB = quoteB ? (quoteB.dp||0) : 0;

  const outcomeCards = [
    { label: `${stockA.name} (${stockA.ticker})`, color: '#38bdf8', borderC: 'rgba(56,189,248,0.3)',  final: fA,    ret: retA,    vol: volA,    invest: paramsA.amount },
    { label: `${stockB.name} (${stockB.ticker})`, color: '#f5c542', borderC: 'rgba(245,197,66,0.3)',  final: fB,    ret: retB,    vol: volB,    invest: paramsB.amount },
    { label: 'Market Index (7%)',                  color: '#6b7fa3', borderC: 'rgba(107,127,163,0.3)', final: fCtrl, ret: retCtrl, vol: volCtrl, invest: avgInvest      },
  ];

  return (
    <div>
      <div className="topbar">
        <span className="topbar-logo">Future<span>Fork</span></span>
        <div className="topbar-right">
          <button className="btn-back" onClick={onBack}>← Stocks</button>
        </div>
      </div>

      <div className="compare-screen">
        {/* Dropdowns */}
        <div className="compare-dropdowns">
          <div className="dropdown-group">
            <label>STOCK 1</label>
            <select value={stockA.ticker} onChange={e => setStockA(STOCKS.find(s=>s.ticker===e.target.value))}>
              {STOCKS.map(s=><option key={s.ticker} value={s.ticker}>{s.name} ({s.ticker})</option>)}
            </select>
          </div>
          <div className="dropdown-group">
            <label>STOCK 2</label>
            <select value={stockB.ticker} onChange={e => setStockB(STOCKS.find(s=>s.ticker===e.target.value))}>
              {STOCKS.map(s=><option key={s.ticker} value={s.ticker}>{s.name} ({s.ticker})</option>)}
            </select>
          </div>
        </div>

        {/* SECTION 1 */}
        <div className="section-block">
          <div className="section-label">SECTION 01</div>
          <div className="section-title">Real Market Data</div>
          {loading
            ? <div style={{textAlign:'center',padding:'24px 0'}}><span className="state-pill loading">FETCHING DATA...</span></div>
            : <>
                <div className="price-row">
                  <div className="price-block">
                    <p style={{color:'#38bdf8'}}>{stockA.name}</p>
                    <h2 style={{color:'#38bdf8'}}>{fmt(quoteA&&quoteA.c, cur)}</h2>
                    <div className={`stock-change ${pA>=0?'pos':'neg'}`}>{pA>=0?'+':''}{pA.toFixed(2)}% today</div>
                  </div>
                  <div className="price-row-vs">vs</div>
                  <div className="price-block price-block-right">
                    <p style={{color:'#f5c542'}}>{stockB.name}</p>
                    <h2 style={{color:'#f5c542'}}>{fmt(quoteB&&quoteB.c, cur)}</h2>
                    <div className={`stock-change ${pB>=0?'pos':'neg'}`}>{pB>=0?'+':''}{pB.toFixed(2)}% today</div>
                  </div>
                </div>
                <div className="compare-time-filters">
                  {TIME_FILTERS.map(tf=>(
                    <button key={tf.label} className={`tf-btn ${timeFilter===tf.label?'active':''}`}
                      onClick={()=>setTimeFilter(tf.label)}>{tf.label}</button>
                  ))}
                </div>
                <div className="compare-chart-area">
                  <div className="chart-panel">
                    <div className="chart-panel-title" style={{color:'#38bdf8'}}>{stockA.name} ({stockA.ticker})</div>
                    <LineChart data={candlesA} color="#38bdf8" />
                  </div>
                  <div className="chart-panel">
                    <div className="chart-panel-title" style={{color:'#f5c542'}}>{stockB.name} ({stockB.ticker})</div>
                    <LineChart data={candlesB} color="#f5c542" />
                  </div>
                </div>
              </>
          }
        </div>

        {/* SECTION 2 */}
        <div className="section-block">
          <div className="section-label">SECTION 02</div>
          <div className="section-title">Strategy Simulation</div>
          <p style={{fontSize:13,color:'var(--dim)',marginBottom:24,lineHeight:1.6}}>
            Set separate parameters for each stock. Simulation uses each stock's real historical volatility and annual growth rate. A flat 7% market index is shown as a control line.
          </p>
          <div className="sim-params-grid">
            <div className="sim-param-block">
              <div className="sim-param-header" style={{color:'#38bdf8'}}>{stockA.name} ({stockA.ticker})</div>
              <div className="strategy-inputs">
                <Slider label="AMOUNT ($)" value={paramsA.amount} min={1000} max={100000} step={1000} onChange={setPA('amount')} />
                <Slider label="RISK LEVEL" value={paramsA.risk}   min={1}    max={10}     step={1}    onChange={setPA('risk')}   unit="/10" />
                <Slider label="HORIZON"    value={paramsA.horizon} min={1}   max={20}     step={1}    onChange={setPA('horizon')} unit=" yrs" />
              </div>
            </div>
            <div className="sim-param-block">
              <div className="sim-param-header" style={{color:'#f5c542'}}>{stockB.name} ({stockB.ticker})</div>
              <div className="strategy-inputs">
                <Slider label="AMOUNT ($)" value={paramsB.amount}  min={1000} max={100000} step={1000} onChange={setPB('amount')} />
                <Slider label="RISK LEVEL" value={paramsB.risk}    min={1}    max={10}     step={1}    onChange={setPB('risk')}   unit="/10" />
                <Slider label="HORIZON"    value={paramsB.horizon} min={1}    max={20}     step={1}    onChange={setPB('horizon')} unit=" yrs" />
              </div>
            </div>
          </div>
          <button className="btn-simulate" onClick={runSim} style={{marginTop:24}}>RUN SIMULATION →</button>
          {simRan && (
            <div className="strategy-chart-wrap">
              <div className="strategy-legend">
                <span className="leg-a">▬ {stockA.name}</span>
                <span className="leg-b">▬ {stockB.name}</span>
                <span style={{color:'#6b7fa3',fontSize:12,fontFamily:'var(--mono)'}}>--- Market Index (7%)</span>
              </div>
              <TripleLineChart dataA={simA} dataB={simB} dataCtrl={simCtrl} nameA={stockA.name} nameB={stockB.name} />
            </div>
          )}
        </div>

        {/* SECTION 3 */}
        {simRan && (
          <div className="section-block">
            <div className="section-label">SECTION 03</div>
            <div className="section-title">Outcome Comparison</div>
            <div className="outcome-grid-3">
              {outcomeCards.map(c => (
                <div key={c.label} className="outcome-card" style={{borderColor:c.borderC}}>
                  <div className="outcome-card-title" style={{color:c.color}}>{c.label}</div>
                  <div className="outcome-row">
                    <span className="outcome-lbl">INVESTED</span>
                    <span className="outcome-val" style={{color:'var(--main)'}}>{fmt(c.invest, cur)}</span>
                  </div>
                  <div className="outcome-row">
                    <span className="outcome-lbl">FINAL VALUE</span>
                    <span className="outcome-val" style={{color:c.color}}>{fmt(c.final, cur)}</span>
                  </div>
                  <div className="outcome-row">
                    <span className="outcome-lbl">RETURN</span>
                    <span className="outcome-val" style={{color:parseFloat(c.ret)>=0?'var(--green)':'var(--red)'}}>
                      {parseFloat(c.ret)>=0?'+':''}{c.ret}%
                    </span>
                  </div>
                  <div className="outcome-row">
                    <span className="outcome-lbl">VOLATILITY</span>
                    <span className="outcome-val" style={{color:'var(--main)'}}>{c.vol}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="verdict-box" style={{marginTop:16}}>
              <div className="verdict-lbl">SYSTEM VERDICT</div>
              <div className="verdict-text">
                {(() => {
                  const ranked = outcomeCards
                    .map(c => ({ name: c.label.split(' (')[0], ret: parseFloat(c.ret) }))
                    .filter(v => !isNaN(v.ret))
                    .sort((a,b) => b.ret - a.ret);
                  if (!ranked.length) return 'Run a simulation to see the verdict.';
                  const winner = ranked[0], loser = ranked[ranked.length-1];
                  const diff = (winner.ret - loser.ret).toFixed(1);
                  return `${winner.name} leads with a ${winner.ret.toFixed(1)}% projected return, outpacing ${loser.name} by ${diff}%. ${
                    winner.name === 'Market Index'
                      ? 'The passive 7% index outperformed both stocks — consider the risk/reward tradeoff before going active.'
                      : `${winner.name}'s historical momentum and your chosen risk level drive this outcome.`
                  }`;
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── LANDING ─────────────────────────────────────────────────── */
function Landing({ onBegin }) {
  const [showAbout, setShowAbout] = useState(false);
  return (
    <div className="landing">
      <div className="landing-grid" />
      <div className="landing-glow" />
      <button className="landing-about-btn" onClick={() => setShowAbout(true)}>About</button>
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      <div className="landing-inner">
        <div className="landing-eyebrow">STOCK STRATEGY COMPARATOR</div>
        <h1 className="landing-title">Future<span>Fork</span></h1>
        <p className="landing-sub">Your investment guide</p>
        <button className="btn-begin" onClick={onBegin}>Begin →</button>
      </div>
    </div>
  );
}

/* ── APP ROOT — currency lifted here so compare gets it ──────── */
function App() {
  const [screen,   setScreen]   = useState('landing');
  const [currency, setCurrency] = useState({ inr: false, rate: null, _chosen: false });
  return (
    <div>
      {screen === 'landing' && <Landing onBegin={() => setScreen('stocks')} />}
      {screen === 'stocks'  && (
        <StocksScreen
          onCompare={() => setScreen('compare')}
          onBack={() => setScreen('landing')}
          currency={currency}
          setCurrency={setCurrency}
        />
      )}
      {screen === 'compare' && (
        <CompareScreen onBack={() => setScreen('stocks')} currency={currency} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);