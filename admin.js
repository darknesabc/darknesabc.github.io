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
// 💡 1. 학생 카드 클릭 시 '라이트 테마 4분할 상세페이지' (막대그래프 복구)
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
        const [resMove, resEdu, resSleep, resAtt] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}),
            _supabase.from('attendance').select('*').eq('student_id', student.studentId).order('attendance_date', {ascending: false})
        ]);

        const today = new Date();
        const start7d = new Date();
        start7d.setDate(today.getDate() - 6);
        const todayIso = today.toISOString().split('T')[0];
        const start7dIso = start7d.toISOString().split('T')[0];

        // 💡 출결 데이터 처리 (최근 7일 및 전체 누적 분리)
        const attLogs = resAtt.data || [];
        let totalAtt = 0, totalAbs = 0;
        let att7d = 0, abs7d = 0;
        const recentAbsences = [];
        
        attLogs.forEach(a => {
            // 전체 누적
            if (a.status_code === '1') totalAtt++;
            if (a.status_code === '3' && !a.memo) {
                totalAbs++;
                if (recentAbsences.length < 3) recentAbsences.push(a);
            }
            // 최근 7일
            if (a.attendance_date >= start7dIso && a.attendance_date <= todayIso) {
                if (a.status_code === '1') att7d++;
                if (a.status_code === '3' && !a.memo) abs7d++;
            }
        });
        
        const attRate = (totalAtt + totalAbs) > 0 ? Math.round((totalAtt / (totalAtt + totalAbs)) * 100) : 0;
        const attRate7d = (att7d + abs7d) > 0 ? Math.round((att7d / (att7d + abs7d)) * 100) : 0;
        const attRate7dColor = attRate7d >= 90 ? '#2ecc71' : (attRate7d >= 70 ? '#f39c12' : '#e74c3c');

        const moveLogs = resMove.data || [];
        let restroom7d = 0, noReturn7d = 0;
        moveLogs.forEach(m => {
            if (m.move_date >= start7dIso && m.move_date <= todayIso) {
                if (m.reason === "화장실/정수기") restroom7d++;
                if (m.return_period === "복귀안함") noReturn7d++;
            }
        });
        const recentMoves = moveLogs.slice(0, 3);

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

        const eduLogs = resEdu.data || [];
        const totalScore = eduLogs.reduce((sum, log) => sum + (EDU_SCORE_MAP[log.reason] || 0), 0);
        const recentEdus = eduLogs.slice(0, 3);

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
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e;">
                            <span>최근 7일 출석률</span>
                            <span style="color:${attRate7dColor}; font-size:18px;">${attRate7d}%</span>
                        </div>
                        <div style="width:100%; height:8px; background:#ecf0f1; border-radius:4px; margin-top:8px; overflow:hidden;">
                            <div style="width:${attRate7d}%; height:100%; background:${attRate7dColor}; border-radius:4px;"></div>
                        </div>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                        <span>전체 누적 출석률</span>
                        <b style="color:#34495e;">${attRate}%</b>
                    </div>

                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 결석:</div>
                    <ul style="margin:0; padding-left:15px; font-size:13px; color:#e74c3c; line-height:1.8;">
                        ${recentAbsences.length > 0 ? recentAbsences.map(a => `<li>${a.attendance_date} ${a.period}교시</li>`).join('') : '<li style="color:#95a5a6; list-style:none; margin-left:-15px;">최근 결석이 없습니다.</li>'}
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
// 💡 2. '상세' 버튼 클릭 시 팝업을 띄워주는 함수 (타임테이블 완벽 복원)
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
        document.body.appendChild(modalOverlay);
    }
    modalOverlay.style.display = 'flex';

    const titleMap = {
        'attendance': '📅 출결 주차별 상세 내역',
        'move': '🚶 이동 전체 내역',
        'sleep': '💤 취침 전체 내역',
        'eduscore': '🚨 교육점수 전체 내역'
    };

    modalOverlay.innerHTML = `
        <div style="background:#fff; width:95%; max-width:900px; max-height:85vh; border-radius:12px; padding:25px; box-shadow:0 10px 30px rgba(0,0,0,0.2); display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;">
                <h3 style="margin:0; color:#2c3e50;">${titleMap[type]} - ${studentName}</h3>
                <button onclick="document.getElementById('custom-detail-modal').style.display='none'" style="background:none; border:none; font-size:20px; cursor:pointer; color:#7f8c8d; padding:0;">✖</button>
            </div>
            <div id="modal-content-area" style="flex:1; overflow-y:auto; padding-right:10px;">
                <div style="text-align:center; padding:50px; color:#7f8c8d;">⏳ 데이터를 불러오는 중입니다...</div>
            </div>
        </div>
    `;

    const contentArea = document.getElementById('modal-content-area');

    try {
        let contentHtml = '';
        
        // 💡 [핵심] 출결일 경우: 주차별 타임테이블 테이블 생성 로직
        if (type === 'attendance') {
            const { data } = await _supabase.from('attendance').select('*').eq('student_id', studentId).order('attendance_date', {ascending: false});
            
            if (!data || data.length === 0) {
                contentArea.innerHTML = '<div style="text-align:center; padding:30px; color:#7f8c8d;">기록이 없습니다.</div>';
                return;
            }

            // 데이터를 주차(월요일 기준)별로 그룹화
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
            
            // 1. 주차 선택 드롭다운
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

            // 2. 주차별 테이블 생성
            contentHtml += `<style>
                .att-table { width:100%; border-collapse:collapse; text-align:center; font-size:13px; color:#2c3e50; }
                .att-table th, .att-table td { border:1px solid #dfe6e9; padding:8px 2px; }
                .att-table th { background:#f1f2f6; font-weight:bold; }
                .st-1 { background:#e8f8f5; color:#27ae60; font-weight:bold; } /* 출석 */
                .st-3 { background:#fadedb; color:#e74c3c; font-weight:bold; } /* 결석 */
                .st-memo { font-size:11px; color:#7f8c8d; }
            </style>`;

            weeks.forEach((mon, idx) => {
                const displayStyle = idx === 0 ? 'block' : 'none';
                contentHtml += `<div id="week-${mon}" class="week-table-container" style="display:${displayStyle}; overflow-x:auto;">
                    <table class="att-table">
                        <thead>
                            <tr>
                                <th rowspan="2" style="width:50px;">교시</th>
                `;
                
                // 상단 날짜 헤더 (월~토 6일 기준)
                const weekDates = [];
                for(let i=0; i<6; i++) {
                    const d = new Date(mon); d.setDate(d.getDate() + i);
                    const dStr = d.toISOString().split('T')[0];
                    weekDates.push(dStr);
                    contentHtml += `<th colspan="2">${formatDateShort(dStr)}</th>`;
                }
                contentHtml += `</tr><tr>`;
                for(let i=0; i<6; i++) { contentHtml += `<th>스케줄</th><th>출/결</th>`; }
                contentHtml += `</tr></thead><tbody>`;

                // 1~8교시 데이터 채우기
                for(let p=1; p<=8; p++) {
                    contentHtml += `<tr><th>${p}</th>`;
                    weekDates.forEach(dateStr => {
                        const cellData = (weekMap[mon][dateStr] && weekMap[mon][dateStr][p]) ? weekMap[mon][dateStr][p] : null;
                        const memo = cellData && cellData.memo ? cellData.memo : '-';
                        let statusHtml = '-';
                        if (cellData && cellData.status === '1') statusHtml = `<div class="st-1">출석</div>`;
                        else if (cellData && cellData.status === '3') statusHtml = `<div class="st-3">결석</div>`;
                        else if (cellData && cellData.status) statusHtml = cellData.status;

                        contentHtml += `<td class="st-memo">${memo}</td><td>${statusHtml}</td>`;
                    });
                    contentHtml += `</tr>`;
                }
                contentHtml += `</tbody></table></div>`;
            });
        } 
        // 다른 항목들 (이동, 취침, 교육점수)은 깔끔한 리스트로 유지
        else {
            contentHtml += '<ul style="list-style:none; padding:0; margin:0; line-height:2.0; font-size:14px; color:#34495e;">';
            if (type === 'move') {
                const { data } = await _supabase.from('move_log').select('*').eq('student_id', studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false});
                if (!data || data.length === 0) contentHtml += '<li>기록이 없습니다.</li>';
                else data.forEach(d => contentHtml += `<li style="border-bottom:1px solid #f1f2f6; padding:10px 0;"><span style="display:inline-block; width:130px; color:#7f8c8d;">${d.move_date} ${d.move_time}</span> <b>${d.reason}</b> <span style="color:#95a5a6; font-size:12px; margin-left:5px;">(복귀: ${d.return_period || '-'})</span></li>`);
            }
            else if (type === 'sleep') {
                const { data } = await _supabase.from('sleep_log').select('*').eq('student_id', studentId).order('sleep_date', {ascending: false});
                if (!data || data.length === 0) contentHtml += '<li>기록이 없습니다.</li>';
                else data.forEach(d => contentHtml += `<li style="border-bottom:1px solid #f1f2f6; padding:10px 0;"><span style="display:inline-block; width:100px; color:#7f8c8d;">${d.sleep_date}</span> <span style="display:inline-block; width:50px;">${d.period}교시</span> <b style="color:#8e44ad;">${d.count}회 적발</b></li>`);
            }
            else if (type === 'eduscore') {
                const { data } = await _supabase.from('edu_score_log').select('*').eq('student_id', studentId).order('score_date', {ascending: false});
                if (!data || data.length === 0) contentHtml += '<li>기록이 없습니다.</li>';
                else data.forEach(d => contentHtml += `<li style="border-bottom:1px solid #f1f2f6; padding:10px 0;"><span style="display:inline-block; width:100px; color:#7f8c8d;">${d.score_date}</span> <b>${d.reason}</b> <span style="color:#e74c3c; font-weight:bold; margin-left:10px;">+${EDU_SCORE_MAP[d.reason] || 0}점</span></li>`);
            }
            contentHtml += '</ul>';
        }

        contentArea.innerHTML = contentHtml;

    } catch (err) {
        contentArea.innerHTML = `
            <div style="text-align:center;">
                <h3 style="color:#e74c3c;">오류 발생</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
};
