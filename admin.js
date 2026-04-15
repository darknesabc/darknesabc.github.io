const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// 로그인 세션 및 역할(Role) 유지용
let loggedInManager = localStorage.getItem('managerName');
let loggedInRole = localStorage.getItem('managerRole'); 

const EDU_SCORE_MAP = {
    "전자기기 부정사용": 10, "핸드폰 무단사용": 7, "해드폰 미제출": 7, "무단결석": 7, "무단이탈": 7,
    "타층/타관 무단출입": 5, "원내대화": 5, "무단지각": 5, "모의고사 무단 1회 미응시": 5,
    "취침강제하원(7회)": 3, "음식물섭취": 3, "입/퇴실 미준수": 3,
    "지각": 1, "자습 중 이동 태블릿 미입력": 1, "취침": 1
};

// ---------------------------------------------------------
// 1. 로그인/로그아웃 및 시간 관리
// ---------------------------------------------------------
async function handleLogin() {
    const id = document.getElementById('admin-id').value;
    const pw = document.getElementById('admin-pw').value;
    const loginMsg = document.getElementById('login-msg');
    try {
        const { data } = await _supabase.from('managers').select('*').eq('manager_id', id).eq('password', pw).single();
        if (data) {
            localStorage.setItem('managerName', data.manager_name);
            localStorage.setItem('managerRole', data.role); 
            location.reload(); 
        } else { loginMsg.innerText = "로그인 정보가 올바르지 않습니다."; }
    } catch (err) { loginMsg.innerText = "에러: " + err.message; }
}

function handleLogout() {
    localStorage.removeItem('managerName');
    localStorage.removeItem('managerRole'); 
    location.reload();
}

function getCurrentPeriod() {
    const SCHEDULE = [
        { p: "1", start: "08:00", end: "08:30" }, { p: "2", start: "08:50", end: "10:10" },
        { p: "3", start: "10:30", end: "12:00" }, { p: "4", start: "13:10", end: "14:30" },
        { p: "5", start: "14:50", end: "15:50" }, { p: "6", start: "16:10", end: "17:30" },
        { p: "7", start: "18:40", end: "20:10" }, { p: "8", start: "20:30", end: "22:00" }
    ];
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    let currentP = SCHEDULE[0].p;
    for (const slot of SCHEDULE) { if (currentTime >= slot.start) currentP = slot.p; }
    return currentP;
}

// ---------------------------------------------------------
// 2. 메인 화면 (바둑판) 초기화
// ---------------------------------------------------------
async function init() {
    if (!loggedInManager) {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
        return;
    }
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('welcome-msg').innerText = loggedInRole === 'super' ? '전체관리자 선생님, 환영합니다' : `${loggedInManager} 선생님, 환영합니다`;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentP = getCurrentPeriod();
        summary.innerText = `현재 ${currentP}교시 현황판 (${today})`;

        let studentQuery = _supabase.from('student').select('*');
        if (loggedInRole !== 'super') studentQuery = studentQuery.eq('teacher_name', loggedInManager);

        const [resStudents, resAttendance, resSleep, resMove, resEdu, resSurvey] = await Promise.all([
            studentQuery.order('seat_no'),
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*'),
            _supabase.from('survey_log').select('*').eq('survey_date', today)
        ]);

        const students = (resStudents.data || []).filter(s => s.name && s.name !== '배정금지');
        window.__dashboardItems = students.map(s => ({ seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name }));

        dashboard.innerHTML = '';
        students.forEach(s => {
            const att = (resAttendance.data || []).find(a => a.student_id === s.student_id);
            const move = (resMove.data || []).find(m => m.student_id === s.student_id);
            const isOut = move && (move.return_period === "복귀안함" || parseInt(move.return_period) >= parseInt(currentP));
            const validMove = (isOut && move.reason !== "화장실/정수기") ? move.reason : "";
            const survey = (resSurvey.data || []).find(sv => sv.student_id === s.student_id);
            const surveyReason = survey ? `[설문] ${survey.reason.split('(')[0].trim()}` : "";
            
            const todaySleep = (resSleep.data || []).filter(sl => sl.student_id === s.student_id).reduce((acc, cur) => acc + (cur.count || 1), 0);
            const totalEduScore = (resEdu.data || []).filter(el => el.student_id === s.student_id).reduce((acc, cur) => acc + (EDU_SCORE_MAP[cur.reason] || 0), 0);

            let displayStatus = "미입력", subStatus = "", statusColor = "none", attStatus = att ? att.status_code : "";
            if (attStatus === "1") { 
                displayStatus = "출석"; statusColor = "1"; subStatus = validMove || surveyReason || (att ? att.memo : ""); 
            } else if (validMove) { displayStatus = validMove; statusColor = "move"; }
            else if (surveyReason) { displayStatus = surveyReason; statusColor = "schedule"; }
            else if (att && att.memo) { displayStatus = att.memo; statusColor = "schedule"; }
            else { displayStatus = attStatus === "3" ? "결석" : (attStatus === "2" ? "지각" : "미입력"); statusColor = attStatus || "none"; }

            dashboard.innerHTML += `
                <div class="card status-${statusColor}" onclick="window.__loadStudentDetail(window.__dashboardItems.find(x => x.studentId === '${s.student_id}'))">
                    <div class="seat">${s.seat_no}</div>
                    <div class="name">${s.name}</div>
                    <div class="status-badge badge-${statusColor}">${displayStatus}</div>
                    ${subStatus ? `<div class="sub-status" style="font-size:11px; margin-top:5px; font-weight:bold; color:#2c3e50; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">${subStatus}</div>` : ''}
                    <div style="display:flex; gap:3px; margin-top:5px; justify-content:center;">
                        ${todaySleep > 0 ? `<span style="background:#ffeaa7; padding:1px 4px; border-radius:3px; font-size:10px;">💤${todaySleep}</span>` : ''}
                        ${totalEduScore > 0 ? `<span style="background:#fab1a0; padding:1px 4px; border-radius:3px; font-size:10px;">⭐${totalEduScore}</span>` : ''}
                    </div>
                </div>
            `;
        });
    } catch (err) { summary.innerText = "에러: " + err.message; }
}

// ---------------------------------------------------------
// 3. 학생 상세 로드 (4분할 요약 + 성적 추이)
// ---------------------------------------------------------
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
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId),
            _supabase.from('attendance').select('*').eq('student_id', student.studentId).order('attendance_date', {ascending: false}),
            _supabase.from('survey_log').select('*').eq('student_id', student.studentId)
        ]);

        const todayIso = new Date().toISOString().split('T')[0];
        const start7dIso = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
        const currentP = parseInt(getCurrentPeriod(), 10);
        let tAtt=0, tLat=0, tAbs=0, a7=0, l7=0, ab7=0;

        (resAtt.data || []).forEach(a => {
            if (a.attendance_date > todayIso || (a.attendance_date === todayIso && parseInt(a.period) > currentP)) return;
            if (new Date(a.attendance_date).getDay() === 0) return;
            const isL = a.status_code === '2' || (a.memo && a.memo.includes('지각'));
            const isA = a.status_code === '1';
            const isAb = a.status_code === '3' && !isL && (!a.memo || a.memo === '-');
            if (isA) { tAtt++; if(a.attendance_date >= start7dIso) a7++; }
            else if (isL) { tLat++; if(a.attendance_date >= start7dIso) l7++; }
            else if (isAb) { tAbs++; if(a.attendance_date >= start7dIso) ab7++; }
        });

        const r7 = (a7+l7+ab7) > 0 ? Math.round((a7/(a7+l7+ab7))*100) : 0;
        const r7Col = r7 >= 90 ? '#2ecc71' : (r7 >= 70 ? '#f39c12' : '#e74c3c');
        const totalScore = (resEdu.data || []).reduce((sum, l) => sum + (EDU_SCORE_MAP[l.reason] || 0), 0);

        const cardStyle = "background:#fff; padding:20px; border-radius:10px; border:1px solid #e2e6ea; position:relative;";
        const btnStyle = "position:absolute; right:15px; top:15px; background:#f1f2f6; border:1px solid #dfe4ea; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; font-weight:bold;";

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e9ecef; padding-bottom:15px; margin-bottom:20px;">
                <div><h2 style="margin:0;">🧑‍🎓 ${student.name} <span style="font-size:14px; color:#7f8c8d;">(${student.studentId})</span></h2></div>
                <button onclick="document.getElementById('student-detail-section').style.display='none'" style="background:#7f8c8d; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">닫기 ✖</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:15px;">
                <div style="${cardStyle}"><button style="${btnStyle}" onclick="window.__openDetailModal('attendance','${student.studentId}','${student.name}')">상세</button>
                    <h5 style="margin:0 0 10px 0; color:#2980b9;">📅 출결 (최근7일)</h5>
                    <div style="font-weight:bold; font-size:18px; color:${r7Col}">${r7}%</div>
                    <div style="width:100%; height:6px; background:#eee; border-radius:3px; margin:8px 0; overflow:hidden;"><div style="width:${r7}%; height:100%; background:${r7Col};"></div></div>
                    <div style="font-size:12px; color:#7f8c8d;">출석 ${a7} | 지각 ${l7} | 결석 ${ab7}</div>
                </div>
                <div style="${cardStyle}"><button style="${btnStyle}" onclick="window.__openDetailModal('move','${student.studentId}','${student.name}')">상세</button>
                    <h5 style="margin:0 0 10px 0; color:#27ae60;">🚶 이동 (최근7일)</h5>
                    <div style="font-size:18px; font-weight:bold;">${(resMove.data||[]).filter(m=>m.move_date>=start7dIso).length}회</div>
                </div>
                <div style="${cardStyle}"><button style="${btnStyle}" onclick="window.__openDetailModal('sleep','${student.studentId}','${student.name}')">상세</button>
                    <h5 style="margin:0 0 10px 0; color:#8e44ad;">💤 취침 (최근7일)</h5>
                    <div style="font-size:18px; font-weight:bold;">${(resSleep.data||[]).filter(s=>s.sleep_date>=start7dIso).reduce((a,c)=>a+(c.count||1),0)}회</div>
                </div>
                <div style="${cardStyle}"><button style="${btnStyle}" onclick="window.__openDetailModal('eduscore','${student.studentId}','${student.name}')">상세</button>
                    <h5 style="margin:0 0 10px 0; color:#e67e22;">🚨 벌점 (누적)</h5>
                    <div style="font-size:18px; font-weight:bold; color:#d35400;">${totalScore}점</div>
                </div>
            </div>
            <div id="grade-trend-container" style="margin-top:20px;"></div>
        `;
        detailSection.innerHTML = html;
        window.__loadGradeTrend(student.studentId); // 💡 HTML 생성 후 성적 로드 호출

    } catch (err) { detailSection.innerHTML = "에러: " + err.message; }
};

// ---------------------------------------------------------
// 4. 성적 추이 (그래프/표 스위치)
// ---------------------------------------------------------
window.__loadGradeTrend = async function(studentId) {
    const container = document.getElementById('grade-trend-container');
    try {
        const { data: scores } = await _supabase.from('mock_scores').select('*').eq('student_id', studentId).order('created_at', { ascending: true });
        if (!scores || scores.length === 0) {
            container.innerHTML = '<div style="background:#fff; padding:30px; text-align:center; border-radius:12px; color:#999;">등록된 성적 데이터가 없습니다.</div>';
            return;
        }
        window.__currentStudentScores = scores;
        window.__currentGradeMode = 'pct'; window.__currentViewMode = 'graph';
        window.__renderGradeTrendUI();
    } catch (err) { console.error(err); }
};

window.__renderGradeTrendUI = function() {
    const container = document.getElementById('grade-trend-container');
    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h4 style="margin:0; color:#2c3e50;">📈 성적 추이 분석</h4>
                <div style="display:flex; gap:10px;">
                    <div style="background:#f1f2f6; padding:4px; border-radius:8px; display:flex;">
                        <button id="btn-v-graph" onclick="window.__switchGView('graph')" style="border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; background:${window.__currentViewMode==='graph'?'#2c3e50':'transparent'}; color:${window.__currentViewMode==='graph'?'#fff':'#7f8c8d'};">그래프</button>
                        <button id="btn-v-table" onclick="window.__switchGView('table')" style="border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; background:${window.__currentViewMode==='table'?'#2c3e50':'transparent'}; color:${window.__currentViewMode==='table'?'#fff':'#7f8c8d'};">표</button>
                    </div>
                    <div style="background:#f1f2f6; padding:4px; border-radius:8px; display:flex;">
                        <button id="btn-m-pct" onclick="window.__switchGMode('pct')" style="border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; background:${window.__currentGradeMode==='pct'?'#3498db':'transparent'}; color:${window.__currentGradeMode==='pct'?'#fff':'#7f8c8d'};">백분위</button>
                        <button id="btn-m-raw" onclick="window.__switchGMode('raw')" style="border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; background:${window.__currentGradeMode==='raw'?'#3498db':'transparent'}; color:${window.__currentGradeMode==='raw'?'#fff':'#7f8c8d'};">원점수</button>
                    </div>
                </div>
            </div>
            <div id="grade-display-area" style="min-height:300px;"></div>
        </div>
    `;
    window.__renderGradeDisplay();
};

window.__renderGradeDisplay = function() {
    const area = document.getElementById('grade-display-area');
    const scores = window.__currentStudentScores;
    const mode = window.__currentGradeMode;
    if (window.__currentViewMode === 'graph') {
        area.innerHTML = '<canvas id="gradeChart" style="max-height:350px;"></canvas>';
        new Chart(document.getElementById('gradeChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: scores.map(s => s.exam_label),
                datasets: [
                    { label:'국어', data:scores.map(s=>mode==='pct'?s.kor_pct:s.kor_raw_total), borderColor:'#3498db', tension:0.2 },
                    { label:'수학', data:scores.map(s=>mode==='pct'?s.math_pct:s.math_raw_total), borderColor:'#e74c3c', tension:0.2 },
                    { label:'탐구1', data:scores.map(s=>mode==='pct'?s.tam1_pct:s.tam1_raw), borderColor:'#2ecc71', tension:0.2 },
                    { label:'탐구2', data:scores.map(s=>mode==='pct'?s.tam2_pct:s.tam2_raw), borderColor:'#f1c40f', tension:0.2 }
                ]
            },
            options: { responsive:true, maintainAspectRatio:false }
        });
    } else {
        let h = `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13px; text-align:center;"><thead><tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;"><th style="padding:12px;">시험명</th><th>국어</th><th>수학</th><th>탐구1</th><th>탐구2</th><th>영어</th></tr></thead><tbody>`;
        scores.forEach(s => { h += `<tr style="border-bottom:1px solid #eee;"><td style="padding:10px; font-weight:bold;">${s.exam_label}</td><td>${mode==='pct'?s.kor_pct+'%':s.kor_raw_total+'점'}</td><td>${mode==='pct'?s.math_pct+'%':s.math_raw_total+'점'}</td><td>${mode==='pct'?s.tam1_pct+'%':s.tam1_raw+'점'}</td><td>${mode==='pct'?s.tam2_pct+'%':s.tam2_raw+'점'}</td><td>${s.eng_grade}등급</td></tr>`; });
        area.innerHTML = h + '</tbody></table></div>';
    }
};

window.__switchGView = function(v) { window.__currentViewMode = v; window.__renderGradeTrendUI(); };
window.__switchGMode = function(m) { window.__currentGradeMode = m; window.__renderGradeTrendUI(); };

// ---------------------------------------------------------
// 5. 상세 모달 (출결 타임테이블 등)
// ---------------------------------------------------------
window.__openDetailModal = async function(type, studentId, studentName) {
    let modal = document.getElementById('custom-detail-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'custom-detail-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center;';
        modal.addEventListener('click', (e) => { if(e.target===modal){ modal.style.display='none'; document.body.style.overflow=''; } });
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
    modal.innerHTML = `<div style="background:#fff; width:95%; max-width:1100px; max-height:85vh; border-radius:12px; padding:25px; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;"><h3 style="margin:0;">상세 내역 - ${studentName}</h3><button onclick="document.getElementById('custom-detail-modal').style.display='none'; document.body.style.overflow='';" style="background:none; border:none; font-size:20px; cursor:pointer;">✖</button></div>
        <div id="modal-content-area" style="flex:1; overflow-y:auto;">⏳ 로딩 중...</div></div>`;

    const area = document.getElementById('modal-content-area');
    try {
        if (type === 'attendance') {
            const { data } = await _supabase.from('attendance').select('*').eq('student_id', studentId).order('attendance_date', {ascending:false});
            if(!data.length) { area.innerHTML = "기록이 없습니다."; return; }
            area.innerHTML = "출결 타임테이블 렌더링 생략 (기존 로직 사용 가능)";
        } else {
            const tableMap = { 'move':'move_log', 'sleep':'sleep_log', 'eduscore':'edu_score_log' };
            const { data } = await _supabase.from(tableMap[type]).select('*').eq('student_id', studentId);
            area.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`; // 임시 표시
        }
    } catch (err) { area.innerHTML = err.message; }
};

init();
