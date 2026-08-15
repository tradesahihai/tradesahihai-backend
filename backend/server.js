const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// ✅ Configured CORS explicitly for your live trading dashboard environment
app.use(cors({
    origin: ['https://github.io', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Secure connection to your Supabase cloud cluster
const supabaseUrl = process.env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

/**
 * 📈 DYNAMIC ENDPOINT: Flat-File Analysis Engine Matrix
 * Expected Operational Route: /api/analysis/2026/August/Aug15
 */
app.get('/api/analysis/:year/:month/:date', async (req, res) => {
    try {
        const { year, month, date } = req.params;
        
        // Target path maps to your root folder layout: data -> 2026 -> August
        const targetFolder = path.join(__dirname, '..', 'data', year, month);

        // Fallback checks to find your custom files like _pnb.txt or standard _summ.txt
        let summaryPath = path.join(targetFolder, `${date}_summ.txt`);
        if (!fs.existsSync(summaryPath)) {
            summaryPath = path.join(targetFolder, `${date}_pnb.txt`);
        }
        
        const learningPath = path.join(targetFolder, `${date}_learning.txt`);
        const strategyPath = path.join(targetFolder, `${date}_strategy.txt`);

        // 1. Enforce core structural file validations
        if (!fs.existsSync(summaryPath) || !fs.existsSync(learningPath)) {
            return res.status(404).json({ error: `Required entry text files missing for ${date}.` });
        }

        // 2. Read localized content natively
        const summaryText = fs.readFileSync(summaryPath, 'utf8');
        const learningText = fs.readFileSync(learningPath, 'utf8');
        const strategyText = fs.existsSync(strategyPath) ? fs.readFileSync(strategyPath, 'utf8') : null;

        // 3. Scan for media assets inside your Public Supabase Storage Bucket
        const storageFolderPath = `${year}/${month}`;
        let imageUrl = null;
        let videoUrl = null;

        const { data: files, error } = await supabase.storage
            .from('tracking')
            .list(storageFolderPath, { search: date });

        if (!error && files) {
            // Find and extract chart screenshots
            const imageMatch = files.find(f => f.name.startsWith(date) && /\.(png|jpeg|jpg)$/i.test(f.name));
            if (imageMatch) {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${imageMatch.name}`;
            }

            // Find and extract optional trading videos
            const videoMatch = files.find(f => f.name.startsWith(date) && /\.(mp4|mov)$/i.test(f.name));
            if (videoMatch) {
                videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${videoMatch.name}`;
            }
        }

        // 4. Return the dynamic data payload
        return res.json({
            date,
            summary: summaryText,
            learning: learningText,
            imageUrl,   
            strategy: strategyText, 
            videoUrl   
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Endpoint 1: Fetch all public charts
app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analysis_posts')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint 2: Secure backend login check
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: "Invalid login credentials." });
    res.json({ token: data.session.access_token, message: "Authorized Access Granted" });
});

// Endpoint 3: Secure post publication with token guard
app.post('/api/posts', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(403).json({ error: "Access token missing." });

    const { title, category, image_url, body } = req.body;
    const { data, error } = await supabase.from('analysis_posts').insert([{ title, category, image_url, body }]);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Post saved live globally!" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
