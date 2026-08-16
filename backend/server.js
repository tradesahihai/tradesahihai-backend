const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

<<<<<<< Updated upstream
// ✅ CORS Layer Setup
=======
>>>>>>> Stashed changes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

app.get('/api/analysis/:year/:month/:date', async (req, res) => {
    try {
        const { year, month, date } = req.params;
        const baseDataPath = path.join(__dirname, '..', 'data');

        const processContent = (content, isToday) => {
            if (!content) return null;
            if (isToday) return content;
            
            const lines = content.split(/\r?\n/);
            const firstLine = lines.find(line => line.trim().length > 0) || "Older Entry Data";
            return {
                header: firstLine.trim(),
                hasMore: content.trim().length > firstLine.trim().length,
                fullContent: content
            };
        };

        const todayObj = new Date();
        const currentYear = todayObj.getFullYear().toString();
        const curLongMonth = todayObj.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const curShortMonth = todayObj.toLocaleString('en-US', { month: 'short' }).toLowerCase();
        const curNumMonth = (todayObj.getMonth() + 1).toString().padStart(2, '0');
        const currentDay = todayObj.getDate().toString().padStart(2, '0');
        
        const inputMonth = month.toLowerCase();
        const isMonthMatch = (inputMonth === curLongMonth) || (inputMonth === curShortMonth) || (parseInt(inputMonth) === parseInt(curNumMonth));
        const isToday = (year.toLowerCase() === currentYear.toLowerCase()) && isMonthMatch && (parseInt(date) === parseInt(currentDay));

        let summaryText = null; let learningText = null; let strategyText = null;
        let imageUrl = null; let videoUrl = null;

<<<<<<< Updated upstream
        // Establish safe folder variables with case fallbacks matching your storage paths
        let folderYear = year; 
        let folderMonth = month; 
=======
        let folderYear = year; let folderMonth = month;
>>>>>>> Stashed changes

        if (fs.existsSync(baseDataPath)) {
            const yearsInDir = fs.readdirSync(baseDataPath);
            const matchedYearDir = yearsInDir.find(y => y.toLowerCase() === year.toLowerCase());

            if (matchedYearDir) {
<<<<<<< Updated upstream
                folderYear = matchedYearDir; // Capture exact casing (e.g. "2026")
=======
                folderYear = matchedYearDir;
>>>>>>> Stashed changes
                const monthsPath = path.join(baseDataPath, matchedYearDir);
                const monthsInDir = fs.readdirSync(monthsPath);
                const matchedMonthDir = monthsInDir.find(m => m.toLowerCase() === inputMonth || m.toLowerCase().startsWith(inputMonth));

                if (matchedMonthDir) {
<<<<<<< Updated upstream
                    folderMonth = matchedMonthDir; // Capture exact casing (e.g. "August")
=======
                    folderMonth = matchedMonthDir;
>>>>>>> Stashed changes
                    const targetFolder = path.join(monthsPath, matchedMonthDir);
                    const filesInDir = fs.readdirSync(targetFolder);
                    const dayNum = parseInt(date).toString();

                    const dayFiles = filesInDir.filter(f => {
                        const bn = f.toLowerCase();
                        return (bn.startsWith(`aug${dayNum}`) || bn.startsWith(`${dayNum}`)) && bn.endsWith('.txt');
                    });

                    dayFiles.forEach(fileName => {
                        const ln = fileName.toLowerCase();
                        const content = fs.readFileSync(path.join(targetFolder, fileName), 'utf8');
                        if (ln.includes('learning')) learningText = content;
                        else if (ln.includes('strategy') || ln.includes('strategies')) strategyText = content;
                        else summaryText = content;
                    });
                }
            }
        }

        // =========================================================================
        // 🔄 FIXED ASSET ENGINE: Accurate Subfolder Path Alignment Layer
        // =========================================================================
        try {
            const dayNum = parseInt(date).toString();
            const shortMonthToken = folderMonth.toLowerCase().substring(0, 3);
<<<<<<< Updated upstream
            const titleCaseMonth = shortMonthToken.charAt(0).toUpperCase() + shortMonthToken.slice(1); // Result: "Aug"

            // Target storage path matches your exact structure layout: "2026/August"
            const storageFolderPath = `${folderYear}/${folderMonth}`;

            // Create expected file variations cleanly
            const nsePattern = `${titleCaseMonth}${dayNum}_nse.png`; // Aug16_nse.png
            const plainPattern = `${titleCaseMonth}${dayNum}.png`;   // Aug15.png

            // Clean fallback router selector matching your disk files explicitly
            if (parseInt(dayNum) === 15) {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${plainPattern}`;
            } else {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${nsePattern}`;
            }

            // Map corresponding walkthrough reel video track layout
            videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${titleCaseMonth}${dayNum}.mp4`;

        } catch (assetErr) {
            console.warn("Storage path fallback override failed:", assetErr.message);
        }

        return res.json({
            date,
            isToday,
            summary: processContent(summaryText, isToday),
            learning: processContent(learningText, isToday),
            strategy: processContent(strategyText, isToday), 
            imageUrl,   
            videoUrl   
=======
            const titleCaseMonth = shortMonthToken.charAt(0).toUpperCase() + shortMonthToken.slice(1);
            const storageFolderPath = `${folderYear}/${folderMonth}`;

            if (parseInt(dayNum) === 15) {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${titleCaseMonth}${dayNum}.png`;
            } else {
                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${titleCaseMonth}${dayNum}_nse.png`;
            }
            videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${titleCaseMonth}${dayNum}.mp4`;
        } catch (assetErr) {
            console.warn("Storage path fallback override failed.");
        }

        return res.json({
            date, isToday,
            summary: processContent(summaryText, isToday),
            learning: processContent(learningText, isToday),
            strategy: processContent(strategyText, isToday),
            imageUrl, videoUrl
>>>>>>> Stashed changes
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

<<<<<<< Updated upstream
// --- Legacy Cloud Table Routes ---
=======
>>>>>>> Stashed changes
app.get('/api/posts', async (req, res) => {
    try {
        const { data, error } = await supabase.from('analysis_posts').select('*').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data || []);
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Intelligent Engine Active on Port ${PORT}`));