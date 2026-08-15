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

        const processContent = (content, isToday) => {
            if (!content) return null;
            if (isToday) return content;
            
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
        // 🔄 ASSET VERIFICATION LAYER: Ignore completely if not found
        // =========================================================================
        try {
            const dayNum = parseInt(date).toString();
            const shortMonthToken = month.toLowerCase().substring(0, 3);
            const titleCaseMonth = shortMonthToken.charAt(0).toUpperCase() + shortMonthToken.slice(1);

            // Create an array of possible case variations based on your dynamic filenames
            const prospectiveImages = [
                `${supabaseUrl}/storage/v1/object/public/tracking/${titleCaseMonth}${dayNum}_nse.png`,
                `${supabaseUrl}/storage/v1/object/public/tracking/${shortMonthToken}${dayNum}_nse.png`,
                `${supabaseUrl}/storage/v1/object/public/tracking/${titleCaseMonth}${dayNum}.png`,
                `${supabaseUrl}/storage/v1/object/public/tracking/${shortMonthToken}${dayNum}.png`
            ];

            const prospectiveVideos = [
                `${supabaseUrl}/storage/v1/object/public/tracking/${titleCaseMonth}${dayNum}.mp4`,
                `${supabaseUrl}/storage/v1/object/public/tracking/${shortMonthToken}${dayNum}.mp4`
            ];

            // Helper function to verify url availability before serving it to the client
            const verifyUrl = async (urlArray) => {
                for (const url of urlArray) {
                    try {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), 1200); // Rapid timeout flag
                        
                        const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
                        clearTimeout(id);
                        
                        if (response.ok && response.status !== 400) {
                            return url; // Match found! Stop looping and return valid url
                        }
                    } catch {
                        continue;
                    }
                }
                return null; // File not found across any file naming variation -> ignore it cleanly
            };

            imageUrl = await verifyUrl(prospectiveImages);
            videoUrl = await verifyUrl(prospectiveVideos);

        } catch (assetErr) {
            console.warn("Storage verification bypassed:", assetErr.message);
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
        const { data, error } = await supabase.from('analysis_posts').select('*').order('created_at', { ascending: false });
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
