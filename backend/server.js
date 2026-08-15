const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

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
            
            const firstLine = content.split(/\r?\n/)[0].trim();
            return {
                header: firstLine || "Older Entry Data",
                hasMore: content.trim().length > firstLine.length,
                fullContent: content
            };
        };

        // Determine if parameters match current system date
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
                    
                    // ✅ MATCHING LOGIC FIX: Generate short prefix from month parameter (e.g., "aug") + numeric string day layout ("16")
                    const shortMonthPrefix = matchedMonthDir.substring(0, 3).toLowerCase(); 
                    const formattedDayStr = parseInt(date).toString(); // Strips leading zeros if passed
                    const targetFilePrefix = `${shortMonthPrefix}${formattedDayStr}`; // Creates "aug16"

                    const dayFiles = filesInDir.filter(f => {
                        const baseName = f.toLowerCase();
                        return baseName.startsWith(targetFilePrefix) && baseName.endsWith('.txt');
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
                            // Automatically assigns general reports like 'Aug16_NSE.txt' to summary streams
                            summaryText = content;
                        }
                    });

                    const storageFolderPath = `${matchedYearDir}/${matchedMonthDir}`;
                    try {
                        const { data: files, error } = await supabase.storage
                            .from('tracking')
                            .list(storageFolderPath, { search: date });

                        if (!error && files) {
                            const imageMatch = files.find(f => f.name.toLowerCase().includes(targetFilePrefix) && /\.(png|jpeg|jpg)$/i.test(f.name));
                            if (imageMatch) {
                                imageUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${imageMatch.name}`;
                            }

                            const videoMatch = files.find(f => f.name.toLowerCase().includes(targetFilePrefix) && /\.(mp4|mov)$/i.test(f.name));
                            if (videoMatch) {
                                videoUrl = `${supabaseUrl}/storage/v1/object/public/tracking/${storageFolderPath}/${videoMatch.name}`;
                            }
                        }
                    } catch (storageErr) {
                        console.warn("Supabase asset processing engine bypass:", storageErr.message);
                    }
                }
            }
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Intelligent Wildcard Engine Active on Port ${PORT}`));
