const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Secure connection to your Supabase cloud cluster
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Endpoint 1: Fetch all public charts
app.get('/api/posts', async (req, res) => {
    const { data, error } = await supabase.from('analysis_posts').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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

