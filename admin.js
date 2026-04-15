// 1. Supabase 설정 (아까 복사해둔 주소와 키를 넣으세요)
const SUPABASE_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SUPABASE_KEY = "sb_publishable_T9CnSuoTX52psrp5vZbYuA_6ZTCTlZM";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. 화면에 명단 그리기 함수
async function fetchAndRender() {
    const { data, error } = await _supabase
        .from('student')
        .select('*')
        .order('seat_no', { ascending: true }); // 자리번호 순 정렬

    if (error) {
        console.error("데이터 로드 실패:", error);
        return;
    }

    const listDiv = document.getElementById('student-list');
    listDiv.innerHTML = data.map(s => `
        <div class="student-card">
            <span>[${s.seat_no}]</span> 
            <strong>${s.name || '빈자리'}</strong> 
            <span>${s.status}</span>
        </div>
    `).join('');
}

// 3. 실시간 감시 시작 (확성기 소리 듣기)
_supabase
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student' }, (payload) => {
        console.log('변경 감지! 화면 갱신합니다.');
        fetchAndRender(); // 데이터 바뀌면 즉시 다시 그리기
    })
    .subscribe();

// 처음 페이지 열릴 때 실행
fetchAndRender();
