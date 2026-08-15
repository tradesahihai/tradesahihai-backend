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

        // Helper to format string or pull first line if older
        const processContent = (content, isToday) => {
            if (!content) return null;
            if (isToday) return content; // Display full content
            
            // Older data: Update to single line header with read more indicator
            const firstLine = content.split(/\r?\n/)[0].trim();
            return {
                header: firstLine || "Older Entry Data",
                hasMore: content.trim().length > firstLine.length,
                fullContent: content // Sent so front-end can toggle "read more"
            };
        };

        // Determine if target parameter matches today's local date
        const todayObj = new Date();
        const currentYear = todayObj.getFullYear().toString();
        const currentMonth = todayObj.toLocaleString('en-US', { month: 'long' }); // e.g., "October"
        const currentDay = todayObj.getDate().toString().padStart(2, '0'); // e.g., "24"
        
        const isToday = (year.toLowerCase() === currentYear.toLowerCase()) && 
                        (month.toLowerCase() === currentMonth.toLowerCase()) && 
                        (date.toLowerCase() === currentDay.toLowerCase());

        let summaryText = null;
        let learningText = null;
        let strategyText = null;
        let imageUrl = null;
        let videoUrl = null;

        // 1. Check workspace directories. If they don't exist, ignore them cleanly.
        if (fs.existsSync(baseDataPath)) {
            const yearsInDir = fs.readdirSync(baseDataPath);
            const matchedYearDir = yearsInDir.find(y => y.toLowerCase() === year.toLowerCase());

            if (matchedYearDir) {
                const monthsPath = path.join(baseDataPath, matchedYearDir);
                const monthsInDir = fs.readdirSync(monthsPath);
                const matchedMonthDir = monthsInDir.find(m => m.toLowerCase() === month.toLowerCase());

                if (matchedMonthDir) {
                    const targetFolder = path.join(monthsPath, matchedMonthDir);
                    const filesInDir = fs.readdirSync(targetFolder);
                    const dayFiles = filesInDir.filter(f => f.toLowerCase().startsWith(date.toLowerCase()) && f.toLowerCase().endsWith('.txt'));

                    // Read local files if they exist
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

                    // 2. Process Supabase assets if directories match
                    const storageFolderPath = `${matchedYearDir}/${matchedMonthDir}`;
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
                }
            }
        }

        // Return empty structural fields instead of 404 error if records aren't found
        return res.json({
            date,
            isToday,
            summary: processContent(summaryText, isToday),
            learning: processContent(learningText, isToday),
            strategy: processContent(strategyText, isToday), 
            imageUrl,   
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
