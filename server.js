// server.js  (ESM 버전, type: "module"과 호환)

// npm install express body-parser

import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, 'click-db.json');

// ===== 간단 파일 DB =====
let db = { uids: {} };

function loadDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(raw);
            if (!db || typeof db !== 'object' || !db.uids) {
                db = { uids: {} };
            }
        }
    } catch (e) {
        console.error('loadDb error:', e);
        db = { uids: {} };
    }
}

function saveDb() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('saveDb error:', e);
    }
}

loadDb();

app.use(bodyParser.json());

// Vite 빌드 결과(dist) 정적 서빙
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// ===== 유틸: 랭킹 계산 =====
function computeLeaderboard(currentUid) {
    const entries = Object.entries(db.uids).map(([uid, info]) => ({
        uid,
        team: info.team || 'unknown',
        totalClicks: info.totalClicks || 0,
        bestSession: info.bestSession || 0,
        updatedAt: info.updatedAt || 0
    }));

    entries.sort((a, b) => {
        if (b.totalClicks !== a.totalClicks) {
            return b.totalClicks - a.totalClicks;
        }
        return a.updatedAt - b.updatedAt;
    });

    const totalUsers = entries.length;
    const leaderboard = entries.slice(0, 10).map((e, idx) => ({
        rank: idx + 1,
        uid: e.uid,
        team: e.team,
        totalClicks: e.totalClicks
    }));

    let me = null;
    if (currentUid) {
        const idx = entries.findIndex((e) => e.uid === currentUid);
        if (idx !== -1) {
            const info = entries[idx];
            me = {
                uid: info.uid,
                team: info.team,
                rank: idx + 1,
                totalClicks: info.totalClicks,
                bestSession: info.bestSession,
                totalUsers
            };
        }
    }

    return { leaderboard, me };
}

// ===== API: 세션 결과 기록 =====
app.post('/api/session', (req, res) => {
    const { uid, team, sessionClicks, totalLocalClicks } = req.body || {};

    if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ ok: false, error: 'invalid uid' });
    }
    const sc = Number.parseInt(sessionClicks, 10);
    if (!Number.isFinite(sc) || sc <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid sessionClicks' });
    }

    const tClicks = Number.parseInt(totalLocalClicks, 10);
    const now = Date.now();

    if (!db.uids[uid]) {
        db.uids[uid] = {
            team: team === 'outside' ? 'outside' : 'inside',
            totalClicks: 0,
            bestSession: 0,
            lastLocalClicks: 0,
            updatedAt: now
        };
    }

    const entry = db.uids[uid];
    entry.team = team === 'outside' ? 'outside' : 'inside';
    entry.totalClicks += sc;
    if (!entry.bestSession || sc > entry.bestSession) {
        entry.bestSession = sc;
    }
    entry.lastLocalClicks = Number.isFinite(tClicks)
        ? tClicks
        : entry.lastLocalClicks;
    entry.updatedAt = now;

    saveDb();

    const result = computeLeaderboard(uid);
    res.json({
        ok: true,
        leaderboard: result.leaderboard,
        me: result.me
    });
});

// ===== API: 랭킹 조회 =====
app.get('/api/leaderboard', (req, res) => {
    const uid = req.query.uid;
    const result = computeLeaderboard(uid);
    res.json({
        ok: true,
        leaderboard: result.leaderboard,
        me: result.me
    });
});

// SPA 라우팅: 나머지는 dist/index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
