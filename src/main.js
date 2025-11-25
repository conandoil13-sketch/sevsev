import './style.css';

// ===== 전역 클릭 카운터 =====
window.TOTAL_CLICKS = 0;

// ===== 세션 / 상태 변수 =====
let sessionRunning = false;
let sessionTimeLeft = 60;
let sessionTimerId = null;
let sessionClicks = 0;

let attemptsLeft = 3;

let adActive = false;
let adTimerId = null;
let adRemaining = 0;

let holdTimer = null;
const HOLD_INTERVAL = 80;

let teamSelectingActive = false;

const API_BASE = ''; // 같은 origin 기준

// ===== UID 생성/표시 =====
function getOrCreateUID() {
    let uid = localStorage.getItem('click_experiment_uid');
    if (!uid) {
        if (window.crypto && window.crypto.randomUUID) {
            uid = window.crypto.randomUUID();
        } else {
            uid =
                'uid-' +
                Math.random().toString(36).slice(2) +
                Date.now().toString(36);
        }
        localStorage.setItem('click_experiment_uid', uid);
    }
    return uid;
}
const UID = getOrCreateUID();

// ===== 공용 클릭 함수 =====
function registerClick(source = 'manual') {
    if (adActive) return;

    window.TOTAL_CLICKS += 1;

    const el = document.getElementById('clickCount');
    if (el) el.textContent = window.TOTAL_CLICKS.toString();

    if (sessionRunning) {
        sessionClicks += 1;
        const sEl = document.getElementById('sessionClickCount');
        if (sEl) sEl.textContent = sessionClicks.toString();
    }

    if (window.TOTAL_CLICKS % 50 === 0) {
        console.log(
            `[LOG] total clicks = ${window.TOTAL_CLICKS} (via ${source})`
        );
    }
}

// ===== 시도 횟수 로드/저장 =====
function loadAttempts() {
    const raw = localStorage.getItem('click_experiment_attempts');
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
        attemptsLeft = 3;
    } else {
        attemptsLeft = n;
    }
}

function saveAttempts() {
    localStorage.setItem('click_experiment_attempts', String(attemptsLeft));
    updateControls();
}

// ===== UI 제어 공통 =====
function updateControls() {
    const attemptsEl = document.getElementById('attemptsLeft');
    const timeEl = document.getElementById('timeLeft');
    const clickBtn = document.getElementById('clickBtn');
    const startBtn = document.getElementById('startSessionBtn');
    const showAdBtn = document.getElementById('showAdBtn');

    if (attemptsEl) attemptsEl.textContent = String(attemptsLeft);
    if (timeEl) timeEl.textContent = String(sessionTimeLeft);

    const cannotInteract = adActive || teamSelectingActive;

    if (sessionRunning) {
        startBtn.disabled = true;
    } else {
        startBtn.disabled = cannotInteract || attemptsLeft <= 0;
    }

    if (sessionRunning && !cannotInteract && attemptsLeft > 0) {
        clickBtn.disabled = false;
    } else {
        clickBtn.disabled = true;
    }

    if (attemptsLeft <= 0 && !adActive) {
        showAdBtn.classList.remove('hidden');
    } else {
        showAdBtn.classList.add('hidden');
    }
}

function updateSessionResult(text) {
    const el = document.getElementById('sessionResult');
    if (el) el.textContent = text || '';
}

// ===== 세션 제어 =====
function startSession() {
    if (sessionRunning) return;
    if (adActive || teamSelectingActive) return;
    if (attemptsLeft <= 0) return;

    sessionRunning = true;
    sessionTimeLeft = 60;
    sessionClicks = 0;
    const sEl = document.getElementById('sessionClickCount');
    if (sEl) sEl.textContent = '0';
    updateSessionResult('');

    updateControls();

    if (sessionTimerId) {
        clearInterval(sessionTimerId);
        sessionTimerId = null;
    }

    sessionTimerId = setInterval(() => {
        sessionTimeLeft -= 1;
        if (sessionTimeLeft < 0) sessionTimeLeft = 0;
        const timeEl = document.getElementById('timeLeft');
        if (timeEl) timeEl.textContent = String(sessionTimeLeft);

        if (sessionTimeLeft <= 0) {
            endSession();
        }
    }, 1000);
}

async function endSession() {
    if (!sessionRunning) return;
    sessionRunning = false;

    if (sessionTimerId) {
        clearInterval(sessionTimerId);
        sessionTimerId = null;
    }
    sessionTimeLeft = 0;
    endHold();
    updateControls();

    attemptsLeft -= 1;
    if (attemptsLeft < 0) attemptsLeft = 0;
    saveAttempts();

    const lastSessionClicks = sessionClicks;
    updateSessionResult(`이번 세션 결과: ${lastSessionClicks}회`);

    // 서버에 세션 결과 전송 + 랭킹 갱신
    if (lastSessionClicks > 0) {
        submitSessionToServer(lastSessionClicks);
    }
}

// ===== 꾹 누르기 자동 연타 =====
function startHold() {
    if (!sessionRunning || adActive || teamSelectingActive) return;

    registerClick('hold');

    if (holdTimer === null) {
        holdTimer = setInterval(() => {
            if (!sessionRunning || adActive || teamSelectingActive) {
                endHold();
                return;
            }
            registerClick('hold');
        }, HOLD_INTERVAL);
    }
}

function endHold() {
    if (holdTimer !== null) {
        clearInterval(holdTimer);
        holdTimer = null;
    }
}

// ===== 광고 제어 =====
function openAd() {
    if (adActive) return;
    if (attemptsLeft > 0) return;

    adActive = true;
    adRemaining = 10;

    const overlay = document.getElementById('adOverlay');
    const secSpan = document.getElementById('adSeconds');
    const closeBtn = document.getElementById('adCloseBtn');

    if (secSpan) secSpan.textContent = String(adRemaining);
    if (overlay) overlay.classList.remove('hidden');
    if (closeBtn) {
        closeBtn.disabled = true;
        closeBtn.textContent = '닫기 (10초 후 활성화)';
    }

    endHold();
    updateControls();

    if (adTimerId) {
        clearInterval(adTimerId);
        adTimerId = null;
    }

    adTimerId = setInterval(() => {
        adRemaining -= 1;
        if (adRemaining < 0) adRemaining = 0;
        if (secSpan) secSpan.textContent = String(adRemaining);
        if (adRemaining <= 0) {
            clearInterval(adTimerId);
            adTimerId = null;
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.textContent = '닫기';
            }
        }
    }, 1000);
}

function closeAdAndRefill() {
    if (!adActive) return;

    adActive = false;

    if (adTimerId) {
        clearInterval(adTimerId);
        adTimerId = null;
    }

    const overlay = document.getElementById('adOverlay');
    if (overlay) overlay.classList.add('hidden');

    attemptsLeft = 3;
    saveAttempts();
    updateControls();
}

// ===== 팀 선택 로직 =====
const teamQuestions = [
    {
        text: '낯선 사람들과 함께하는 공간에서는 보통 어떤 쪽에 서 있나요?',
        aLabel: '벽 쪽이나 구석에서 분위기를 지켜본다.',
        bLabel: '중앙 쪽으로 가서 자연스럽게 섞인다.',
        aInside: 1,
        aOutside: 0,
        bInside: 0,
        bOutside: 1
    },
    {
        text: '새로운 규칙이나 시스템을 만났을 때 당신은?',
        aLabel: '일단 정해진 틀 안에서 최대한 잘 활용해본다.',
        bLabel: '규칙의 빈틈을 찾아 나만의 길을 만들어본다.',
        aInside: 1,
        aOutside: 1
    },
    {
        text: '“벽”이라는 단어를 들었을 때 더 먼저 떠오르는 것은?',
        aLabel: '안쪽을 지키는 방어막, 안정을 위한 경계선.',
        bLabel: '뛰어넘어야 할 장벽, 바깥으로 나가는 출구.',
        aInside: 1,
        aOutside: 2
    }
];

let teamQuestionIndex = 0;
let insideScore = 0;
let outsideScore = 0;

function setTeamUI(team) {
    const teamLabel = document.getElementById('teamLabel');
    const clickBtn = document.getElementById('clickBtn');
    document.body.classList.remove('team-inside', 'team-outside');

    if (team === 'inside') {
        if (teamLabel) teamLabel.textContent = '당신의 팀: 벽 안';
        if (clickBtn) clickBtn.textContent = '벽 안을 지키기 위해 클릭!';
        document.body.classList.add('team-inside');
    } else {
        if (teamLabel) teamLabel.textContent = '당신의 팀: 벽 밖';
        if (clickBtn) clickBtn.textContent = '벽 밖으로 나아가기 위해 클릭!';
        document.body.classList.add('team-outside');
    }
}

function showTeamOverlay() {
    teamSelectingActive = true;
    const overlay = document.getElementById('teamOverlay');
    if (overlay) overlay.classList.remove('hidden');

    teamQuestionIndex = 0;
    insideScore = 0;
    outsideScore = 0;
    renderTeamQuestion();
    updateControls();
}

function hideTeamOverlay() {
    teamSelectingActive = false;
    const overlay = document.getElementById('teamOverlay');
    if (overlay) overlay.classList.add('hidden');
    updateControls();
}

function renderTeamQuestion() {
    const q = teamQuestions[teamQuestionIndex];
    const qText = document.getElementById('teamQuestionText');
    const btnA = document.getElementById('teamOptionA');
    const btnB = document.getElementById('teamOptionB');

    if (!q || !qText || !btnA || !btnB) return;

    qText.textContent = q.text;
    btnA.textContent = q.aLabel;
    btnB.textContent = q.bLabel;
}

function handleTeamAnswer(option) {
    const q = teamQuestions[teamQuestionIndex];
    if (!q) return;

    if (option === 'A') {
        insideScore += q.aInside || 0;
        outsideScore += q.aOutside || 0;
    } else {
        insideScore += q.bInside || 0;
        outsideScore += q.bOutside || 0;
    }

    teamQuestionIndex += 1;

    if (teamQuestionIndex >= teamQuestions.length) {
        const team = insideScore >= outsideScore ? 'inside' : 'outside';
        localStorage.setItem('click_experiment_team', team);
        setTeamUI(team);
        hideTeamOverlay();
        fetchLeaderboard();
    } else {
        renderTeamQuestion();
    }
}

function initTeam() {
    const saved = localStorage.getItem('click_experiment_team');
    if (saved === 'inside' || saved === 'outside') {
        setTeamUI(saved);
        teamSelectingActive = false;
        const overlay = document.getElementById('teamOverlay');
        if (overlay) overlay.classList.add('hidden');
    } else {
        showTeamOverlay();
    }
}

// ===== 랭킹 UI =====
function updateLeaderboardUI(leaderboard, me) {
    const listEl = document.getElementById('leaderboardList');
    const myEl = document.getElementById('myRankLine');
    if (!listEl || !myEl) return;

    listEl.innerHTML = '';
    if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
        myEl.textContent = '아직 랭킹 데이터가 없습니다.';
        return;
    }

    leaderboard.forEach((entry) => {
        const li = document.createElement('li');
        const left = document.createElement('div');
        left.className = 'lb-left';
        const right = document.createElement('div');

        const nameLine = document.createElement('span');
        nameLine.innerHTML =
            `<span class="lb-rank">#${entry.rank}</span>` +
            `<span>[${entry.team === 'outside' ? '벽 밖' : '벽 안'}]</span>`;
        const uidLine = document.createElement('span');
        uidLine.className = 'leaderboard-uid';
        uidLine.textContent = entry.uid;

        left.appendChild(nameLine);
        left.appendChild(uidLine);

        right.className = 'lb-score';
        right.textContent = `${entry.totalClicks} clicks`;

        li.appendChild(left);
        li.appendChild(right);
        listEl.appendChild(li);
    });

    if (me && me.rank != null) {
        myEl.textContent =
            `내 UID 기준 순위: #${me.rank} / ${me.totalUsers}명, ` +
            `총 ${me.totalClicks}회, 최고 세션 ${me.bestSession}회`;
    } else {
        myEl.textContent = '내 랭킹 정보를 불러오지 못했습니다.';
    }
}

async function fetchLeaderboard() {
    try {
        const params = new URLSearchParams({ uid: UID });
        const res = await fetch(
            `${API_BASE}/api/leaderboard?${params.toString()}`
        );
        if (!res.ok) return;
        const data = await res.json();
        updateLeaderboardUI(data.leaderboard, data.me);
    } catch (err) {
        console.error('fetchLeaderboard error', err);
    }
}

async function submitSessionToServer(lastSessionClicks) {
    try {
        const team = localStorage.getItem('click_experiment_team') || 'unknown';
        const body = {
            uid: UID,
            team,
            sessionClicks: lastSessionClicks,
            totalLocalClicks: window.TOTAL_CLICKS
        };
        const res = await fetch(`${API_BASE}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) return;
        const data = await res.json();
        updateLeaderboardUI(data.leaderboard, data.me);
    } catch (err) {
        console.error('submitSessionToServer error', err);
    }
}

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INFO] UID =', UID);
    const uidLabel = document.getElementById('uidLabel');
    if (uidLabel) uidLabel.textContent = UID;

    loadAttempts();

    const clickBtn = document.getElementById('clickBtn');
    const startBtn = document.getElementById('startSessionBtn');
    const showAdBtn = document.getElementById('showAdBtn');
    const adCloseBtn = document.getElementById('adCloseBtn');
    const teamOptionA = document.getElementById('teamOptionA');
    const teamOptionB = document.getElementById('teamOptionB');

    // 세션 시작 버튼
    startBtn.addEventListener('click', () => {
        startSession();
    });

    // 광고 보기 버튼
    showAdBtn.addEventListener('click', () => {
        openAd();
    });

    // 광고 닫기 버튼
    adCloseBtn.addEventListener('click', () => {
        closeAdAndRefill();
    });

    // 메인 클릭 버튼 - 꾹 누르기
    clickBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startHold();
    });
    document.addEventListener('mouseup', () => {
        endHold();
    });
    clickBtn.addEventListener('mouseleave', () => {
        endHold();
    });

    // 터치 지원
    clickBtn.addEventListener(
        'touchstart',
        (e) => {
            e.preventDefault();
            startHold();
        },
        { passive: false }
    );
    document.addEventListener('touchend', () => {
        endHold();
    });
    document.addEventListener('touchcancel', () => {
        endHold();
    });

    // 팀 선택 옵션
    teamOptionA.addEventListener('click', () => handleTeamAnswer('A'));
    teamOptionB.addEventListener('click', () => handleTeamAnswer('B'));

    // 초기 UI
    const timeEl = document.getElementById('timeLeft');
    if (timeEl) timeEl.textContent = String(sessionTimeLeft);
    const sEl = document.getElementById('sessionClickCount');
    if (sEl) sEl.textContent = '0';
    updateSessionResult('');
    initTeam();
    updateControls();

    // 팀이 이미 정해져 있으면 초기 랭킹 불러오기
    fetchLeaderboard();
});
