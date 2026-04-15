const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// 로그인 세션 유지용
let loggedInManager = localStorage.getItem('managerName');

// 현재 교시 확인 함수 (이전과 동일)
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

// 로그인 처리
async function handleLogin() {
    const id = document.getElementById('admin-id').value;
    const pw = document.getElementById('admin-pw').value;
    const { data, error } = await _supabase.from('managers').select('*').eq('manager_id', id).eq('password', pw).single();

    if (data) {
        localStorage.setItem('managerName', data.manager_name);
        location.reload();
    } else {
        document.getElementById('login-msg').innerText = "로그인 정보가 올바르지 않습니다.";
    }
}

// 로그아웃
function handleLogout() {
    localStorage.removeItem('managerName');
    location.reload();
}

async function init() {
    if (!loggedInManager) {
        document.getElementById('login-section').style.display = 'flex';
        return;
    }

    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('welcome-msg').innerText = `${loggedInManager} 선생님, 환영합니다`;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentP = getCurrentPeriod();
        summary.innerText = `현재 ${currentP}교시 현황판 (${today})`;

        // ⭐️ 핵심: 로그인한 선생님의 학생만 필터링해서 가져오기
        const { data: students } = await _supabase.from('student').select('*').eq('teacher_name', loggedInManager).order('seat_no');
        const { data: attendance } = await _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP);

        dashboard.innerHTML = '';
        students.forEach(s => {
            const log = attendance.find(a => a.student_id === s.student_id);
            const status = log ? log.status_code : "미입력";
            const memo = log ? log.memo : ""; // 아까 나눴던 메모 데이터 활용

            let typeClass = status.includes("1") ? "1" : (status.includes("3") ? "3" : "none");

            dashboard.innerHTML += `
                <div class="card status-${typeClass}">
                    <div class="seat">${s.seat_no}</div>
                    <div class="name">${s.name}</div>
                    <div class="status-badge badge-${typeClass}">${status}</div>
                    ${memo ? `<div style="font-size:12px; color:#3498db; margin-top:5px;">${memo}</div>` : ''}
                </div>
            `;
        });
    } catch (err) {
        summary.innerText = "❌ 데이터 로드 에러: " + err.message;
    }
}

init();
