const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// 로그인 세션 및 역할(Role) 유지용
let loggedInManager = localStorage.getItem('managerName');
let loggedInRole = localStorage.getItem('managerRole'); // 💡 역할 정보 추가

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
            // 💡 이름과 역할을 로컬 스토리지에 함께 저장
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
    localStorage.removeItem('managerRole'); // 💡 역할 정보도 함께 삭제
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
    
    // 💡 역할에 따라 환영 메시지 다르게 표시
    const welcomeMsg = loggedInRole === 'super' ? '전체관리자 선생님, 환영합니다' : `${loggedInManager} 선생님, 환영합니다`;
    document.getElementById('welcome-msg').innerText = welcomeMsg;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentP = getCurrentPeriod();
        summary.innerText = `현재 ${currentP}교시 현황판 (${today})`;

        // 💡 ⭐️ 핵심: 전체 관리자일 경우 필터 없이 모든 학생 로드
        let studentQuery = _supabase.from('student').select('*');
        
        if (loggedInRole !== 'super') {
            // 일반 관리자(담임)일 때만 본인 반 학생으로 필터링
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
                <div class="card status-${statusColor}" style="position:relative; cursor:pointer;">
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

        // 💡 [핵심 추가 1] 상세페이지 연동을 위해 기존 코드 형식에 맞게 변환하여 주머니에 저장
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

            // 💡 [핵심 추가 2] onclick 이벤트에 window.__loadStudentDetail 함수 연결
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

// =========================================================
// 💡 학생 카드 클릭 시 화면 하단에 상세페이지를 펼쳐주는 함수
// =========================================================
window.__loadStudentDetail = async function(student) {
    if (!student || !student.studentId) return;

    // 1. 상세 내역을 보여줄 투명한 박스 찾기 (없으면 대시보드 아래에 새로 생성)
    let detailSection = document.getElementById('student-detail-section');
    if (!detailSection) {
        detailSection = document.createElement('div');
        detailSection.id = 'student-detail-section';
        detailSection.style.marginTop = '40px';
        detailSection.style.marginBottom = '60px';
        detailSection.style.padding = '25px';
        detailSection.style.backgroundColor = '#ffffff';
        detailSection.style.borderRadius = '12px';
        detailSection.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
        // admin-content(현황판)의 제일 아래쪽에 추가
        document.getElementById('admin-content').appendChild(detailSection);
    }

    // 2. 박스를 보이게 하고, "불러오는 중" 텍스트 띄운 후 화면 아래로 스크롤
    detailSection.style.display = 'block';
    detailSection.innerHTML = `<div style="text-align:center; padding:40px; font-size:18px; color:#34495e;">⏳ <b>${student.name}</b> 학생의 상세 데이터를 빛의 속도로 불러오는 중입니다...</div>`;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        // 3. 수퍼베이스에서 해당 학생의 '이동/교육점수/취침' 데이터를 동시에 싹 끌어옵니다! (매우 빠름)
        const [resMove, resEdu, resSleep] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}).limit(5),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}).limit(5)
        ]);

        const moveLogs = resMove.data || [];
        const eduLogs = resEdu.data || [];
        const sleepLogs = resSleep.data || [];

        // 총 벌점 자동 계산
        const totalScore = eduLogs.reduce((sum, log) => sum + (EDU_SCORE_MAP[log.reason] || 0), 0);

        // 4. 가져온 데이터를 보기 좋은 HTML 화면으로 조립합니다.
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f2f6; padding-bottom: 15px; margin-bottom: 25px;">
                <h2 style="margin: 0; color: #2c3e50;">🧑‍🎓 ${student.name} <span style="font-size:15px; color:#7f8c8d; font-weight:normal; margin-left:10px;">(학번: ${student.studentId} | 좌석: ${student.seat} | 담임: ${student.teacher})</span></h2>
                <button onclick="document.getElementById('student-detail-section').style.display='none'" style="padding: 8px 20px; border:none; background:#e74c3c; color:white; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border: 1px solid #e2e6ea;">
                    <h4 style="margin-top: 0; margin-bottom:15px; color: #2980b9; font-size:16px;">🚶 최근 이동 기록 (최대 5건)</h4>
                    <ul style="list-style:none; padding:0; margin:0; font-size:14px; line-height:1.8;">
                        ${moveLogs.length > 0 ? moveLogs.map(m => `
                            <li style="margin-bottom:12px; border-bottom:1px dashed #dfe6e9; padding-bottom:8px;">
                                <span style="display:inline-block; width:130px; color:#7f8c8d;">${m.move_date} ${m.move_time}</span> 
                                <b style="color:#2c3e50;">${m.reason}</b> 
                                <span style="font-size:12px; color:#95a5a6; margin-left:5px;">(복귀예정: ${m.return_period || '-'})</span>
                            </li>
                        `).join('') : '<li style="color:#95a5a6;">최근 이동 기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border: 1px solid #e2e6ea;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h4 style="margin: 0; color: #e67e22; font-size:16px;">⭐ 누적 교육점수(벌점)</h4>
                        <span style="background:#ffeaa7; color:#d35400; padding:4px 10px; border-radius:20px; font-weight:bold;">총 ${totalScore}점</span>
                    </div>
                    <ul style="list-style:none; padding:0; margin:0; font-size:14px; line-height:1.8; max-height:150px; overflow-y:auto; border-bottom:2px solid #ecf0f1; margin-bottom:15px; padding-bottom:15px;">
                        ${eduLogs.length > 0 ? eduLogs.map(e => `
                            <li style="margin-bottom:6px;">
                                <span style="color:#7f8c8d; margin-right:10px;">${e.score_date}</span> 
                                <b>${e.reason}</b> 
                                <span style="color:#e74c3c; font-size:12px; margin-left:5px;">(+${EDU_SCORE_MAP[e.reason]||0})</span>
                            </li>
                        `).join('') : '<li style="color:#95a5a6;">벌점 기록이 없습니다.</li>'}
                    </ul>
                    
                    <h4 style="margin-top: 0; margin-bottom:10px; color: #8e44ad; font-size:16px;">💤 최근 취침 기록 (최대 5건)</h4>
                    <ul style="list-style:none; padding:0; margin:0; font-size:14px; line-height:1.8;">
                        ${sleepLogs.length > 0 ? sleepLogs.map(s => `
                            <li><span style="color:#7f8c8d; margin-right:10px;">${s.sleep_date}</span> ${s.period}교시 <b style="color:#8e44ad;">(${s.count}회 적발)</b></li>
                        `).join('') : '<li style="color:#95a5a6;">최근 취침 기록이 없습니다.</li>'}
                    </ul>
                </div>
            </div>
        `;
        
        detailSection.innerHTML = html;

    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
}; // 🚨 3. 가장 마지막 줄! 이 닫는 괄호와 세미콜론이 반드시 있어야 합니다!
