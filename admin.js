const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// 1. 관리자님이 주신 시간표 설정
const SCHEDULE = [
  { p: "1", start: "08:00", end: "08:30" },
  { p: "2", start: "08:50", end: "10:10" },
  { p: "3", start: "10:30", end: "12:00" },
  { p: "4", start: "13:10", end: "14:30" },
  { p: "5", start: "14:50", end: "15:50" },
  { p: "6", start: "16:10", end: "17:30" },
  { p: "7", start: "18:40", end: "20:10" },
  { p: "8", start: "20:30", end: "22:00" }
];

// 현재 시간에 맞는 교시를 찾는 함수
function getCurrentPeriod() {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                        now.getMinutes().toString().padStart(2, '0');
    
    // 현재 시간보다 시작 시간이 빠른 교시들 중 가장 마지막 교시를 반환
    let currentP = SCHEDULE[0].p; 
    for (const slot of SCHEDULE) {
        if (currentTime >= slot.start) {
            currentP = slot.p;
        }
    }
    return currentP;
}

async function init() {
    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const now = new Date();
        const targetDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        
        const currentP = getCurrentPeriod(); // 현재 시간 기준 교시 (예: "5")
        summary.innerText = `현재 ${currentP}교시 현황판 (${targetDate})`;

        const { data: students } = await _supabase.from('student').select('*').order('seat_no');
        const { data: attendance } = await _supabase.from('attendance').select('*').eq('attendance_date', targetDate);

        dashboard.innerHTML = '';

        students.forEach(s => {
            const logs = attendance.filter(a => a.student_id === s.student_id);
            
            // ⭐️ 핵심 로직: 오직 '현재 교시'와 일치하는 데이터만 찾습니다.
            const currentLog = logs.find(l => l.period === currentP);
            
            // 데이터가 있으면 해당 값을, 없으면 무조건 "미입력" 표시
            const status = currentLog ? currentLog.status_code : "미입력";
            
            // 테두리 색상 결정
            let typeClass = "text"; 
            if (status.includes("1")) typeClass = "1";
            else if (status.includes("3")) typeClass = "3";
            else if (status === "미입력") typeClass = "none"; // 데이터 없을 때 스타일

            dashboard.innerHTML += `
                <div class="card status-${typeClass}">
                    <div class="seat">${s.seat_no}</div>
                    <div class="name">${s.name || '빈자리'}</div>
                    <div class="status-badge badge-${typeClass}">${status}</div>
                    <div style="font-size:11px; color:#aaa; margin-top:10px;">${s.teacher_name}</div>
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
        summary.innerText = "❌ 에러: " + err.message;
    }
}

init();
