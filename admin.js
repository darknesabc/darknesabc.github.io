const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let loggedInManager = localStorage.getItem('managerName');
let loggedInRole = localStorage.getItem('managerRole'); 

// 💡 글로벌 상태 변수
window.__currentSortMode = 'seat'; // 기본값: 자리순
window.__radarCurrentType = 'unit'; // 레이더 차트 (단원별/행동영역별)
window.__radarCurrentSubj = null;   // 레이더 차트 (선택된 과목)

// 1. 숫자 추출 도구 및 수퍼베이스 차단 대비용 '강제 순서표' 내장
const getSafeNum = (val) => {
    if (typeof val === 'number') return val;
    const match = String(val || "").match(/\d+/); 
    return match ? parseInt(match[0], 10) : 9999;
};

const KOR_UNIT_ORDER = {
    '인문': 1, '사회': 2, '과학': 3, '기술': 4, '예술': 5, '독서이론': 6, '융합': 7,
    '현대시': 8, '현대소설': 9, '고전시가': 10, '고전소설': 11, '수필': 12, '극': 13, '갈래복합': 14,
    '화법': 15, '작문': 16, '언어': 15, '매체': 16
};

const EDU_SCORE_MAP = {
    "전자기기 부정사용": 10, "핸드폰 무단사용": 7, "해드폰 미제출": 7, "무단결석": 7, "무단이탈": 7,
    "타층/타관 무단출입": 5, "원내대화": 5, "무단지각": 5, "모의고사 무단 1회 미응시": 5,
    "취침강제하원(7회)": 3, "음식물섭취": 3, "입/퇴실 미준수": 3,
    "지각": 1, "자습 중 이동 태블릿 미입력": 1, "취침": 1
};

// =========================================================
// 1. 공통 유틸리티 (로그인, 로그아웃, 시간)
// =========================================================
async function handleLogin() {
    const id = document.getElementById('admin-id').value.trim();
    const pw = document.getElementById('admin-pw').value.trim();
    const loginMsg = document.getElementById('login-msg');
    
    if (!id || !pw) { loginMsg.innerText = "아이디와 비밀번호를 모두 입력해주세요."; return; }

    try {
        const { data, error } = await _supabase.from('managers').select('*').eq('manager_id', id).eq('password', pw).maybeSingle();
        if (error) throw error;
        if (data) {
            localStorage.setItem('managerName', data.manager_name);
            localStorage.setItem('managerRole', data.role); 
            location.reload(); 
        } else { loginMsg.innerText = "로그인 정보가 올바르지 않습니다."; }
    } catch (err) { loginMsg.innerText = "에러: " + err.message; }
}

function handleLogout() { localStorage.clear(); location.reload(); }

function getCurrentPeriod() {
    const SCHEDULE = [
        { p: "1", start: "08:00", end: "08:30" }, { p: "2", start: "08:50", end: "10:10" },
        { p: "3", start: "10:30", end: "12:00" }, { p: "4", start: "13:10", end: "14:30" },
        { p: "5", start: "14:50", end: "15:50" }, { p: "6", start: "16:10", end: "17:30" },
        { p: "7", start: "18:40", end: "20:10" }, { p: "8", start: "20:30", end: "22:00" }
    ];
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    for (let i = 0; i < SCHEDULE.length; i++) {
        if (currentTime < SCHEDULE[i].end) return SCHEDULE[i].p;
    }
    return "8"; 
}

// =========================================================
// 2. 메인 화면 초기화 (바둑판 카드)
// =========================================================
async function init() {
    if (!loggedInManager) {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
        return;
    }
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('welcome-msg').innerText = `${loggedInManager} 선생님, 환영합니다`;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const currentP = getCurrentPeriod();

        summary.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:15px;">
                <div style="font-size:18px; font-weight:bold; color:#2c3e50;">현재 ${currentP}교시 현황판 (${today})</div>
                <div style="display:flex; gap:5px; background:#eee; padding:4px; border-radius:8px;">
                    <button onclick="window.__changeSort('seat')" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; ${window.__currentSortMode==='seat'?'background:#2c3e50; color:white;':'background:transparent; color:#7f8c8d;'}">자리순</button>
                    <button onclick="window.__changeSort('name')" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; ${window.__currentSortMode==='name'?'background:#2c3e50; color:white;':'background:transparent; color:#7f8c8d;'}">이름순</button>
                    <button id="dashboard-fold-btn" onclick="window.__toggleDashboard()" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; background:#7f8c8d; color:white; margin-left:10px;">바둑판 접기 ⬆</button>
                </div>
            </div>
        `;

        let query = _supabase.from('student').select('*');
        if (loggedInRole !== 'super') query = query.eq('teacher_name', loggedInManager);

        const [resStudents, resAtt, resSleep, resMove, resEdu, resSurvey] = await Promise.all([
            query,
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*'),
            _supabase.from('survey_log').select('*').eq('survey_date', today)
        ]);

        let students = resStudents.data.filter(s => s.name && s.name !== '배정금지');

        if (window.__currentSortMode === 'name') {
            students.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        } else {
            students.sort((a, b) => a.seat_no.localeCompare(b.seat_no, undefined, {numeric: true}));
        }

        window.__dashboardItems = students.map(s => ({ seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name, className: s.class_name }));

        dashboard.innerHTML = '';
        
        const curPInt = parseInt(currentP, 10);

        students.forEach(s => {
            const att = resAtt.data.find(a => a.student_id === s.student_id);
            const move = resMove.data.find(ml => ml.student_id === s.student_id);
            const isOut = move && (move.return_period === "복귀안함" || parseInt(move.return_period) >= curPInt);
            const validMove = (isOut && move.reason !== "화장실/정수기") ? move.reason : "";
            
            let surveyReason = "";
            const surveysForStudent = resSurvey.data.filter(sv => sv.student_id === s.student_id);
            for (let sv of surveysForStudent) {
                const timeType = sv.arrival_time_type || "";
                let startP = 0, endP = 0;
                
                if (timeType.includes("결석")) { startP = 1; endP = 8; }
                else if (timeType.includes("오전")) { startP = 1; endP = 3; }
                else if (timeType.includes("오후")) { startP = 1; endP = 6; }
                else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 1; endP = 7; }
                
                if (curPInt >= startP && curPInt <= endP) {
                    surveyReason = `[설문] ${sv.reason.split('(')[0].trim()}`;
                    break;
                }
            }
            
            const todaySleep = resSleep.data.filter(sl => sl.student_id === s.student_id).reduce((acc, cur) => acc + (cur.count || 1), 0);
            const totalEduScore = resEdu.data.filter(el => el.student_id === s.student_id).reduce((acc, cur) => acc + (EDU_SCORE_MAP[cur.reason] || 0), 0);

            let status = "미입력", sub = "", color = "none", code = att ? att.status_code : "";
            if (code === "1") { 
                status = "출석"; color = "1"; 
                sub = validMove || surveyReason || (att ? att.memo : ""); 
            }
            else if (validMove) { status = validMove; color = "move"; }
            else if (surveyReason) { status = surveyReason; color = "schedule"; }
            else if (att && att.memo) { status = att.memo; color = "schedule"; }
            else { status = code === "3" ? "결석" : (code === "2" ? "지각" : "미입력"); color = code || "none"; }

            dashboard.innerHTML += `
                <div class="card status-${color}" style="position:relative; cursor:pointer;" onclick="window.__loadStudentDetail(window.__dashboardItems.find(x => x.studentId === '${s.student_id}'))">
                    <div class="seat" style="font-size:11px; opacity:0.7;">${s.seat_no}</div>
                    <div class="name" style="font-size:18px; margin: 5px 0;">${s.name}</div>
                    <div class="status-badge badge-${color}" style="font-size:13px; font-weight:900;">${status}</div>
                    ${sub ? `<div style="font-size:11px; color:#2c3e50; font-weight:bold; margin-top:4px; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">${sub}</div>` : ''}
                    <div style="display:flex; gap:3px; margin-top:5px; justify-content:center;">
                        ${todaySleep > 0 ? `<span style="background:#ffeaa7; padding:1px 4px; border-radius:3px; font-size:10px;">💤${todaySleep}</span>` : ''}
                        ${totalEduScore > 0 ? `<span style="background:#fab1a0; padding:1px 4px; border-radius:3px; font-size:10px;">⭐${totalEduScore}</span>` : ''}
                    </div>
                </div>
            `;
        });
    } catch (err) { summary.innerText = "에러: " + err.message; }
}

window.__changeSort = function(mode) { 
    window.__currentSortMode = mode; 
    init(); 
};

window.__toggleDashboard = function() {
    const dashboard = document.getElementById('dashboard');
    const mainFoldBtn = document.getElementById('dashboard-fold-btn');
    const detailFoldBtn = document.getElementById('fold-button');
    
    if (dashboard.style.display === 'none') {
        dashboard.style.display = 'grid';
        if (mainFoldBtn) { mainFoldBtn.innerText = '바둑판 접기 ⬆'; mainFoldBtn.style.background = '#7f8c8d'; }
        if (detailFoldBtn) { detailFoldBtn.innerText = '바둑판 접기 ⬆'; detailFoldBtn.style.background = '#2c3e50'; }
    } else {
        dashboard.style.display = 'none';
        if (mainFoldBtn) { mainFoldBtn.innerText = '바둑판 펴기 ⬇'; mainFoldBtn.style.background = '#27ae60'; }
        if (detailFoldBtn) { detailFoldBtn.innerText = '바둑판 펴기 ⬇'; detailFoldBtn.style.background = '#27ae60'; }
    }
};

// =========================================================
// 3. 학생 상세 페이지 로드 (지각 카운팅 3중 체크 로직 복구 완료)
// =========================================================
window.__loadStudentDetail = async function(student) {
    if (!student || !student.studentId) return;

    let detailSection = document.getElementById('student-detail-section');
    if (!detailSection) {
        detailSection = document.createElement('div');
        detailSection.id = 'student-detail-section';
        detailSection.style.cssText = 'margin-top:40px; margin-bottom:60px; padding:25px; background:#f8f9fa; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 8px 24px rgba(0,0,0,0.05);';
        document.getElementById('admin-content').appendChild(detailSection);
    }
    detailSection.style.display = 'block';
    detailSection.innerHTML = `<div style="text-align:center; padding:50px; font-size:18px; color:#7f8c8d;">⏳ <b>${student.name}</b> 학생의 통합 데이터를 불러오는 중입니다...</div>`;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const [resMove, resEdu, resSleep, resAtt, resSurvey] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}),
            _supabase.from('attendance').select('*').eq('student_id', student.studentId).order('attendance_date', {ascending: false}),
            _supabase.from('survey_log').select('*').eq('student_id', student.studentId)
        ]);

        const now = new Date();
        const todayIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const start7d = new Date(now);
        start7d.setDate(start7d.getDate() - 6);
        const start7dIso = new Date(start7d.getTime() - (start7d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const currentP = parseInt(getCurrentPeriod(), 10) || 0;

        const formatShortDate = (dateStr) => {
            const d = new Date(dateStr); const days = ['일','월','화','수','목','금','토'];
            return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
        };

        // 💡 [핵심 픽스] 교육점수(벌점)에서 지각 시간을 교시로 변환하는 헬퍼 함수
        const getPeriodFromTime = (timeStr) => {
            if (!timeStr) return 1;
            const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m;
            if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
            if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
            if (t < 20*60+10) return 7; return 8;
        };

        // 💡 교육점수 기록 중 '지각'인 항목을 날짜와 교시별로 맵핑
        const schedMap = {};
        resEdu.data.forEach(ed => {
            if (ed.reason.includes('지각')) {
                const dStr = ed.score_date; 
                const sp = getPeriodFromTime(ed.score_time);
                if (!schedMap[dStr]) schedMap[dStr] = {};
                schedMap[dStr][sp] = true;
            }
        });

        let totalAtt = 0, totalLate = 0, totalAbs = 0;
        let att7d = 0, late7d = 0, abs7d = 0;
        const recentAbsences = [];
        
        resAtt.data.forEach(a => {
            if (a.attendance_date > todayIso || (a.attendance_date === todayIso && parseInt(a.period, 10) > currentP)) return;
            if (new Date(a.attendance_date).getDay() === 0) return;

            const p = parseInt(a.period, 10);
            
            // 💡 [핵심 픽스] 출결코드, 벌점내역, 선생님 메모 3가지를 모두 교차 검증하여 지각 판별
            const hasEduLate = schedMap[a.attendance_date]?.[p] === true;
            const hasMemoLate = a.memo ? a.memo.includes('지각') : false;
            
            const isLate = (a.status_code === '2') || hasEduLate || hasMemoLate;
            const isAtt = (a.status_code === '1');
            const isAbs = (a.status_code === '3');

            // 판별 우선순위: 지각 > 결석 > 출석
            let finalType = '';
            if (isLate) finalType = 'late';
            else if (isAbs) finalType = 'abs';
            else if (isAtt) finalType = 'att';

            if (finalType === 'att') totalAtt++;
            if (finalType === 'late') totalLate++;
            if (finalType === 'abs') { totalAbs++; if (recentAbsences.length < 3) recentAbsences.push(a); }
            
            if (a.attendance_date >= start7dIso && a.attendance_date <= todayIso) {
                if (finalType === 'att') att7d++;
                if (finalType === 'late') late7d++;
                if (finalType === 'abs') abs7d++;
            }
        });
        
        const totalCount = totalAtt + totalLate + totalAbs;
        const count7d = att7d + late7d + abs7d;
        const attRate = totalCount > 0 ? Math.round((totalAtt / totalCount) * 100) : 0;
        const attRate7d = count7d > 0 ? Math.round((att7d / count7d) * 100) : 0;
        const attRate7dColor = attRate7d >= 90 ? '#2ecc71' : (attRate7d >= 70 ? '#f39c12' : '#e74c3c');

        let restroom7d = 0, noReturn7d = 0;
        resMove.data.forEach(m => {
            if (m.move_date >= start7dIso && m.move_date <= todayIso) {
                if (m.reason === "화장실/정수기") restroom7d++;
                if (m.return_period === "복귀안함") noReturn7d++;
            }
        });

        let sleepCount7d = 0;
        const sleepDaysSet = new Set();
        resSleep.data.forEach(s => {
            if (s.sleep_date >= start7dIso && s.sleep_date <= todayIso) {
                sleepCount7d += s.count; sleepDaysSet.add(s.sleep_date);
            }
        });

        const totalScore = resEdu.data.reduce((sum, log) => sum + (EDU_SCORE_MAP[log.reason] || 0), 0);

        const cardStyle = "background:#ffffff; padding:20px; border-radius:10px; border:1px solid #e2e6ea; position:relative; color:#2c3e50; box-shadow:0 2px 8px rgba(0,0,0,0.02);";
        const btnStyle = "position:absolute; right:20px; top:20px; background:#f1f2f6; color:#57606f; border:1px solid #dfe4ea; padding:5px 12px; border-radius:5px; font-size:12px; cursor:pointer; font-weight:bold;";

        let html = `
            <div style="border-bottom: 2px solid #e9ecef; padding-bottom: 20px; margin-bottom: 25px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="margin: 0 0 10px 0; color: #2c3e50; font-size:24px;">${student.name} <span style="font-size:14px; color:#e74c3c; background:rgba(231,76,60,0.1); padding:3px 8px; border-radius:4px; margin-left:10px;">🚨 출결위험 (${attRate}%)</span></h2>
                        <div style="color:#7f8c8d; font-size:14px; line-height:1.6;">
                            좌석: <b style="color:#34495e;">${student.seat}</b> | 학번: <b style="color:#34495e;">${student.studentId}</b> | 담임: <b style="color:#34495e;">${student.teacher}</b>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="fold-button" onclick="window.__toggleDashboard()" style="background:#2c3e50; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">바둑판 접기 ⬆</button>
                        <button onclick="document.getElementById('student-detail-section').style.display='none'; document.getElementById('dashboard').style.display='grid'; document.getElementById('status-summary').style.display='block';" style="background:#7f8c8d; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                
                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('attendance', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #2980b9; font-size:16px;">📅 출결 요약</h4>
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">최근 7일 출석률</span><span style="color:${attRate7dColor}; font-size:18px;">${attRate7d}%</span>
                        </div>
                        <div style="width:100%; height:8px; background:#ecf0f1; border-radius:4px; margin-bottom:10px; overflow:hidden;"><div style="width:${attRate7d}%; height:100%; background:${attRate7dColor}; border-radius:4px;"></div></div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${att7d}</b></span><span>지각 <b style="color:#f39c12;">${late7d}</b></span><span>결석 <b style="color:#e74c3c;">${abs7d}</b></span>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">전체 누적 출석률</span><span style="color:#2980b9; font-size:16px;">${attRate}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${totalAtt}</b></span><span>지각 <b style="color:#f39c12;">${totalLate}</b></span><span>결석 <b style="color:#e74c3c;">${totalAbs}</b></span>
                        </div>
                    </div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 무단 결석:</div>
                    <ul style="margin:0; padding-left:15px; font-size:13px; color:#e74c3c; line-height:1.8;">
                        ${recentAbsences.length > 0 ? recentAbsences.map(a => `<li>${formatShortDate(a.attendance_date)} ${a.period}교시</li>`).join('') : '<li style="color:#95a5a6; list-style:none; margin-left:-15px;">최근 결석이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('move', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #27ae60; font-size:16px;">🚶 이동 요약 <span style="font-size:12px; color:#95a5a6; font-weight:normal;">(최근 7일)</span></h4>
                    <div style="margin-bottom:8px;">화장실 : <b>${restroom7d}회</b></div>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">복귀 안함 : <b>${noReturn7d}회</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${resMove.data.slice(0,3).length > 0 ? resMove.data.slice(0,3).map(m => `<li><span style="color:#95a5a6; margin-right:8px;">${m.move_date.slice(5)}</span> <b>${m.reason}</b></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('sleep', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #8e44ad; font-size:16px;">💤 취침 요약</h4>
                    <div style="margin-bottom:8px;">최근 7일 취침일수: <b>${sleepDaysSet.size}일</b></div>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">최근 7일 취침횟수: <b>${sleepCount7d}회</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${resSleep.data.slice(0,3).length > 0 ? resSleep.data.slice(0,3).map(s => `<li><span style="color:#95a5a6; margin-right:8px;">${s.sleep_date.slice(5)}</span> ${s.period}교시 <span style="color:#8e44ad; font-weight:bold;">(${s.count}회)</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('eduscore', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #e67e22; font-size:16px;">🚨 교육점수 요약</h4>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">전체 누적점수: <b style="color:#d35400; font-size:18px;">${totalScore}점</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${resEdu.data.slice(0,3).length > 0 ? resEdu.data.slice(0,3).map(e => `<li><span style="color:#95a5a6; margin-right:8px;">${e.score_date.slice(5)}</span> <b>${e.reason}</b> <span style="color:#e74c3c; font-weight:bold;">(+${EDU_SCORE_MAP[e.reason]||0})</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

            </div>

            <div id="grade-summary-container"></div>
            <div id="grade-trend-container"></div>
        `;
        detailSection.innerHTML = html;
        window.__loadGradeTrend(student);

    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// =========================================================
// 4. 성적 요약 UI
// =========================================================
window.__loadGradeTrend = async function(student) {
    const trendContainer = document.getElementById('grade-trend-container');
    if (!trendContainer) return;
    try {
        const { data: allScores, error } = await _supabase.from('mock_scores').select('*').order('created_at', { ascending: true });
        if (error || !allScores || allScores.length === 0) return;

        window.__allMockScores = allScores;
        window.__currentStudentScores = allScores.filter(s => s.student_id === student.studentId);
        window.__currentStudentClass = student.className || ''; 

        if (window.__currentStudentScores.length === 0) {
            trendContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#95a5a6; background:#fff; border-radius:12px; border:1px solid #dee2e6; margin-top:20px;">등록된 성적 데이터가 없습니다.</div>';
            return;
        }

        window.__currentSummaryExam = window.__currentStudentScores[window.__currentStudentScores.length - 1].exam_label;
        window.__renderGradeSummaryUI();
        window.__loadGradeErrata(window.__currentSummaryExam);

        window.__currentGradeMode = 'pct'; window.__currentViewMode = 'graph'; 
        window.__toggles = { topTotal: false, topChoice: false, topClass: false, topHS: false, topGreen: false, topBlue: false, topMed: false, topSKY: false };
        window.__subjectToggles = { kor: true, math: true, tam1: true, tam2: true, eng: true }; 
        window.__renderGradeTrendUI();
    } catch (err) { console.error("성적 로드 에러:", err); }
};

window.__renderGradeSummaryUI = function() {
    const container = document.getElementById('grade-summary-container');
    if (!container) return;
    const scores = window.__currentStudentScores;
    const optionsHtml = scores.map(s => `<option value="${s.exam_label}" ${s.exam_label === window.__currentSummaryExam ? 'selected' : ''}>${s.exam_label} 성적</option>`).join('');
    
    // 💡 취약 영역 분석 컨테이너 추가
    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 4px 6px rgba(0,0,0,0.02); margin-top:20px;">
            <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px;">
                <h4 style="margin:0; color:#2c3e50;">📊 성적 요약</h4>
                <select onchange="window.__changeSummaryExam(this.value)" style="padding:6px 12px; border-radius:6px; border:1px solid #dee2e6; background:#f8f9fa; font-weight:bold; cursor:pointer;">${optionsHtml}</select>
            </div>
            <div id="grade-summary-table-area"></div>
            
            <div style="margin-top:30px; padding-top:25px; border-top:1px dashed #dee2e6;">
                <h4 style="margin:0 0 15px 0; color:#2c3e50;">🕸️ 취약 영역 분석 <span style="font-size:12px; color:#7f8c8d; font-weight:normal;">(단원별 / 행동영역별 성취도)</span></h4>
                <div id="vulnerability-area"><div style="text-align:center; color:#95a5a6; padding:20px;">데이터 분석 중...</div></div>
            </div>

            <div style="margin-top:25px; padding-top:20px; border-top:1px dashed #dee2e6;">
                <h4 style="margin:0 0 15px 0; color:#2c3e50;">🎯 정오표 상세 분석</h4>
                <div id="grade-errata-area"></div>
            </div>
        </div>
    `;
    window.__renderGradeSummaryTable();
};

window.__changeSummaryExam = function(examLabel) {
    window.__currentSummaryExam = examLabel;
    window.__renderGradeSummaryTable();
    window.__loadGradeErrata(examLabel);
};

window.__renderGradeSummaryTable = function() {
    const area = document.getElementById('grade-summary-table-area');
    const score = window.__currentStudentScores.find(s => s.exam_label === window.__currentSummaryExam) || {};
    const v = (val) => val === null || val === undefined || val === "" ? '-' : val;
    area.innerHTML = `
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #dee2e6;">
            <style>
                .sum-table { width:100%; border-collapse:collapse; font-size:13px; text-align:center; color:#2c3e50; min-width:700px; background:#fff; }
                .sum-table th, .sum-table td { border-bottom:1px solid #ecf0f1; padding:12px 10px; }
                .sum-table th { color:#7f8c8d; background:#fbfbfc; border-bottom:2px solid #dee2e6; }
                .sum-table td.header-col { font-weight:bold; color:#7f8c8d; background:#fbfbfc; border-right:1px solid #ecf0f1; width:100px; text-align:left; padding-left:20px; }
                .sum-table td { font-weight:bold; }
                .sum-kor { color:#3498db; } .sum-math { color:#e74c3c; } .sum-tam1 { color:#27ae60; } .sum-tam2 { color:#f39c12; }
            </style>
            <table class="sum-table">
                <thead><tr><th>과목</th><th>국어</th><th>수학</th><th>영어</th><th>한국사</th><th>탐구1</th><th>탐구2</th></tr></thead>
                <tbody>
                    <tr><td class="header-col">선택과목</td><td class="sum-kor">${v(score.kor_choice)}</td><td class="sum-math">${v(score.math_choice)}</td><td>-</td><td>-</td><td class="sum-tam1">${v(score.tam1_name)}</td><td class="sum-tam2">${v(score.tam2_name)}</td></tr>
                    <tr><td class="header-col">원점수</td><td>${v(score.kor_raw_total)}</td><td>${v(score.math_raw_total)}</td><td>${v(score.eng_raw)}</td><td>${v(score.hist_raw)}</td><td>${v(score.tam1_raw)}</td><td>${v(score.tam2_raw)}</td></tr>
                    <tr><td class="header-col">표준점수</td><td>${v(score.kor_exp_std)}</td><td>${v(score.math_exp_std)}</td><td>-</td><td>-</td><td>${v(score.tam1_exp_std)}</td><td>${v(score.tam2_exp_std)}</td></tr>
                    <tr><td class="header-col">백분위</td><td class="sum-kor">${v(score.kor_exp_pct)}</td><td class="sum-math">${v(score.math_exp_pct)}</td><td>-</td><td>-</td><td class="sum-tam1">${v(score.tam1_exp_pct)}</td><td class="sum-tam2">${v(score.tam2_exp_pct)}</td></tr>
                    <tr><td class="header-col">등급</td><td>${v(score.kor_exp_grade)}</td><td>${v(score.math_exp_grade)}</td><td style="color:#9b59b6;">${v(score.eng_grade)}</td><td>${v(score.hist_grade || score.hist_exp_grade)}</td><td>${v(score.tam1_exp_grade)}</td><td>${v(score.tam2_exp_grade)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
};

// =========================================================
// 💡 [수정됨] 정오표 데이터 호출 & 취약 영역 데이터 집계 (unit_map 완벽 적용)
// =========================================================
window.__loadGradeErrata = async function(examLabel) {
    const container = document.getElementById('grade-errata-area');
    const vulnArea = document.getElementById('vulnerability-area');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#95a5a6;"><span style="font-size:24px; display:block; margin-bottom:10px;">⏳</span>상세 데이터를 모아 분석하는 중입니다...</div>';

    const scoreInfo = window.__currentStudentScores.find(s => s.exam_label === examLabel);
    if (!scoreInfo) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#7f8c8d;">데이터가 없습니다.</div>';
        if (vulnArea) vulnArea.innerHTML = '<div style="text-align:center; padding:20px; color:#7f8c8d;">데이터가 없습니다.</div>';
        return;
    }
    
    const studentId = String(scoreInfo.student_id || "").trim();

    try {
        let allErrata = [];
        let fetchMore = true;
        let startIdx = 0;
        const limitSize = 1000;

        while (fetchMore) {
            const { data, error } = await _supabase.from('mock_errata').select('*').eq('exam_label', examLabel).range(startIdx, startIdx + limitSize - 1);
            if (error) break;
            if (data && data.length > 0) {
                allErrata = allErrata.concat(data);
                startIdx += limitSize;
                if (data.length < limitSize) fetchMore = false; 
            } else fetchMore = false;
        }

        const { data: qInfos } = await _supabase.from('mock_question_info').select('*').eq('exam_label', examLabel);
        const { data: unitMapData } = await _supabase.from('unit_map').select('*');
        window.__unitMap = unitMapData || [];

        if (allErrata.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#e74c3c;">DB에서 데이터를 가져오지 못했습니다.</div>';
            return;
        }

        const myErrata = allErrata.filter(e => String(e.student_id || "").trim() === studentId || Object.values(e).some(val => String(val).trim() === studentId));

        if (myErrata.length === 0) {
            const msg = '<div style="text-align:center; padding:30px; color:#95a5a6; border:1px solid #f1f2f6; border-radius:8px;">이 시험의 정오표(O/X) 데이터가 아직 등록되지 않았습니다.</div>';
            container.innerHTML = msg;
            if (vulnArea) vulnArea.innerHTML = msg;
            return;
        }

        const normalizeSubj = (name) => {
            let s = String(name || "").trim().replace(/\s+/g, '').replace(/·/g, '');
            s = s.replace(/II/g, '2').replace(/I/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1');
            if (s.includes('화법') || s.includes('화작')) return '화법과작문';
            if (s.includes('언어') || s.includes('언매')) return '언어와매체';
            if (s.includes('미적')) return '미적분';
            if (s.includes('확률') || s.includes('확통')) return '확률과통계';
            if (s.includes('기하')) return '기하';
            if (s.includes('생활') || s.includes('생윤')) return '생활과윤리';
            if ((s.includes('윤리') && s.includes('사상')) || s.includes('윤사')) return '윤리와사상';
            if (s.includes('한국지리') || s.includes('한지')) return '한국지리';
            if (s.includes('세계지리') || s.includes('세지')) return '세계지리';
            if (s.includes('동아시아') || s.includes('동사')) return '동아시아사';
            if (s.includes('세계사')) return '세계사';
            if (s.includes('정치') || s.includes('정법')) return '정치와법';
            if (s.includes('경제')) return '경제';
            if ((s.includes('사회') && s.includes('문화')) || s.includes('사문')) return '사회문화';
            if (s.includes('물리') && s.includes('1')) return '물리학1';
            if (s.includes('화학') && s.includes('1')) return '화학1';
            if ((s.includes('생명') || s.includes('생물')) && s.includes('1')) return '생명과학1';
            if ((s.includes('지구') || s.includes('지학')) && s.includes('1')) return '지구과학1';
            if (s.includes('물리') && s.includes('2')) return '물리학2';
            if (s.includes('화학') && s.includes('2')) return '화학2';
            if ((s.includes('생명') || s.includes('생물')) && s.includes('2')) return '생명과학2';
            if ((s.includes('지구') || s.includes('지학')) && s.includes('2')) return '지구과학2';
            if (s === '수학1' || s === '수1') return '수학1';
            if (s === '수학2' || s === '수2') return '수학2';
            if (s.includes('영어')) return '영어';
            if (s.includes('국어')) return '국어';
            if (s.includes('수학')) return '수학';
            return s;
        };

        const stats = {}; 
        const addToStats = (targetKey, rowData) => {
            if (!stats[targetKey]) stats[targetKey] = {};
            for (let i = 1; i <= 45; i++) {
                const val = String(rowData[`q${i}`] || "").trim();
                if (['O', 'X', '○', '×', 'o', 'x'].includes(val)) {
                    if (!stats[targetKey][i]) stats[targetKey][i] = { o: 0, total: 0 };
                    stats[targetKey][i].total++;
                    if (['O', '○', 'o'].includes(val)) stats[targetKey][i].o++;
                }
            }
        };

        allErrata.forEach(row => {
            const normSubj = normalizeSubj(row.subject);
            addToStats(normSubj, row);
            if (['화법과작문', '언어와매체', '국어'].includes(normSubj)) addToStats('국어공통', row);
            if (['미적분', '기하', '확률과통계', '수학', '수학1', '수학2'].includes(normSubj)) addToStats('수학공통', row);
        });

        const qInfoMap = {}; 
        const qInfoRawMap = {}; 
        
        (qInfos || []).forEach(q => {
            const normSubj = normalizeSubj(q.subject);
            if (!qInfoMap[normSubj]) qInfoMap[normSubj] = {};
            if (!qInfoRawMap[normSubj]) qInfoRawMap[normSubj] = {};
            
            const qNum = parseInt(String(q.question_num).replace(/[^0-9]/g, ''), 10);
            if (isNaN(qNum)) return;

            // 💡 [수정됨] 단원명 앞의 숫자("1. 인문" 등)를 잘라내서 매칭률을 높입니다.
            let unit = String(q.unit_name || '').replace(/^\d+\.?\s*/, '').trim(); 
            const subUnit = String(q.sub_unit || q.subunit || '').trim();
            const beh = String(q.behavior_domain || '').trim();
            
            let uKey = 9999;
            const cleanTarget = unit.replace(/\s+/g, '');
            
            // 💡 [1순위] 수퍼베이스 unit_map 매칭
            if (window.__unitMap && window.__unitMap.length > 0) {
                const found = window.__unitMap.find(u => {
                    const mapName = String(u.unit_name || u.unit || u.name || u.title || '').replace(/\s+/g, '');
                    const mapSubj = String(u.subject || '').replace(/\s+/g, '');
                    
                    const baseNorm = normSubj.replace(/[12ⅠⅡIIV]/g, '').replace(/과학/g, '').replace(/학/g, '');
                    const baseMap = mapSubj.replace(/[12ⅠⅡIIV]/g, '').replace(/과학/g, '').replace(/학/g, '');
                    const isTamguMatch = baseNorm && baseMap && (baseNorm.includes(baseMap) || baseMap.includes(baseNorm)) && (normSubj.slice(-1) === mapSubj.slice(-1));
                    
                    const subjMatch = !mapSubj || mapSubj.includes(normSubj) || normSubj.includes(mapSubj) || isTamguMatch;
                    return subjMatch && mapName && (mapName === cleanTarget || mapName.includes(cleanTarget) || cleanTarget.includes(mapName));
                });
                if (found) {
                    unit = found.unit_name || found.unit || found.name || unit; 
                    const mappedKey = getSafeNum(found.unit_key ?? found.unit_code ?? found.chapter_num ?? found.unit_num);
                    if (mappedKey !== 9999) uKey = mappedKey;
                }
            }

            // 💡 [2순위] 매칭 실패 시, 하드코딩된 국어 강제 순서표 적용
            if (uKey === 9999 && KOR_UNIT_ORDER[cleanTarget]) {
                uKey = KOR_UNIT_ORDER[cleanTarget];
            }

            // 💡 [3순위] 그래도 없으면 원래 데이터에서 숫자 추출
            if (uKey === 9999) {
                const rawKey = getSafeNum(q.unit_key ?? q.unit_code ?? q.chapter_num ?? q.unit_num);
                if (rawKey !== 9999) uKey = rawKey;
            }

            let cleanUnit = unit;
            if (!cleanUnit || cleanUnit === '-' || cleanUnit === 'null') cleanUnit = '기타';
            let cleanBeh = beh;
            if (!cleanBeh || cleanBeh === '-' || cleanBeh === 'null') cleanBeh = '기타';
            
            qInfoRawMap[normSubj][qNum] = { 
                unit: cleanUnit, 
                beh: cleanBeh, 
                unitKey: uKey, 
                qSubj: normSubj 
            };

            // 기존 라벨 HTML 생성 코드 유지
            let labelHtml = '';
            if (normSubj === '수학' || normSubj === '수학공통') {
                const uStr = cleanUnit.replace(/\s+/g, '');
                if (uStr.includes('지수') || uStr.includes('로그') || uStr.includes('삼각') || uStr.includes('수열')) labelHtml += `<span style="color:#2980b9; font-weight:900; margin-right:6px;">[수학I]</span>`;
                else if (uStr.includes('극한') || uStr.includes('연속') || uStr.includes('미분') || uStr.includes('적분')) labelHtml += `<span style="color:#2ecc71; font-weight:900; margin-right:6px;">[수학II]</span>`;
                else if (uStr.includes('다항식') || uStr.includes('방정식') || uStr.includes('부등식') || uStr.includes('도형') || uStr.includes('함수') || uStr.includes('경우')) labelHtml += `<span style="color:#27ae60; font-weight:900; margin-right:6px;">[고1수학]</span>`;
            } else if (normSubj === '수학1') labelHtml += `<span style="color:#2980b9; font-weight:900; margin-right:6px;">[수학I]</span>`;
            else if (normSubj === '수학2') labelHtml += `<span style="color:#2ecc71; font-weight:900; margin-right:6px;">[수학II]</span>`;
            
            const isTamgu = !['국어', '국어공통', '화법과작문', '언어와매체', '수학', '수학공통', '미적분', '기하', '확률과통계', '영어', '수학1', '수학2'].includes(normSubj);
            
            if (isTamgu && uKey !== 9999) {
                labelHtml += `<span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:#8e44ad; color:#fff; border-radius:4px; font-size:11px; font-weight:bold; margin-right:8px; vertical-align:middle;">${uKey}</span>`;
            }
            
            let labelArr = [];
            if (cleanUnit !== '기타') labelArr.push(cleanUnit);
            
            if (isTamgu && subUnit && subUnit !== '-' && subUnit !== 'null') {
                let cleanSubUnit = subUnit.replace(/^\d+\.?\s*/, '');
                labelArr.push(cleanSubUnit);
            }
            
            let joinedUnit = labelArr.join(' - ');
            if (!joinedUnit) joinedUnit = '단원 정보 없음';
            labelHtml += joinedUnit;
            
            if (cleanBeh !== '기타') {
                labelHtml += ` <span style="font-size:11px; color:#95a5a6; border:1px solid #ecf0f1; padding:2px 6px; border-radius:4px; margin-left:6px; background:#f8f9fa;">${cleanBeh}</span>`;
            }
            qInfoMap[normSubj][qNum] = labelHtml;
        });

        const radarStats = {};
        const getMajorCategory = (normS) => {
            if (['국어', '국어공통', '화법과작문', '언어와매체'].includes(normS) || normS === normalizeSubj(scoreInfo.kor_choice)) return '국어';
            if (['수학', '수학공통', '수학1', '수학2', '미적분', '기하', '확률과통계'].includes(normS) || normS === normalizeSubj(scoreInfo.math_choice)) return '수학';
            if (normS === '영어') return '영어';
            if (normS === normalizeSubj(scoreInfo.tam1_name)) return scoreInfo.tam1_name;
            if (normS === normalizeSubj(scoreInfo.tam2_name)) return scoreInfo.tam2_name;
            return null;
        };

        const myKorChoice = normalizeSubj(scoreInfo.kor_choice);
        const myMathChoice = normalizeSubj(scoreInfo.math_choice);

        myErrata.forEach(row => {
            const normS = normalizeSubj(row.subject);
            const majorCat = getMajorCategory(normS);
            if (!majorCat) return;

            if (!radarStats[majorCat]) radarStats[majorCat] = { units: {}, behaviors: {} };

            for (let i = 1; i <= 45; i++) {
                const ox = String(row[`q${i}`] || "").trim();
                if (!ox || !['O','X','○','×','o','x'].includes(ox)) continue;
                
                const isO = ['O','○','o'].includes(ox);
                let unitInfo = null;
                
                if (majorCat === '국어') {
                    if (i >= 35) unitInfo = qInfoRawMap[myKorChoice]?.[i];
                    if (!unitInfo) unitInfo = qInfoRawMap['국어공통']?.[i] || qInfoRawMap['국어']?.[i] || qInfoRawMap['공통']?.[i];
                } else if (majorCat === '수학') {
                    if (i >= 23) unitInfo = qInfoRawMap[myMathChoice]?.[i];
                    if (!unitInfo) unitInfo = qInfoRawMap['수학1']?.[i] || qInfoRawMap['수학2']?.[i] || qInfoRawMap['수학공통']?.[i] || qInfoRawMap['수학']?.[i];
                } else {
                    unitInfo = qInfoRawMap[normS]?.[i];
                }

                if (!unitInfo) unitInfo = { unit: '분류없음', beh: '분류없음', unitKey: 9999, qSubj: normS };

                const u = unitInfo.unit;
                const b = unitInfo.beh;

                if (!radarStats[majorCat].units[u]) radarStats[majorCat].units[u] = { o: 0, total: 0, qSubj: unitInfo.qSubj, unitKey: unitInfo.unitKey };
                if (!radarStats[majorCat].behaviors[b]) radarStats[majorCat].behaviors[b] = { o: 0, total: 0, qSubj: unitInfo.qSubj, unitKey: unitInfo.unitKey };

                radarStats[majorCat].units[u].total++;
                if (isO) radarStats[majorCat].units[u].o++;

                radarStats[majorCat].behaviors[b].total++;
                if (isO) radarStats[majorCat].behaviors[b].o++;
            }
        });

        window.__radarStats = radarStats;
        window.__renderRadarChartUI();

        const findRowStrict = (targetName) => {
            if (!targetName) return null;
            const target = normalizeSubj(targetName);
            return myErrata.find(e => normalizeSubj(e.subject) === target);
        };
        
        const korRow = findRowStrict(scoreInfo.kor_choice) || myErrata.find(e => ['화법과작문', '언어와매체'].includes(normalizeSubj(e.subject))) || findRowStrict('국어');
        const mathRow = findRowStrict(scoreInfo.math_choice) || myErrata.find(e => ['미적분', '기하', '확률과통계'].includes(normalizeSubj(e.subject))) || findRowStrict('수학');
        const engRow = findRowStrict('영어');
        const tam1Row = findRowStrict(scoreInfo.tam1_name);
        const tam2Row = findRowStrict(scoreInfo.tam2_name);

        const renderSection = (title, subtitle, qStart, qEnd, errataRow, statKey, infoKey) => {
            if (!errataRow) return '';
            let hasData = false;
            for (let i = qStart; i <= qEnd; i++) { if (errataRow[`q${i}`]) { hasData = true; break; } }
            if (!hasData) return '';

            let rowsHtml = '';
            for (let i = qStart; i <= qEnd; i++) {
                const ox = String(errataRow[`q${i}`] || "").trim();
                if (!ox) continue;
                const isO = (ox === 'O' || ox === '○' || ox === 'o');
                const oxColor = isO ? '#3498db' : '#e74c3c';
                const oxBg = isO ? '#fff' : '#fdf3f2';
                const stat = (stats[statKey] && stats[statKey][i]) ? stats[statKey][i] : { o: 0, total: 0 };
                const rate = stat.total > 0 ? Math.round((stat.o / stat.total) * 1000) / 10 : 0;
                const barColor = rate >= 80 ? '#2ecc71' : (rate >= 50 ? '#f1c40f' : '#e74c3c');
                
                let qInfo = '-';
                if (infoKey === '수학공통') {
                    qInfo = (qInfoMap['수학1']?.[i]) || (qInfoMap['수학2']?.[i]) || (qInfoMap['수학']?.[i]) || (qInfoMap['수학공통']?.[i]) || (qInfoMap['공통']?.[i]) || '-';
                } else if (infoKey === '국어공통') {
                    qInfo = (qInfoMap['국어']?.[i]) || (qInfoMap['국어공통']?.[i]) || (qInfoMap['공통']?.[i]) || '-';
                } else {
                    qInfo = (qInfoMap[infoKey] && qInfoMap[infoKey][i]) || '-';
                }

                rowsHtml += `<tr style="background:${oxBg}; border-bottom: 1px solid #f1f2f6;"><td style="padding:8px 5px; text-align:center; font-weight:bold; color:#7f8c8d; width:50px;">${i}</td><td style="padding:8px 5px; text-align:center; font-weight:900; color:${oxColor}; font-size:15px; width:60px;">${isO?'O':'X'}</td><td style="padding:8px 10px; text-align:left; color:#34495e; font-size:12px;">${qInfo}</td><td style="padding:8px 10px; text-align:right; font-size:12px; color:#2c3e50; width:120px;"><div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;"><span style="width:35px; text-align:right;">${rate}%</span><div style="width:50px; height:6px; background:#ecf0f1; border-radius:3px; overflow:hidden;"><div style="width:${rate}%; height:100%; background:${barColor};"></div></div></div></td><td style="padding:8px 10px; text-align:right; font-size:11px; color:#95a5a6; width:70px;">${stat.o}/${stat.total}</td></tr>`;
            }
            
            const sectionId = 'errata-' + Math.random().toString(36).substr(2, 9);
            const infoHeader = (infoKey === '수학공통' || infoKey === '국어공통' || infoKey === '영어' || infoKey === '미적분' || infoKey === '기하' || infoKey === '확률과통계' || infoKey === '화법과작문' || infoKey === '언어와매체') ? '출제 영역 (과목 / 대단원)' : '출제 영역 (대단원 - 소단원)';

            return `<div style="border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 10px; overflow:hidden; background:#fff;"><div onclick="const el = document.getElementById('${sectionId}'); el.style.display = el.style.display === 'none' ? 'block' : 'none';" style="padding: 12px 15px; background: #fbfbfc; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;"><div style="font-weight: bold; color: #2c3e50; font-size: 14px;">${title}</div><div style="font-size: 11px; color: #7f8c8d;">${subtitle}</div></div><div id="${sectionId}" style="display: none; padding: 0;"><table style="width: 100%; border-collapse: collapse; margin-bottom: 0;"><thead><tr style="border-bottom: 2px solid #dee2e6; background: #fff;"><th style="padding: 10px 5px; text-align:center; color:#95a5a6; font-size:11px;">문항</th><th style="padding: 10px 5px; text-align:center; color:#95a5a6; font-size:11px;">O/X</th><th style="padding: 10px; text-align:left; color:#95a5a6; font-size:11px;">${infoHeader}</th><th style="padding: 10px; text-align:right; color:#95a5a6; font-size:11px;">정답률</th><th style="padding: 10px; text-align:right; color:#95a5a6; font-size:11px;">O/응시</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
        };

        let html = '';
        html += renderSection('국어 공통', '문항 1~34 ▼', 1, 34, korRow, '국어공통', '국어공통');
        if (scoreInfo.kor_choice) html += renderSection('국어 선택', `문항 35~45 · ${scoreInfo.kor_choice} ▼`, 35, 45, korRow, normalizeSubj(scoreInfo.kor_choice), normalizeSubj(scoreInfo.kor_choice));
        html += renderSection('수학 공통', '문항 1~22 ▼', 1, 22, mathRow, '수학공통', '수학공통');
        if (scoreInfo.math_choice) html += renderSection('수학 선택', `문항 23~30 · ${scoreInfo.math_choice} ▼`, 23, 30, mathRow, normalizeSubj(scoreInfo.math_choice), normalizeSubj(scoreInfo.math_choice));
        html += renderSection('영어', '문항 1~45 ▼', 1, 45, engRow, '영어', '영어');
        if (scoreInfo.tam1_name) html += renderSection(`탐구 (${scoreInfo.tam1_name})`, '문항 1~20 ▼', 1, 20, tam1Row, normalizeSubj(scoreInfo.tam1_name), normalizeSubj(scoreInfo.tam1_name));
        if (scoreInfo.tam2_name) html += renderSection(`탐구 (${scoreInfo.tam2_name})`, '문항 1~20 ▼', 1, 20, tam2Row, normalizeSubj(scoreInfo.tam2_name), normalizeSubj(scoreInfo.tam2_name));
        container.innerHTML = html || '<div style="text-align:center; padding:20px; color:#7f8c8d;">해당 시험의 정오표 데이터가 없습니다.</div>';

    } catch (err) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:#e74c3c;">에러 발생: ${err.message}</div>`;
    }
};

// =========================================================
// 💡 취약 영역 분석 (레이더 차트 렌더러)
// =========================================================
window.__switchRadarType = function(type) { window.__radarCurrentType = type; window.__renderRadarChartUI(); };
window.__switchRadarSubj = function(subj) { window.__radarCurrentSubj = subj; window.__renderRadarChartUI(); };

window.__renderRadarChartUI = function() {
    const area = document.getElementById('vulnerability-area');
    if (!area || !window.__radarStats) return;

    const subjs = Object.keys(window.__radarStats);
    if (subjs.length === 0) {
        area.innerHTML = '<div style="padding:20px; color:#95a5a6; text-align:center;">분석 가능한 데이터가 없습니다.</div>';
        return;
    }

    if (!window.__radarCurrentSubj || !subjs.includes(window.__radarCurrentSubj)) {
        window.__radarCurrentSubj = subjs[0];
    }

    const type = window.__radarCurrentType || 'unit';
    const btnSty = (isActive, bg) => `padding:6px 15px; border-radius:20px; border:1px solid ${isActive?bg:'#dee2e6'}; cursor:pointer; font-size:12px; font-weight:bold; transition:0.2s; background:${isActive?bg:'#f8f9fa'}; color:${isActive?'#fff':'#7f8c8d'};`;

    let tabsHtml = subjs.map(s => `<button onclick="window.__switchRadarSubj('${s}')" style="${btnSty(s === window.__radarCurrentSubj, '#2c3e50')}">${s}</button>`).join('');

    area.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px; margin-bottom:20px;">
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                ${tabsHtml}
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="window.__switchRadarType('unit')" style="${btnSty(type==='unit', '#2980b9')}">단원별 성취도</button>
                <button onclick="window.__switchRadarType('beh')" style="${btnSty(type==='beh', '#8e44ad')}">행동영역 보기</button>
            </div>
        </div>
        <div style="position:relative; height:350px; width:100%; max-width:600px; margin:0 auto;">
            <canvas id="radarChartCanvas"></canvas>
        </div>
    `;

    // 캔버스 그리기 지연 실행 (DOM 렌더링 대기)
    setTimeout(() => { window.__renderRadarChartCanvas(); }, 50);
};

// =========================================================
// 💡 [수정됨] 방사형 레이더 그래프 렌더러 (순서 완벽 고정)
// =========================================================
window.__renderRadarChartCanvas = function() {
    const ctx = document.getElementById('radarChartCanvas');
    if (!ctx || !window.__radarStats) return;

    const subj = window.__radarCurrentSubj;
    const type = window.__radarCurrentType || 'unit';
    const dataObj = window.__radarStats[subj]?.units || {};

    let labels = Object.keys(dataObj).filter(k => k !== '기타' && k !== '분류없음' && k !== '');
    
    // 💡 저장된 고유 순서(unitKey)를 바탕으로 오름차순 강제 정렬
    labels.sort((a, b) => {
        const keyA = dataObj[a]?.unitKey ?? 9999;
        const keyB = dataObj[b]?.unitKey ?? 9999;
        if (keyA === keyB) return a.localeCompare(b, 'ko'); 
        return keyA - keyB;
    });

    const dataPoints = labels.map(l => {
        return dataObj[l].total > 0 ? Math.round((dataObj[l].o / dataObj[l].total) * 100) : 0;
    });

    const getLabelColor = (label, majorSubj) => {
        const info = dataObj[label];
        const qSubj = info?.qSubj || majorSubj; 

        if (majorSubj === '국어') {
            if (['화법과작문', '언어와매체'].includes(qSubj)) return '#f39c12'; // 선택(주황)
            if (/(시|소설|극|수필|문학|갈래)/.test(label)) return '#2ecc71'; // 문학(초록)
            return '#3498db'; // 독서(파랑)
        } else if (majorSubj === '수학') {
            if (['미적분', '기하', '확률과통계'].includes(qSubj)) return '#f39c12'; 
            if (qSubj === '수학2' || /(극한|연속|미분|적분)/.test(label)) return '#2ecc71'; 
            if (qSubj === '수학1' || /(지수|로그|삼각|수열)/.test(label)) return '#3498db'; 
            return '#27ae60'; 
        }
        return '#3498db'; 
    };

    const pointColors = labels.map(l => getLabelColor(l, subj));

    if (window.__radarChartInstance) window.__radarChartInstance.destroy();

    window.__radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: `${subj} 성취도(%)`,
                data: dataPoints,
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderColor: 'rgba(52, 152, 219, 0.5)',
                pointBackgroundColor: pointColors,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: pointColors,
                borderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true, max: 100, min: 0,
                    ticks: { stepSize: 20, display: false },
                    grid: { color: '#ecf0f1' },
                    angleLines: { color: '#ecf0f1' },
                    pointLabels: {
                        color: (context) => getLabelColor(context.label, subj),
                        font: { size: 12, weight: 'bold' }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false, // 💡 앞에 붙는 네모난 색상 박스(🟦) 숨기기 (더 깔끔해짐)
                    callbacks: {
                        title: () => '', // 💡 겹칠 때 뜨는 대표 타이틀(엉뚱한 단원명) 아예 숨기기
                        label: (context) => `${context.label} 성취도: ${context.raw}%` // 💡 원하시는 형식으로 출력
                    }
                }
            }
        }
    });
};

// =========================================================
// 💡 추이 & 그래프 로직
// =========================================================
window.__renderGradeTrendUI = function() {
    const container = document.getElementById('grade-trend-container');
    const btnSty = (isActive, bg, fg) => `border:1px solid #dee2e6; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; background:${isActive ? bg : 'transparent'}; color:${isActive ? '#fff' : fg}; transition:0.2s;`;
    
    const tglBtn = (key, label) => {
        const isOn = window.__toggles[key];
        return `<button onclick="window.__toggleCutoff('${key}')" style="border:1px solid ${isOn ? '#3498db' : '#dee2e6'}; padding:5px 12px; border-radius:20px; cursor:pointer; font-size:11px; font-weight:bold; background:${isOn ? '#e8f4f8' : '#fff'}; color:${isOn ? '#2980b9' : '#7f8c8d'}; transition:0.2s;">${label}</button>`;
    };

    const latestScore = window.__currentStudentScores[window.__currentStudentScores.length - 1] || {};
    const kLabel = latestScore.kor_choice ? `국어(${latestScore.kor_choice})` : '국어(선택)';
    const mLabel = latestScore.math_choice ? `수학(${latestScore.math_choice})` : '수학(선택)';
    const t1Label = latestScore.tam1_name ? `탐구1(${latestScore.tam1_name})` : '탐구1(과목명)';
    const t2Label = latestScore.tam2_name ? `탐구2(${latestScore.tam2_name})` : '탐구2(과목)';

    const subjBtn = (id, label, color) => {
        const isOn = window.__subjectToggles[id];
        const bg = isOn ? color : '#f1f2f6';
        const fg = isOn ? '#fff' : '#bdc3c7';
        const border = isOn ? color : '#dee2e6';
        return `<button onclick="window.__toggleSubject('${id}')" style="background:${bg}; color:${fg}; border:1px solid ${border}; padding:4px 12px; border-radius:15px; font-size:11px; font-weight:bold; cursor:pointer; transition:0.2s;">${label}</button>`;
    };

    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 4px 6px rgba(0,0,0,0.02); margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h4 style="margin:0; color:#2c3e50; display:flex; align-items:center; gap:8px;">📈 성적 추이 <span style="font-size:12px; color:#7f8c8d; font-weight:normal;">(예상 컷 기준)</span></h4>
                    
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px;">
                        <button onclick="window.__switchGView('graph')" style="${btnSty(window.__currentViewMode==='graph', '#2c3e50', '#7f8c8d')}">그래프</button>
                        <button onclick="window.__switchGView('table')" style="${btnSty(window.__currentViewMode==='table', '#2c3e50', '#7f8c8d')}">표</button>
                    </div>
                    
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px; margin-left:10px;">
                        <button onclick="window.__switchGMode('pct')" style="${btnSty(window.__currentGradeMode==='pct', '#3498db', '#7f8c8d')}">백분위</button>
                        <button onclick="window.__switchGMode('raw')" style="${btnSty(window.__currentGradeMode==='raw', '#3498db', '#7f8c8d')}">원점수</button>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; ${window.__currentViewMode==='table' ? 'display:none;' : ''}">
                ${tglBtn('topTotal', '전체 상위 30%')}
                ${tglBtn('topChoice', '선택 상위 30%')}
                ${tglBtn('topHS', 'HS반 30%')}
                ${tglBtn('topGreen', '그린 30%')}
                ${tglBtn('topBlue', '블루 30%')}
                ${tglBtn('topMed', '서/의치대 30%')}
                ${tglBtn('topSKY', '연고대 30%')}
            </div>

            <div style="display:flex; gap:8px; margin-bottom:15px; ${window.__currentViewMode==='table' ? 'display:none;' : ''}">
                ${subjBtn('kor', kLabel, '#3498db')}
                ${subjBtn('math', mLabel, '#e74c3c')}
                ${subjBtn('tam1', t1Label, '#27ae60')}
                ${subjBtn('tam2', t2Label, '#f39c12')}
                ${subjBtn('eng', '영어', '#9b59b6')}
            </div>
            
            <div id="grade-display-area" style="min-height:350px;"></div>
        </div>
    `;
    window.__renderGradeDisplay();
};

window.__toggleCutoff = function(key) { window.__toggles[key] = !window.__toggles[key]; window.__renderGradeTrendUI(); };
window.__toggleSubject = function(subjId) { window.__subjectToggles[subjId] = !window.__subjectToggles[subjId]; window.__renderGradeTrendUI(); };

window.__renderGradeDisplay = function() {
    const area = document.getElementById('grade-display-area');
    const scores = window.__currentStudentScores;
    const mode = window.__currentGradeMode; 
    const view = window.__currentViewMode; 
    const toggles = window.__toggles;

    const getVal = (s, subj) => {
        if (subj === 'eng' && mode === 'pct') return s.eng_grade ? Number(s.eng_grade) : null;
        if (mode === 'pct') return s[`${subj}_exp_pct`] ? Number(s[`${subj}_exp_pct`]) : null;
        return s[`${subj}_raw_total`] !== undefined ? (s[`${subj}_raw_total`] ? Number(s[`${subj}_raw_total`]) : null) : (s[`${subj}_raw`] ? Number(s[`${subj}_raw`]) : null);
    };

    const getTop30 = (examLabel, subj, valKey, filterMode, myScore) => {
        let pool = window.__allMockScores.filter(s => s.exam_label === examLabel);
        if (filterMode === 'topClass') pool = pool.filter(s => s.class_name === window.__currentStudentClass);
        else if (filterMode === 'topHS') pool = pool.filter(s => s.class_group && s.class_group.includes('HS'));
        else if (filterMode === 'topGreen') pool = pool.filter(s => s.class_group && s.class_group.includes('그린'));
        else if (filterMode === 'topBlue') pool = pool.filter(s => s.class_group && s.class_group.includes('블루'));
        else if (filterMode === 'topMed') pool = pool.filter(s => s.class_group && (s.class_group.includes('의치') || s.class_group.includes('서/')));
        else if (filterMode === 'topSKY') pool = pool.filter(s => s.class_group && s.class_group.includes('연고'));
        
        let vals = [];
        if (subj === 'kor' || subj === 'math') {
            if (filterMode === 'topChoice') {
                const choiceKey = subj === 'kor' ? 'kor_choice' : 'math_choice';
                const myChoice = myScore[choiceKey];
                if (!myChoice) return null;
                pool = pool.filter(s => s[choiceKey] === myChoice);
            }
            vals = pool.map(s => Number(s[valKey]) || 0);
        } else if (subj === 'tam1' || subj === 'tam2') {
            const myTamName = subj === 'tam1' ? myScore.tam1_name : myScore.tam2_name;
            if (!myTamName) return null;
            const suffix = valKey.replace(subj, ""); 
            pool.forEach(s => {
                if (s.tam1_name === myTamName) vals.push(Number(s["tam1" + suffix]) || 0);
                if (s.tam2_name === myTamName) vals.push(Number(s["tam2" + suffix]) || 0);
            });
        } else if (subj === 'eng') {
            vals = pool.map(s => Number(s[valKey]) || 0);
        }
        
        if (subj === 'eng' && valKey === 'eng_grade') vals = vals.filter(v => v > 0).sort((a, b) => a - b);
        else vals = vals.filter(v => v > 0).sort((a, b) => b - a);
        
        if (vals.length === 0) return null;
        let idx = Math.floor(vals.length * 0.3);
        if (idx >= vals.length) idx = vals.length - 1;
        return vals[idx];
    };

    if (view === 'graph') {
        area.innerHTML = '<canvas id="gradeChart"></canvas>';
        const ctx = document.getElementById('gradeChart').getContext('2d');
        const labels = scores.map(s => s.exam_label);
        const datasets = [];
        const colors = { kor:'#3498db', math:'#e74c3c', tam1:'#27ae60', tam2:'#f39c12', eng:'#9b59b6' };
        
        const subjs = [{id:'kor', name:'국어'}, {id:'math', name:'수학'}, {id:'tam1', name:'탐구1'}, {id:'tam2', name:'탐구2'}, {id:'eng', name:'영어'}];
        const rPt = scores.length === 1 ? 5 : 0;

        subjs.forEach(sbj => {
            if (!window.__subjectToggles[sbj.id]) return;
            if(sbj.id === 'eng' && mode !== 'raw') return; 
            
            let valKey = (sbj.id === 'eng') ? (mode === 'pct' ? 'eng_grade' : 'eng_raw') : (mode === 'pct' ? `${sbj.id}_exp_pct` : (sbj.id.startsWith('tam') ? `${sbj.id}_raw` : `${sbj.id}_raw_total`));
            const yAxisID = (sbj.id === 'eng' && mode === 'pct') ? 'yGrade' : 'y';
            
            datasets.push({ label: sbj.name, data: scores.map(s => getVal(s, sbj.id)), borderColor: colors[sbj.id], backgroundColor: colors[sbj.id], tension: 0.1, borderWidth: 2, pointRadius: 4, fill: false, yAxisID: yAxisID });

            if (sbj.id !== 'eng') {
                const addLine = (key, label, dashPattern, color) => {
                    if (toggles[key]) datasets.push({ label: `${sbj.name} (${label})`, data: scores.map(s => getTop30(s.exam_label, sbj.id, valKey, key, s)), borderColor: color || colors[sbj.id], borderDash: dashPattern, borderWidth: 1.5, pointRadius: rPt, pointStyle: 'rect', fill: false, yAxisID: yAxisID });
                };
                addLine('topTotal', '전체상위30%', [5, 5], colors[sbj.id]); addLine('topChoice', '선택상위30%', [3, 3], '#9b59b6'); addLine('topClass', '반별상위30%', [2, 4], '#1abc9c'); addLine('topHS', 'HS반 30%', [4, 2], '#e67e22'); addLine('topGreen', '그린 30%', [4, 2], '#2ecc71'); addLine('topBlue', '블루 30%', [4, 2], '#3498db'); addLine('topMed', '의치대 30%', [4, 2], '#c0392b'); addLine('topSKY', '연고대 30%', [4, 2], '#2980b9');
            }
        });

        Chart.defaults.color = '#7f8c8d';
        const chartScales = { x: { grid: { display: false } }, y: { type: 'linear', display: true, position: 'left', beginAtZero: mode==='pct', max: mode==='pct'?100:null, grid: { color: '#ecf0f1' } } };

        if (window.__subjectToggles['eng'] && mode === 'pct') chartScales.yGrade = { type: 'linear', display: true, position: 'right', reverse: true, min: 1, max: 9, ticks: { stepSize: 1, callback: function(value) { return value + '등급'; } }, grid: { drawOnChartArea: false } };

        new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, scales: chartScales, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#fff', bodyColor: '#fff', callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.y !== null) { label += context.parsed.y; if (context.dataset.yAxisID === 'yGrade') label += '등급'; } return label; } } } } } });

    } else {
        const v = (val) => val === null || val === undefined ? '-' : val;
        let h = `<div style="overflow-x:auto; border-radius:8px; border:1px solid #dee2e6; box-shadow: 0 2px 4px rgba(0,0,0,0.02);"><style>.dt-table { width:100%; border-collapse:collapse; font-size:12px; text-align:center; color:#2c3e50; min-width:800px; background:#fff; } .dt-table th, .dt-table td { border:1px solid #dee2e6; padding:10px 5px; } .dt-table th { background:#f8f9fa; font-weight:bold; color:#34495e; } .dt-table tbody tr:hover { background-color:#f1f2f6; transition:0.2s; } .c-kor { color:#3498db; } .c-math { color:#e74c3c; } .c-eng { color:#9b59b6; } .c-tam { color:#27ae60; } .c-tam2 { color:#f39c12; } </style><table class="dt-table"><thead><tr><th rowspan="2">시험구분</th><th colspan="4">국어</th><th colspan="4">수학</th><th colspan="3">영어</th><th colspan="4">탐구1</th><th colspan="4">탐구2</th></tr><tr style="font-size:11px; color:#7f8c8d; background:#fff;"><th>원점</th><th>표점</th><th class="c-kor">백분위</th><th>등급</th><th>원점</th><th>표점</th><th class="c-math">백분위</th><th>등급</th><th>원점</th><th>백분위</th><th class="c-eng">등급</th><th class="c-tam">과목</th><th>원점</th><th class="c-tam">백분위</th><th>등급</th><th class="c-tam2">과목</th><th>원점</th><th class="c-tam2">백분위</th><th>등급</th></tr></thead><tbody>`;
        scores.forEach(s => { h += `<tr><td style="font-weight:bold; color:#2c3e50; background:#f8f9fa;">${s.exam_label}</td><td>${v(s.kor_raw_total)}</td> <td>${v(s.kor_exp_std)}</td> <td class="c-kor" style="font-weight:bold;">${v(s.kor_exp_pct)}</td> <td>${v(s.kor_exp_grade)}</td><td>${v(s.math_raw_total)}</td> <td>${v(s.math_exp_std)}</td> <td class="c-math" style="font-weight:bold;">${v(s.math_exp_pct)}</td> <td>${v(s.math_exp_grade)}</td><td>${v(s.eng_raw)}</td> <td>-</td> <td class="c-eng" style="font-weight:bold;">${v(s.eng_grade)}</td><td class="c-tam" style="font-size:11px;">${v(s.tam1_name)}</td> <td>${v(s.tam1_raw)}</td> <td class="c-tam" style="font-weight:bold;">${v(s.tam1_exp_pct)}</td> <td>${v(s.tam1_exp_grade)}</td><td class="c-tam2" style="font-size:11px;">${v(s.tam2_name)}</td> <td>${v(s.tam2_raw)}</td> <td class="c-tam2" style="font-weight:bold;">${v(s.tam2_exp_pct)}</td> <td>${v(s.tam2_exp_grade)}</td></tr>`; });
        h += '</tbody></table></div>'; area.innerHTML = h;
    }
};

window.__switchGView = function(v) { window.__currentViewMode = v; window.__renderGradeTrendUI(); };
window.__switchGMode = function(m) { window.__currentGradeMode = m; window.__renderGradeTrendUI(); };

// =========================================================
// 💡 5. 상세 모달창 (주차별 타임테이블 등)
// =========================================================
window.__openDetailModal = async function(type, studentId, studentName) {
    let modalOverlay = document.getElementById('custom-detail-modal');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'custom-detail-modal';
        modalOverlay.style.position = 'fixed'; modalOverlay.style.top = '0'; modalOverlay.style.left = '0'; modalOverlay.style.width = '100%'; modalOverlay.style.height = '100%'; modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)'; modalOverlay.style.zIndex = '9999'; modalOverlay.style.display = 'flex'; modalOverlay.style.justifyContent = 'center'; modalOverlay.style.alignItems = 'center';
        modalOverlay.addEventListener('click', function(e) { if (e.target === modalOverlay) { modalOverlay.style.display = 'none'; document.body.style.overflow = ''; } });
        document.body.appendChild(modalOverlay);
    }
    modalOverlay.style.display = 'flex'; document.body.style.overflow = 'hidden';

    const titleMap = { 'attendance': '📅 출결 주차별 상세 내역', 'move': '🚶 이동 전체 내역', 'sleep': '💤 취침 전체 내역', 'eduscore': '🚨 교육점수 전체 내역' };
    modalOverlay.innerHTML = `<div style="background:#fff; width:98%; max-width:1000px; max-height:85vh; border-radius:12px; padding:25px; box-shadow:0 10px 30px rgba(0,0,0,0.2); display:flex; flex-direction:column;"><div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;"><h3 style="margin:0; color:#2c3e50;">${titleMap[type]} - ${studentName}</h3><button onclick="document.getElementById('custom-detail-modal').style.display='none'; document.body.style.overflow='';" style="background:none; border:none; font-size:20px; cursor:pointer; color:#7f8c8d; padding:0;">✖</button></div><div id="modal-content-area" style="flex:1; overflow-y:auto; padding-right:10px;"><div style="text-align:center; padding:50px; color:#7f8c8d;">⏳ 데이터를 불러오는 중입니다...</div></div></div>`;

    const contentArea = document.getElementById('modal-content-area');
    try {
        let contentHtml = '';
        if (type === 'attendance') {
            const [resAtt, resMove, resSurvey, resEdu] = await Promise.all([ _supabase.from('attendance').select('*').eq('student_id', studentId).order('attendance_date', {ascending: false}), _supabase.from('move_log').select('*').eq('student_id', studentId), _supabase.from('survey_log').select('*').eq('student_id', studentId), _supabase.from('edu_score_log').select('*').eq('student_id', studentId) ]);
            const data = resAtt.data || []; const moveData = resMove.data || []; const surveyData = resSurvey.data || []; const eduData = resEdu.data || [];
            if (!data || data.length === 0) { contentArea.innerHTML = '<div style="text-align:center; padding:30px; color:#7f8c8d;">기록이 없습니다.</div>'; return; }

            const now = new Date(); const todayIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; const currentP = parseInt(getCurrentPeriod(), 10) || 0;
            const schedMap = {};
            surveyData.forEach(sv => {
                const dStr = sv.survey_date; let reason = sv.reason ? sv.reason.split('(')[0].trim() : ''; const timeType = sv.arrival_time_type || ""; let startP = 0, endP = 0;
                if (timeType.includes("결석")) { startP = 1; endP = 8; } else if (timeType.includes("오전")) { startP = 1; endP = 3; } else if (timeType.includes("오후")) { startP = 1; endP = 6; } else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 1; endP = 7; }
                if (startP > 0) { if (!schedMap[dStr]) schedMap[dStr] = {}; for(let p=startP; p<=endP; p++) schedMap[dStr][p] = `[설문] ${reason}`; }
            });
            const getPeriodFromTime = (timeStr) => { if (!timeStr) return 0; const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m; if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3; if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6; if (t < 20*60+10) return 7; return 8; };
            moveData.forEach(mv => { if (mv.reason === "화장실/정수기") return; const dStr = mv.move_date; let rp = parseInt(mv.return_period, 10) || 0; if (mv.return_period === "복귀안함") rp = 8; const sp = getPeriodFromTime(mv.move_time); if (!schedMap[dStr]) schedMap[dStr] = {}; if (rp > 0) { const start = sp > 0 ? sp : rp; for(let p=start; p<=rp; p++) schedMap[dStr][p] = mv.reason; } else { const targetP = sp > 0 ? sp : 1; schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason; } });
            eduData.forEach(ed => { if (ed.reason.includes('지각')) { const dStr = ed.score_date; const sp = getPeriodFromTime(ed.score_time) || 1; if (!schedMap[dStr]) schedMap[dStr] = {}; schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.reason}` : ed.reason; } });

            const weekMap = {}; const getMonday = (dStr) => { const d = new Date(dStr); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().split('T')[0]; };
            data.forEach(row => { const mon = getMonday(row.attendance_date); if (!weekMap[mon]) weekMap[mon] = {}; if (!weekMap[mon][row.attendance_date]) weekMap[mon][row.attendance_date] = {}; weekMap[mon][row.attendance_date][row.period] = { status: row.status_code, memo: row.memo }; });
            const weeks = Object.keys(weekMap).sort().reverse();
            contentHtml += `<div style="margin-bottom:15px;"><select id="week-selector" onchange="document.querySelectorAll('.week-table-container').forEach(el => el.style.display='none'); document.getElementById('week-'+this.value).style.display='block';" style="padding:8px 12px; border-radius:6px; border:1px solid #bdc3c7; background:#f8f9fa; font-size:14px; cursor:pointer; color:#2c3e50; font-weight:bold;">`;
            const formatDateShort = (dStr) => { const d = new Date(dStr); const days = ['일','월','화','수','목','금','토']; return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`; };
            weeks.forEach((mon, idx) => { const endDay = new Date(mon); endDay.setDate(endDay.getDate() + 6); const label = idx === 0 ? `최신 주차 (${formatDateShort(mon)} ~ ${formatDateShort(endDay.toISOString().split('T')[0])})` : `${formatDateShort(mon)} 주차`; contentHtml += `<option value="${mon}">${label}</option>`; });
            contentHtml += `</select></div><style>.att-table { width:100%; border-collapse:collapse; text-align:center; font-size:12px; color:#2c3e50; min-width:800px; } .att-table th, .att-table td { border:1px solid #dfe6e9; padding:8px 2px; } .att-table th { background:#f1f2f6; font-weight:bold; } .st-1 { background:#e8f8f5; color:#27ae60; font-weight:bold; border-radius:3px; padding:2px 0; } .st-2 { background:#fef9e7; color:#f39c12; font-weight:bold; border-radius:3px; padding:2px 0; } .st-3 { background:#fadedb; color:#e74c3c; font-weight:bold; border-radius:3px; padding:2px 0; } .st-memo { font-size:11px; color:#7f8c8d; max-width:80px; word-break:keep-all; font-weight:bold; }</style>`;
            
            weeks.forEach((mon, idx) => {
                const displayStyle = idx === 0 ? 'block' : 'none';
                contentHtml += `<div id="week-${mon}" class="week-table-container" style="display:${displayStyle}; overflow-x:auto;"><table class="att-table"><thead><tr><th rowspan="2" style="width:40px;">교시</th>`;
                const weekDates = []; for(let i=0; i<7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); const dStr = d.toISOString().split('T')[0]; weekDates.push(dStr); const dateColor = i === 6 ? '#e74c3c' : '#2c3e50'; contentHtml += `<th colspan="2" style="color:${dateColor}">${formatDateShort(dStr)}</th>`; }
                contentHtml += `</tr><tr>`; for(let i=0; i<7; i++) { contentHtml += `<th>스케줄</th><th>출/결</th>`; } contentHtml += `</tr></thead><tbody>`;
                for(let p=1; p<=8; p++) {
                    contentHtml += `<tr><td style="background:#fcfcfc; font-weight:bold;">${p}교시</td>`;
                    weekDates.forEach(dateStr => {
                        const isFuture = dateStr > todayIso || (dateStr === todayIso && p > currentP); const cellData = (weekMap[mon][dateStr] && weekMap[mon][dateStr][p]) ? weekMap[mon][dateStr][p] : null; const baseMemo = cellData && cellData.memo ? cellData.memo.trim() : ''; const extraMemo = schedMap[dateStr]?.[p] || ''; let memo = extraMemo || baseMemo || '-'; let statusHtml = '-';
                        if (isFuture) { statusHtml = '<span style="color:#bdc3c7;">-</span>'; } else { if (!cellData) { statusHtml = '<span style="color:#ccc;">미입력</span>'; } else { const isLate = cellData.status === '2' || memo.includes('지각'); const isUnexcusedAbs = cellData.status === '3' && !isLate && (!memo || memo === '-'); if (isLate) { statusHtml = `<div class="st-2">지각</div>`; } else if (cellData.status === '1') { statusHtml = `<div class="st-1">출석</div>`; } else if (isUnexcusedAbs) { statusHtml = `<div class="st-3">결석</div>`; } else if (cellData.status === '3') { statusHtml = `<div style="background:#f1f2f6; color:#7f8c8d; font-weight:bold; border-radius:3px; padding:2px 0;">공결</div>`; } else { statusHtml = cellData.status; } } }
                        const memoStyle = (isFuture && memo !== '-') ? 'color:#3498db; font-weight:900;' : ''; contentHtml += `<td class="st-memo" style="${memoStyle}">${memo}</td><td>${statusHtml}</td>`;
                    });
                    contentHtml += `</tr>`;
                }
                contentHtml += `</tbody></table></div>`;
            });
            contentArea.innerHTML = contentHtml;
        } 
        else {
            window.__modalData = { type: type, items: [] }; let tableQuery = null;
            if (type === 'move') { tableQuery = _supabase.from('move_log').select('*').eq('student_id', studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}); } else if (type === 'sleep') { tableQuery = _supabase.from('sleep_log').select('*').eq('student_id', studentId).order('sleep_date', {ascending: false}); } else if (type === 'eduscore') { tableQuery = _supabase.from('edu_score_log').select('*').eq('student_id', studentId).order('score_date', {ascending: false}); }
            const { data } = await tableQuery; window.__modalData.items = data || [];
            contentArea.innerHTML = `<style>.period-btn { background:#f1f2f6; border:1px solid #dfe6e9; padding:6px 16px; margin-left:6px; border-radius:6px; cursor:pointer; color:#7f8c8d; font-size:13px; font-weight:bold; transition:all 0.2s; } .period-btn.active { background:#2c3e50; color:#ffffff; border-color:#2c3e50; } .period-btn:hover:not(.active) { background:#e2e6ea; } .data-table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; color:#2c3e50; margin-top:10px; } .data-table th { padding:12px 10px; border-bottom:2px solid #ecf0f1; color:#7f8c8d; font-weight:normal; font-size:13px; } .data-table td { padding:12px 10px; border-bottom:1px solid #f1f2f6; } .data-table tbody tr:hover { background-color:#f8f9fa; }</style><div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:20px;"><span style="font-size:13px; color:#7f8c8d;">조회 기간:</span><button class="period-btn" id="btn-period-7" onclick="window.__renderModalTable(7)">7일</button><button class="period-btn" id="btn-period-15" onclick="window.__renderModalTable(15)">15일</button><button class="period-btn" id="btn-period-30" onclick="window.__renderModalTable(30)">30일</button></div><div id="modal-table-area"></div>`;
            window.__renderModalTable = function(days) {
                [7, 15, 30].forEach(d => { const btn = document.getElementById('btn-period-' + d); if (btn) { if (d === days) btn.classList.add('active'); else btn.classList.remove('active'); } });
                const now = new Date(); const targetDate = new Date(now); targetDate.setDate(now.getDate() - (days - 1)); const targetIso = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                const filtered = window.__modalData.items.filter(item => { const dStr = item.move_date || item.sleep_date || item.score_date; return dStr >= targetIso; });
                let tableHtml = '<table class="data-table"><thead><tr>';
                if (window.__modalData.type === 'move') { tableHtml += '<th>날짜</th><th>시간</th><th>사유</th><th>복귀교시</th></tr></thead><tbody>'; if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; else { filtered.forEach(d => { tableHtml += `<tr><td style="color:#7f8c8d;">${d.move_date}</td><td>${d.move_time || '-'}</td><td><b style="color:#2c3e50;">${d.reason}</b></td><td style="color:#95a5a6;">${d.return_period || '-'}</td></tr>`; }); } } else if (window.__modalData.type === 'sleep') { tableHtml += '<th>날짜</th><th>교시</th><th>기록</th><th>횟수</th></tr></thead><tbody>'; if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; else { filtered.forEach(d => { tableHtml += `<tr><td style="color:#7f8c8d;">${d.sleep_date}</td><td>${d.period}교시</td><td><b style="color:#2c3e50;">취침</b></td><td><b style="color:#8e44ad; background:#f4ebf7; padding:4px 8px; border-radius:4px; font-size:12px;">${d.count}회 적발</b></td></tr>`; }); } } else if (window.__modalData.type === 'eduscore') { tableHtml += '<th>날짜</th><th>사유</th><th>점수</th></tr></thead><tbody>'; if (filtered.length === 0) tableHtml += '<tr><td colspan="3" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; else { filtered.forEach(d => { const score = EDU_SCORE_MAP[d.reason] || 0; tableHtml += `<tr><td style="color:#7f8c8d;">${d.score_date}</td><td><b style="color:#2c3e50;">${d.reason}</b></td><td><b style="color:#e74c3c; background:#fdedec; padding:4px 8px; border-radius:4px; font-size:12px;">+${score}점</b></td></tr>`; }); } }
                tableHtml += '</tbody></table>'; document.getElementById('modal-table-area').innerHTML = tableHtml;
            };
            window.__renderModalTable(7);
        }
    } catch (err) { contentArea.innerHTML = `<div style="text-align:center;"><h3 style="color:#e74c3c;">오류 발생</h3><p>${err.message}</p></div>`; }
};

init();
