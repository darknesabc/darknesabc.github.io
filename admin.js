const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let loggedInManager = localStorage.getItem('managerName');
let loggedInRole = localStorage.getItem('managerRole'); 

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
    let currentP = SCHEDULE[0].p;
    for (const slot of SCHEDULE) { if (currentTime >= slot.start) currentP = slot.p; }
    return currentP;
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
        // 한국 시간대(로컬 시간)에 맞춰 오늘 날짜 계산
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const currentP = getCurrentPeriod();
        summary.innerText = `현재 ${currentP}교시 현황판 (${today})`;

        let query = _supabase.from('student').select('*');
        if (loggedInRole !== 'super') query = query.eq('teacher_name', loggedInManager);

        const [resStudents, resAtt, resSleep, resMove, resEdu, resSurvey] = await Promise.all([
            query.order('seat_no'),
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*'),
            _supabase.from('survey_log').select('*').eq('survey_date', today)
        ]);

        const students = resStudents.data.filter(s => s.name && s.name !== '배정금지');
        window.__dashboardItems = students.map(s => ({ seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name, className: s.class_name }));

        dashboard.innerHTML = '';
        students.forEach(s => {
            const att = resAtt.data.find(a => a.student_id === s.student_id);
            const move = resMove.data.find(ml => ml.student_id === s.student_id);
            const isOut = move && (move.return_period === "복귀안함" || parseInt(move.return_period) >= parseInt(currentP));
            const validMove = (isOut && move.reason !== "화장실/정수기") ? move.reason : "";
            const survey = resSurvey.data.find(sv => sv.student_id === s.student_id);
            const surveyReason = survey ? `[설문] ${survey.reason.split('(')[0].trim()}` : "";
            
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
                    ${move && move.reason === "화장실/정수기" && isOut ? `<div style="font-size:10px; color:#3498db; margin-top:3px;">🚰 화장실</div>` : ''}
                </div>
            `;
        });
    } catch (err) { summary.innerText = "에러: " + err.message; }
}

// =========================================================
// 3. 학생 상세 페이지 로드 (요약 카드 + 상세 내역 리스트)
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

        // 한국 시간대(로컬 시간)에 맞춰 상세 페이지 날짜 계산
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
        const getPeriodFromTime = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m;
            if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
            if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
            if (t < 20*60+10) return 7; return 8;
        };

        const schedMap = {};
        resSurvey.data.forEach(sv => {
            const dStr = sv.survey_date; let reason = sv.reason ? sv.reason.split('(')[0].trim() : '';
            const timeType = sv.arrival_time_type || ""; let startP = 0, endP = 0;
            if (timeType.includes("결석")) { startP = 1; endP = 8; }
            else if (timeType.includes("오전")) { startP = 1; endP = 3; }
            else if (timeType.includes("오후")) { startP = 4; endP = 6; }
            else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 7; endP = 8; }
            if (startP > 0) {
                if (!schedMap[dStr]) schedMap[dStr] = {};
                for(let p=startP; p<=endP; p++) schedMap[dStr][p] = `[설문] ${reason}`;
            }
        });

        resMove.data.forEach(mv => {
            if (mv.reason === "화장실/정수기") return;
            const dStr = mv.move_date; let rp = parseInt(mv.return_period, 10) || 0;
            if (mv.return_period === "복귀안함") rp = 8;
            const sp = getPeriodFromTime(mv.move_time);
            if (!schedMap[dStr]) schedMap[dStr] = {};
            if (rp > 0) { const start = sp > 0 ? sp : rp; for(let p=start; p<=rp; p++) schedMap[dStr][p] = mv.reason; } 
            else { const targetP = sp > 0 ? sp : 1; schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason; }
        });

        resEdu.data.forEach(ed => {
            if (ed.reason.includes('지각')) {
                const dStr = ed.score_date; const sp = getPeriodFromTime(ed.score_time) || 1;
                if (!schedMap[dStr]) schedMap[dStr] = {};
                schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.reason}` : ed.reason;
            }
        });

        let totalAtt = 0, totalLate = 0, totalAbs = 0;
        let att7d = 0, late7d = 0, abs7d = 0;
        const recentAbsences = [];
        
        resAtt.data.forEach(a => {
            if (a.attendance_date > todayIso || (a.attendance_date === todayIso && parseInt(a.period, 10) > currentP)) return;
            if (new Date(a.attendance_date).getDay() === 0) return;

            const p = parseInt(a.period, 10);
            const finalSched = (schedMap[a.attendance_date]?.[p] || '') + (a.memo ? a.memo.trim() : '');
            const isLate = a.status_code === '2' || finalSched.includes('지각');
            const isAtt = a.status_code === '1';
            const isAbs = a.status_code === '3' && !isLate && (!finalSched || finalSched === '-');

            let finalType = isLate ? 'late' : (isAbs ? 'abs' : (isAtt ? 'att' : ''));

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
                    <button onclick="document.getElementById('student-detail-section').style.display='none'" style="background:#7f8c8d; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
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

            <div id="grade-trend-container" style="margin-top:20px;"></div>
        `;
        detailSection.innerHTML = html;
        
        // 💡 HTML 세팅 후 성적 불러오기 실행 (학생 정보를 그대로 넘깁니다)
        window.__loadGradeTrend(student);

    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// =========================================================
// 💡 4. 성적 추이 (백분위/표점/원점수 & 컷오프 & 다크 표)
// =========================================================
window.__loadGradeTrend = async function(student) {
    const trendContainer = document.getElementById('grade-trend-container');
    if (!trendContainer) return;

    try {
        const { data: allScores, error } = await _supabase
            .from('mock_scores')
            .select('*')
            .order('created_at', { ascending: true });

        if (error || !allScores || allScores.length === 0) {
            trendContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#95a5a6; background:#fff; border-radius:12px; border:1px solid #dee2e6;">등록된 성적 데이터가 없습니다.</div>';
            return;
        }

        window.__allMockScores = allScores;
        window.__currentStudentScores = allScores.filter(s => s.student_id === student.studentId);
        window.__currentStudentClass = student.className || ''; // 학생의 반 정보 저장 (반별 컷오프용)

        if (window.__currentStudentScores.length === 0) {
            trendContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#95a5a6; background:#fff; border-radius:12px; border:1px solid #dee2e6;">등록된 성적 데이터가 없습니다.</div>';
            return;
        }

        window.__currentGradeMode = 'pct'; // 기본값: 백분위
        window.__currentViewMode = 'graph'; 
        window.__toggles = { topTotal: false, topChoice: false, topClass: false }; // 컷오프 초기화

        window.__renderGradeTrendUI();
    } catch (err) { console.error("성적 로드 에러:", err); }
};

window.__renderGradeTrendUI = function() {
    const container = document.getElementById('grade-trend-container');
    
    // 버튼 스타일 통일
    const btnSty = (isActive, bg, fg) => `border:1px solid #dee2e6; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; background:${isActive ? bg : 'transparent'}; color:${isActive ? '#fff' : fg}; transition:0.2s;`;
    const tglBtn = (key, label) => {
        const isOn = window.__toggles[key];
        return `<button onclick="window.__toggleCutoff('${key}')" style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; cursor:pointer; font-size:11px; font-weight:bold; background:${isOn ? '#f1f2f6' : '#fff'}; color:${isOn ? '#2c3e50' : '#7f8c8d'}; transition:0.2s;">${label}</button>`;
    };

    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 4px 6px rgba(0,0,0,0.02); margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h4 style="margin:0; color:#2c3e50; display:flex; align-items:center; gap:8px;">📈 성적 추이 <span style="font-size:12px; color:#7f8c8d; font-weight:normal;">(예상 컷 기준)</span></h4>
                    
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px;">
                        <button onclick="window.__switchGView('graph')" style="${btnSty(window.__currentViewMode==='graph', '#f1c40f', '#7f8c8d')} color:${window.__currentViewMode==='graph'?'#2c3e50':'#7f8c8d'};">그래프</button>
                        <button onclick="window.__switchGView('table')" style="${btnSty(window.__currentViewMode==='table', '#f1c40f', '#7f8c8d')} color:${window.__currentViewMode==='table'?'#2c3e50':'#7f8c8d'};">표</button>
                    </div>
                    
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px; margin-left:10px;">
                        <button onclick="window.__switchGMode('pct')" style="${btnSty(window.__currentGradeMode==='pct', '#3498db', '#7f8c8d')}">백분위</button>
                        <button onclick="window.__switchGMode('raw')" style="${btnSty(window.__currentGradeMode==='raw', '#3498db', '#7f8c8d')}">원점수</button>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; ${window.__currentViewMode==='table' ? 'display:none;' : ''}">
                ${tglBtn('topTotal', '전체 상위 30% ' + (window.__toggles.topTotal?'ON':'OFF'))}
                ${tglBtn('topChoice', '선택 상위 30% ' + (window.__toggles.topChoice?'ON':'OFF'))}
                ${tglBtn('topClass', '반별 상위 30% ' + (window.__toggles.topClass?'ON':'OFF'))}
                <button style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; font-size:11px; color:#bdc3c7; background:#fff; cursor:not-allowed;">HS반 30% OFF</button>
                <button style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; font-size:11px; color:#bdc3c7; background:#fff; cursor:not-allowed;">그린 30% OFF</button>
                <button style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; font-size:11px; color:#bdc3c7; background:#fff; cursor:not-allowed;">블루 30% OFF</button>
                <button style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; font-size:11px; color:#bdc3c7; background:#fff; cursor:not-allowed;">서/의치대 30% OFF</button>
                <button style="border:1px solid #dee2e6; padding:5px 12px; border-radius:20px; font-size:11px; color:#bdc3c7; background:#fff; cursor:not-allowed;">연고대 30% OFF</button>
            </div>
            
            <div id="grade-display-area" style="min-height:350px;"></div>
        </div>
    `;
    window.__renderGradeDisplay();
};

window.__toggleCutoff = function(key) {
    window.__toggles[key] = !window.__toggles[key];
    window.__renderGradeTrendUI();
};

window.__renderGradeDisplay = function() {
    const area = document.getElementById('grade-display-area');
    const scores = window.__currentStudentScores;
    const mode = window.__currentGradeMode; 
    const view = window.__currentViewMode; 
    const toggles = window.__toggles;

    const getVal = (s, subj) => {
        if (mode === 'pct') return s[`${subj}_exp_pct`] || 0;
        return s[`${subj}_raw_total`] !== undefined ? (s[`${subj}_raw_total`] || 0) : (s[`${subj}_raw`] || 0);
    };

    const getTop30 = (examLabel, subj, valKey, filterMode, myScore) => {
        let pool = window.__allMockScores.filter(s => s.exam_label === examLabel);
        if (filterMode === 'topChoice') {
            const choiceKey = subj === 'kor' ? 'kor_choice' : (subj === 'math' ? 'math_choice' : (subj === 'tam1' ? 'tam1_name' : 'tam2_name'));
            pool = pool.filter(s => s[choiceKey] === myScore[choiceKey]);
        } else if (filterMode === 'topClass') {
            pool = pool.filter(s => s.class_name === window.__currentStudentClass);
        }
        let vals = pool.map(s => s[valKey] || 0).sort((a,b) => b-a);
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
        const colors = { kor:'#3498db', math:'#e74c3c', tam1:'#2ecc71', tam2:'#f1c40f', eng:'#9b59b6' };
        
        const subjs = [
            {id:'kor', name:'국어(선택)'}, {id:'math', name:'수학(선택)'}, 
            {id:'tam1', name:'탐구1(과목명)'}, {id:'tam2', name:'탐구2(과목)'}, {id:'eng', name:'영어'}
        ];

        subjs.forEach(sbj => {
            if(sbj.id === 'eng' && mode !== 'raw') return; // 영어는 원점수(등급)만
            
            const valKey = mode === 'pct' ? `${sbj.id}_exp_pct` : (sbj.id.startsWith('tam') || sbj.id==='eng' ? `${sbj.id}_raw` : `${sbj.id}_raw_total`);
            
            // 1. 내 성적 (실선)
            datasets.push({
                label: sbj.name,
                data: scores.map(s => sbj.id==='eng' ? (s.eng_raw||0) : getVal(s, sbj.id)),
                borderColor: colors[sbj.id], backgroundColor: colors[sbj.id],
                tension: 0.1, borderWidth: 2, pointRadius: 4, fill: false
            });

            // 2. 컷오프 성적 (점선)
            if (sbj.id !== 'eng') {
                if (toggles.topTotal) datasets.push({ label: `${sbj.name} (전체상위30%)`, data: scores.map(s => getTop30(s.exam_label, sbj.id, valKey, 'topTotal', s)), borderColor: colors[sbj.id], borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false });
                if (toggles.topChoice) datasets.push({ label: `${sbj.name} (선택상위30%)`, data: scores.map(s => getTop30(s.exam_label, sbj.id, valKey, 'topChoice', s)), borderColor: '#9b59b6', borderDash: [3, 3], borderWidth: 1, pointRadius: 0, fill: false });
                if (toggles.topClass) datasets.push({ label: `${sbj.name} (반별상위30%)`, data: scores.map(s => getTop30(s.exam_label, sbj.id, valKey, 'topClass', s)), borderColor: '#1abc9c', borderDash: [2, 4], borderWidth: 1, pointRadius: 0, fill: false });
            }
        });

        Chart.defaults.color = '#7f8c8d';
        new Chart(ctx, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: mode==='pct', max: mode==='pct'?100:null, grid: { color: '#f1f2f6' } }, x: { grid: { display: false } } },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
            }
        });

    } else {
        // 💡 표(Table) 형식 다크테마 스타일 렌더링 (이미지 2번과 동일)
        const v = (val) => val === null || val === undefined ? '-' : val;
        
        let h = `
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #2f3542;">
            <style>
                .dt-table { width:100%; border-collapse:collapse; font-size:12px; text-align:center; color:#dfe4ea; min-width:800px; background:#1e2128; }
                .dt-table th, .dt-table td { border:1px solid #2f3542; padding:10px 5px; }
                .dt-table th { background:#282c34; font-weight:bold; color:#f1f2f6; }
                .c-kor { color:#3498db; } .c-math { color:#e74c3c; } .c-eng { color:#9b59b6; } .c-tam { color:#2ecc71; } .c-tam2 { color:#f1c40f; }
            </style>
            <table class="dt-table">
                <thead>
                    <tr>
                        <th rowspan="2">시험구분</th>
                        <th colspan="4">국어</th>
                        <th colspan="4">수학</th>
                        <th colspan="3">영어</th>
                        <th colspan="4">탐구1</th>
                        <th colspan="4">탐구2</th>
                    </tr>
                    <tr style="font-size:11px; color:#a4b0be;">
                        <th>원점</th><th>표점</th><th class="c-kor">백분위</th><th>등급</th>
                        <th>원점</th><th>표점</th><th class="c-math">백분위</th><th>등급</th>
                        <th>원점</th><th>백분위</th><th class="c-eng">등급</th>
                        <th class="c-tam">과목</th><th>원점</th><th class="c-tam">백분위</th><th>등급</th>
                        <th class="c-tam2">과목</th><th>원점</th><th class="c-tam2">백분위</th><th>등급</th>
                    </tr>
                </thead>
                <tbody>
        `;
        scores.forEach(s => {
            h += `<tr>
                <td style="font-weight:bold; color:#fff;">${s.exam_label}</td>
                <td>${v(s.kor_raw_total)}</td> <td>${v(s.kor_exp_std)}</td> <td class="c-kor" style="font-weight:bold;">${v(s.kor_exp_pct)}</td> <td>${v(s.kor_exp_grade)}</td>
                <td>${v(s.math_raw_total)}</td> <td>${v(s.math_exp_std)}</td> <td class="c-math" style="font-weight:bold;">${v(s.math_exp_pct)}</td> <td>${v(s.math_exp_grade)}</td>
                <td>${v(s.eng_raw)}</td> <td>-</td> <td class="c-eng" style="font-weight:bold;">${v(s.eng_grade)}</td>
                <td class="c-tam">${v(s.tam1_name)}</td> <td>${v(s.tam1_raw)}</td> <td class="c-tam" style="font-weight:bold;">${v(s.tam1_exp_pct)}</td> <td>${v(s.tam1_exp_grade)}</td>
                <td class="c-tam2">${v(s.tam2_name)}</td> <td>${v(s.tam2_raw)}</td> <td class="c-tam2" style="font-weight:bold;">${v(s.tam2_exp_pct)}</td> <td>${v(s.tam2_exp_grade)}</td>
            </tr>`;
        });
        area.innerHTML = h + '</tbody></table></div>';
    }
};

window.__switchGView = function(v) { window.__currentViewMode = v; window.__renderGradeTrendUI(); };
window.__switchGMode = function(m) { window.__currentGradeMode = m; window.__renderGradeTrendUI(); };

// =========================================================
// 💡 5. 상세 모달창 (주차별 타임테이블 및 필터 테이블)
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

            // 👇 한국 시간에 맞춘 오늘 날짜로 교체
            const now = new Date();
            const todayIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
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
                    contentHtml += `<tr><td style="background:#fcfcfc; font-weight:bold;">${p}교시</td>`;
                    weekDates.forEach(dateStr => {
                        const isFuture = dateStr > todayIso || (dateStr === todayIso && p > currentP);
                        const cellData = (weekMap[mon][dateStr] && weekMap[mon][dateStr][p]) ? weekMap[mon][dateStr][p] : null;
                        
                        // 💡 1. 스케줄(메모)은 과거나 미래 상관없이 데이터가 있으면 무조건 가져오기!
                        const baseMemo = cellData && cellData.memo ? cellData.memo.trim() : '';
                        const extraMemo = schedMap[dateStr]?.[p] || '';
                        let memo = extraMemo || baseMemo || '-';
                        
                        let statusHtml = '-';

                        // 💡 2. 출결 상태 표시 로직
                        if (isFuture) {
                            // 미래 시간은 출결 칸만 하이픈 처리
                            statusHtml = '<span style="color:#bdc3c7;">-</span>'; 
                        } else {
                            if (!cellData) {
                                statusHtml = '<span style="color:#ccc;">미입력</span>';
                            } else {
                                const isLate = cellData.status === '2' || memo.includes('지각');
                                const isUnexcusedAbs = cellData.status === '3' && !isLate && (!memo || memo === '-');

                                if (isLate) {
                                    statusHtml = `<div class="st-2">지각</div>`;
                                } else if (cellData.status === '1') {
                                    statusHtml = `<div class="st-1">출석</div>`;
                                } else if (isUnexcusedAbs) {
                                    statusHtml = `<div class="st-3">결석</div>`; // 진짜 무단결석 (빨간색)
                                } else if (cellData.status === '3') {
                                    // 사유가 있는 결석은 회색 '공결' 처리
                                    statusHtml = `<div style="background:#f1f2f6; color:#7f8c8d; font-weight:bold; border-radius:3px; padding:2px 0;">공결</div>`;
                                } else {
                                    statusHtml = cellData.status;
                                }
                            }
                        }

                        // 💡 3. 미래 스케줄이 있다면 눈에 띄게 파란색으로 표시
                        const memoStyle = (isFuture && memo !== '-') ? 'color:#3498db; font-weight:900;' : '';
                        contentHtml += `<td class="st-memo" style="${memoStyle}">${memo}</td><td>${statusHtml}</td>`;
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

                // 👇 한국 시간에 맞춰 n일 전 날짜를 정확히 구하도록 교체
                const now = new Date();
                const targetDate = new Date(now);
                targetDate.setDate(now.getDate() - (days - 1));
                const targetIso = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

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

init();
