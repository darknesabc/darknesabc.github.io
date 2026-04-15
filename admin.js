// 수퍼베이스에서 출결 데이터 가져오기 및 렌더링 함수
async function renderAttendanceDashboard() {
  const today = new Date().toISOString().split('T')[0]; // 2026-04-15 형식

  // 1. 학생 명렬과 오늘 출결 동시에 가져오기
  const [students, attendance] = await Promise.all([
    supabase.from('student').select('*').order('seat_no'),
    supabase.from('attendance').select('*').eq('attendance_date', today)
  ]);

  const dashboard = document.getElementById('dashboard');
  dashboard.innerHTML = '';

  // 2. 학생별로 출결 매칭하기
  students.data.forEach(student => {
    // 해당 학생의 오늘 모든 교시 기록 필터링
    const studentLogs = attendance.data.filter(log => log.student_id === student.student_id);
    
    // 가장 최신 교시의 상태 가져오기 (예: 8교시가 있으면 8교시 상태)
    const lastLog = studentLogs.sort((a, b) => b.period - a.period)[0];
    const statusText = lastLog ? lastLog.status_code : '미입력';

    // 3. 상태에 따른 카드 색상 결정
    let statusClass = 'status-normal';
    if (statusText === '3') statusClass = 'status-absent'; // 결석
    if (['영어과외', '병원', '학교'].includes(statusText)) statusClass = 'status-out'; // 외출

    // 4. 화면에 카드 그리기
    dashboard.innerHTML += `
      <div class="student-card ${statusClass}">
        <div class="seat-no">${student.seat_no}</div>
        <div class="student-name">${student.name || '빈자리'}</div>
        <div class="status-badge">${statusText}</div>
        <div class="info-row">${student.class_name} | ${student.teacher_name}</div>
      </div>
    `;
  });
}