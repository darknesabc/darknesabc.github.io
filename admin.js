// 1. 설정
const SUPABASE_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 기존 Apps Script API (상세 기록 조회용으로 남겨둠)
const API_BASE = "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

// 2. 메인 대시보드 그리기
async function renderDashboard(filterText = "") {
    let query = _supabase.from('student').select('*').order('seat_no', { ascending: true });

    // 검색어가 있으면 필터링
    if (filterText) {
        query = query.or(`name.ilike.%${filterText}%,seat_no.ilike.%${filterText}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error("데이터 로드 실패:", error);
        return;
    }

    const listDiv = document.getElementById('student-list');
    listDiv.innerHTML = `
        <div class="grid">
            ${data.map(s => {
                const penalty = Number(s.penalty_points || 0);
                let cardClass = "class-dash-card";
                if (penalty >= 15) cardClass += " card-danger";
                else if (penalty >= 10) cardClass += " card-warning";

                return `
                    <div class="${cardClass}" onclick="showStudentDetail('${s.student_id}', '${s.name}', '${s.seat_no}')">
                        <div class="badge-row">
                            <div class="db-badge ${s.status === '결석' ? 'b-danger' : 'b-warning'}">${s.status || '상태'}</div>
                            <div class="db-badge b-danger">${penalty}점</div>
                        </div>
                        <span class="muted">[${s.seat_no}]</span>
                        <strong style="display:block; margin:4px 0; font-size:16px;">${s.name || '빈자리'}</strong>
                        <span class="muted" style="font-size:12px;">${s.student_id || ''}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    updateRiskPanel(data);
}

// 3. 검색 처리
function handleSearch() {
    const text = document.getElementById('searchInput').value;
    renderDashboard(text);
}

// 4. 위험 학생 알림판 (admin (1).js 로직)
function updateRiskPanel(students) {
    const panel = document.getElementById('riskNoticePanel');
    const riskyOnes = students.filter(s => Number(s.penalty_points || 0) >= 10);
    
    if (riskyOnes.length > 0) {
        panel.style.display = "block";
        panel.innerHTML = `
            <div style="background: rgba(231, 76, 60, 0.08); border: 1px solid rgba(231, 76, 60, 0.2); border-radius: 14px; padding: 15px;">
                <b style="color:#ff4757; font-size:15px;">🚨 집중 관리 대상 (${riskyOnes.length}명)</b>
                <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">
                    ${riskyOnes.map(s => `
                        <span class="db-badge b-danger" style="cursor:pointer" onclick="showStudentDetail('${s.student_id}', '${s.name}', '${s.seat_no}')">
                            ${s.name}(${s.penalty_points}점)
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        panel.style.display = "none";
    }
}

// 5. 학생 상세 정보 보기 (모달 열기)
async function showStudentDetail(id, name, seat) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = `${name} 학생 상세 현황 (${seat})`;
    
    modal.style.display = "block";
    body.innerHTML = `<div class="muted">기록을 불러오는 중...</div>`;

    try {
        // 상세 기록(출결, 벌점 등)은 기존 Apps Script API를 활용하여 가져옵니다.
        // (수퍼베이스에는 현재 기본 정보만 있으므로)
        const res = await fetch(`${API_BASE}?path=admin_student_detail&studentId=${id}`);
        const data = await res.json();

        if (data.ok) {
            body.innerHTML = `
                <div class="grid">
                    <div class="card">
                        <div class="card-title">📅 출결 요약</div>
                        <div class="card-sub">출석률: ${data.summary.attendance.attRate}%</div>
                    </div>
                    <div class="card">
                        <div class="card-title">💯 벌점 내역</div>
                        <div class="card-sub">이번 달 누적: ${data.summary.eduscore.monthTotal}점</div>
                    </div>
                </div>
                <div class="hint" style="margin-top:15px;">
                    * 상세 로그는 기존 시스템의 기록을 실시간으로 가져옵니다.
                </div>
            `;
        } else {
            body.innerHTML = `<div class="msg">기록을 찾을 수 없습니다.</div>`;
        }
    } catch (e) {
        body.innerHTML = `<div class="msg">데이터 연결 오류가 발생했습니다.</div>`;
    }
}

function closeModal() {
    document.getElementById('modal').style.display = "none";
}

// 6. 실시간 구독
_supabase
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student' }, () => {
        renderDashboard(document.getElementById('searchInput').value);
    })
    .subscribe();

// 초기 로딩
renderDashboard();
