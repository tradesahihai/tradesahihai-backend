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
  yahoofinance: { data: null, lastFetched: 0 },
  nseIndices: { data: null, lastFetched: 0 },
  nseChart: {}
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const NSE_CACHE_TTL_MS = 60 * 1000; // 1 min cache for live NSE quotes

let nseCookie = '';
let nseCookieExpiry = 0;

async function getNseCookie() {
  const now = Date.now();
  if (nseCookie && now < nseCookieExpiry) {
    return nseCookie;
  }
  try {
    const res = await fetch('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(5000)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      nseCookie = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
      nseCookieExpiry = now + 4 * 60 * 1000;
    }
    return nseCookie;
  } catch (err) {
    console.warn('NSE cookie fetch failed:', err.message);
    return '';
  }
}

// Live Quote & Candle Data Caches (short TTL to keep data fresh and fast)
const quotesCache = new Map(); // key -> { data, timestamp }
const candlesCache = new Map(); // key -> { data, timestamp }
const QUOTE_CACHE_TTL = 8 * 1000; // 8 seconds TTL for live prices
const CANDLE_CACHE_TTL = 15 * 1000; // 15 seconds TTL for live candles

function mapSymbolToYahooTicker(rawSymbol) {
  if (!rawSymbol) return '';
  let sym = String(rawSymbol).trim().toUpperCase();

  // Benchmark index mappings
  if (sym === 'NSE:NIFTY' || sym === 'NIFTY' || sym === 'NIFTY 50' || sym === 'INDEX:NIFTY') return '^NSEI';
  if (sym === 'NSE:BANKNIFTY' || sym === 'BANKNIFTY' || sym === 'NIFTY BANK' || sym === 'INDEX:BANKNIFTY') return '^NSEBANK';
  if (sym === 'BSE:SENSEX' || sym === 'SENSEX' || sym === 'INDEX:SENSEX') return '^BSESN';
  if (sym === 'NASDAQ:IXIC' || sym === 'IXIC' || sym === 'INDEX:IXIC') return '^IXIC';
  if (sym === 'NASDAQ:NDX' || sym === 'NDX' || sym === 'INDEX:NDX') return '^NDX';
  if (sym === 'INDEX:SPX' || sym === 'SPX' || sym === 'INDEX:SP500') return '^GSPC';
  if (sym === 'INDEX:DJI' || sym === 'DJI') return '^DJI';

  // Explicit prefix parsing
  if (sym.startsWith('NSE:')) {
    return `${sym.replace('NSE:', '')}.NS`;
  }
  if (sym.startsWith('BSE:')) {
    return `${sym.replace('BSE:', '')}.BO`;
  }
  if (sym.startsWith('NASDAQ:')) {
    return sym.replace('NASDAQ:', '');
  }
  if (sym.startsWith('NYSE:')) {
    const raw = sym.replace('NYSE:', '');
    return raw === 'BRK.B' ? 'BRK-B' : (raw === 'BRK.A' ? 'BRK-A' : raw);
  }
  if (sym.startsWith('INDEX:')) {
    const raw = sym.replace('INDEX:', '');
    if (raw === 'SPX') return '^GSPC';
    if (raw === 'IXIC') return '^IXIC';
    if (raw === 'NDX') return '^NDX';
    return raw;
  }

  // If already tagged with suffix
  if (sym.endsWith('.NS') || sym.endsWith('.BO') || sym.startsWith('^')) {
    return sym;
  }

  // Known US Tickers
  const usList = [
    'IBM', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AMD', 
    'NFLX', 'AVGO', 'QQQ', 'SPY', 'INTC', 'QCOM', 'ADBE', 'COST', 'PYPL', 'ARM', 
    'PLTR', 'CRWD', 'SMCI', 'COIN', 'UBER', 'BRK.B', 'BRK.A', 'JPM', 'V', 'MA', 
    'WMT', 'LLY', 'ORCL', 'DIS', 'CRM', 'NOW', 'PANW', 'SNOW', 'SQ', 'SHOP', 
    'MU', 'TXN', 'ABNB', 'SPOT', 'BA', 'CAT', 'GE', 'JNJ', 'PFE', 'BAC', 'WFC', 
    'GS', 'MS', 'AXP', 'DELL', 'HPQ', 'MRK', 'ABBV'
  ];
  if (usList.includes(sym)) {
    return sym === 'BRK.B' ? 'BRK-B' : (sym === 'BRK.A' ? 'BRK-A' : sym);
  }

  // Default to NSE for standard Indian ticker codes
  return `${sym}.NS`;
}

// 🟢 LIVE MULTI-SYMBOL REAL-TIME QUOTE ENDPOINT
app.get('/api/quotes', async (req, res) => {
  const symbolsParam = req.query.symbols || req.query.symbol || '';
  if (!symbolsParam) {
    return res.json({ success: true, quotes: {} });
  }

  const rawList = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (rawList.length === 0) {
    return res.json({ success: true, quotes: {} });
  }

  const results = {};
  const neededTickers = [];
  const symbolToTickerMap = {};

  const now = Date.now();
  rawList.forEach(sym => {
    const ticker = mapSymbolToYahooTicker(sym);
    symbolToTickerMap[sym] = ticker;
    const cached = quotesCache.get(ticker);
    if (cached && (now - cached.timestamp < QUOTE_CACHE_TTL)) {
      results[sym] = cached.data;
    } else {
      if (!neededTickers.includes(ticker)) {
        neededTickers.push(ticker);
      }
    }
  });

  if (neededTickers.length > 0) {
    try {
      const tickerQuery = neededTickers.map(encodeURIComponent).join(',');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickerQuery}&formatted=false&enableFuzzyQuery=false`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const json = await response.json();
        const quotesArray = json?.quoteResponse?.result || [];
        
        quotesArray.forEach(q => {
          const t = q.symbol;
          const isUS = t.indexOf('.NS') === -1 && t.indexOf('.BO') === -1;
          const quoteObj = {
            symbol: t,
            price: q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
            open: q.regularMarketOpen ?? q.regularMarketPrice ?? 0,
            high: q.regularMarketDayHigh ?? q.regularMarketPrice ?? 0,
            low: q.regularMarketDayLow ?? q.regularMarketPrice ?? 0,
            previousClose: q.regularMarketPreviousClose ?? q.regularMarketPrice ?? 0,
            volume: q.regularMarketVolume ?? 0,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? 0,
            marketState: q.marketState || 'REGULAR',
            currency: isUS ? 'USD' : (q.currency || 'INR'),
            currencySymbol: isUS ? '$' : '₹',
            name: q.shortName || q.longName || t,
            exchange: q.exchange || (isUS ? 'US' : 'NSE'),
            timestamp: (q.regularMarketTime ? q.regularMarketTime * 1000 : Date.now()),
            isLive: true
          };

          quotesCache.set(t, { data: quoteObj, timestamp: now });
        });
      }
    } catch (err) {
      console.warn('Live quotes batch fetch notice:', err.message);
    }
  }

  // Populate output mapping for all requested original symbols
  rawList.forEach(sym => {
    const ticker = symbolToTickerMap[sym];
    const cached = quotesCache.get(ticker);
    if (cached) {
      results[sym] = cached.data;
    }
  });

  res.json({ success: true, quotes: results, count: Object.keys(results).length, timestamp: Date.now() });
});

// 🟢 LIVE REAL-TIME CANDLESTICK CHART DATA ENDPOINT
app.get('/api/chart/candles', async (req, res) => {
  const symbol = req.query.symbol || 'NSE:NIFTY';
  const intervalParam = (req.query.interval || '15').toUpperCase();
  const ticker = mapSymbolToYahooTicker(symbol);

  let yahooInterval = '15m';
  let yahooRange = '5d';

  if (intervalParam === '60' || intervalParam === '1H') {
    yahooInterval = '60m';
    yahooRange = '1mo';
  } else if (intervalParam === 'D' || intervalParam === '1D' || intervalParam === 'DAILY') {
    yahooInterval = '1d';
    yahooRange = '1y';
  }

  const cacheKey = `${ticker}_${yahooInterval}_${yahooRange}`;
  const now = Date.now();
  const cached = candlesCache.get(cacheKey);
  if (cached && (now - cached.timestamp < CANDLE_CACHE_TTL)) {
    return res.json({ success: true, source: 'Yahoo Live Cache', candles: cached.data, symbol, interval: intervalParam });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yahooInterval}&range=${yahooRange}&includePrePost=false`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const json = await response.json();
      const chartResult = json?.chart?.result?.[0];
      if (chartResult && chartResult.timestamp && chartResult.indicators?.quote?.[0]) {
        const timestamps = chartResult.timestamp;
        const q = chartResult.indicators.quote[0];
        const opens = q.open || [];
        const highs = q.high || [];
        const lows = q.low || [];
        const closes = q.close || [];
        const volumes = q.volume || [];

        const candles = [];
        for (let i = 0; i < timestamps.length; i++) {
          const o = opens[i];
          const h = highs[i];
          const l = lows[i];
          const c = closes[i];
          const v = volumes[i] || 0;

          // Filter out missing/null bars
          if (o === null || h === null || l === null || c === null || isNaN(o) || isNaN(c)) {
            continue;
          }

          const body = Math.abs(c - o);
          const range = h - l;
          let pattern = null;

          if (range > 0) {
            const lowerShadow = Math.min(o, c) - l;
            const upperShadow = h - Math.max(o, c);

            // Bullish Hammer check
            if (lowerShadow >= Math.max(body * 1.8, range * 0.50) && upperShadow <= Math.max(range * 0.15, body * 0.35)) {
              pattern = { type: 'HAMMER', label: 'HAMMER', isBullish: true, name: 'Bullish Hammer' };
            } else if (upperShadow >= Math.max(body * 1.8, range * 0.50) && lowerShadow <= Math.max(range * 0.15, body * 0.35)) {
              pattern = { type: 'INV_HAMMER', label: 'INV HAMMER', isBullish: c >= o, name: 'Inverted Hammer' };
            }
          }

          candles.push({
            time: new Date(timestamps[i] * 1000).toISOString(),
            open: Number(o.toFixed(2)),
            high: Number(h.toFixed(2)),
            low: Number(l.toFixed(2)),
            close: Number(c.toFixed(2)),
            volume: Math.round(v),
            pattern
          });
        }

        if (candles.length > 0) {
          // Calculate EMA 9 & EMA 21
          const k9 = 2 / (9 + 1);
          let ema9 = candles[0].close;
          candles.forEach((c, idx) => {
            if (idx === 0) {
              c.ema9 = Number(ema9.toFixed(2));
            } else {
              ema9 = c.close * k9 + ema9 * (1 - k9);
              c.ema9 = Number(ema9.toFixed(2));
            }
          });

          const k21 = 2 / (21 + 1);
          let ema21 = candles[0].close;
          candles.forEach((c, idx) => {
            if (idx === 0) {
              c.ema21 = Number(ema21.toFixed(2));
            } else {
              ema21 = c.close * k21 + ema21 * (1 - k21);
              c.ema21 = Number(ema21.toFixed(2));
            }
          });

          candlesCache.set(cacheKey, { data: candles, timestamp: now });
          return res.json({
            success: true,
            source: 'Live Exchange Feed',
            ticker,
            symbol,
            interval: intervalParam,
            meta: chartResult.meta,
            candles
          });
        }
      }
    }
  } catch (err) {
    console.warn(`Live candles chart fetch for ${ticker} (${symbol}):`, err.message);
  }

  res.json({ success: false, message: `Could not fetch live candles for ${symbol}`, candles: [] });
});

// NSE Official Indices Route
app.get('/api/nse/indices', async (req, res) => {
  const now = Date.now();
  if (newsCache.nseIndices.data && (now - newsCache.nseIndices.lastFetched < NSE_CACHE_TTL_MS)) {
    return res.json({ success: true, source: 'NSE India Official (Cached)', data: newsCache.nseIndices.data });
  }

  try {
    const cookie = await getNseCookie();
    const response = await fetch('https://www.nseindia.com/api/allIndices', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nseindia.com/',
        'Cookie': cookie
      },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const data = await response.json();
      newsCache.nseIndices = { data, lastFetched: now };
      return res.json({ success: true, source: 'NSE India Official Live', data });
    }
  } catch (err) {
    console.warn('Failed to fetch from NSE India API:', err.message);
  }

  // Fallback realistic snapshot
  res.json({
    success: true,
    source: 'NSE India Benchmark Snapshot',
    fallback: true,
    data: {
      data: [
        { index: 'NIFTY 50', last: 24367.50, change: 42.15, pChange: 0.17, open: 24340.00, high: 24410.80, low: 24305.20, previousClose: 24325.35, yearHigh: 25078.30, yearLow: 18837.85 },
        { index: 'NIFTY BANK', last: 50480.20, change: 180.40, pChange: 0.36, open: 50320.00, high: 50650.00, low: 50280.10, previousClose: 50299.80, yearHigh: 53357.70, yearLow: 42105.40 },
        { index: 'NIFTY FINANCIAL SERVICES', last: 23145.60, change: 65.30, pChange: 0.28, open: 23090.00, high: 23210.00, low: 23050.00, previousClose: 23080.30, yearHigh: 24200.00, yearLow: 19100.00 }
      ]
    }
  });
});

// NSE Chart Data by Symbol
app.get('/api/nse/chart', async (req, res) => {
  const symbol = req.query.symbol || 'NIFTY 50';
  const encodedSymbol = encodeURIComponent(symbol);
  
  try {
    const cookie = await getNseCookie();
    const response = await fetch(`https://www.nseindia.com/api/chart-databyindex?index=${encodedSymbol}&indices=true`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nseindia.com/',
        'Cookie': cookie
      },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, source: 'NSE India Official Live', data });
    }
  } catch (err) {
    console.warn(`Failed to fetch chart data from NSE for ${symbol}:`, err.message);
  }

  res.json({ success: false, message: 'Direct NSE chart feed unavailable at this moment' });
});

// Predefined curated list of popular global and NASDAQ / US tickers for instant offline matching
const GLOBAL_POPULAR_SYMBOLS = [
  { symbol: 'NASDAQ:NVDA', name: 'NVIDIA', fullName: 'NVIDIA Corporation (AI & GPUs)', code: 'NVDA', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'NVDA', currency: 'USD' },
  { symbol: 'NASDAQ:AAPL', name: 'Apple', fullName: 'Apple Inc.', code: 'AAPL', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'AAPL', currency: 'USD' },
  { symbol: 'NASDAQ:MSFT', name: 'Microsoft', fullName: 'Microsoft Corporation', code: 'MSFT', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'MSFT', currency: 'USD' },
  { symbol: 'NASDAQ:GOOGL', name: 'Alphabet / Google', fullName: 'Alphabet Inc. (Class A)', code: 'GOOGL', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'GOOGL', currency: 'USD' },
  { symbol: 'NASDAQ:AMZN', name: 'Amazon', fullName: 'Amazon.com Inc.', code: 'AMZN', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'AMZN', currency: 'USD' },
  { symbol: 'NASDAQ:META', name: 'Meta', fullName: 'Meta Platforms Inc.', code: 'META', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'META', currency: 'USD' },
  { symbol: 'NASDAQ:TSLA', name: 'Tesla', fullName: 'Tesla Inc.', code: 'TSLA', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'TSLA', currency: 'USD' },
  { symbol: 'NYSE:IBM', name: 'IBM', fullName: 'International Business Machines Corp (AI & Cloud)', code: 'IBM', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'IBM', currency: 'USD' },
  { symbol: 'NASDAQ:IBM', name: 'IBM', fullName: 'International Business Machines Corp (NASDAQ/US)', code: 'IBM', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'IBM', currency: 'USD' },
  { symbol: 'NASDAQ:AVGO', name: 'Broadcom', fullName: 'Broadcom Inc.', code: 'AVGO', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'AVGO', currency: 'USD' },
  { symbol: 'NASDAQ:AMD', name: 'AMD', fullName: 'Advanced Micro Devices Inc.', code: 'AMD', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'AMD', currency: 'USD' },
  { symbol: 'NASDAQ:NFLX', name: 'Netflix', fullName: 'Netflix Inc.', code: 'NFLX', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'NFLX', currency: 'USD' },
  { symbol: 'NASDAQ:INTC', name: 'Intel', fullName: 'Intel Corporation', code: 'INTC', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'INTC', currency: 'USD' },
  { symbol: 'NASDAQ:QCOM', name: 'Qualcomm', fullName: 'QUALCOMM Incorporated', code: 'QCOM', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'QCOM', currency: 'USD' },
  { symbol: 'NASDAQ:COST', name: 'Costco', fullName: 'Costco Wholesale Corp', code: 'COST', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'COST', currency: 'USD' },
  { symbol: 'NASDAQ:ADBE', name: 'Adobe', fullName: 'Adobe Inc.', code: 'ADBE', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'ADBE', currency: 'USD' },
  { symbol: 'NASDAQ:CSCO', name: 'Cisco', fullName: 'Cisco Systems Inc.', code: 'CSCO', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'CSCO', currency: 'USD' },
  { symbol: 'NASDAQ:PYPL', name: 'PayPal', fullName: 'PayPal Holdings Inc.', code: 'PYPL', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'PYPL', currency: 'USD' },
  { symbol: 'NASDAQ:ARM', name: 'Arm Holdings', fullName: 'Arm Holdings plc', code: 'ARM', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'ARM', currency: 'USD' },
  { symbol: 'NASDAQ:PLTR', name: 'Palantir', fullName: 'Palantir Technologies Inc.', code: 'PLTR', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'PLTR', currency: 'USD' },
  { symbol: 'NASDAQ:CRWD', name: 'CrowdStrike', fullName: 'CrowdStrike Holdings Inc.', code: 'CRWD', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'CRWD', currency: 'USD' },
  { symbol: 'NASDAQ:SMCI', name: 'Super Micro', fullName: 'Super Micro Computer Inc.', code: 'SMCI', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'SMCI', currency: 'USD' },
  { symbol: 'NASDAQ:COIN', name: 'Coinbase', fullName: 'Coinbase Global Inc.', code: 'COIN', exchange: 'NASDAQ', group: 'NASDAQ Stocks', yahooTicker: 'COIN', currency: 'USD' },
  { symbol: 'NASDAQ:QQQ', name: 'Invesco QQQ', fullName: 'Invesco QQQ Trust (NASDAQ 100 ETF)', code: 'QQQ', exchange: 'NASDAQ', group: 'NASDAQ ETFs', yahooTicker: 'QQQ', currency: 'USD' },
  { symbol: 'NASDAQ:IXIC', name: 'NASDAQ Composite', fullName: 'NASDAQ Composite Index', code: 'IXIC', exchange: 'NASDAQ', group: 'US Indices', yahooTicker: '^IXIC', currency: 'USD' },
  { symbol: 'NASDAQ:NDX', name: 'NASDAQ 100', fullName: 'NASDAQ-100 Index', code: 'NDX', exchange: 'NASDAQ', group: 'US Indices', yahooTicker: '^NDX', currency: 'USD' },
  { symbol: 'INDEX:SPX', name: 'S&P 500', fullName: 'S&P 500 Index', code: 'SPX', exchange: 'S&P', group: 'US Indices', yahooTicker: '^GSPC', currency: 'USD' },
  { symbol: 'NYSE:CRM', name: 'Salesforce', fullName: 'Salesforce Inc.', code: 'CRM', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'CRM', currency: 'USD' },
  { symbol: 'NYSE:BRK.B', name: 'Berkshire Hathaway', fullName: 'Berkshire Hathaway Inc. Class B', code: 'BRK.B', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'BRK-B', currency: 'USD' },
  { symbol: 'NYSE:JPM', name: 'JPMorgan Chase', fullName: 'JPMorgan Chase & Co.', code: 'JPM', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'JPM', currency: 'USD' },
  { symbol: 'NYSE:V', name: 'Visa', fullName: 'Visa Inc.', code: 'V', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'V', currency: 'USD' },
  { symbol: 'NYSE:WMT', name: 'Walmart', fullName: 'Walmart Inc.', code: 'WMT', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'WMT', currency: 'USD' },
  { symbol: 'NYSE:LLY', name: 'Eli Lilly', fullName: 'Eli Lilly and Company', code: 'LLY', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'LLY', currency: 'USD' },
  { symbol: 'NYSE:ORCL', name: 'Oracle', fullName: 'Oracle Corporation', code: 'ORCL', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'ORCL', currency: 'USD' },
  { symbol: 'NYSE:DIS', name: 'Disney', fullName: 'The Walt Disney Company', code: 'DIS', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'DIS', currency: 'USD' },
  { symbol: 'NYSE:UBER', name: 'Uber', fullName: 'Uber Technologies Inc.', code: 'UBER', exchange: 'NYSE', group: 'NYSE Stocks', yahooTicker: 'UBER', currency: 'USD' }
];

// Global Symbol Search Proxy (Yahoo Finance Autocomplete + NSE + NASDAQ + NYSE)
app.get('/api/symbol/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, results: [] });
  }

  const queryLower = query.toLowerCase();
  const directMatches = GLOBAL_POPULAR_SYMBOLS.filter(s =>
    s.code.toLowerCase().includes(queryLower) ||
    s.name.toLowerCase().includes(queryLower) ||
    s.symbol.toLowerCase().includes(queryLower) ||
    s.fullName.toLowerCase().includes(queryLower)
  );

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (response.ok) {
      const data = await response.json();
      const quotes = data?.quotes || [];
      const formatted = quotes
        .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'INDEX' || q.quoteType === 'ETF' || q.quoteType === 'CURRENCY' || q.quoteType === 'CRYPTOCURRENCY'))
        .map(q => {
          const isNSE = q.symbol.endsWith('.NS');
          const isBSE = q.symbol.endsWith('.BO');
          const rawTicker = q.symbol.replace(/\.NS$|\.BO$/, '');
          
          let exch = 'GLOBAL';
          let symbolPrefix = '';
          const exchRaw = (q.exchange || q.exchDisp || '').toUpperCase();

          if (isNSE) {
            exch = 'NSE';
            symbolPrefix = 'NSE:';
          } else if (isBSE) {
            exch = 'BSE';
            symbolPrefix = 'BSE:';
          } else if (exchRaw.includes('NMS') || exchRaw.includes('NGS') || exchRaw.includes('NCM') || exchRaw.includes('NAS') || exchRaw.includes('NASDAQ')) {
            exch = 'NASDAQ';
            symbolPrefix = 'NASDAQ:';
          } else if (exchRaw.includes('NYQ') || exchRaw.includes('NYS') || exchRaw.includes('NYSE')) {
            exch = 'NYSE';
            symbolPrefix = 'NYSE:';
          } else if (q.quoteType === 'INDEX') {
            exch = 'INDEX';
            symbolPrefix = 'INDEX:';
          } else {
            exch = q.exchDisp || q.exchange || 'GLOBAL';
            symbolPrefix = `${exch}:`;
          }

          const symbolStr = `${symbolPrefix}${rawTicker}`;
          const isUS = exch === 'NASDAQ' || exch === 'NYSE';

          let groupLabel = 'Stocks';
          if (isNSE || isBSE) {
            groupLabel = q.quoteType === 'INDEX' ? 'Indian Indices' : 'Indian Stocks';
          } else if (exch === 'NASDAQ') {
            groupLabel = q.quoteType === 'INDEX' ? 'US Indices' : (q.quoteType === 'ETF' ? 'NASDAQ ETFs' : 'NASDAQ Stocks');
          } else if (exch === 'NYSE') {
            groupLabel = q.quoteType === 'INDEX' ? 'US Indices' : (q.quoteType === 'ETF' ? 'US ETFs' : 'NYSE Stocks');
          } else {
            groupLabel = q.quoteType === 'INDEX' ? 'Global Indices' : 'Global Stocks';
          }

          return {
            symbol: symbolStr,
            name: q.shortname || q.longname || rawTicker,
            fullName: q.longname || q.shortname || rawTicker,
            code: rawTicker,
            exchange: exch,
            group: groupLabel,
            yahooTicker: q.symbol,
            type: q.quoteType,
            currency: (isNSE || isBSE) ? 'INR' : (isUS ? 'USD' : (q.currency || 'USD'))
          };
        });

      // Merge directMatches + formatted without duplicates
      const finalResults = [...directMatches];
      formatted.forEach(f => {
        if (!finalResults.some(r => r.code.toUpperCase() === f.code.toUpperCase() || r.symbol.toUpperCase() === f.symbol.toUpperCase())) {
          finalResults.push(f);
        }
      });

      return res.json({ success: true, results: finalResults });
    }
  } catch (err) {
    console.warn(`Symbol search query failed for ${query}:`, err.message);
  }

  res.json({ success: true, results: directMatches });
});

// ============================================================================
// 🌐 GLOBAL WATCHLIST DATABASE / GITHUB STORAGE SYNC
// ============================================================================
const fs = require('fs');
const WATCHLIST_LOCAL_FILE = path.join(__dirname, 'watchlist_db.json');
const GH_OWNER = process.env.GITHUB_REPO_OWNER || 'tradesahihai';
const GH_REPO = process.env.GITHUB_REPO_NAME || 'tradesahihai-backend';
const GH_BRANCH = process.env.GITHUB_REPO_BRANCH || 'main';
const GH_PATH = 'data/watchlist.json';

// In-memory global watchlist state (empty by default as requested: no sample stocks)
let globalWatchlistState = [];
let watchlistSha = null;

function loadLocalWatchlist() {
  try {
    if (fs.existsSync(WATCHLIST_LOCAL_FILE)) {
      const data = JSON.parse(fs.readFileSync(WATCHLIST_LOCAL_FILE, 'utf8'));
      if (Array.isArray(data)) {
        globalWatchlistState = data;
      }
    }
  } catch (e) {
    console.warn('Could not read local watchlist file:', e.message);
  }
}
loadLocalWatchlist();

function saveLocalWatchlist() {
  try {
    fs.writeFileSync(WATCHLIST_LOCAL_FILE, JSON.stringify(globalWatchlistState, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write local watchlist file:', e.message);
  }
}

async function syncWatchlistFromGitHub() {
  try {
    const ghUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`;
    const headers = {
      'User-Agent': 'TradeSahiHai-App',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(ghUrl, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      watchlistSha = json.sha;
      if (json.content) {
        const contentStr = Buffer.from(json.content, 'base64').toString('utf8');
        const parsed = JSON.parse(contentStr);
        if (Array.isArray(parsed)) {
          globalWatchlistState = parsed;
          saveLocalWatchlist();
          return { success: true, source: 'github', count: parsed.length };
        }
      }
    }
  } catch (e) {
    console.warn('GitHub watchlist fetch sync notice:', e.message);
  }
  return { success: true, source: 'server_database', count: globalWatchlistState.length };
}

async function saveWatchlistToGitHub() {
  saveLocalWatchlist();
  if (!process.env.GITHUB_TOKEN) {
    return { syncedToGitHub: false, message: 'Saved to global server database (Set GITHUB_TOKEN to commit directly to GitHub repository)' };
  }
  try {
    const ghUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
    const headers = {
      'User-Agent': 'TradeSahiHai-App',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    };
    const body = {
      message: `Update global watchlist [${globalWatchlistState.length} items]`,
      content: Buffer.from(JSON.stringify(globalWatchlistState, null, 2)).toString('base64'),
      branch: GH_BRANCH
    };
    if (watchlistSha) {
      body.sha = watchlistSha;
    }
    const res = await fetch(ghUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const json = await res.json();
      watchlistSha = json?.content?.sha || null;
      return { syncedToGitHub: true };
    } else {
      const errText = await res.text();
      console.warn('GitHub commit error:', errText);
      return { syncedToGitHub: false, error: errText };
    }
  } catch (err) {
    console.warn('GitHub save error:', err.message);
    return { syncedToGitHub: false, error: err.message };
  }
}

// GET /api/watchlist - Fetch globally shared watchlist
app.get('/api/watchlist', async (req, res) => {
  // Sync from GitHub on initial request or if empty
  if (globalWatchlistState.length === 0) {
    await syncWatchlistFromGitHub();
  }
  res.json({
    success: true,
    data: globalWatchlistState,
    count: globalWatchlistState.length,
    storage: 'global_database'
  });
});

// POST /api/watchlist - Add new stock to global watchlist
app.post('/api/watchlist', async (req, res) => {
  const { symbol, name, fullName, addedAt } = req.body || {};
  const cleanSymbol = (symbol || '').trim().toUpperCase();

  if (!cleanSymbol) {
    return res.status(400).json({ success: false, error: 'Symbol is required' });
  }

  // Check if exists
  const existingIdx = globalWatchlistState.findIndex(
    item => (typeof item === 'string' ? item : item.symbol).toUpperCase() === cleanSymbol
  );

  if (existingIdx !== -1) {
    return res.json({
      success: true,
      message: 'Stock is already in global watchlist',
      data: globalWatchlistState
    });
  }

  const stockEntry = {
    symbol: cleanSymbol,
    name: name || cleanSymbol.replace(/^(NSE|BSE):/, ''),
    fullName: fullName || name || cleanSymbol,
    addedAt: addedAt || new Date().toISOString()
  };

  globalWatchlistState.unshift(stockEntry);
  const ghResult = await saveWatchlistToGitHub();

  res.json({
    success: true,
    message: `Added ${cleanSymbol} to global watchlist`,
    data: globalWatchlistState,
    github: ghResult
  });
});

// DELETE /api/watchlist - Remove stock from global watchlist (or clear all)
app.delete('/api/watchlist', async (req, res) => {
  const isClearAll = req.body?.clearAll === true || req.query?.clearAll === 'true';
  if (isClearAll) {
    globalWatchlistState = [];
    saveLocalWatchlist();
    const ghResult = await saveWatchlistToGitHub();
    return res.json({
      success: true,
      message: 'Watchlist cleared successfully',
      data: [],
      github: ghResult
    });
  }

  const symbol = (req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Symbol is required' });
  }

  globalWatchlistState = globalWatchlistState.filter(item => {
    const itemSym = (typeof item === 'string' ? item : item.symbol).toUpperCase();
    return itemSym !== symbol;
  });

  const ghResult = await saveWatchlistToGitHub();

  res.json({
    success: true,
    message: `Removed ${symbol} from global watchlist`,
    data: globalWatchlistState,
    github: ghResult
  });
});

// DELETE /api/watchlist/all - Clear entire watchlist
app.delete('/api/watchlist/all', async (req, res) => {
  globalWatchlistState = [];
  saveLocalWatchlist();
  const ghResult = await saveWatchlistToGitHub();
  res.json({
    success: true,
    message: 'Global watchlist cleared completely',
    data: [],
    github: ghResult
  });
});


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

