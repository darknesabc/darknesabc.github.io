// 1. 수퍼베이스 설정 (여기를 꼭 관리자님 정보로 바꿔주세요!)
const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co"; 
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A"; 

// 수퍼베이스 클라이언트 생성
const _supabase = supabase.createClient(SB_URL, SB_KEY);

async function init() {
    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        // 테스트용 날짜 (오늘 날짜 데이터가 없으면 아무것도 안 뜰 수 있으니 시트에 있는 날짜로 고정)
        const targetDate = "2026-04-15"; 
        summary.innerText = `${targetDate} 데이터를 가져오는 중...`;

        // 2. 데이터 가져오기 (학생 명렬 + 출결 기록)
        const { data: students, error: sError } = await _supabase.from('student').select('*').order('seat_no');
        const { data: attendance, error: aError } = await _supabase.from('attendance').select('*').eq('attendance_date', targetDate);

        if (sError || aError) throw (sError || aError);

        // 3. 화면 그리기
        dashboard.innerHTML = '';
        
        if (!students || students.length === 0) {
            summary.innerText = "학생 데이터가 없습니다. student 테이블을 확인하세요.";
            return;
        }

        students.forEach(s => {
            // 이 학생의 오늘 기록들 찾기
            const logs = attendance.filter(a => a.student_id === s.student_id);
            // 가장 늦은 교시 기록 선택
            const lastLog = logs.sort((a, b) => b.period - a.period)[0];
            
            const status = lastLog ? lastLog.status_code : "미입력";
            
            // 상태별 색상 구분 로직
            let typeClass = "text"; 
            if (status.includes("1")) typeClass = "1";
            else if (status.includes("3")) typeClass = "3";

            dashboard.innerHTML += `
                <div class="card status-${typeClass}">
                    <div class="seat">${s.seat_no || '좌석미정'}</div>
                    <div class="name">${s.name || '빈자리'}</div>
                    <div class="status-badge badge-${typeClass}">${status}</div>
                    <div style="font-size:11px; color:#aaa; margin-top:10px;">${s.teacher_name || ''}</div>
                </div>
            `;
        });

        summary.innerText = `${targetDate} 출결 현황판 (총 ${students.length}명)`;

    } catch (err) {
        console.error(err);
        summary.innerText = "❌ 에러 발생: " + err.message;
        summary.style.color = "red";
    }
}

// 실행!
init();
