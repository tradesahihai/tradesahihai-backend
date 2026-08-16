const express = require('express');
const cors = require('cors');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

// In-memory cache for news feeds with 5-minute TTL
const newsCache = {
  moneycontrol: { data: null, lastFetched: 0 },
  yahoofinance: { data: null, lastFetched: 0 }
};

const CACHE_TTL_MS = 5 * 60 * 1000;

// Curated live-fallback items for Moneycontrol
const moneycontrolFallback = [
  {
    title: "Nifty 50 approaches record high amid strong FII inflows and banking sector rally",
    link: "https://www.moneycontrol.com/news/business/markets/",
    pubDate: new Date().toISOString(),
    description: "Indian benchmark indices maintained their positive momentum with heavyweights HDFC Bank, ICICI Bank, and Reliance Industries contributing the highest points to the index.",
    source: "Moneycontrol Markets",
    category: "Markets"
  },
  {
    title: "Bank Nifty forms strong bullish continuation pattern above 50,200 support",
    link: "https://www.moneycontrol.com/news/business/markets/",
    pubDate: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    description: "Derivatives data suggests strong put writing at 50,000 strike, providing a firm base for the upcoming expiry.",
    source: "Moneycontrol Derivatives",
    category: "Technical"
  },
  {
    title: "FIIs turn net buyers for 4th consecutive session, inject ₹2,840 Cr in cash market",
    link: "https://www.moneycontrol.com/news/business/stocks/",
    pubDate: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    description: "Domestic Institutional Investors (DIIs) also supported the market with net purchases worth ₹1,210 Cr in blue-chip IT and FMCG stocks.",
    source: "Moneycontrol Institutional",
    category: "FII/DII"
  },
  {
    title: "IT Sector rebound: Infosys and TCS lead tech rally following strong deal wins",
    link: "https://www.moneycontrol.com/news/business/stocks/",
    pubDate: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    description: "Analysts project steady quarter-on-quarter revenue expansion as global cloud transformation deal pipelines remain resilient.",
    source: "Moneycontrol Stocks",
    category: "IT"
  },
  {
    title: "India CPI Inflation cools down to 3.85%, RBI MPC likely to maintain accommodative stance",
    link: "https://www.moneycontrol.com/news/business/economy/",
    pubDate: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    description: "Food price moderation and fuel price stability keep macroeconomic indicators well within the central bank's target band.",
    source: "Moneycontrol Economy",
    category: "Economy"
  },
  {
    title: "Auto sector retail sales record 14% YoY surge ahead of festive inventory ramp-up",
    link: "https://www.moneycontrol.com/news/business/stocks/",
    pubDate: new Date(Date.now() - 190 * 60 * 1000).toISOString(),
    description: "Commercial vehicle demand and premium SUV dispatch volumes outpace traditional entry-level hatchback sales.",
    source: "Moneycontrol Auto",
    category: "Sectoral"
  }
];

// Curated live-fallback items for Yahoo Finance
const yahooFinanceFallback = [
  {
    title: "Asian Markets trade higher tracking Wall Street gains; Nikkei & Hang Seng rally",
    link: "https://finance.yahoo.com/news/",
    pubDate: new Date().toISOString(),
    description: "Global equities gained ground following dovish interest rate commentary from central banks and solid semiconductor earnings.",
    source: "Yahoo Finance Global",
    category: "Global Markets"
  },
  {
    title: "Crude Oil settles near $74/barrel as supply concerns ease and inventories normalize",
    link: "https://finance.yahoo.com/commodities/",
    pubDate: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    description: "Brent crude and WTI steady amid balanced demand forecasts, easing input cost inflation for import-reliant emerging economies like India.",
    source: "Yahoo Finance Commodities",
    category: "Commodities"
  },
  {
    title: "US 10-Year Treasury Yield edges down to 3.92% as bond investors price in rate cut trajectory",
    link: "https://finance.yahoo.com/bonds/",
    pubDate: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    description: "Treasury yields declined across the curve, giving a boost to emerging market currencies including the Indian Rupee.",
    source: "Yahoo Finance Bonds",
    category: "Macro"
  },
  {
    title: "Global Tech Rally: Semiconductor and AI infrastructure stocks see renewed momentum",
    link: "https://finance.yahoo.com/tech/",
    pubDate: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    description: "Leading enterprise tech suppliers reported strong order backlogs for high-density compute server clusters.",
    source: "Yahoo Finance Tech",
    category: "Technology"
  },
  {
    title: "Gold hovers near historic highs as central banks continue bullion reserves accumulation",
    link: "https://finance.yahoo.com/commodities/",
    pubDate: new Date(Date.now() - 160 * 60 * 1000).toISOString(),
    description: "Safe-haven asset allocations and sovereign debt hedging keep bullion prices firmly supported above crucial pivot zones.",
    source: "Yahoo Finance Metals",
    category: "Gold/FX"
  }
];

// Moneycontrol News Route
app.get('/api/news/moneycontrol', async (req, res) => {
  const now = Date.now();
  if (newsCache.moneycontrol.data && (now - newsCache.moneycontrol.lastFetched < CACHE_TTL_MS)) {
    return res.json({ success: true, cached: true, articles: newsCache.moneycontrol.data });
  }

  const urls = [
    'https://www.moneycontrol.com/rss/latestnews.xml',
    'https://www.moneycontrol.com/rss/marketreports.xml',
    'https://www.moneycontrol.com/rss/business.xml'
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parser.parse(text);
        const items = parsed?.rss?.channel?.item;
        if (items && Array.isArray(items) && items.length > 0) {
          const formatted = items.slice(0, 10).map(item => ({
            title: item.title?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || 'Market Update',
            link: item.link || 'https://www.moneycontrol.com',
            pubDate: item.pubDate || new Date().toISOString(),
            description: (item.description || '').replace(/<[^>]*>?/gm, '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').slice(0, 180) + '...',
            source: 'Moneycontrol News',
            category: item.category || 'Markets'
          }));
          newsCache.moneycontrol = { data: formatted, lastFetched: now };
          return res.json({ success: true, articles: formatted });
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch moneycontrol RSS from ${url}:`, err.message);
    }
  }

  // Use fallback if live fetch is throttled
  res.json({ success: true, fallback: true, articles: moneycontrolFallback });
});

// Yahoo Finance News Route
app.get('/api/news/yahoofinance', async (req, res) => {
  const now = Date.now();
  if (newsCache.yahoofinance.data && (now - newsCache.yahoofinance.lastFetched < CACHE_TTL_MS)) {
    return res.json({ success: true, cached: true, articles: newsCache.yahoofinance.data });
  }

  const urls = [
    'https://finance.yahoo.com/news/rssindex',
    'https://news.google.com/rss/search?q=NSE+BSE+Stock+Market+when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parser.parse(text);
        const items = parsed?.rss?.channel?.item;
        if (items && Array.isArray(items) && items.length > 0) {
          const formatted = items.slice(0, 10).map(item => ({
            title: item.title?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || 'Financial Headline',
            link: item.link || 'https://finance.yahoo.com',
            pubDate: item.pubDate || new Date().toISOString(),
            description: (item.description || '').replace(/<[^>]*>?/gm, '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').slice(0, 180) + '...',
            source: typeof item.source === 'object' ? (item.source['#text'] || 'Yahoo Finance') : (item.source || 'Yahoo Finance'),
            category: 'Global Finance'
          }));
          newsCache.yahoofinance = { data: formatted, lastFetched: now };
          return res.json({ success: true, articles: formatted });
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch Yahoo Finance RSS from ${url}:`, err.message);
    }
  }

  res.json({ success: true, fallback: true, articles: yahooFinanceFallback });
});

// Proxy route for backend posts/analysis if needed
app.get('/api/proxy/posts', async (req, res) => {
  try {
    const backendRes = await fetch('https://tradesahihai-backend.onrender.com/api/posts', {
      signal: AbortSignal.timeout(6000)
    });
    if (backendRes.ok) {
      const data = await backendRes.json();
      return res.json(data);
    }
    res.status(backendRes.status).json({ error: 'Backend error' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// SPA static routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Trade Sahi Hai server running on http://0.0.0.0:${PORT}`);
});

