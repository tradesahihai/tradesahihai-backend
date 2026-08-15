const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// ✅ CORS Configurations open for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

/**
 * 📈 INTELLIGENT WILDCARD ENDPOINT: Flat-File Analysis Engine
 */
app.get('/api/analysis/:year/:month/:date', async (req, res) => {
    try {
        const { year, month, date } = req.params;
        const baseDataPath = path.join(__dirname, '..', 'data');

        if (!fs.existsSync(baseDataPath)) {
            return res.status(404).json({ error: "Backend data workspace root folder missing." });
        }

        const yearsInDir = fs.readdirSync(baseDataPath);
        const matchedYearDir = yearsInDir.find(y => y.toLowerCase() === year.toLowerCase());
        if (!matchedYearDir) {
            return res.status(404).json({ error: `Year workspace directory '${year}' not found.` });
        }

        const monthsPath = path.join(baseDataPath, matchedYearDir);
        const monthsInDir = fs.readdirSync(monthsPath);
        const matchedMonthDir = monthsInDir.find(m => m.toLowerCase() === month.toLowerCase());
        if (!matchedMonthDir) {
            return res.status(404).json({ error: `Month workspace directory '${month}' not found.` });
        }

        const targetFolder = path.join(monthsPath, matchedMonthDir);
        const filesInDir = fs.readdirSync(targetFolder);

        const dayFiles = filesInDir.filter(f => f.toLowerCase().startsWith(date.toLowerCase()) && f.endsWith('.txt'));

        if (dayFiles.length === 0) {
            return res.status(404).json({ error: `No tracking documentation found starting with prefix ${date}.` });
        }

        let summaryText = null;
        let learningText = null;
        let strategyText = null;

        dayFiles.forEach(fileName => {
            const lowerName = fileName.toLowerCase();
            const fullFilePath = path.join(targetFolder, fileName);
            const content = fs.readFileSync(fullFilePath, 'utf8');

            if (lowerName.includes('learning')) {
                learningText = content;
            } else if (lowerName.includes('strategy') || lowerName.includes('strategies')) {
                strategyText = content;
            } else if (
                !lowerName.includes('reel') && 
                !lowerName.includes('trending') && 
                !lowerName.includes('video')
            ) {
                summaryText = content;
            }
        });

        const storageFolderPath = `${matchedYearDir}/${matchedMonthDir}`;
        let imageUrl = null;
        let videoUrl = null;

        try {
            const { data: files, error } = await supabase.storage
                .from('tracking')
                .list(storageFolderPath, { search: date });

            if (!error && files) {
                const imageMatch = files.find(f => f.name.toLowerCase().startsWith(date.toLowerCase()) && /\.(png|jpeg|jpg)$/i.test(f.name));
                if (imageMatch) {
                    imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${imageMatch.name}`;
                }

                const videoMatch = files.find(f => f.name.toLowerCase().startsWith(date.toLowerCase()) && /\.(mp4|mov)$/i.test(f.name));
                if (videoMatch) {
                    videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${videoMatch.name}`;
                }
            }
        } catch (storageErr) {
            console.warn("Supabase asset processing error skipped safely:", storageErr.message);
        }

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

// --- Legacy Cloud Table Routes (Preserved Natively) ---
app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analysis_posts')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: "Invalid credentials." });
    res.json({ token: data.session.access_token });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Intelligent Wildcard Engine Active on Port ${PORT}`));
