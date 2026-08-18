const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Enable Cross-Origin Resource Sharing for GitHub Pages and localhost
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || "https://tieaswmnzytdeuatkmmq.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "sb_secret_q10iY-_Fa-ZjbpdL4XX0BQ_WE9arRfS";
const supabase = createClient(supabaseUrl, supabaseKey);

// Root Healthcheck
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Trade Sahi Hai - Intelligent Analytics & RSS Proxy Engine',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Resolve the 'data' directory (supports running from root or backend/ subfolder)
function getDataDirectory() {
    const rootData = path.join(__dirname, 'data');
    const parentData = path.join(__dirname, '../data');
    if (fs.existsSync(rootData)) return rootData;
    if (fs.existsSync(parentData)) return parentData;
    return rootData;
}

// Helper to clean Markdown & Text Content
function formatTextContent(raw) {
    if (!raw) return "";
    return raw.trim();
}

/**
 * 📊 API: Fetch Daily Analysis & Historical Documentation by Date
 * Example: GET /api/analysis/2026/August/Aug16
 */
app.get('/api/analysis/:year/:month/:date', async (req, res) => {
    try {
        const { year, month, date } = req.params;
        const baseDataPath = getDataDirectory();

        let summaryText = null;
        let learningText = null;
        let strategyText = null;
        let reelsText = null;

        if (fs.existsSync(baseDataPath)) {
            const yearsInDir = fs.readdirSync(baseDataPath);
            const matchedYearDir = yearsInDir.find(y => y.toLowerCase() === year.toLowerCase());

            if (matchedYearDir) {
                const monthsPath = path.join(baseDataPath, matchedYearDir);
                if (fs.existsSync(monthsPath)) {
                    const monthsInDir = fs.readdirSync(monthsPath);
                    const matchedMonthDir = monthsInDir.find(m => 
                        m.toLowerCase() === month.toLowerCase() || 
                        m.toLowerCase().startsWith(month.toLowerCase())
                    );

                    if (matchedMonthDir) {
                        const targetFolder = path.join(monthsPath, matchedMonthDir);
                        const filesInDir = fs.readdirSync(targetFolder);

                        const searchPrefix = date.toLowerCase();
                        const matchedFiles = filesInDir.filter(f => 
                            f.toLowerCase().startsWith(searchPrefix) && f.endsWith('.txt')
                        );

                        matchedFiles.forEach(fileName => {
                            const lowerName = fileName.toLowerCase();
                            const content = fs.readFileSync(path.join(targetFolder, fileName), 'utf8');

                            if (lowerName.includes('learning')) {
                                learningText = content;
                            } else if (lowerName.includes('strategy') || lowerName.includes('strategies')) {
                                strategyText = content;
                            } else if (lowerName.includes('reel') || lowerName.includes('video')) {
                                reelsText = content;
                            } else {
                                summaryText = content;
                            }
                        });
                    }
                }
            }
        }

        // Generate Supabase Asset CDN Links
        const monthShort = month.substring(0, 3);
        const titleMonth = monthShort.charAt(0).toUpperCase() + monthShort.slice(1).toLowerCase();
        const cleanDatePrefix = date.toLowerCase().replace(/[^a-z0-9]/g, '');

        const storageFolderPath = `${year}/${month}`;
        let imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${date}.png`;
        let videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${date}.mp4`;

        // Check if image exists in Supabase Storage
        try {
            const { data: files } = await supabase.storage
                .from('tracking')
                .list(storageFolderPath, { search: date });

            if (files && files.length > 0) {
                const img = files.find(f => /\.(png|jpeg|jpg)$/i.test(f.name));
                if (img) {
                    imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${img.name}`;
                }
                const vid = files.find(f => /\.(mp4|mov)$/i.test(f.name));
                if (vid) {
                    videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${vid.name}`;
                }
            }
        } catch (storageErr) {
            console.warn("Storage check notice:", storageErr.message);
        }

        return res.json({
            year,
            month,
            date,
            summary: formatTextContent(summaryText),
            learning: formatTextContent(learningText),
            strategy: formatTextContent(strategyText),
            reels: formatTextContent(reelsText),
            imageUrl,
            videoUrl
        });
    } catch (err) {
        console.error("Analysis route error:", err);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * 📰 API: Live News Feed (Moneycontrol Markets)
 */
app.get('/api/news/moneycontrol', async (req, res) => {
    try {
        const response = await fetch('https://www.moneycontrol.com/rss/MCtopnews.xml', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xmlText = await response.text();

        // Simple XML Item Parser
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null && items.length < 15) {
            const block = match[1];
            const getTag = (tag) => {
                const tMatch = block.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>|<${tag}>(.*?)<\\/${tag}>`));
                return tMatch ? (tMatch[1] || tMatch[2] || '').trim() : '';
            };

            items.push({
                title: getTag('title'),
                link: getTag('link') || 'https://www.moneycontrol.com',
                pubDate: getTag('pubDate') || new Date().toISOString(),
                description: getTag('description').replace(/<[^>]*>?/gm, '').slice(0, 200) + '...',
                source: 'Moneycontrol',
                category: 'Markets'
            });
        }

        res.json({ success: true, articles: items });
    } catch (err) {
        console.warn("Moneycontrol fetch fallback:", err.message);
        res.json({
            success: true,
            articles: [
                {
                    title: "Nifty 50 and Sensex extend weekly gains backed by institutional buying",
                    link: "https://www.moneycontrol.com",
                    pubDate: new Date().toISOString(),
                    description: "Benchmark indices advanced with heavyweights leading the rally amid strong macroeconomic indicators.",
                    source: "Moneycontrol",
                    category: "Markets"
                }
            ]
        });
    }
});

/**
 * 🌐 API: Live News Feed (Yahoo Finance)
 */
app.get('/api/news/yahoofinance', async (req, res) => {
    try {
        const response = await fetch('https://finance.yahoo.com/news/rssindex', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xmlText = await response.text();

        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null && items.length < 15) {
            const block = match[1];
            const getTag = (tag) => {
                const tMatch = block.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>|<${tag}>(.*?)<\\/${tag}>`));
                return tMatch ? (tMatch[1] || tMatch[2] || '').trim() : '';
            };

            items.push({
                title: getTag('title'),
                link: getTag('link') || 'https://finance.yahoo.com',
                pubDate: getTag('pubDate') || new Date().toISOString(),
                description: getTag('description').replace(/<[^>]*>?/gm, '').slice(0, 200) + '...',
                source: 'Yahoo Finance',
                category: 'Global Finance'
            });
        }

        res.json({ success: true, articles: items });
    } catch (err) {
        console.warn("Yahoo Finance fetch fallback:", err.message);
        res.json({
            success: true,
            articles: [
                {
                    title: "Global Markets maintain positive sentiment across major trading sessions",
                    link: "https://finance.yahoo.com",
                    pubDate: new Date().toISOString(),
                    description: "Asian and European markets mirrored Wall Street gains as Treasury yields stabilized.",
                    source: "Yahoo Finance",
                    category: "Global Finance"
                }
            ]
        });
    }
});

/**
 * 📝 API: Retrieve analysis posts from Supabase Table
 */
app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analysis_posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("Supabase query note:", error.message);
            return res.json([]);
        }
        res.json(data || []);
    } catch (err) {
        res.json([]);
    }
});

/**
 * 🔐 API: Supabase Admin Auth
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: "Invalid credentials." });
        res.json({ token: data.session.access_token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Trade Sahi Hai Backend Server running on port ${PORT}`);
});

