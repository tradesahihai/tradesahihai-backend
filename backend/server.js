// ✅ CONNECTED: Pointed precisely to your wildcard backend web service running live on Render
const BACKEND_URL = "https://onrender.com"; 

document.addEventListener("DOMContentLoaded", () => {
    // Fire up both your legacy table posts and your active intelligent daily wildcard file layers
    fetchCloudData();
    fetchDailyFlatFiles();
});

/**
 * 📈 FLAT-FILE FILE ENGINE: Fetches directly out of your flexible backend folders
 */
async function fetchDailyFlatFiles() {
    try {
        const year = "2026";
        const month = "August";
        const dateStr = "Aug15";

        const res = await fetch(`${BACKEND_URL}/api/analysis/${year}/${month}/${dateStr}`);
        if (!res.ok) {
            console.warn("Flat file logs matching today's parameters are empty or pending.");
            return;
        }

        const data = await res.json();
        injectFlatFilesIntoVaults(data);

    } catch (err) {
        console.error("Flat-file synchronizer pipeline blocked:", err);
    }
}

/**
 * 🎨 DOM INJECTION WORKER: Maps parameters right inside your current layout containers
 */
function injectFlatFilesIntoVaults(data) {
    // ✅ HARMONIZED: Matched exactly to your index.html element target identifiers
    const dailyVault = document.getElementById('stream-daily');
    const learningVault = document.getElementById('stream-learning');
    const strategyVault = document.getElementById('stream-strategy');
    const reelsVault = document.getElementById('stream-reels');

    if (!dailyVault || !learningVault || !strategyVault || !reelsVault) {
        console.error("Critical Error: Missing structural streaming containers in index.html");
        return;
    }

    // 1. Daily Summary Inferences & Chart Image Layer
    if (data.summary) {
        let imgHtml = data.imageUrl ? `<div class="chart-frame-wrapper"><img src="${data.imageUrl}" class="chart-frame-img" style="max-width:100%; border-radius:8px; margin: 1rem 0;"></div>` : '';
        dailyVault.innerHTML = `
            <div class="display-card-v2" style="background:#161b22; padding:1.5rem; border:1px solid #30363d; border-radius:8px; margin-bottom:1rem; width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <h3 style="margin:0; color:#fff;">📈 Today's Analysis Summary</h3>
                    <div><span class="localization-tag" style="background:#2962ff; color:#fff; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight:600;">📁 Live File Sync</span></div>
                </div>
                <p style="font-size:0.75rem; color:#8b949e; margin-bottom:12px;">File loaded dynamically for date: ${data.date}</p>
                ${imgHtml}
                <p class="card-body-text" style="white-space: pre-wrap; line-height: 1.6; color:#c9d1d9;">${data.summary}</p>
            </div>
        ` + dailyVault.innerHTML; 
    }

    // 2. Educational Learning Metrics Layer
    if (data.learning) {
        learningVault.innerHTML = `
            <div class="display-card-v2" style="background:#161b22; padding:1.5rem; border:1px solid #30363d; border-radius:8px; margin-bottom:1rem; width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <h3 style="margin:0; color:#fff;">💡 Concept Learnings</h3>
                    <div><span class="localization-tag" style="background:#00e676; color:#000; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight:600;">📁 Live File Sync</span></div>
                </div>
                <p class="card-body-text" style="white-space: pre-wrap; line-height: 1.6; margin-top:12px; color:#c9d1d9;">${data.learning}</p>
            </div>
        ` + learningVault.innerHTML;
    }

    // 3. Conditional Strategy Layer (Prepends ONLY if file text context exists)
    if (data.strategy) {
        strategyVault.innerHTML = `
            <div class="display-card-v2" style="background:#161b22; padding:1.5rem; border:1px solid #30363d; border-radius:8px; margin-bottom:1rem; width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <h3 style="margin:0; color:#fff;">🎯 System Execution Rules</h3>
                    <div><span class="localization-tag" style="background:#ffea00; color:#000; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight:600;">📁 Live File Sync</span></div>
                </div>
                <p class="card-body-text" style="white-space: pre-wrap; line-height: 1.6; margin-top:12px; color:#c9d1d9;">${data.strategy}</p>
            </div>
        ` + strategyVault.innerHTML;
    }

    // 4. Conditional Video Reels Layer (Injects native HTML5 mp4 media players natively)
    if (data.videoUrl) {
        reelsVault.innerHTML = `
            <article class="reel-card" style="width: 100%; max-width: 360px; background:#161b22; padding:1rem; border:1px solid #30363d; border-radius:8px; margin-bottom: 1.5rem;">
                <video src="${data.videoUrl}" controls style="border-radius: 6px; background: #000; width:100%; max-height:450px;">
                    Your environment context cannot stream native mp4 video frames.
                </video>
                <div style="padding: 10px 0 0 0;">
                    <h4 style="margin:0; color:#fff;">🎬 Live Video Playback</h4>
                    <p style="font-size:0.75rem; color:#8b949e; margin:4px 0 0 0;">Streaming via public storage bucket root</p>
                </div>
            </article>
        ` + reelsVault.innerHTML;
    }
}

/**
 * 🌐 CLOUD STORAGE ACCESSOR: Fetches data rows from Supabase (Fixed and Protected against Null Crashes)
 */
async function fetchCloudData() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/posts`);
        const posts = await res.json();
        
        // ✅ HARMONIZED: Fixed legacy naming selectors to map accurately with stream- panels
        const dailyVault = document.getElementById('stream-daily');
        const learningVault = document.getElementById('stream-learning');
        const strategyVault = document.getElementById('stream-strategy');
        const reelsVault = document.getElementById('stream-reels');

        if (!dailyVault || !learningVault || !strategyVault || !reelsVault) return;

        dailyVault.innerHTML = ''; learningVault.innerHTML = '';
        strategyVault.innerHTML = ''; reelsVault.innerHTML = '';

        if(!posts || posts.length === 0) {
            const fallback = `<div class="display-card-v2" style="background:#161b22; padding:1.5rem; border:1px solid #30363d; border-radius:8px; color:#8b949e;"><h4>Feed Repository Active</h4><p>Commit flat text files to your data/ workspace directory to publish trading logs.</p></div>`;
            dailyVault.innerHTML = fallback; learningVault.innerHTML = fallback;
            strategyVault.innerHTML = fallback; reelsVault.innerHTML = fallback;
            return;
        }

        posts.forEach(p => {
            let img = p.image_url ? `<div class="chart-frame-wrapper"><img src="${p.image_url}" class="chart-frame-img" style="max-width:100%; border-radius:4px; margin-top:0.5rem;"></div>` : '';
            let dateStr = new Date(p.created_at || Date.now()).toLocaleDateString(undefined, { 
                year: 'numeric', month: 'short', day: 'numeric' 
            });
            
            let cardHtml = `
                <div class="display-card-v2" style="background:#161b22; padding:1.5rem; border:1px solid #30363d; border-radius:8px; margin-bottom:1rem; width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                        <h3 style="margin:0; color:#fff;">${p.title}</h3>
                        <div><span class="localization-tag" style="background:#30363d; color:#8b949e; padding:2px 8px; border-radius:4px; font-size:0.7rem;">🌐 Global Sync</span></div>
                    </div>
                    <p style="font-size:0.75rem; color:#8b949e; margin-bottom:12px;">Logged securely on ${dateStr}</p>
                    ${img}
                    <p class="card-body-text" style="white-space: pre-wrap; line-height: 1.6; color:#c9d1d9; margin-top:0.5rem;">${p.body}</p>
                </div>
            `;

            if(p.category === 'daily') dailyVault.innerHTML += cardHtml;
            if(p.category === 'learning') learningVault.innerHTML += cardHtml;
            if(p.category === 'strategy') strategyVault.innerHTML += cardHtml;
            
            if(p.category === 'reel') {
                reelsVault.innerHTML += `
                    <article class="reel-card" style="width:100%; max-width:360px; background:#161b22; border:1px solid #30363d; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                        <div class="reel-video-simulation-box" style="position:relative; display:flex; justify-content:center; align-items:center; background:#000; border-radius:6px; height:200px; overflow:hidden;">
                            <img src="${p.image_url}" class="reel-media-placeholder" style="width:100%; opacity:0.6;">
                            <div style="position: absolute; font-size: 2rem; opacity: 0.85; cursor: pointer;">▶️</div>
                            <div class="reel-overlay-info" style="position:absolute; bottom:0; left:0; right:0; padding:10px; background:linear-gradient(transparent, rgba(0,0,0,0.8)); color:#fff;">
                                <h4 style="margin:0;">${p.title}</h4>
                                <p style="font-size:0.75rem; opacity:0.9; margin:4px 0 0 0;">${p.body}</p>
                            </div>
                        </div>
                    </article>
                `;
            }
        });
} catch (err) { 
    console.error("Cloud syncing blocked", err); 
}
}

function navigateHub(targetTab, event) {
    document.querySelectorAll('.viewport-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    
    if (event && event.target) event.target.classList.add('active');
    
    const panel = document.getElementById(`${targetTab}-panel`);
    if (panel) panel.classList.add('active');
}
