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

// 4. 메인 화면 초기화 및 데이터 로드
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

        const [resStudents, resAttendance, resSleep, resMove, resEdu] = await Promise.all([
            studentQuery.order('seat_no'),
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*')
        ]);

        const students = (resStudents.data || []).filter(s => s.name && s.name !== '배정금지');

        // 상세페이지 연동을 위해 변환하여 주머니에 저장
        window.__dashboardItems = students.map(s => ({
            seat: s.seat_no,
            studentId: s.student_id,
            name: s.name,
            teacher: s.teacher_name
        }));

        const attendance = resAttendance.data || [];
        const sleepLogs = resSleep.data || [];
        const moveLogs = resMove.data || [];
        const eduLogs = resEdu.data || [];

        dashboard.innerHTML = '';

        students.forEach(s => {
            const att = attendance.find(a => a.student_id === s.student_id);
            const attStatus = att ? att.status_code : "미입력";
            const attMemo = att ? att.memo : "";

            const todaySleep = sleepLogs.filter(sl => sl.student_id === s.student_id)
                                        .reduce((acc, cur) => acc + (cur.count || 1), 0);

            const lastMove = moveLogs.find(ml => ml.student_id === s.student_id);
            const isOut = lastMove && (lastMove.return_period === "복귀안함" || parseInt(lastMove.return_period) >= parseInt(currentP));
            const moveReason = isOut ? lastMove.reason : "";

            const totalEduScore = eduLogs.filter(el => el.student_id === s.student_id)
                                         .reduce((acc, cur) => acc + (EDU_SCORE_MAP[cur.reason] || 0), 0);

            const validMove = (isOut && moveReason !== "화장실/정수기") ? moveReason : "";

            let displayStatus = "";
            let subStatus = ""; 
            let statusColor = "";

            if (attStatus === "1") {
                displayStatus = "출석";
                statusColor = "1";
                if (validMove) subStatus = validMove;
                else if (attMemo) subStatus = attMemo;
            } else {
                if (validMove) {
                    displayStatus = validMove;
                    statusColor = "move";
                } else if (attMemo) {
                    displayStatus = attMemo;
                    statusColor = "schedule";
                } else {
                    displayStatus = attStatus === "3" ? "결석" : attStatus;
                    statusColor = attStatus === "3" ? "3" : "none";
                }
            }

            dashboard.innerHTML += `
                <div class="card status-${statusColor}" style="position:relative; cursor:pointer;"
                     onclick="if(window.__loadStudentDetail) window.__loadStudentDetail(window.__dashboardItems.find(x => x.studentId === '${s.student_id}'))">
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
                    ${moveReason === "화장실/정수기" && isOut ? `<div style="font-size:10px; color:#3498db; margin-top:3px;">🚰 화장실</div>` : ''}
                </div>
            `;
        });
    } catch (err) { summary.innerText = "에러: " + err.message; }
}

init();

// =========================================================
// 💡 학생 카드 클릭 시 하단에 '다크 테마 4분할 상세페이지'를 펼쳐주는 함수
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
        detailSection.style.backgroundColor = '#1e222d'; // 기존 다크 테마 배경색
        detailSection.style.borderRadius = '12px';
        detailSection.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        document.getElementById('admin-content').appendChild(detailSection);
    }

    detailSection.style.display = 'block';
    detailSection.innerHTML = `<div style="text-align:center; padding:50px; font-size:18px; color:#a5b1c2;">⏳ <b>${student.name}</b> 학생의 상세 데이터를 빛의 속도로 불러오는 중입니다...</div>`;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        // 1. 수퍼베이스에서 4가지 데이터(이동, 교육점수, 취침, 출결)를 동시에 가져옵니다.
        const [resMove, resEdu, resSleep, resAtt] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}),
            _supabase.from('attendance').select('*').eq('student_id', student.studentId).order('attendance_date', {ascending: false})
        ]);

        // 2. 날짜 기준 (최근 7일 계산용)
        const today = new Date();
        const start7d = new Date();
        start7d.setDate(today.getDate() - 6);
        const todayIso = today.toISOString().split('T')[0];
        const start7dIso = start7d.toISOString().split('T')[0];

        // 3. 출결 데이터 가공
        const attLogs = resAtt.data || [];
        let totalAtt = 0, totalAbs = 0;
        const recentAbsences = [];
        attLogs.forEach(a => {
            if (a.status_code === '1') totalAtt++;
            if (a.status_code === '3') {
                totalAbs++;
                if (!a.memo && recentAbsences.length < 3) recentAbsences.push(a); // 스케줄 없는 순수 결석만 최근 결석으로 노출
            }
        });
        const attRate = (totalAtt + totalAbs) > 0 ? Math.round((totalAtt / (totalAtt + totalAbs)) * 100) : 0;
        const attRateColor = attRate >= 90 ? '#2ecc71' : (attRate >= 70 ? '#f39c12' : '#e74c3c');

        // 4. 이동 데이터 가공 (최근 7일 통계 포함)
        const moveLogs = resMove.data || [];
        let restroom7d = 0, noReturn7d = 0;
        moveLogs.forEach(m => {
            if (m.move_date >= start7dIso && m.move_date <= todayIso) {
                if (m.reason === "화장실/정수기") restroom7d++;
                if (m.return_period === "복귀안함") noReturn7d++;
            }
        });
        const recentMoves = moveLogs.slice(0, 3);

        // 5. 취침 데이터 가공
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

        // 6. 교육점수 가공
        const eduLogs = resEdu.data || [];
        const totalScore = eduLogs.reduce((sum, log) => sum + (EDU_SCORE_MAP[log.reason] || 0), 0);
        const recentEdus = eduLogs.slice(0, 3);

        // 공통 카드 스타일
        const cardStyle = "background:#2b303b; padding:20px; border-radius:10px; border:1px solid #3c404b; position:relative; color:#d1d8e0;";
        const btnStyle = "position:absolute; right:20px; top:20px; background:#4a5468; color:white; border:none; padding:5px 12px; border-radius:5px; font-size:12px; cursor:pointer; transition:0.2s;";

        // 7. 화면 HTML 조립
        let html = `
            <div style="border-bottom: 1px solid #3c404b; padding-bottom: 20px; margin-bottom: 25px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="margin: 0 0 10px 0; color: #ffffff; font-size:24px;">${student.name} <span style="font-size:14px; color:#e74c3c; background:rgba(231,76,60,0.1); padding:3px 8px; border-radius:4px; margin-left:10px;">🚨 출결위험 (${attRate}%)</span></h2>
                        <div style="color:#a5b1c2; font-size:14px; line-height:1.6;">
                            좌석: <b style="color:#fff;">${student.seat}</b><br>
                            학번: <b style="color:#fff;">${student.studentId}</b><br>
                            담임: <b style="color:#fff;">${student.teacher}</b>
                        </div>
                    </div>
                    <div>
                        <button onclick="alert('비밀번호 초기화 기능은 준비 중입니다.')" style="background:#e74c3c; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer; margin-right:10px;">🔒 비밀번호 초기화</button>
                        <button onclick="document.getElementById('student-detail-section').style.display='none'" style="background:#4a5468; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                
                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('attendance', '${student.studentId}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #ffffff; font-size:16px;">📅 출결 요약</h4>
                    <div style="margin-bottom:15px;">전체 누적 출석률 <span style="float:right; font-size:18px; font-weight:bold; color:${attRateColor};">${attRate}%</span></div>
                    <div style="font-size:12px; color:#a5b1c2; margin-bottom:8px;">최근 결석:</div>
                    <ul style="margin:0; padding-left:15px; font-size:13px; color:#e74c3c; line-height:1.8;">
                        ${recentAbsences.length > 0 ? recentAbsences.map(a => `<li>${a.attendance_date} ${a.period}교시</li>`).join('') : '<li style="color:#a5b1c2; list-style:none; margin-left:-15px;">최근 결석이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('move', '${student.studentId}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #ffffff; font-size:16px;">🚶 이동 요약 <span style="font-size:12px; color:#a5b1c2; font-weight:normal;">(최근 7일)</span></h4>
                    <div style="margin-bottom:8px;">화장실 : <b style="color:#fff;">${restroom7d}회</b></div>
                    <div style="margin-bottom:15px;">복귀 안함 : <b style="color:#fff;">${noReturn7d}회</b></div>
                    <div style="font-size:12px; color:#a5b1c2; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${recentMoves.length > 0 ? recentMoves.map(m => `<li><span style="color:#a5b1c2;">${m.move_date}</span> <b style="color:#fff;">${m.reason}</b></li>`).join('') : '<li style="color:#a5b1c2;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('sleep', '${student.studentId}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #ffffff; font-size:16px;">💤 취침 요약</h4>
                    <div style="margin-bottom:8px;">최근 7일 취침일수: <b style="color:#fff;">${sleepDaysSet.size}일</b></div>
                    <div style="margin-bottom:15px;">최근 7일 취침횟수: <b style="color:#fff;">${sleepCount7d}회</b></div>
                    <div style="font-size:12px; color:#a5b1c2; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${recentSleeps.length > 0 ? recentSleeps.map(s => `<li><span style="color:#a5b1c2;">${s.sleep_date}</span> ${s.period}교시 <span style="color:#9b59b6;">(${s.count}회)</span></li>`).join('') : '<li style="color:#a5b1c2;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('eduscore', '${student.studentId}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #ffffff; font-size:16px;">🚨 교육점수 요약</h4>
                    <div style="margin-bottom:15px;">전체 누적점수: <b style="color:#f39c12; font-size:18px;">${totalScore}점</b></div>
                    <div style="font-size:12px; color:#a5b1c2; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${recentEdus.length > 0 ? recentEdus.map(e => `<li><span style="color:#a5b1c2;">${e.score_date}</span> <b style="color:#fff;">${e.reason}</b> <span style="color:#e74c3c;">(+${EDU_SCORE_MAP[e.reason]||0})</span></li>`).join('') : '<li style="color:#a5b1c2;">기록이 없습니다.</li>'}
                    </ul>
                </div>

            </div>
        `;
        
        detailSection.innerHTML = html;

    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// 💡 각 카드의 [상세] 버튼 클릭 시 실행되는 함수
window.__openDetailModal = function(type, studentId) {
    // 여기에 기존에 사용하시던 모달창 호출 코드를 연결하시면 됩니다!
    // 예: if(type === 'attendance') showAttendanceModal(studentId);
    
    alert(`학번 [${studentId}] 학생의 [${type}] 상세 페이지 호출 로직을 이 곳에 연결하세요!`);
};
