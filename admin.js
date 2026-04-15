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

// 1. 로그인 처리 함수
async function handleLogin() {
    const id = document.getElementById('admin-id').value;
    const pw = document.getElementById('admin-pw').value;
    const loginMsg = document.getElementById('login-msg');
    try {
        const { data } = await _supabase
            .from('managers')
            .select('*')
            .eq('manager_id', id)
            .eq('password', pw)
            .single();

        if (data) {
            localStorage.setItem('managerName', data.manager_name);
            localStorage.setItem('managerRole', data.role); 
            location.reload(); 
        } else {
            loginMsg.innerText = "로그인 정보가 올바르지 않습니다.";
        }
    } catch (err) {
        loginMsg.innerText = "에러: " + err.message;
    }
}

// 2. 로그아웃 함수
function handleLogout() {
    localStorage.removeItem('managerName');
    localStorage.removeItem('managerRole'); 
    location.reload();
}

// 3. 현재 교시 확인 함수
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

// 4. 메인 화면 초기화 및 데이터 로드 (이동 + 설문 + 출결 통합 연동)
async function init() {
    if (!loggedInManager) {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
        return;
    }

    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    
    const welcomeMsg = loggedInRole === 'super' ? '전체관리자 선생님, 환영합니다' : `${loggedInManager} 선생님, 환영합니다`;
    document.getElementById('welcome-msg').innerText = welcomeMsg;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentP = getCurrentPeriod();
        summary.innerText = `현재 ${currentP}교시 현황판 (${today})`;

        let studentQuery = _supabase.from('student').select('*');
        if (loggedInRole !== 'super') {
            studentQuery = studentQuery.eq('teacher_name', loggedInManager);
        }

        // 💡 설문 로그(survey_log) 추가 호출
        const [resStudents, resAttendance, resSleep, resMove, resEdu, resSurvey] = await Promise.all([
            studentQuery.order('seat_no'),
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*'),
            _supabase.from('survey_log').select('*').eq('survey_date', today) // 오늘자 설문
        ]);

        const students = (resStudents.data || []).filter(s => s.name && s.name !== '배정금지');
        const attendance = resAttendance.data || [];
        const sleepLogs = resSleep.data || [];
        const moveLogs = resMove.data || [];
        const eduLogs = resEdu.data || [];
        const surveyLogs = resSurvey.data || [];

        window.__dashboardItems = students.map(s => ({
            seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name
        }));

        dashboard.innerHTML = '';

        students.forEach(s => {
            const att = attendance.find(a => a.student_id === s.student_id);
            const attStatus = att ? att.status_code : "미입력";
            const attMemo = att ? att.memo : "";

            // 1. 이동 사유 확인
            const lastMove = moveLogs.find(ml => ml.student_id === s.student_id);
            const isOut = lastMove && (lastMove.return_period === "복귀안함" || parseInt(lastMove.return_period) >= parseInt(currentP));
            const validMove = (isOut && lastMove.reason !== "화장실/정수기") ? lastMove.reason : "";

            // 2. 설문 사유 확인 (앞부분만 추출)
            const mySurvey = surveyLogs.find(sv => sv.student_id === s.student_id);
            const surveyReason = mySurvey ? `[설문] ${mySurvey.reason.split('(')[0].trim()}` : "";

            // 3. 벌점/취침 합산
            const todaySleep = sleepLogs.filter(sl => sl.student_id === s.student_id).reduce((acc, cur) => acc + (cur.count || 1), 0);
            const totalEduScore = eduLogs.filter(el => el.student_id === s.student_id).reduce((acc, cur) => acc + (EDU_SCORE_MAP[cur.reason] || 0), 0);

            let displayStatus = "";
            let subStatus = ""; 
            let statusColor = "";

            // 🏆 통합 우선순위 판단 로직
            if (attStatus === "1") {
                displayStatus = "출석";
                statusColor = "1";
                // 출석일 때는 사유를 아래에 보조로 표시
                if (validMove) subStatus = validMove;
                else if (surveyReason) subStatus = surveyReason;
                else if (attMemo) subStatus = attMemo;
            } else {
                // 출석이 아닐 때는 사유를 배지에 직접 표시
                if (validMove) {
                    displayStatus = validMove;
                    statusColor = "move";
                } else if (surveyReason) {
                    displayStatus = surveyReason;
                    statusColor = "schedule"; // 설문은 스케줄 색상과 동일하게
                } else if (attMemo) {
                    displayStatus = attMemo;
                    statusColor = "schedule";
                } else {
                    displayStatus = attStatus === "3" ? "결석" : (attStatus === "2" ? "지각" : attStatus);
                    statusColor = attStatus === "3" ? "3" : (attStatus === "2" ? "2" : "none");
                }
            }

            dashboard.innerHTML += `
                <div class="card status-${statusColor}" style="position:relative; cursor:pointer;"
                     onclick="window.__loadStudentDetail(window.__dashboardItems.find(x => x.studentId === '${s.student_id}'))">
                    <div class="seat" style="font-size:11px; opacity:0.7;">${s.seat_no}</div>
                    <div class="name" style="font-size:18px; margin: 5px 0;">${s.name}</div>
                    <div class="status-badge badge-${statusColor}" style="font-size:13px; font-weight:900;">
                        ${displayStatus}
                    </div>
                    ${subStatus ? `<div style="font-size:11px; color:#2c3e50; font-weight:bold; margin-top:4px; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">${subStatus}</div>` : ''}
                    <div style="display:flex; gap:3px; margin-top:5px; justify-content:center;">
                        ${todaySleep > 0 ? `<span style="background:#ffeaa7; padding:1px 4px; border-radius:3px; font-size:10px;">💤${todaySleep}</span>` : ''}
                        ${totalEduScore > 0 ? `<span style="background:#fab1a0; padding:1px 4px; border-radius:3px; font-size:10px;">⭐${totalEduScore}</span>` : ''}
                    </div>
                    ${lastMove && lastMove.reason === "화장실/정수기" && isOut ? `<div style="font-size:10px; color:#3498db; margin-top:3px;">🚰 화장실</div>` : ''}
                </div>
            `;
        });
    } catch (err) { summary.innerText = "에러: " + err.message; }
}

init();

// =========================================================
// 💡 1. 요약 카드 (지각 우선순위 및 복귀교시 없는 스케줄 반영)
// =========================================================
window.__loadStudentDetail = async function(student) {
    if (!student || !student.studentId) return;

    let detailSection = document.getElementById('student-detail-section');
    if (!detailSection) {
        detailSection = document.createElement('div');
        detailSection.id = 'student-detail-section';
        detailSection.style.marginTop = '40px';
        detailSection.style.marginBottom = '60px';
        detailSection.style.padding = '25px';
        detailSection.style.backgroundColor = '#f8f9fa'; 
        detailSection.style.borderRadius = '12px';
        detailSection.style.border = '1px solid #dee2e6';
        detailSection.style.boxShadow = '0 8px 24px rgba(0,0,0,0.05)';
        document.getElementById('admin-content').appendChild(detailSection);
    }

    detailSection.style.display = 'block';
    detailSection.innerHTML = `<div style="text-align:center; padding:50px; font-size:18px; color:#7f8c8d;">⏳ <b>${student.name}</b> 학생의 데이터를 불러오는 중입니다...</div>`;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const [resMove, resEdu, resSleep, resAtt, resSurvey] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}),
            _supabase.from('attendance').select('*').eq('student_id', student.studentId).order('attendance_date', {ascending: false}),
            _supabase.from('survey_log').select('*').eq('student_id', student.studentId)
        ]);

        const today = new Date();
        const start7d = new Date();
        start7d.setDate(today.getDate() - 6);
        const todayIso = today.toISOString().split('T')[0];
        const start7dIso = start7d.toISOString().split('T')[0];
        const currentP = parseInt(getCurrentPeriod(), 10) || 0;

        const formatShortDate = (dateStr) => {
            const d = new Date(dateStr);
            const days = ['일','월','화','수','목','금','토'];
            return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
        };

        const getPeriodFromTime = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            const t = h * 60 + m;
            if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
            if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
            if (t < 20*60+10) return 7; return 8;
        };

        // 💡 통합 스케줄 맵 만들기
        const schedMap = {};
        
        // 설문 반영
        (resSurvey.data || []).forEach(sv => {
            const dStr = sv.survey_date;
            let reason = sv.reason ? sv.reason.split('(')[0].trim() : '';
            const timeType = sv.arrival_time_type || "";
            let startP = 0, endP = 0;
            if (timeType.includes("결석")) { startP = 1; endP = 8; }
            else if (timeType.includes("오전")) { startP = 1; endP = 3; }
            else if (timeType.includes("오후")) { startP = 4; endP = 6; }
            else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 7; endP = 8; }
            if (startP > 0) {
                if (!schedMap[dStr]) schedMap[dStr] = {};
                for(let p=startP; p<=endP; p++) schedMap[dStr][p] = `[설문] ${reason}`;
            }
        });

        // 이동 반영 (💡 복귀교시 없어도 무조건 넣기!)
        const moveData = resMove.data || [];
        moveData.forEach(mv => {
            if (mv.reason === "화장실/정수기") return;
            const dStr = mv.move_date;
            let rp = parseInt(mv.return_period, 10) || 0;
            if (mv.return_period === "복귀안함") rp = 8;
            const sp = getPeriodFromTime(mv.move_time);
            
            if (!schedMap[dStr]) schedMap[dStr] = {};
            if (rp > 0) {
                const start = sp > 0 ? sp : rp;
                for(let p=start; p<=rp; p++) schedMap[dStr][p] = mv.reason;
            } else {
                const targetP = sp > 0 ? sp : 1; // 기본 1교시
                schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason;
            }
        });

        // 교육점수 '지각' 반영 (💡 벌점 지각도 출결에 표시)
        const eduData = resEdu.data || [];
        eduData.forEach(ed => {
            if (ed.reason.includes('지각')) {
                const dStr = ed.score_date;
                const sp = getPeriodFromTime(ed.score_time) || 1;
                if (!schedMap[dStr]) schedMap[dStr] = {};
                schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.reason}` : ed.reason;
            }
        });

        const attLogs = resAtt.data || [];
        let totalAtt = 0, totalLate = 0, totalAbs = 0;
        let att7d = 0, late7d = 0, abs7d = 0;
        const recentAbsences = [];
        
        attLogs.forEach(a => {
            if (a.attendance_date > todayIso) return;
            if (a.attendance_date === todayIso && parseInt(a.period, 10) > currentP) return;
            const logDateObj = new Date(a.attendance_date);
            if (logDateObj.getDay() === 0) return; // 일요일 제외

            const p = parseInt(a.period, 10);
            const extraMemo = schedMap[a.attendance_date]?.[p] || '';
            const baseMemo = a.memo ? a.memo.trim() : '';
            const finalSched = extraMemo || baseMemo || '';

            const isLate = a.status_code === '2' || finalSched.includes('지각');
            const isAtt = a.status_code === '1';
            const isAbs = a.status_code === '3' && !isLate && finalSched === '';

            let finalType = '';
            // 💡 [핵심] 지각이 1순위로 평가되도록 순서 변경!
            if (isLate) finalType = 'late';
            else if (isAbs) finalType = 'abs';
            else if (isAtt) finalType = 'att';

            if (finalType === 'att') totalAtt++;
            if (finalType === 'late') totalLate++;
            if (finalType === 'abs') {
                totalAbs++;
                if (recentAbsences.length < 3) recentAbsences.push(a);
            }
            
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
        moveData.forEach(m => {
            if (m.move_date >= start7dIso && m.move_date <= todayIso) {
                if (m.reason === "화장실/정수기") restroom7d++;
                if (m.return_period === "복귀안함") noReturn7d++;
            }
        });
        const recentMoves = moveData.slice(0, 3);

        const sleepLogs = resSleep.data || [];
        let sleepCount7d = 0;
        const sleepDaysSet = new Set();
        sleepLogs.forEach(s => {
            if (s.sleep_date >= start7dIso && s.sleep_date <= todayIso) {
                sleepCount7d += s.count;
                sleepDaysSet.add(s.sleep_date);
            }
        });
        const recentSleeps = sleepLogs.slice(0, 3);

        const totalScore = eduData.reduce((sum, log) => sum + (EDU_SCORE_MAP[log.reason] || 0), 0);
        const recentEdus = eduData.slice(0, 3);

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
                    <div>
                        <button onclick="document.getElementById('student-detail-section').style.display='none'" style="background:#7f8c8d; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                
                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('attendance', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #2980b9; font-size:16px;">📅 출결 요약</h4>
                    
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">최근 7일 출석률</span>
                            <span style="color:${attRate7dColor}; font-size:18px;">${attRate7d}%</span>
                        </div>
                        <div style="width:100%; height:8px; background:#ecf0f1; border-radius:4px; margin-bottom:10px; overflow:hidden;">
                            <div style="width:${attRate7d}%; height:100%; background:${attRate7dColor}; border-radius:4px;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${att7d}</b></span>
                            <span>지각 <b style="color:#f39c12;">${late7d}</b></span>
                            <span>결석 <b style="color:#e74c3c;">${abs7d}</b></span>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">전체 누적 출석률</span>
                            <span style="color:#2980b9; font-size:16px;">${attRate}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${totalAtt}</b></span>
                            <span>지각 <b style="color:#f39c12;">${totalLate}</b></span>
                            <span>결석 <b style="color:#e74c3c;">${totalAbs}</b></span>
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
                        ${recentMoves.length > 0 ? recentMoves.map(m => `<li><span style="color:#95a5a6; margin-right:8px;">${m.move_date}</span> <b>${m.reason}</b></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('sleep', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #8e44ad; font-size:16px;">💤 취침 요약</h4>
                    <div style="margin-bottom:8px;">최근 7일 취침일수: <b>${sleepDaysSet.size}일</b></div>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">최근 7일 취침횟수: <b>${sleepCount7d}회</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${recentSleeps.length > 0 ? recentSleeps.map(s => `<li><span style="color:#95a5a6; margin-right:8px;">${s.sleep_date}</span> ${s.period}교시 <span style="color:#8e44ad; font-weight:bold;">(${s.count}회)</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('eduscore', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #e67e22; font-size:16px;">🚨 교육점수 요약</h4>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">전체 누적점수: <b style="color:#d35400; font-size:18px;">${totalScore}점</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${recentEdus.length > 0 ? recentEdus.map(e => `<li><span style="color:#95a5a6; margin-right:8px;">${e.score_date}</span> <b>${e.reason}</b> <span style="color:#e74c3c; font-weight:bold;">(+${EDU_SCORE_MAP[e.reason]||0})</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

            </div>
        `;
        detailSection.innerHTML = html;
    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// =========================================================
// 💡 2. '상세' 모달창 (지각 우선순위 및 복귀교시 없는 스케줄 반영)
// =========================================================
window.__openDetailModal = async function(type, studentId, studentName) {
    let modalOverlay = document.getElementById('custom-detail-modal');
    
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'custom-detail-modal';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0'; modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%'; modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
        modalOverlay.style.zIndex = '9999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
                document.body.style.overflow = ''; 
            }
        });
        document.body.appendChild(modalOverlay);
    }
    
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const titleMap = {
        'attendance': '📅 출결 주차별 상세 내역',
        'move': '🚶 이동 전체 내역',
        'sleep': '💤 취침 전체 내역',
        'eduscore': '🚨 교육점수 전체 내역'
    };

    modalOverlay.innerHTML = `
        <div style="background:#fff; width:98%; max-width:1000px; max-height:85vh; border-radius:12px; padding:25px; box-shadow:0 10px 30px rgba(0,0,0,0.2); display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;">
                <h3 style="margin:0; color:#2c3e50;">${titleMap[type]} - ${studentName}</h3>
                <button onclick="document.getElementById('custom-detail-modal').style.display='none'; document.body.style.overflow='';" style="background:none; border:none; font-size:20px; cursor:pointer; color:#7f8c8d; padding:0;">✖</button>
            </div>
            <div id="modal-content-area" style="flex:1; overflow-y:auto; padding-right:10px;">
                <div style="text-align:center; padding:50px; color:#7f8c8d;">⏳ 데이터를 불러오는 중입니다...</div>
            </div>
        </div>
    `;

    const contentArea = document.getElementById('modal-content-area');

    try {
        let contentHtml = '';
        
        if (type === 'attendance') {
            const [resAtt, resMove, resSurvey, resEdu] = await Promise.all([
                _supabase.from('attendance').select('*').eq('student_id', studentId).order('attendance_date', {ascending: false}),
                _supabase.from('move_log').select('*').eq('student_id', studentId),
                _supabase.from('survey_log').select('*').eq('student_id', studentId),
                _supabase.from('edu_score_log').select('*').eq('student_id', studentId)
            ]);
            
            const data = resAtt.data || [];
            const moveData = resMove.data || [];
            const surveyData = resSurvey.data || [];
            const eduData = resEdu.data || [];

            if (!data || data.length === 0) {
                contentArea.innerHTML = '<div style="text-align:center; padding:30px; color:#7f8c8d;">기록이 없습니다.</div>';
                return;
            }

            const todayIso = new Date().toISOString().split('T')[0];
            const currentP = parseInt(getCurrentPeriod(), 10) || 0;

            const schedMap = {};
            
            surveyData.forEach(sv => {
                const dStr = sv.survey_date;
                let reason = sv.reason ? sv.reason.split('(')[0].trim() : '';
                const timeType = sv.arrival_time_type || "";
                let startP = 0, endP = 0;
                if (timeType.includes("결석")) { startP = 1; endP = 8; }
                else if (timeType.includes("오전")) { startP = 1; endP = 3; }
                else if (timeType.includes("오후")) { startP = 4; endP = 6; }
                else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 7; endP = 8; }
                if (startP > 0) {
                    if (!schedMap[dStr]) schedMap[dStr] = {};
                    for(let p=startP; p<=endP; p++) schedMap[dStr][p] = `[설문] ${reason}`;
                }
            });

            const getPeriodFromTime = (timeStr) => {
                if (!timeStr) return 0;
                const [h, m] = timeStr.split(':').map(Number);
                const t = h * 60 + m;
                if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
                if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
                if (t < 20*60+10) return 7; return 8;
            };

            moveData.forEach(mv => {
                if (mv.reason === "화장실/정수기") return;
                const dStr = mv.move_date;
                let rp = parseInt(mv.return_period, 10) || 0;
                if (mv.return_period === "복귀안함") rp = 8;
                const sp = getPeriodFromTime(mv.move_time);
                
                if (!schedMap[dStr]) schedMap[dStr] = {};
                if (rp > 0) {
                    const start = sp > 0 ? sp : rp;
                    for(let p=start; p<=rp; p++) schedMap[dStr][p] = mv.reason;
                } else {
                    const targetP = sp > 0 ? sp : 1;
                    schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason;
                }
            });

            eduData.forEach(ed => {
                if (ed.reason.includes('지각')) {
                    const dStr = ed.score_date;
                    const sp = getPeriodFromTime(ed.score_time) || 1;
                    if (!schedMap[dStr]) schedMap[dStr] = {};
                    schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.reason}` : ed.reason;
                }
            });

            const weekMap = {};
            const getMonday = (dStr) => {
                const d = new Date(dStr);
                const day = d.getDay() || 7; 
                d.setDate(d.getDate() - day + 1);
                return d.toISOString().split('T')[0];
            };

            data.forEach(row => {
                const mon = getMonday(row.attendance_date);
                if (!weekMap[mon]) weekMap[mon] = {};
                if (!weekMap[mon][row.attendance_date]) weekMap[mon][row.attendance_date] = {};
                weekMap[mon][row.attendance_date][row.period] = { status: row.status_code, memo: row.memo };
            });

            const weeks = Object.keys(weekMap).sort().reverse();
            
            contentHtml += `<div style="margin-bottom:15px;">
                <select id="week-selector" onchange="document.querySelectorAll('.week-table-container').forEach(el => el.style.display='none'); document.getElementById('week-'+this.value).style.display='block';" style="padding:8px 12px; border-radius:6px; border:1px solid #bdc3c7; background:#f8f9fa; font-size:14px; cursor:pointer; color:#2c3e50; font-weight:bold;">
            `;
            
            const formatDateShort = (dStr) => {
                const d = new Date(dStr);
                const days = ['일','월','화','수','목','금','토'];
                return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
            };

            weeks.forEach((mon, idx) => {
                const endDay = new Date(mon); endDay.setDate(endDay.getDate() + 6);
                const label = idx === 0 ? `최신 주차 (${formatDateShort(mon)} ~ ${formatDateShort(endDay.toISOString().split('T')[0])})` : `${formatDateShort(mon)} 주차`;
                contentHtml += `<option value="${mon}">${label}</option>`;
            });
            contentHtml += `</select></div>`;

            contentHtml += `<style>
                .att-table { width:100%; border-collapse:collapse; text-align:center; font-size:12px; color:#2c3e50; min-width:800px; }
                .att-table th, .att-table td { border:1px solid #dfe6e9; padding:8px 2px; }
                .att-table th { background:#f1f2f6; font-weight:bold; }
                .st-1 { background:#e8f8f5; color:#27ae60; font-weight:bold; border-radius:3px; padding:2px 0; }
                .st-2 { background:#fef9e7; color:#f39c12; font-weight:bold; border-radius:3px; padding:2px 0; }
                .st-3 { background:#fadedb; color:#e74c3c; font-weight:bold; border-radius:3px; padding:2px 0; }
                .st-memo { font-size:11px; color:#7f8c8d; max-width:80px; word-break:keep-all; font-weight:bold; }
            </style>`;

            weeks.forEach((mon, idx) => {
                const displayStyle = idx === 0 ? 'block' : 'none';
                contentHtml += `<div id="week-${mon}" class="week-table-container" style="display:${displayStyle}; overflow-x:auto;">
                    <table class="att-table">
                        <thead>
                            <tr>
                                <th rowspan="2" style="width:40px;">교시</th>
                `;
                
                const weekDates = [];
                for(let i=0; i<7; i++) {
                    const d = new Date(mon); d.setDate(d.getDate() + i);
                    const dStr = d.toISOString().split('T')[0];
                    weekDates.push(dStr);
                    const dateColor = i === 6 ? '#e74c3c' : '#2c3e50';
                    contentHtml += `<th colspan="2" style="color:${dateColor}">${formatDateShort(dStr)}</th>`;
                }
                contentHtml += `</tr><tr>`;
                for(let i=0; i<7; i++) { contentHtml += `<th>스케줄</th><th>출/결</th>`; }
                contentHtml += `</tr></thead><tbody>`;

                for(let p=1; p<=8; p++) {
                    contentHtml += `<tr><th>${p}</th>`;
                    weekDates.forEach(dateStr => {
                        const isFuture = dateStr > todayIso || (dateStr === todayIso && p > currentP);
                        const cellData = (weekMap[mon][dateStr] && weekMap[mon][dateStr][p]) ? weekMap[mon][dateStr][p] : null;
                        
                        let memo = '-';
                        let statusHtml = '-';

                        if (isFuture) {
                            memo = '-';
                            statusHtml = '-';
                        } else {
                            const baseMemo = cellData && cellData.memo ? cellData.memo.trim() : '';
                            const extraMemo = schedMap[dateStr]?.[p] || '';
                            memo = extraMemo || baseMemo || '-';

                            if (cellData) {
                                // 💡 [핵심] 지각 우선 판별
                                const isLate = cellData.status === '2' || memo.includes('지각');
                                if (isLate) statusHtml = `<div class="st-2">지각</div>`;
                                else if (cellData.status === '1') statusHtml = `<div class="st-1">출석</div>`;
                                else if (cellData.status === '3') statusHtml = `<div class="st-3">결석</div>`;
                                else statusHtml = cellData.status;
                            }
                        }

                        contentHtml += `<td class="st-memo">${memo}</td><td>${statusHtml}</td>`;
                    });
                    contentHtml += `</tr>`;
                }
                contentHtml += `</tbody></table></div>`;
            });
            contentArea.innerHTML = contentHtml;
        } 
        else {
            window.__modalData = { type: type, items: [] };
            let tableQuery = null;
            
            if (type === 'move') {
                tableQuery = _supabase.from('move_log').select('*').eq('student_id', studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false});
            } else if (type === 'sleep') {
                tableQuery = _supabase.from('sleep_log').select('*').eq('student_id', studentId).order('sleep_date', {ascending: false});
            } else if (type === 'eduscore') {
                tableQuery = _supabase.from('edu_score_log').select('*').eq('student_id', studentId).order('score_date', {ascending: false});
            }

            const { data } = await tableQuery;
            window.__modalData.items = data || [];

            contentArea.innerHTML = `
                <style>
                    .period-btn { background:#f1f2f6; border:1px solid #dfe6e9; padding:6px 16px; margin-left:6px; border-radius:6px; cursor:pointer; color:#7f8c8d; font-size:13px; font-weight:bold; transition:all 0.2s; }
                    .period-btn.active { background:#2c3e50; color:#ffffff; border-color:#2c3e50; }
                    .period-btn:hover:not(.active) { background:#e2e6ea; }
                    .data-table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; color:#2c3e50; margin-top:10px; }
                    .data-table th { padding:12px 10px; border-bottom:2px solid #ecf0f1; color:#7f8c8d; font-weight:normal; font-size:13px; }
                    .data-table td { padding:12px 10px; border-bottom:1px solid #f1f2f6; }
                    .data-table tbody tr:hover { background-color:#f8f9fa; }
                </style>
                <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:20px;">
                    <span style="font-size:13px; color:#7f8c8d;">조회 기간:</span>
                    <button class="period-btn" id="btn-period-7" onclick="window.__renderModalTable(7)">7일</button>
                    <button class="period-btn" id="btn-period-15" onclick="window.__renderModalTable(15)">15일</button>
                    <button class="period-btn" id="btn-period-30" onclick="window.__renderModalTable(30)">30일</button>
                </div>
                <div id="modal-table-area"></div>
            `;

            window.__renderModalTable = function(days) {
                [7, 15, 30].forEach(d => {
                    const btn = document.getElementById('btn-period-' + d);
                    if (btn) {
                        if (d === days) btn.classList.add('active');
                        else btn.classList.remove('active');
                    }
                });

                const targetDate = new Date();
                targetDate.setDate(new Date().getDate() - (days - 1));
                const targetIso = targetDate.toISOString().split('T')[0];

                const filtered = window.__modalData.items.filter(item => {
                    const dStr = item.move_date || item.sleep_date || item.score_date;
                    return dStr >= targetIso;
                });

                let tableHtml = '<table class="data-table"><thead><tr>';
                
                if (window.__modalData.type === 'move') {
                    tableHtml += '<th>날짜</th><th>시간</th><th>사유</th><th>복귀교시</th></tr></thead><tbody>';
                    if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>';
                    else {
                        filtered.forEach(d => {
                            tableHtml += `<tr>
                                <td style="color:#7f8c8d;">${d.move_date}</td>
                                <td>${d.move_time || '-'}</td>
                                <td><b style="color:#2c3e50;">${d.reason}</b></td>
                                <td style="color:#95a5a6;">${d.return_period || '-'}</td>
                            </tr>`;
                        });
                    }
                } 
                else if (window.__modalData.type === 'sleep') {
                    tableHtml += '<th>날짜</th><th>교시</th><th>기록</th><th>횟수</th></tr></thead><tbody>';
                    if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>';
                    else {
                        filtered.forEach(d => {
                            tableHtml += `<tr>
                                <td style="color:#7f8c8d;">${d.sleep_date}</td>
                                <td>${d.period}교시</td>
                                <td><b style="color:#2c3e50;">취침</b></td>
                                <td><b style="color:#8e44ad; background:#f4ebf7; padding:4px 8px; border-radius:4px; font-size:12px;">${d.count}회 적발</b></td>
                            </tr>`;
                        });
                    }
                }
                else if (window.__modalData.type === 'eduscore') {
                    tableHtml += '<th>날짜</th><th>사유</th><th>점수</th></tr></thead><tbody>';
                    if (filtered.length === 0) tableHtml += '<tr><td colspan="3" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>';
                    else {
                        filtered.forEach(d => {
                            const score = EDU_SCORE_MAP[d.reason] || 0;
                            tableHtml += `<tr>
                                <td style="color:#7f8c8d;">${d.score_date}</td>
                                <td><b style="color:#2c3e50;">${d.reason}</b></td>
                                <td><b style="color:#e74c3c; background:#fdedec; padding:4px 8px; border-radius:4px; font-size:12px;">+${score}점</b></td>
                            </tr>`;
                        });
                    }
                }
                tableHtml += '</tbody></table>';
                document.getElementById('modal-table-area').innerHTML = tableHtml;
            };

            window.__renderModalTable(7);
        }

    } catch (err) {
        contentArea.innerHTML = `
            <div style="text-align:center;">
                <h3 style="color:#e74c3c;">오류 발생</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
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
