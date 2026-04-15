// 1. 수퍼베이스 설정
const SUPABASE_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. 화면에 학생 그리드 그리기 함수
async function renderDashboard() {
    const { data, error } = await _supabase
        .from('student')
        .select('*')
        .order('seat_no', { ascending: true });

    if (error) {
        console.error("데이터 로드 실패:", error);
        return;
    }

    const listDiv = document.getElementById('student-list');
    
    // 관리자님이 주신 CSS 구조(.grid > .class-dash-card)를 그대로 사용합니다.
    listDiv.innerHTML = `
        <div class="grid">
            ${data.map(s => {
                // 벌점에 따른 스타일 (15점 이상 위험, 10점 이상 경고)
                const penalty = Number(s.penalty_points || 0);
                let cardClass = "class-dash-card";
                if (penalty >= 15) cardClass += " card-danger";
                else if (penalty >= 10) cardClass += " card-warning";

                return `
                    <div class="${cardClass}" onclick="alert('${s.name} 학생 상세 정보를 봅니다.')">
                        <div class="badge-row">
                            <div class="db-badge ${s.status === '결석' ? 'b-danger' : 'b-warning'}">${s.status || '상태'}</div>
                            <div class="db-badge b-danger">${penalty}점</div>
                        </div>
                        <span class="muted">[${s.seat_no}]</span>
                        <strong style="display:block; margin:4px 0; font-size:16px;">${s.name || '빈자리'}</strong>
                        <span class="muted" style="font-size:12px;">${s.student_id}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // 벌점 높은 학생 알림판 업데이트 로직 (간략화)
    updateRiskPanel(data);
}

// 3. 위험 학생 알림판 업데이트
function updateRiskPanel(students) {
    const panel = document.getElementById('riskNoticePanel');
    const riskyOnes = students.filter(s => Number(s.penalty_points) >= 10);
    
    if (riskyOnes.length > 0) {
        panel.style.display = "block";
        panel.innerHTML = `
            <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid #ff4757; border-radius: 12px; padding: 15px;">
                <b style="color:#ff4757;">🚨 집중 관리 대상 (${riskyOnes.length}명)</b>
                <div style="margin-top:8px;">
                    ${riskyOnes.map(s => `<span style="margin-right:10px;">${s.name}(${s.penalty_points}점)</span>`).join('')}
                </div>
            </div>
        `;
    } else {
        panel.style.display = "none";
    }
}

// 4. 실시간 감시 (데이터 바뀌면 즉시 다시 그리기)
_supabase
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student' }, () => {
        console.log('데이터 변경 감지! 화면 갱신합니다.');
        renderDashboard();
    })
    .subscribe();

// 처음 접속 시 실행
renderDashboard();
