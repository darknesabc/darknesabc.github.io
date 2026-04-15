const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let loggedInManager = localStorage.getItem('managerName');

// 교육점수 가중치 맵 (점수 계산용)
const EDU_SCORE_MAP = {
    "전자기기 부정사용": 10, "핸드폰 무단사용": 7, "해드폰 미제출": 7, "무단결석": 7, "무단이탈": 7,
    "타층/타관 무단출입": 5, "원내대화": 5, "무단지각": 5, "모의고사 무단 1회 미응시": 5,
    "취침강제하원(7회)": 3, "음식물섭취": 3, "입/퇴실 미준수": 3,
    "지각": 1, "자습 중 이동 태블릿 미입력": 1, "취침": 1
};

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

        // 1. 모든 데이터 병렬로 가져오기 (속도 최적화)
        const [resStudents, resAttendance, resSleep, resMove, resEdu] = await Promise.all([
            _supabase.from('student').select('*').eq('teacher_name', loggedInManager).order('seat_no'),
            _supabase.from('attendance').select('*').eq('attendance_date', today).eq('period', currentP),
            _supabase.from('sleep_log').select('*').eq('sleep_date', today),
            _supabase.from('move_log').select('*').eq('move_date', today).order('move_time', { ascending: false }),
            _supabase.from('edu_score_log').select('*') // 전체 누적 점수용
        ]);

        const students = resStudents.data.filter(s => s.name && s.name !== '배정금지');
        const attendance = resAttendance.data || [];
        const sleepLogs = resSleep.data || [];
        const moveLogs = resMove.data || [];
        const eduLogs = resEdu.data || [];

        dashboard.innerHTML = '';

        students.forEach(s => {
            // [출결] 현재 교시 상태
            const att = attendance.find(a => a.student_id === s.student_id);
            const attStatus = att ? att.status_code : "미입력";
            const attMemo = att ? att.memo : "";

            // [취침] 오늘 총 횟수 합산
            const todaySleep = sleepLogs.filter(sl => sl.student_id === s.student_id)
                                        .reduce((acc, cur) => acc + (cur.count || 1), 0);

            // [이동] 현재 '외출 중'인지 확인 (가장 최근 기록 기준)
            const lastMove = moveLogs.find(ml => ml.student_id === s.student_id);
            const isOut = lastMove && (lastMove.return_period === "복귀안함" || parseInt(lastMove.return_period) >= parseInt(currentP));
            const moveReason = isOut ? lastMove.reason : "";

            // [교육점수] 전체 누적 점수 계산
            const totalEduScore = eduLogs.filter(el => el.student_id === s.student_id)
                                         .reduce((acc, cur) => acc + (EDU_SCORE_MAP[cur.reason] || 0), 0);

            // 카드 색상 결정
            let cardClass = attStatus === "1" ? "status-1" : (attStatus === "3" ? "status-3" : "status-none");
            if (isOut) cardClass = "status-move"; // 이동 중이면 별도 색상(파란색 등) 표시 권장

            dashboard.innerHTML += `
                <div class="card ${cardClass}" style="position:relative; padding: 15px; border-radius: 12px; border: 1px solid #ddd; background: #fff; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div style="font-size: 11px; color: #7f8c8d;">${s.seat_no}</div>
                    <div style="font-size: 18px; font-weight: bold;">${s.name}</div>
                    
                    <div class="status-badge" style="padding: 4px 12px; border-radius: 20px; background: #f1f2f6; font-weight: bold;">
                        ${attStatus}
                    </div>

                    <div style="display: flex; gap: 5px; margin-top: 5px;">
                        ${todaySleep > 0 ? `<span title="오늘 취침 횟수" style="font-size:11px; background:#ffeaa7; padding:2px 5px; border-radius:4px;">💤 ${todaySleep}</span>` : ''}
                        ${totalEduScore > 0 ? `<span title="누적 교육점수" style="font-size:11px; background:#fab1a0; padding:2px 5px; border-radius:4px;">⭐ ${totalEduScore}</span>` : ''}
                    </div>

                    ${isOut ? `<div style="font-size:11px; color:#3498db; font-weight:bold;">🚶 ${moveReason}</div>` : ''}
                    ${attMemo ? `<div style="font-size:11px; color:#95a5a6; font-style:italic;">"${attMemo}"</div>` : ''}
                </div>
            `;
        });
    } catch (err) {
        summary.innerText = "❌ 데이터 로드 에러: " + err.message;
    }
}
