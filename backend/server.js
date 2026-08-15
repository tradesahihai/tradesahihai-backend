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

        // ✅ FIXED TYPE-SAFE STRUCTURAL HEADER PARSER
        const processContent = (content, isToday) => {
            if (!content) return null;
            if (isToday) return content;
            
            // Safe indexing break verification to prevent crashes on initial blank lines
            const lines = content.split(/\r?\n/);
            const firstLine = lines.find(line => line.trim().length > 0) || "Older Entry Data";
            const trimmedHeader = firstLine.trim();

            return {
                header: trimmedHeader,
                hasMore: content.trim().length > trimmedHeader.length,
                fullContent: content
            };
        };

        // Determine if target parameter matches today's local date
        const todayObj = new Date();
        const currentYear = todayObj.getFullYear().toString();
        const curLongMonth = todayObj.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const curShortMonth = todayObj.toLocaleString('en-US', { month: 'short' }).toLowerCase();
        const curNumMonth = (todayObj.getMonth() + 1).toString().padStart(2, '0');
        const currentDay = todayObj.getDate().toString().padStart(2, '0');
        
        const inputMonth = month.toLowerCase();
        const isMonthMatch = (inputMonth === curLongMonth) || (inputMonth === curShortMonth) || (parseInt(inputMonth) === parseInt(curNumMonth));

        const isToday = (year.toLowerCase() === currentYear.toLowerCase()) && 
                        isMonthMatch && 
                        (parseInt(date) === parseInt(currentDay));

        let summaryText = null;
        let learningText = null;
        let strategyText = null;
        let imageUrl = null;
        let videoUrl = null;

        if (fs.existsSync(baseDataPath)) {
            const yearsInDir = fs.readdirSync(baseDataPath);
            const matchedYearDir = yearsInDir.find(y => y.toLowerCase() === year.toLowerCase());

            if (matchedYearDir) {
                const monthsPath = path.join(baseDataPath, matchedYearDir);
                const monthsInDir = fs.readdirSync(monthsPath);
                
                const matchedMonthDir = monthsInDir.find(m => {
                    const lm = m.toLowerCase();
                    return lm === inputMonth || lm.startsWith(inputMonth) || (parseInt(lm) === parseInt(inputMonth));
                });

                if (matchedMonthDir) {
                    const targetFolder = path.join(monthsPath, matchedMonthDir);
                    const filesInDir = fs.readdirSync(targetFolder);
                    
                    const dayNum = parseInt(date).toString();

                    // CASE INSENSITIVE DIRECTORY SCAN: Matches both "Aug16" and "aug16" inside target folder
                    const dayFiles = filesInDir.filter(f => {
                        const baseName = f.toLowerCase();
                        return (baseName.startsWith(`aug${dayNum}`) || baseName.startsWith(`${dayNum}`)) && baseName.endsWith('.txt');
                    });

                    dayFiles.forEach(fileName => {
                        const lowerName = fileName.toLowerCase();
                        const fullFilePath = path.join(targetFolder, fileName);
                        const content = fs.readFileSync(fullFilePath, 'utf8');

                        if (lowerName.includes('learning')) {
                            learningText = content;
                        } else if (lowerName.includes('strategy') || lowerName.includes('strategies')) {
                            strategyText = content;
                        } else {
                            summaryText = content;
                        }
                    });
                }
            }
        }

        // =========================================================================
        // 🔄 FIXED ASSET ENGINE: Direct Programmatic Public URL Construction Layer
        // =========================================================================
        try {
            const dayNum = parseInt(date).toString(); // Converts "16" or "05" cleanly
            const shortMonthToken = month.toLowerCase().substring(0, 3);
            
            // Build the exact case-sensitive filename combinations matching your root storage bucket assets
            const titleCaseMonth = shortMonthToken.charAt(0).toUpperCase() + shortMonthToken.slice(1); // "Aug"
            const titleCaseFileNamePattern = `${titleCaseMonth}${dayNum}_nse.png`; // e.g. "Aug16_nse.png"
            const plainDayFileNamePattern = `${titleCaseMonth}${dayNum}.png`; // e.g. "Aug15.png"

            // Construct direct fallback URLs depending on the specific date pattern to bypass listing permission locks
            if (parseInt(dayNum) === 15) {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${plainDayFileNamePattern}`;
            } else {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${titleCaseFileNamePattern}`;
            }

            // Programmatic video asset fallback URL setup
            videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${titleCaseMonth}${dayNum}.mp4`;

        } catch (assetErr) {
            console.warn("Tracking asset lookup bypass:", assetErr.message);
        }

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

// --- Legacy Cloud Table Routes ---
app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analysis_posts')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data || []);
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: "Invalid credentials." });
    res.json({ token: data.session.access_token });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Intelligent Wildcard Engine Active on Port ${PORT}`));
