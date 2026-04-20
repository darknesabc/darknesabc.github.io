const SB_URL = "https://kqxhxrbpxwdmuvcyhcua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeGh4cmJweHdkbXV2Y3loY3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc4MzQsImV4cCI6MjA5MTcyMzgzNH0.Y_esLcGduxQteKUsbcwuqUKiGMMM8ItjyZFwpI2cu2A";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let loggedInManager = localStorage.getItem('managerName');
let loggedInRole = localStorage.getItem('managerRole'); 
let loggedInId = localStorage.getItem('managerId');

// 💡 글로벌 상태 변수
window.__currentSortMode = 'seat'; // 기본값: 자리순
window.__radarCurrentType = 'unit'; // 레이더 차트 (단원별/행동영역별)
window.__radarCurrentSubj = null;   // 레이더 차트 (선택된 과목)
window.__examTypeToggles = {
    '더프': false,
    '오메가': false,
    '전대실모': false,
    '평가원': false
};

// 💡 [여기에 추가!] 30% 컷 및 과목 토글 글로벌 상태 명시적 선언
window.__toggles = { topTotal: false, topChoice: false, topClass: false, topHS: false, topGreen: false, topBlue: false, topMed: false, topSKY: false };
window.__subjectToggles = { kor: true, math: true, tam1: true, tam2: true, eng: true };

// 시험 라벨에서 종류를 추출하는 도우미 함수
const getExamType = (label) => {
    if (label.includes('더프')) return '더프';
    if (label.includes('오메가')) return '오메가';
    if (label.includes('전대실모')) return '전대실모';
    if (label.includes('평가원') || label.includes('6월') || label.includes('9월') || label.includes('수능')) return '평가원'; // 👈 추가
    return '기타';
};

// =========================================================
// 💡 [신규 기능] 전체(누적) 보기 토글 함수
// =========================================================
window.__isCumulativeRadar = false; // 기본값은 '해당 시험만 보기'

window.__toggleCumulativeRadar = function() {
    window.__isCumulativeRadar = !window.__isCumulativeRadar;
    // 토글 후 현재 보고 있는 시험 기준으로 다시 데이터 로드 (내부적으로 누적 합산)
    window.__loadGradeErrata(window.__currentSummaryExam); 
};

// 💡 숫자 추출 도구 및 강제 순서표
const getSafeNum = (val) => {
    if (typeof val === 'number') return val;
    const match = String(val || "").match(/\d+/); 
    return match ? parseInt(match[0], 10) : 9999;
};

const KOR_UNIT_ORDER = {
    '인문': 1, '사회': 2, '과학': 3, '기술': 4, '예술': 5, '독서이론': 6, '융합': 7,
    '현대시': 8, '현대소설': 9, '고전시가': 10, '고전소설': 11, '수필': 12, '극': 13, '갈래복합': 14,
    '화법': 15, '작문': 16, '언어': 15, '매체': 16
};

const EDU_SCORE_MAP = {
    "전자기기 부정사용": 10, "핸드폰 무단사용": 7, "해드폰 미제출": 7, "무단결석": 7, "무단이탈": 7,
    "타층/타관 무단출입": 5, "원내대화": 5, "무단지각": 5, "모의고사 무단 1회 미응시": 5,
    "취침강제하원(7회)": 3, "음식물섭취": 3, "입/퇴실 미준수": 3,
    "지각": 1, "자습 중 이동 태블릿 미입력": 1, "취침": 1
};

// =========================================================
// 💡 [신규 기능] 스마트 알림판 숨김(✅) 처리 및 복구(✕), 상세 보기(🔗)
// =========================================================
window.__ackAlert = function(studentId, category, currentValue) {
    const el = document.getElementById(`alert-badge-${studentId}-${category}`);
    if (el) {
        // 부드럽게 사라지는 애니메이션
        el.style.transition = 'all 0.3s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.8)';
    }
    // 애니메이션 후 로컬스토리지에 저장하고 화면 새로고침(보관함으로 이동)
    setTimeout(() => {
        let ackData = JSON.parse(localStorage.getItem('smartAlertAck') || '{}');
        ackData[`${studentId}_${category}`] = { timestamp: Date.now(), valueAtAck: currentValue };
        localStorage.setItem('smartAlertAck', JSON.stringify(ackData));
        init(); 
    }, 300);
};

window.__undoAlert = function(studentId, category) {
    // 숨김 기록에서 삭제하고 즉시 원상복구
    let ackData = JSON.parse(localStorage.getItem('smartAlertAck') || '{}');
    delete ackData[`${studentId}_${category}`];
    localStorage.setItem('smartAlertAck', JSON.stringify(ackData));
    init(); 
};

window.__openDetailFromAlert = function(studentId) {
    // 💡 원클릭 연동: 알림판에서 이름 클릭 시 딜레이 없이 바로 상세 페이지 오픈!
    if (!window.__allStudentsData) return;
    const s = window.__allStudentsData.find(x => x.student_id === studentId);
    if (s) {
        const studentObj = { seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name, className: s.class_name };
        window.__loadStudentDetail(studentObj);
    }
};

// =========================================================
// 💡 [신규 기능] 담임별 보기 시 특정 반 접기/펴기 함수
// =========================================================
window.__toggleTeacherGroup = function(groupId) {
    const cards = document.querySelectorAll('.' + groupId);
    const icon = document.getElementById('icon-' + groupId);
    if (cards.length === 0) return;
    
    // 첫 번째 카드의 상태를 보고 현재 접혀있는지 펴져있는지 판단
    const isCurrentlyHidden = cards[0].style.display === 'none';
    
    cards.forEach(card => {
        if (isCurrentlyHidden) {
            // 펴기: display를 먼저 살리고, 찰나의 지연 후 투명도/크기 복구 (부드러운 애니메이션)
            card.style.display = ''; 
            setTimeout(() => { 
                card.style.opacity = '1'; 
                card.style.transform = 'scale(1)'; 
            }, 10);
        } else {
            // 접기: 투명도/크기를 먼저 줄이고, 애니메이션이 끝나면 display: none 처리
            card.style.opacity = '0'; 
            card.style.transform = 'scale(0.95)';
            setTimeout(() => { 
                card.style.display = 'none'; 
            }, 200); 
        }
    });
    
    // 헤더의 화살표 아이콘(▼/◀) 회전 애니메이션
    if (icon) {
        icon.style.transform = isCurrentlyHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
};

// =========================================================
// 1. 공통 유틸리티 (로그인, 로그아웃, 시간)
// =========================================================
async function handleLogin() {
    const id = document.getElementById('admin-id').value.trim();
    const pw = document.getElementById('admin-pw').value.trim();
    const loginMsg = document.getElementById('login-msg');
    
    if (!id || !pw) { loginMsg.innerText = "아이디와 비밀번호를 모두 입력해주세요."; return; }

    try {
        const { data, error } = await _supabase.from('managers').select('*').eq('manager_id', id).eq('password', pw).maybeSingle();
        if (error) throw error;
        if (data) {
            localStorage.setItem('managerName', data.manager_name);
            localStorage.setItem('managerRole', data.role);
            localStorage.setItem('managerId', data.manager_id);
            location.reload(); 
        } else { loginMsg.innerText = "로그인 정보가 올바르지 않습니다."; }
    } catch (err) { loginMsg.innerText = "에러: " + err.message; }
}

function handleLogout() { localStorage.clear(); location.reload(); }

// =========================================================
// 💡 [추가 기능] 출결 데이터 1000개 제한 해제 헬퍼 함수
// =========================================================
window.__fetchAllAttendance = async function(studentId) {
    let allData = [];
    let fetchMore = true;
    let startIdx = 0;
    
    while (fetchMore) {
        const { data, error } = await _supabase
            .from('attendance')
            .select('*')
            .eq('student_id', studentId)
            .order('attendance_date', { ascending: false })
            .range(startIdx, startIdx + 999);

        if (error) throw error;
        
        if (data && data.length > 0) {
            allData = allData.concat(data);
            startIdx += 1000;
            // 1000개 미만으로 가져왔다면 마지막 페이지이므로 루프 종료
            if (data.length < 1000) fetchMore = false;
        } else {
            fetchMore = false;
        }
    }
    // Promise.all 형식에 맞추기 위해 객체 형태로 반환
    return { data: allData };
};

// =========================================================
// 💡 [업그레이드] 최근 N일치 데이터 1000개 무제한 가져오기 (스마트 알림판용)
// =========================================================
window.__fetchRecentData = async function(tableName, dateCol, startDate) {
    let allData = [];
    let fetchMore = true;
    let startIdx = 0;
    
    while (fetchMore) {
        let query = _supabase.from(tableName).select('*').gte(dateCol, startDate).range(startIdx, startIdx + 999);
        
        // 출결 데이터는 꼬이지 않게 학생/교시 순으로 고정 정렬
        if (tableName === 'attendance') {
            query = query.order('student_id', { ascending: true }).order('period', { ascending: true });
        }
        
        const { data, error } = await query;
        if (error) { console.error(`${tableName} 로드 에러:`, error); break; }
        
        if (data && data.length > 0) {
            allData = allData.concat(data);
            startIdx += 1000;
            if (data.length < 1000) fetchMore = false;
        } else {
            fetchMore = false;
        }
    }
    return { data: allData };
};

window.__fetchAllEduScores = async function() {
    let allData = [];
    let fetchMore = true;
    let startIdx = 0;
    while (fetchMore) {
        const { data, error } = await _supabase
            .from('edu_score_log')
            .select('*')
            // 🚨 [필수 추가] 누락 방지용 정렬 기준
            .order('score_date', { ascending: false })
            .order('score_time', { ascending: false })
            .range(startIdx, startIdx + 999);
        if (error) break;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            startIdx += 1000;
            if (data.length < 1000) fetchMore = false;
        } else {
            fetchMore = false;
        }
    }
    return { data: allData };
};

// =========================================================
// 💡 [추가 기능] 엔터키 로그인 지원
// =========================================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        // 로그인 섹션이 현재 화면에 보이고 있는 상태인지 확인
        const loginSection = document.getElementById('login-section');
        if (loginSection && loginSection.style.display !== 'none') {
            handleLogin();
        }
    }
});

function getCurrentPeriod() {
    const SCHEDULE = [
        { p: "1", start: "08:00", end: "08:30" }, { p: "2", start: "08:50", end: "10:10" },
        { p: "3", start: "10:30", end: "12:00" }, { p: "4", start: "13:10", end: "14:30" },
        { p: "5", start: "14:50", end: "15:50" }, { p: "6", start: "16:10", end: "17:30" },
        { p: "7", start: "18:40", end: "20:10" }, { p: "8", start: "20:30", end: "22:00" }
    ];
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    for (let i = 0; i < SCHEDULE.length; i++) {
        if (currentTime < SCHEDULE[i].end) return SCHEDULE[i].p;
    }
    return "8"; 
}

// =========================================================
// 💡 [추가 기능] 시간 -> 교시 변환 헬퍼 함수 (지각 계산용)
// =========================================================
window.__getPeriodFromTime = function(timeStr) {
    if (!timeStr) return 1;
    const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m;
    if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
    if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
    if (t < 20*60+10) return 7; return 8;
};

// =========================================================
// 💡 [신규 기능] 교육점수(벌점) 데이터 전처리 헬퍼
// 휴먼 에러 중복 방지(Set) 및 '취침' 당일 합산 특수 처리
// =========================================================
window.__processEduScores = function(rawEduData) {
    if (!rawEduData || !Array.isArray(rawEduData)) return [];
    
    const seen = new Set();
    const sleepAgg = {};
    const processed = [];

    rawEduData.forEach(el => {
        const score = EDU_SCORE_MAP[el.reason] || 0;
        // DB 스크린샷 기준 return_period에 교시가 들어갈 수도 있으므로 호환성 추가
        const period = el.period || el.return_period || window.__getPeriodFromTime(el.score_time) || "1";
        
        if (el.reason === '취침') {
            // 💡 [해결 포인트] 취침은 교시/시간 입력 없이 횟수로 연타하는 경우가 많음.
            // 따라서 까다로운 중복 검사(seen)를 패스하고, 무조건 날짜 기준으로 합산(Agg)시킵니다!
            const aggKey = `${el.student_id}_${el.score_date}`;
            if (!sleepAgg[aggKey]) {
                sleepAgg[aggKey] = { ...el, sleepCount: 1, calculated_score: score };
            } else {
                sleepAgg[aggKey].sleepCount += 1;
                sleepAgg[aggKey].calculated_score += score;
            }
        } else {
            // 💡 다른 일반 벌점(지각 등)은 날짜+시간+사유+점수+교시가 완전 동일하면 휴먼 에러로 간주해 차단
            const dedupKey = `${el.student_id}_${el.score_date}_${el.score_time}_${el.reason}_${score}_${period}`;
            
            if (seen.has(dedupKey)) return; // 이미 본 데이터면 무시!
            seen.add(dedupKey);

            // 통과한 벌점만 추가
            processed.push({ ...el, calculated_score: score, display_reason: el.reason });
        }
    });

    // 병합된 취침 데이터를 배열에 다시 삽입
    Object.values(sleepAgg).forEach(sleepObj => {
        sleepObj.display_reason = sleepObj.sleepCount > 1 ? `취침 (${sleepObj.calculated_score}점)` : `취침`;
        processed.push(sleepObj);
    });

    // 최신순으로 정렬 (날짜 내림차순 -> 시간 내림차순)
    processed.sort((a, b) => {
        if (a.score_date !== b.score_date) return a.score_date > b.score_date ? -1 : 1;
        const tA = a.score_time || "00:00";
        const tB = b.score_time || "00:00";
        return tA > tB ? -1 : 1;
    });

    return processed;
};

// =========================================================
// 2. 메인 화면 초기화 (바둑판 카드)
// =========================================================
async function init() {
    if (!loggedInManager) {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
        return;
    }
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('welcome-msg').innerText = `${loggedInManager} 선생님, 환영합니다`;

    const dashboard = document.getElementById('dashboard');
    const summary = document.getElementById('status-summary');

    try {
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const isSunday = new Date(today).getDay() === 0; 
        const currentP = getCurrentPeriod();

        // 💡 [신규] 7일 전 날짜 계산
        const start7d = new Date(now);
        start7d.setDate(start7d.getDate() - 6);
        const start7dIso = new Date(start7d.getTime() - (start7d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]

        summary.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:15px;">
                <div style="font-size:18px; font-weight:bold; color:#2c3e50;">현재 ${currentP}교시 현황판 (${today})</div>
                <div style="display:flex; gap:5px; background:#eee; padding:4px; border-radius:8px;">
                    <button onclick="window.__changeSort('seat')" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; ${window.__currentSortMode==='seat'?'background:#2c3e50; color:white;':'background:transparent; color:#7f8c8d;'}">자리순</button>
                    <button onclick="window.__changeSort('name')" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; ${window.__currentSortMode==='name'?'background:#2c3e50; color:white;':'background:transparent; color:#7f8c8d;'}">이름순</button>
                    
                    ${(loggedInId === 'admin_4F' || loggedInRole === 'super') ? `<button onclick="window.__changeSort('teacher')" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; ${window.__currentSortMode==='teacher'?'background:#2c3e50; color:white;':'background:transparent; color:#7f8c8d;'}">담임별</button>` : ''}
                    
                    <button id="dashboard-fold-btn" onclick="window.__toggleDashboard()" style="padding:6px 15px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; background:#7f8c8d; color:white; margin-left:10px;">바둑판 접기 ⬆</button>
                </div>
            </div>
        `;

        let query = _supabase.from('student').select('*');
        if (loggedInId === 'admin_4F') {
            query = query.ilike('seat_no', '4-%'); 
        }
        else if (loggedInRole !== 'super') {
            query = query.eq('teacher_name', loggedInManager);
        }

        const [resStudents, resAtt, resSleep, resMove, resEduRaw, resSurvey] = await Promise.all([
            query,
            window.__fetchRecentData('attendance', 'attendance_date', start7dIso),
            window.__fetchRecentData('sleep_log', 'sleep_date', start7dIso),
            window.__fetchRecentData('move_log', 'move_date', start7dIso),
            window.__fetchAllEduScores(),
            window.__fetchRecentData('survey_log', 'survey_date', start7dIso)
        ]);

        window.__allStudentsData = resStudents.data; // 💡 원클릭 상세 조회를 위해 전체 학생 명단 보관

        const processedEduData = window.__processEduScores(resEduRaw.data);
        let students = resStudents.data.filter(s => s.name && s.name !== '배정금지');

        if (window.__currentSortMode === 'name') {
            students.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        } else if (window.__currentSortMode === 'teacher') {
            // 💡 [신규] 담임별 정렬 로직
            students.sort((a, b) => {
                const tA = a.teacher_name || '미배정';
                const tB = b.teacher_name || '미배정';
                if (tA === tB) return a.name.localeCompare(b.name, 'ko'); // 같은 반이면 이름순 정렬
                return tA.localeCompare(tB, 'ko');
            });
        } else {
            students.sort((a, b) => a.seat_no.localeCompare(b.seat_no, undefined, {numeric: true}));
        }

        window.__dashboardItems = students.map(s => ({ seat: s.seat_no, studentId: s.student_id, name: s.name, teacher: s.teacher_name, className: s.class_name }));

        dashboard.innerHTML = '';
        const curPInt = parseInt(currentP, 10);
        
        window.__currentTeacherLabel = null; 
        let teacherIdx = 0; // 💡 [신규] 반별로 고유 번호를 매겨서 묶기 위한 변수

        // 🚨 [스마트 기능] 숨김 기록 확인 함수
        const ackData = JSON.parse(localStorage.getItem('smartAlertAck') || '{}');
        const checkAlertStatus = (studentId, category, currentValue) => {
            const ack = ackData[`${studentId}_${category}`];
            if (!ack) return true; 
            
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - ack.timestamp > SEVEN_DAYS) return true; 
            if (currentValue > ack.valueAtAck) return true; // 💡 더 나빠지면 강제 재소환!
            
            return false;
        };

        // 🚨 알림판 리스트 및 📦 보관함 리스트
        let alertEdu = [], alertAbs = [], alertLate = [], alertSleep = [], alertNoReturn = [];
        let ackedList = []; // 확인 완료된 학생 보관함

        const pushAlert = (condition, list, val, unit, cat, catLabel, s) => {
            if (condition) {
                const item = { id: s.student_id, name: s.name, val: val, unit: unit, cat: cat, catLabel: catLabel };
                if (checkAlertStatus(s.student_id, cat, val)) list.push(item);
                else ackedList.push(item); // 숨김 처리된 학생은 보관함으로 이동
            }
        };

        students.forEach(s => {
            const stAtts7d = resAtt.data.filter(a => a.student_id === s.student_id);
            const stSleep7d = resSleep.data.filter(sl => sl.student_id === s.student_id);
            const stMove7d = resMove.data.filter(ml => ml.student_id === s.student_id);
            const stSurvey7d = resSurvey.data.filter(sv => sv.student_id === s.student_id);
            const stEduAll = processedEduData.filter(el => el.student_id === s.student_id);

            const stAttsToday = stAtts7d.filter(a => a.attendance_date === today);
            const att = stAttsToday.find(a => String(a.period) === String(currentP));
                        
            let schedMap7d = {};
            stEduAll.forEach(ed => {
                if (ed.score_date >= start7dIso && ed.score_date <= today && ed.reason.includes('지각')) {
                    const sp = window.__getPeriodFromTime(ed.score_time);
                    if (!schedMap7d[ed.score_date]) schedMap7d[ed.score_date] = {};
                    schedMap7d[ed.score_date][sp] = schedMap7d[ed.score_date][sp] ? schedMap7d[ed.score_date][sp] + ` / ${ed.display_reason}` : ed.display_reason;
                }
            });
            stSurvey7d.forEach(sv => {
                const dStr = sv.survey_date; const timeType = sv.arrival_time_type || ""; let startP = 0, endP = 0;
                if (timeType.includes("결석")) { startP = 1; endP = 8; } else if (timeType.includes("오전")) { startP = 1; endP = 3; } else if (timeType.includes("오후")) { startP = 1; endP = 6; } else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 1; endP = 7; }
                if (startP > 0) { if (!schedMap7d[dStr]) schedMap7d[dStr] = {}; for(let p=startP; p<=endP; p++) schedMap7d[dStr][p] = `[설문]`; }
            });
            stMove7d.forEach(mv => { 
                // 💡 [추가] 화장실 가거나, '취소'된 일정은 스케줄 칸을 차지하지 않도록 무시!
                if (mv.reason === "화장실/정수기" || mv.reason.includes("취소")) return; 
                
                const dStr = mv.move_date; 
                let rp = parseInt(mv.return_period, 10) || 0; 
                if (mv.return_period === "복귀안함") rp = 8; 

                const sp = window.__getPeriodFromTime(mv.move_time); 
                
                if (mv.reason.includes("상담") || String(mv.return_period).includes("-")) {
                    rp = sp;
                }

                if (rp > 8) rp = 8; 

                if (rp > 0) { 
                    const start = sp > 0 ? sp : rp; 
                    if (!schedMap7d[dStr]) schedMap7d[dStr] = {}; 
                    for(let p=start; p<=rp; p++) schedMap7d[dStr][p] = schedMap7d[dStr][p] ? schedMap7d[dStr][p] + ` / ${mv.reason}` : mv.reason; 
                } 
            });

            // 💡 [추가] 배지 띄울 때도 '취소'된 기록은 대상에서 제외!
            const movesTodayList = stMove7d.filter(ml => ml.move_date === today && ml.reason !== "화장실/정수기" && !ml.reason.includes("취소"));
            movesTodayList.sort((a, b) => (b.move_time || "").localeCompare(a.move_time || "")); // 최신순(내림차순) 정렬
            
            let validMove = "";
            for (let mv of movesTodayList) {
                let rp = parseInt(mv.return_period, 10) || 0;
                if (mv.return_period === "복귀안함") rp = 8;
                const sp = window.__getPeriodFromTime(mv.move_time);
                
                // 💡 [핵심 추가 2] 상담이거나, 복귀 교시에 날짜(-)가 잘못 입력된 경우 무조건 시작 교시 1칸으로 고정!
                if (mv.reason.includes("상담") || String(mv.return_period).includes("-")) {
                    rp = sp;
                }

                if (rp > 8) rp = 8; 
                
                // 지금 현재 교시(curPInt)가 이동 시작교시(sp) ~ 복귀교시(rp) 사이에 있다면?
                if (curPInt >= sp && curPInt <= rp) {
                    validMove = mv.reason;
                    break; 
                }
            }

            let abs7dCount = 0, late7dCount = 0, todayAbsenceCount = 0;

            stAtts7d.forEach(a => {
                const isToday = a.attendance_date === today;
                if (a.attendance_date > today || (isToday && parseInt(a.period, 10) > currentP)) return;
                if (new Date(a.attendance_date).getDay() === 0) return;

                const p = parseInt(a.period, 10);
                const extraMemo = schedMap7d[a.attendance_date]?.[p] || '';
                const baseMemo = a.memo ? a.memo.trim() : '';
                const combinedMemo = extraMemo || (baseMemo !== '-' ? baseMemo : '');

                const isLate = a.status_code === '2' || extraMemo.includes('지각') || baseMemo.includes('지각');
                const hasValidMemo = combinedMemo !== '';
                const isExcused = (a.status_code === '3') && !isLate && hasValidMemo; 
                const isAbs = (a.status_code === '3') && !isLate && !isExcused;

                if (isLate) late7dCount++;
                if (isAbs) {
                    abs7dCount++;
                    if (isToday && p < curPInt) todayAbsenceCount++;
                }
            });

            const sleep7dCount = stSleep7d.reduce((sum, sl) => sum + sl.count, 0);
            const noReturn7dCount = stMove7d.filter(m => m.return_period === '복귀안함').length;
            const totalEduScore = stEduAll.reduce((sum, el) => sum + el.calculated_score, 0);

            // 🚨 스마트 배분 (위험/경고 명단 vs 보관함)
            pushAlert(totalEduScore >= 10, alertEdu, totalEduScore, '점', 'edu', '벌점', s);
            pushAlert(abs7dCount >= 3, alertAbs, abs7dCount, '회', 'abs', '결석', s);
            pushAlert(late7dCount >= 2, alertLate, late7dCount, '회', 'late', '지각', s);
            pushAlert(sleep7dCount >= 3, alertSleep, sleep7dCount, '회', 'sleep', '취침', s);
            pushAlert(noReturn7dCount >= 3, alertNoReturn, noReturn7dCount, '회', 'noreturn', '복귀안함', s);

            // --- 당일 바둑판 카드 그리기 ---
            const todaySleep = stSleep7d.filter(sl => sl.sleep_date === today).reduce((acc, cur) => acc + (cur.count || 1), 0);
            const todayRestroomCount = stMove7d.filter(ml => ml.move_date === today && ml.reason === "화장실/정수기").length;

            let latePeriods = new Set();
            if (!isSunday) {
                stAttsToday.forEach(a => { if (a.status_code === '2' || (a.memo && a.memo.includes('지각'))) latePeriods.add(String(a.period)); });
                stEduAll.filter(el => el.score_date === today && el.reason.includes('지각')).forEach(el => {
                    const sp = window.__getPeriodFromTime(el.score_time); if (sp) latePeriods.add(String(sp));
                });
            }
            const todayLateCount = latePeriods.size;

            let surveyReason = "";
            if (schedMap7d[today]?.[curPInt]?.includes('[설문]')) {
                // 💡 화장실 등 다른 사유와 섞여 있을 경우를 대비해 [설문]이 포함된 텍스트 덩어리만 정확히 뽑아냅니다.
                surveyReason = schedMap7d[today][curPInt].split(' / ').find(item => item.includes('[설문]')).trim();
            }
            let status = "미입력", sub = "", color = "none", code = att ? att.status_code : "";
            if (code === "1") { status = "출석"; color = "1"; sub = validMove || surveyReason || (att ? att.memo : ""); }
            else if (validMove) { status = validMove; color = "move"; }
            else if (surveyReason) { status = surveyReason; color = "schedule"; }
            else if (att && att.memo) { status = att.memo; color = "schedule"; }
            else { status = code === "3" ? "결석" : (code === "2" ? "지각" : "미입력"); color = code || "none"; }

            let absBadge = '';
            if (todayAbsenceCount >= 6) absBadge = `<span style="background:#e74c3c; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:900;">❌위험(${todayAbsenceCount})</span>`;
            else if (todayAbsenceCount >= 3) absBadge = `<span style="background:#e67e22; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;">❌경고(${todayAbsenceCount})</span>`;
            else if (todayAbsenceCount > 0) absBadge = `<span style="background:#fadedb; color:#e74c3c; padding:1px 4px; border-radius:3px; font-size:12px; font-weight:bold;">❌${todayAbsenceCount}</span>`;

            let sleepBadge = '';
            if (todaySleep >= 6) sleepBadge = `<span style="background:#c0392b; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:900;">💤위험(${todaySleep})</span>`;
            else if (todaySleep >= 3) sleepBadge = `<span style="background:#f39c12; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;">💤경고(${todaySleep})</span>`;
            else if (todaySleep > 0) sleepBadge = `<span style="background:#ffeaa7; color:#d35400; padding:1px 4px; border-radius:3px; font-size:12px;">💤${todaySleep}</span>`;

            let eduBadge = '';
            if (totalEduScore >= 15) eduBadge = `<span style="background:#6c3483; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:900;">🚨위험(${totalEduScore})</span>`;
            else if (totalEduScore >= 10) eduBadge = `<span style="background:#af7ac5; color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;">🚨경고(${totalEduScore})</span>`;
            else if (totalEduScore > 0) eduBadge = `<span style="background:#fab1a0; color:#c0392b; padding:1px 4px; border-radius:3px; font-size:12px;">🚨${totalEduScore}</span>`;

            // 💡 담임별 정렬일 때 꽉 차는 그룹 헤더(구분선) 삽입! (클릭 토글 기능 추가)
            if (window.__currentSortMode === 'teacher' && window.__currentTeacherLabel !== s.teacher_name) {
                window.__currentTeacherLabel = s.teacher_name || '미배정';
                teacherIdx++; // 새로운 반이 나올 때마다 번호 1 증가
                const tCount = students.filter(x => (x.teacher_name || '미배정') === window.__currentTeacherLabel).length;
                
                dashboard.innerHTML += `
                    <div onclick="window.__toggleTeacherGroup('teacher-group-${teacherIdx}')" style="grid-column: 1 / -1; cursor:pointer; background:#34495e; color:#fff; padding:8px 15px; border-radius:8px; font-weight:bold; font-size:14px; margin-top:15px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); transition:0.2s;" onmouseover="this.style.background='#2c3e50'" onmouseout="this.style.background='#34495e'">
                        <span style="display:flex; align-items:center; gap:8px;">
                            👨‍🏫 ${window.__currentTeacherLabel} 선생님 반 
                            <span style="font-size:11px; font-weight:normal; opacity:0.7; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px;">클릭하여 접기/펴기</span>
                        </span>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="background:rgba(255,255,255,0.2); padding:2px 10px; border-radius:12px; font-size:12px;">총 ${tCount}명</span>
                            <span id="icon-teacher-group-${teacherIdx}" style="font-size:12px; transition:transform 0.3s; transform:rotate(0deg);">▼</span>
                        </div>
                    </div>
                `;
            }

            // 💡 [신규] 카드 껍데기에 반별 고유 클래스(teacher-group-번호)를 붙여줍니다.
            const groupClass = window.__currentSortMode === 'teacher' ? `teacher-group-${teacherIdx}` : '';
            
            dashboard.innerHTML += `
                <div class="card status-${color} ${groupClass}" style="position:relative; cursor:pointer; transition: opacity 0.2s, transform 0.2s;" onclick="window.__loadStudentDetail(window.__dashboardItems.find(x => x.studentId === '${s.student_id}'))">
                    <div class="seat" style="font-size:11px; opacity:0.7;">${s.seat_no}</div>
                    <div class="name" style="font-size:18px; margin: 5px 0;">${s.name}</div>
                    <div class="status-badge badge-${color}" style="font-size:13px; font-weight:900; display: inline-block; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; line-height: 1.4; padding: 2px 8px; margin: 2px auto;">
                        ${status}
                    </div>
                    ${sub ? `<div style="font-size:11px; color:#2c3e50; font-weight:bold; margin-top:4px; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">${sub}</div>` : ''}
                    <div style="display:flex; gap:3px; margin-top:5px; justify-content:center; flex-wrap:wrap;">
                        ${absBadge}
                        ${todayLateCount > 0 ? `<span style="background:#fef5e7; color:#e67e22; padding:1px 4px; border-radius:3px; font-size:12px; font-weight:bold;">⏰${todayLateCount}</span>` : ''}
                        ${todayRestroomCount > 0 ? `<span style="background:#e0f7fa; color:#0097a7; padding:1px 4px; border-radius:3px; font-size:12px; font-weight:bold;">💧${todayRestroomCount}</span>` : ''}
                        ${sleepBadge}
                        ${eduBadge}
                    </div>
                </div>
            `;
        });

        // 🚨 알림판 UI 렌더러 (이름 클릭 🔗 연동)
        const buildAlertRow = (title, icon, items, color, bgColor) => {
            if (items.length === 0) return '';
            return `
                <div style="background:${bgColor}; border-left:5px solid ${color}; border-radius:8px; padding:12px 18px; margin-bottom:10px; display:flex; align-items:flex-start; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <div style="font-weight:900; color:${color}; font-size:14px; white-space:nowrap; min-width:140px;">${icon} ${title}</div>
                    <div style="font-size:13px; color:#2c3e50; line-height:1.6; flex:1; display:flex; flex-wrap:wrap; gap:6px;">
                        ${items.map(i => `
                            <span id="alert-badge-${i.id}-${i.cat}" style="background:rgba(255,255,255,0.7); border:1px solid rgba(0,0,0,0.05); padding:4px 10px; border-radius:15px; display:inline-flex; align-items:center; gap:4px; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.02); transition:0.2s;">
                                <a href="javascript:void(0);" onclick="window.__openDetailFromAlert('${i.id}')" style="color:inherit; text-decoration:underline; text-underline-offset:2px;">${i.name}</a> 
                                <span style="color:#e74c3c;">(${i.val}${i.unit})</span>
                                <span onclick="window.__ackAlert('${i.id}', '${i.cat}', ${i.val})" title="확인 완료 (7일 숨김)" style="cursor:pointer; margin-left:2px; font-size:11px; opacity:0.4; transition:0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">✅</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        let alertHtml = '';
        alertHtml += buildAlertRow('누적 벌점 주의', '🚨', alertEdu, '#8e44ad', '#f4ecf7');
        alertHtml += buildAlertRow('최근 결석 주의 (7일)', '❌', alertAbs, '#e74c3c', '#fdedec');
        alertHtml += buildAlertRow('최근 지각 주의 (7일)', '⏰', alertLate, '#e67e22', '#fef5e7');
        alertHtml += buildAlertRow('최근 취침 주의 (7일)', '💤', alertSleep, '#f39c12', '#fcf3cf');
        alertHtml += buildAlertRow('복귀 안 함 주의 (7일)', '🚶', alertNoReturn, '#27ae60', '#e9f7ef');

        // 📦 보관함 UI 렌더러
        let ackedHtml = '';
        if (ackedList.length > 0) {
            ackedHtml = `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #bdc3c7;">
                    <div onclick="const el = document.getElementById('acked-alert-list'); el.style.display = el.style.display === 'none' ? 'flex' : 'none';" style="cursor:pointer; color:#7f8c8d; font-size:13px; font-weight:bold; display:flex; align-items:center; gap:5px; transition:0.2s;" onmouseover="this.style.color='#2c3e50'" onmouseout="this.style.color='#7f8c8d'">
                        ▶ ✔️ 확인 완료된 학생 보관함 펼치기 (${ackedList.length}건)
                    </div>
                    <div id="acked-alert-list" style="display:none; flex-wrap:wrap; gap:8px; margin-top:12px; padding:15px; background:#f8f9fa; border-radius:8px; border:1px solid #ecf0f1; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);">
                        ${ackedList.map(i => `
                            <span style="background:#fff; border:1px solid #dee2e6; padding:4px 12px; border-radius:15px; display:inline-flex; align-items:center; gap:4px; font-size:12px; color:#7f8c8d; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                                <span style="font-size:11px; background:#ecf0f1; padding:2px 6px; border-radius:4px; color:#95a5a6; margin-right:2px;">${i.catLabel}</span>
                                <a href="javascript:void(0);" onclick="window.__openDetailFromAlert('${i.id}')" style="color:#2c3e50; font-weight:bold; text-decoration:underline; text-underline-offset:2px;">${i.name}</a>
                                <span style="opacity:0.8; color:#e74c3c; font-weight:bold;">(${i.val}${i.unit})</span>
                                <span onclick="window.__undoAlert('${i.id}', '${i.cat}')" title="숨김 해제 (원상복구)" style="cursor:pointer; margin-left:4px; font-size:12px; transition:0.2s;" onmouseover="this.style.color='#e74c3c'" onmouseout="this.style.color='#7f8c8d'">✕</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let alertContainer = document.getElementById('smart-alert-container');
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'smart-alert-container';
            dashboard.parentNode.insertBefore(alertContainer, dashboard);
        }
        
        if (alertHtml || ackedHtml) {
            alertContainer.innerHTML = `
                <div style="margin-bottom:25px; padding:20px; background:#ffffff; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.05); border:1px solid #ecf0f1;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; color:#2c3e50; font-size:17px; display:flex; align-items:center; gap:8px;">📌 집중 관리 대상 (스마트 알림판)</h3>
                        <button id="smart-alert-toggle-btn" onclick="window.__toggleSmartAlert()" style="background:#7f8c8d; color:white; border:none; padding:6px 15px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; transition:0.2s;">알림판 접기 ⬆</button>
                    </div>
                    <div id="smart-alert-content" style="margin-top:15px;">
                        ${alertHtml}
                        ${ackedHtml}
                    </div>
                </div>
            `;
            alertContainer.style.display = 'block';
        } else {
            alertContainer.style.display = 'none';
        }

    } catch (err) { summary.innerText = "에러: " + err.message; }
}

window.__changeSort = function(mode) { 
    window.__currentSortMode = mode; 
    init(); 
};

window.__toggleDashboard = function() {
    const dashboard = document.getElementById('dashboard');
    const mainFoldBtn = document.getElementById('dashboard-fold-btn');
    const detailFoldBtn = document.getElementById('fold-button');
    
    if (dashboard.style.display === 'none') {
        dashboard.style.display = 'grid';
        if (mainFoldBtn) { mainFoldBtn.innerText = '바둑판 접기 ⬆'; mainFoldBtn.style.background = '#7f8c8d'; }
        if (detailFoldBtn) { detailFoldBtn.innerText = '바둑판 접기 ⬆'; detailFoldBtn.style.background = '#2c3e50'; }
    } else {
        dashboard.style.display = 'none';
        if (mainFoldBtn) { mainFoldBtn.innerText = '바둑판 펴기 ⬇'; mainFoldBtn.style.background = '#27ae60'; }
        if (detailFoldBtn) { detailFoldBtn.innerText = '바둑판 펴기 ⬇'; detailFoldBtn.style.background = '#27ae60'; }
    }
};

// 👇👇👇 [여기서부터 새로 추가!] 👇👇👇
// =========================================================
// 💡 [신규 기능] 스마트 알림판 접기/펴기 함수
// =========================================================
window.__toggleSmartAlert = function() {
    const content = document.getElementById('smart-alert-content');
    const btn = document.getElementById('smart-alert-toggle-btn');
    if (!content || !btn) return;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.innerText = '알림판 접기 ⬆';
        btn.style.background = '#7f8c8d'; // 회색
    } else {
        content.style.display = 'none';
        btn.innerText = '알림판 펴기 ⬇';
        btn.style.background = '#27ae60'; // 초록색
    }
};

// =========================================================
// 3. 학생 상세 페이지 로드 (스케줄 메모 = 공결 자동 인식 버전)
// =========================================================
window.__loadStudentDetail = async function(student) {
    if (!student || !student.studentId) return;

    let detailSection = document.getElementById('student-detail-section');
    if (!detailSection) {
        detailSection = document.createElement('div');
        detailSection.id = 'student-detail-section';
        detailSection.style.cssText = 'margin-top:40px; margin-bottom:60px; padding:25px; background:#f8f9fa; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 8px 24px rgba(0,0,0,0.05);';
        document.getElementById('admin-content').appendChild(detailSection);
    }
    detailSection.style.display = 'block';
    detailSection.innerHTML = `<div style="text-align:center; padding:50px; font-size:18px; color:#7f8c8d;">⏳ <b>${student.name}</b> 학생의 통합 데이터를 불러오는 중입니다...</div>`;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        // 💡 1. resEdu -> resEduRaw 로 이름 변경
        const [resMove, resEduRaw, resSleep, resAtt, resSurvey] = await Promise.all([
            _supabase.from('move_log').select('*').eq('student_id', student.studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}),
            _supabase.from('edu_score_log').select('*').eq('student_id', student.studentId).order('score_date', {ascending: false}),
            _supabase.from('sleep_log').select('*').eq('student_id', student.studentId).order('sleep_date', {ascending: false}),
            window.__fetchAllAttendance(student.studentId), // 1000개 무제한 함수
            _supabase.from('survey_log').select('*').eq('student_id', student.studentId)
        ]);

        // 💡 2. [에러 해결!] 여기서 교육점수를 헬퍼 함수에 통과시켜 processedEduData 변수를 만듭니다.
        const processedEduData = window.__processEduScores(resEduRaw.data);

        const now = new Date();
        const todayIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const start7d = new Date(now);
        start7d.setDate(start7d.getDate() - 6);
        const start7dIso = new Date(start7d.getTime() - (start7d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const currentP = parseInt(getCurrentPeriod(), 10) || 0;

        const formatShortDate = (dateStr) => {
            const d = new Date(dateStr); const days = ['일','월','화','수','목','금','토'];
            return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
        };

        const getPeriodFromTime = (timeStr) => {
            if (!timeStr) return 1;
            const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m;
            if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3;
            if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6;
            if (t < 20*60+10) return 7; return 8;
        };

        // =========================================================================
        // 💡 요약 패널에서도 모달창처럼 모든 스케줄을 합쳐서 공결 판단
        // =========================================================================
        const schedMap = {};
        
        // 💡 3. 교육점수 (지각) 반영 시 resEdu.data 대신 processedEduData 사용
        processedEduData.forEach(ed => {
            if (ed.reason.includes('지각')) {
                const dStr = ed.score_date; 
                const sp = getPeriodFromTime(ed.score_time);
                if (!schedMap[dStr]) schedMap[dStr] = {};
                schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.display_reason}` : ed.display_reason;
            }
        });

        // 2. 설문(Survey) 스케줄 반영
        resSurvey.data.forEach(sv => {
            const dStr = sv.survey_date; 
            const timeType = sv.arrival_time_type || ""; 
            let startP = 0, endP = 0;
            if (timeType.includes("결석")) { startP = 1; endP = 8; } 
            else if (timeType.includes("오전")) { startP = 1; endP = 3; } 
            else if (timeType.includes("오후")) { startP = 1; endP = 6; } 
            else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 1; endP = 7; }
            
            if (startP > 0) { 
                if (!schedMap[dStr]) schedMap[dStr] = {}; 
                for(let p=startP; p<=endP; p++) schedMap[dStr][p] = schedMap[dStr][p] ? schedMap[dStr][p] + ` / [설문]` : `[설문]`; 
            }
        });

        // 3. 이동(Move) 스케줄 반영 (복귀안함 등)
        resMove.data.forEach(mv => { 
            // 💡 [추가] 상세 모달창 달력에서도 '취소'된 일정은 무시!
            if (mv.reason === "화장실/정수기" || mv.reason.includes("취소")) return; 
            
            const dStr = mv.move_date; 
            let rp = parseInt(mv.return_period, 10) || 0; 
            if (mv.return_period === "복귀안함") rp = 8; 
            
            const sp = getPeriodFromTime(mv.move_time); 
            
            if (mv.reason.includes("상담") || String(mv.return_period).includes("-")) {
                rp = sp;
            }

            if (rp > 8) rp = 8; 

            if (!schedMap[dStr]) schedMap[dStr] = {}; 
            if (rp > 0) { 
                const start = sp > 0 ? sp : rp; 
                for(let p=start; p<=rp; p++) schedMap[dStr][p] = mv.reason; 
            } else { 
                const targetP = sp > 0 ? sp : 1; 
                schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason; 
            } 
        });
        
        let totalAtt = 0, totalLate = 0, totalAbs = 0, totalExcused = 0;
        let att7d = 0, late7d = 0, abs7d = 0, excused7d = 0;
        const recentAbsences = [];
        
        resAtt.data.forEach(a => {
            if (a.attendance_date > todayIso || (a.attendance_date === todayIso && parseInt(a.period, 10) > currentP)) return;
            if (new Date(a.attendance_date).getDay() === 0) return; // 일요일 제외

            const p = parseInt(a.period, 10);
            
            // 종합 스케줄 맵(설문, 이동, 교육점수)에서 해당 교시의 메모가 있는지 확인
            const extraMemo = schedMap[a.attendance_date]?.[p] || '';
            const baseMemo = a.memo ? a.memo.trim() : '';
            const combinedMemo = extraMemo || (baseMemo !== '-' ? baseMemo : '');

            const hasEduLate = extraMemo.includes('지각');
            const hasMemoLate = baseMemo.includes('지각');
            const isLate = (a.status_code === '2') || hasEduLate || hasMemoLate;
            
            // 💡 [핵심 수정 로직] 결석(3)이면서, DB메모 또는 설문/이동 스케줄(combinedMemo)이 존재하면 공결로 인정!
            const hasValidMemo = combinedMemo !== '';
            const isExcused = (a.status_code === '3') && !isLate && hasValidMemo; 
            
            const isAtt = (a.status_code === '1');
            const isAbs = (a.status_code === '3') && !isLate && !isExcused; // 진정한 무단결석만 남김

            let finalType = '';
            if (isExcused) finalType = 'excused'; 
            else if (isLate) finalType = 'late';
            else if (isAbs) finalType = 'abs';
            else if (isAtt) finalType = 'att';
            
            // =========================================================================
            // 💡 [여기까지 교체] 하단의 누적 카운트 로직(totalAtt++ 등)은 그대로 두시면 됩니다.
            // =========================================================================

            // 전체 카운트 누적
            if (finalType === 'att') totalAtt++;
            if (finalType === 'late') totalLate++;
            if (finalType === 'excused') totalExcused++;
            if (finalType === 'abs') { 
                totalAbs++; 
                if (recentAbsences.length < 3) recentAbsences.push(a); 
            }
            
            // 7일 카운트 누적
            if (a.attendance_date >= start7dIso && a.attendance_date <= todayIso) {
                if (finalType === 'att') att7d++;
                if (finalType === 'late') late7d++;
                if (finalType === 'excused') excused7d++;
                if (finalType === 'abs') abs7d++;
            }
        });
        
        // 공결(excused)은 출석률 모수에서 완전히 제외
        const totalCount = totalAtt + totalLate + totalAbs; 
        const count7d = att7d + late7d + abs7d;
        
        const attRate = totalCount > 0 ? Math.round((totalAtt / totalCount) * 100) : 100;
        const attRate7d = count7d > 0 ? Math.round((att7d / count7d) * 100) : 100;
        
        const attRate7dColor = attRate7d >= 90 ? '#2ecc71' : (attRate7d >= 70 ? '#f39c12' : '#e74c3c');

        let restroom7d = 0, noReturn7d = 0;
        resMove.data.forEach(m => {
            if (m.move_date >= start7dIso && m.move_date <= todayIso) {
                if (m.reason === "화장실/정수기") restroom7d++;
                if (m.return_period === "복귀안함") noReturn7d++;
            }
        });

        let sleepCount7d = 0;
        const sleepDaysSet = new Set();
        resSleep.data.forEach(s => {
            if (s.sleep_date >= start7dIso && s.sleep_date <= todayIso) {
                sleepCount7d += s.count; sleepDaysSet.add(s.sleep_date);
            }
        });

        const totalScore = processedEduData.reduce((sum, log) => sum + log.calculated_score, 0);

        const cardStyle = "background:#ffffff; padding:20px; border-radius:10px; border:1px solid #e2e6ea; position:relative; color:#2c3e50; box-shadow:0 2px 8px rgba(0,0,0,0.02);";
        const btnStyle = "position:absolute; right:20px; top:20px; background:#f1f2f6; color:#57606f; border:1px solid #dfe4ea; padding:5px 12px; border-radius:5px; font-size:12px; cursor:pointer; font-weight:bold;";

        let html = `
            <div style="border-bottom: 2px solid #e9ecef; padding-bottom: 20px; margin-bottom: 25px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="margin: 0 0 10px 0; color: #2c3e50; font-size:24px;">${student.name} ${attRate < 80 ? `<span style="font-size:14px; color:#e74c3c; background:rgba(231,76,60,0.1); padding:3px 8px; border-radius:4px; margin-left:10px;">🚨 출결위험 (${attRate}%)</span>` : ''}</h2>
                        <div style="color:#7f8c8d; font-size:14px; line-height:1.6;">
                            좌석: <b style="color:#34495e;">${student.seat}</b> | 학번: <b style="color:#34495e;">${student.studentId}</b> | 담임: <b style="color:#34495e;">${student.teacher}</b>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="fold-button" onclick="window.__toggleDashboard()" style="background:#2c3e50; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">바둑판 접기 ⬆</button>
                        <button onclick="document.getElementById('student-detail-section').style.display='none'; document.getElementById('dashboard').style.display='grid'; document.getElementById('status-summary').style.display='block';" style="background:#7f8c8d; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">닫기 ✖</button>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                
                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('attendance', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #2980b9; font-size:16px;">📅 출결 요약</h4>
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">최근 7일 출석률</span><span style="color:${attRate7dColor}; font-size:18px;">${attRate7d}%</span>
                        </div>
                        <div style="width:100%; height:8px; background:#ecf0f1; border-radius:4px; margin-bottom:10px; overflow:hidden;"><div style="width:${attRate7d}%; height:100%; background:${attRate7dColor}; border-radius:4px;"></div></div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${att7d}</b></span><span>지각 <b style="color:#f39c12;">${late7d}</b></span><span>결석 <b style="color:#e74c3c;">${abs7d}</b></span><span style="color:#bdc3c7;">공결 <b>${excused7d}</b></span>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#34495e; margin-bottom:8px;">
                            <span style="font-size:15px;">전체 누적 출석률</span><span style="color:#2980b9; font-size:16px;">${attRate}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:13px; color:#7f8c8d; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">
                            <span>출석 <b style="color:#34495e;">${totalAtt}</b></span><span>지각 <b style="color:#f39c12;">${totalLate}</b></span><span>결석 <b style="color:#e74c3c;">${totalAbs}</b></span><span style="color:#bdc3c7;">공결 <b>${totalExcused}</b></span>
                        </div>
                    </div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 무단 결석:</div>
                    <ul style="margin:0; padding-left:15px; font-size:13px; color:#e74c3c; line-height:1.8;">
                        ${recentAbsences.length > 0 ? recentAbsences.map(a => `<li>${formatShortDate(a.attendance_date)} ${a.period}교시</li>`).join('') : '<li style="color:#95a5a6; list-style:none; margin-left:-15px;">최근 결석이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('move', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #27ae60; font-size:16px;">🚶 이동 요약 <span style="font-size:12px; color:#95a5a6; font-weight:normal;">(최근 7일)</span></h4>
                    <div style="margin-bottom:8px;">화장실 : <b>${restroom7d}회</b></div>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">복귀 안함 : <b>${noReturn7d}회</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${resMove.data.slice(0,3).length > 0 ? resMove.data.slice(0,3).map(m => `<li><span style="color:#95a5a6; margin-right:8px;">${m.move_date.slice(5)}</span> <b>${m.reason}</b></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('sleep', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #8e44ad; font-size:16px;">💤 취침 요약</h4>
                    <div style="margin-bottom:8px;">최근 7일 취침일수: <b>${sleepDaysSet.size}일</b></div>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">최근 7일 취침횟수: <b>${sleepCount7d}회</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${resSleep.data.slice(0,3).length > 0 ? resSleep.data.slice(0,3).map(s => `<li><span style="color:#95a5a6; margin-right:8px;">${s.sleep_date.slice(5)}</span> ${s.period}교시 <span style="color:#8e44ad; font-weight:bold;">(${s.count}회)</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                    </ul>
                </div>

                <div style="${cardStyle}">
                    <button style="${btnStyle}" onclick="window.__openDetailModal('eduscore', '${student.studentId}', '${student.name}')">상세</button>
                    <h4 style="margin: 0 0 15px 0; color: #e67e22; font-size:16px;">🚨 교육점수 요약</h4>
                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ecf0f1;">전체 누적점수: <b style="color:#d35400; font-size:18px;">${totalScore}점</b></div>
                    <div style="font-size:12px; color:#95a5a6; margin-bottom:8px;">최근 항목:</div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:13px; line-height:1.8;">
                        ${processedEduData.slice(0,3).length > 0 ? processedEduData.slice(0,3).map(e => `<li><span style="color:#95a5a6; margin-right:8px;">${e.score_date.slice(5)}</span> <b>${e.display_reason}</b> <span style="color:#e74c3c; font-weight:bold;">(+${e.calculated_score})</span></li>`).join('') : '<li style="color:#95a5a6;">기록이 없습니다.</li>'}
                   </ul>
                </div>

            </div>

            <div id="grade-trend-container"></div>
            <div id="grade-summary-container"></div>
        `;
        detailSection.innerHTML = html;
        window.__loadGradeTrend(student);

    } catch (err) {
        detailSection.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:30px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// =========================================================
// 4. 성적 요약 UI
// =========================================================
window.__loadGradeTrend = async function(student) {
    const trendContainer = document.getElementById('grade-trend-container');
    if (!trendContainer) return;
    try {
        // 💡 [수정] 1,000건 제한 없이 모든 성적 데이터를 불러오는 로직
        let allScores = [];
        let fetchMore = true;
        let startIdx = 0;

        while (fetchMore) {
            const { data, error } = await _supabase
                .from('mock_scores')
                .select('*')
                .order('created_at', { ascending: true })
                .range(startIdx, startIdx + 999);

            if (error) throw error;
            if (data && data.length > 0) {
                allScores = allScores.concat(data);
                startIdx += 1000;
                if (data.length < 1000) fetchMore = false;
            } else {
                fetchMore = false;
            }
        }

        if (allScores.length === 0) return;

        window.__allMockScores = allScores;
        window.__currentStudentScores = allScores.filter(s => s.student_id === student.studentId);
        window.__currentStudentClass = student.className || ''; 

        if (window.__currentStudentScores.length === 0) {
            trendContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#95a5a6; background:#fff; border-radius:12px; border:1px solid #dee2e6; margin-top:20px;">등록된 성적 데이터가 없습니다.</div>';
            return;
        }

        window.__currentSummaryExam = window.__currentStudentScores[window.__currentStudentScores.length - 1].exam_label;
        window.__renderGradeSummaryUI();
        window.__loadGradeErrata(window.__currentSummaryExam);

        window.__currentGradeMode = 'pct'; window.__currentViewMode = 'graph'; 
        window.__renderGradeTrendUI();
    } catch (err) { console.error("성적 로드 에러:", err); }
};

// =========================================================
// 💡 1. 성적 요약 UI (시뮬레이션 열기 버튼 추가)
// =========================================================
window.__renderGradeSummaryUI = function() {
    const container = document.getElementById('grade-summary-container');
    if (!container) return;
    const scores = window.__currentStudentScores;
    const optionsHtml = scores.map(s => `<option value="${s.exam_label}" ${s.exam_label === window.__currentSummaryExam ? 'selected' : ''}>${s.exam_label} 성적</option>`).join('');
    
    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 4px 6px rgba(0,0,0,0.02); margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h4 style="margin:0; color:#2c3e50;">📊 성적 요약</h4>
                    <select onchange="window.__changeSummaryExam(this.value)" style="padding:6px 12px; border-radius:6px; border:1px solid #dee2e6; background:#f8f9fa; font-weight:bold; cursor:pointer;">${optionsHtml}</select>
                </div>
                <button onclick="window.__openUnivSimulation()" style="background:#1e272e; color:#fff; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 4px 6px rgba(0,0,0,0.1); transition:0.2s;">
                    🎯 정시 지원 시뮬레이션 보드 열기
                </button>
            </div>
            
            <div id="grade-summary-table-area"></div>
            
            <div id="univ-simulation-area" style="display:none; margin-top:20px;"></div>
            
            <div style="margin-top:30px; padding-top:25px; border-top:1px dashed #dee2e6;">
                <h4 style="margin:0 0 15px 0; color:#2c3e50;">🕸️ 취약 영역 분석 <span style="font-size:12px; color:#7f8c8d; font-weight:normal;">(점 클릭 시 세부영역 확인)</span></h4>
                <div id="vulnerability-area"><div style="text-align:center; color:#95a5a6; padding:20px;">데이터 분석 중...</div></div>
            </div>

            <div style="margin-top:25px; padding-top:20px; border-top:1px dashed #dee2e6;">
                <h4 style="margin:0 0 15px 0; color:#2c3e50;">🎯 정오표 상세 분석</h4>
                <div id="grade-errata-area"></div>
            </div>
        </div>
    `;
    window.__renderGradeSummaryTable();
};

// =========================================================
// 💡 [수퍼베이스 완벽 이식판] 정시 지원 시뮬레이션 보드 렌더러
// 🌟 (최종) 하극상 차단 + 터치 지원 툴팁 + 가산점 절대 % 변환
// 🌟 (추가) 동일 대학 내 본교(서울) ↔ 분교 정렬 순서 보정
// 🌟 (수정) 반영비 유불리(🟢/🔴) 배지 삭제 (백분위 모드 최적화)
// =========================================================
window.__openUnivSimulation = async function() {
    const area = document.getElementById('univ-simulation-area');
    if (area.style.display === 'block') { area.style.display = 'none'; return; }
    
    area.style.display = 'block';
    area.innerHTML = `<div style="text-align:center; padding:50px; background:#fff; color:#3498db; font-weight:bold; border-radius:12px; border:1px solid #dee2e6;">⏳ 마스터 배치표 데이터를 끝까지 불러오는 중입니다... (잠시만 기다려주세요)</div>`;

    const score = window.__currentStudentScores.find(s => s.exam_label === window.__currentSummaryExam) || {};
    const korPct = Number(score.kor_exp_pct) || 0;
    const mathPct = Number(score.math_exp_pct) || 0;
    const t1 = Number(score.tam1_exp_pct) || 0;
    const t2 = Number(score.tam2_exp_pct) || 0;
    
    let tamCount = 0, sciCount = 0, socCount = 0;
    const sciSubjs = ["물리학", "화학", "생명과학", "지구과학", "물리", "생명", "지학"];
    const socSubjs = ["생활과윤리", "생윤", "윤리와사상", "윤사", "한국지리", "한지", "세계지리", "세지", "동아시아사", "동사", "세계사", "세사", "경제", "정치와법", "정법", "사회문화", "사문"];
    
    const tam1Name = String(score.tam1_name || "").replace(/\s+/g, "");
    const tam2Name = String(score.tam2_name || "").replace(/\s+/g, "");
    
    if (t1 > 0) { tamCount++; if (sciSubjs.some(s => tam1Name.includes(s))) sciCount++; if (socSubjs.some(s => tam1Name.includes(s))) socCount++; }
    if (t2 > 0) { tamCount++; if (sciSubjs.some(s => tam2Name.includes(s))) sciCount++; if (socSubjs.some(s => tam2Name.includes(s))) socCount++; }
    
    const mathChoice = String(score.math_choice || "").replace(/\s+/g, "");
    const mathType = (mathChoice.includes("미적") || mathChoice.includes("기하")) ? "미기" : "확통";
    const tamType = (sciCount > 0 && socCount === 0) ? "과탐" : (socCount > 0 && sciCount === 0) ? "사탐" : "사과탐";

    // 최고/최저 제외 절사평균 함수
    const calcAdvancedAvg = (scoresArray) => {
        const validScores = scoresArray.filter(s => s > 0);
        const count = validScores.length;
        if (count === 0) return 0;
        if (count >= 4) {
            validScores.sort((a, b) => a - b);
            validScores.pop(); 
            validScores.shift(); 
            const sum = validScores.reduce((a, b) => a + b, 0);
            return sum / validScores.length;
        } else {
            const sum = validScores.reduce((a, b) => a + b, 0);
            return sum / count;
        }
    };

    // 💡 툴팁을 위한 과목별 유효 응시 횟수 카운팅
    const allKorScores = (window.__currentStudentScores || []).map(s => Number(s.kor_exp_pct) || 0).filter(s => s > 0);
    const allMathScores = (window.__currentStudentScores || []).map(s => Number(s.math_exp_pct) || 0).filter(s => s > 0);
    const allT1Scores = (window.__currentStudentScores || []).map(s => Number(s.tam1_exp_pct) || 0).filter(s => s > 0);
    const allT2Scores = (window.__currentStudentScores || []).map(s => Number(s.tam2_exp_pct) || 0).filter(s => s > 0);

    const kCnt = allKorScores.length;
    const mCnt = allMathScores.length;
    const t1Cnt = allT1Scores.length;
    const t2Cnt = allT2Scores.length;

    const tooltipMsg = `국(${kCnt}회) 수(${mCnt}회) 탐1(${t1Cnt}회) 탐2(${t2Cnt}회) 누적평균<br>※ 4회 이상 응시 과목은 최고/최저 제외`;

    const avgKorPct = calcAdvancedAvg(allKorScores);
    const avgMathPct = calcAdvancedAvg(allMathScores);
    const avgT1Pct = calcAdvancedAvg(allT1Scores);
    const avgT2Pct = calcAdvancedAvg(allT2Scores);

    window.__currentSimStatus = {
        scoreMode: 'current',
        streamFilter: '전체', 
        scoreDiff: 0,
        search: ""
    };

    try {
        let cutoffs = [];
        let fetchMore = true; 
        let startIdx = 0;
        
        while(fetchMore) {
            const { data, error } = await _supabase.from('univ_cutoffs').select('*').range(startIdx, startIdx + 999);
            if (error) throw new Error("배치표 DB 로드 실패: " + error.message);
            
            if (data && data.length > 0) { 
                cutoffs = cutoffs.concat(data); 
                startIdx += 1000; 
                if(data.length < 1000) fetchMore = false; 
            } else {
                fetchMore = false;
            }
        }

        if (cutoffs.length === 0) throw new Error("DB에 배치표 데이터가 존재하지 않습니다.");

        area.innerHTML = `
            <div style="background:#fff; border-radius:12px; overflow:hidden; border:1px solid #dee2e6; box-shadow:0 6px 12px rgba(0,0,0,0.04); margin-top:20px;">
                <div style="background:#fff; border-bottom:2px solid #dee2e6; display:flex; justify-content:space-between; padding:18px 25px; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="color:#2c3e50; font-weight:900; font-size:17px; display:flex; align-items:center; gap:8px;">
                        🎯 정시 지원 시뮬레이션 <span style="font-size:12px; color:#7f8c8d; font-weight:normal;">(가산점 완벽 변환 및 터치 툴팁 적용)</span>
                    </div>
                    <div style="background:#e8f4f8; border:1px solid #3498db; color:#2980b9; padding:6px 15px; font-weight:bold; font-size:13px; border-radius:6px;">
                        실제 응시: <span style="color:#e74c3c; margin-left:4px;">${mathType}+${tamType}</span>
                    </div>
                </div>
                
                <div style="display:flex; align-items:center; gap:15px; padding:15px 25px; background:#fbfbfc; border-bottom:1px solid #dee2e6; flex-wrap:wrap;">
                    <div style="color:#2c3e50; font-weight:bold; font-size:14px; margin-right:5px;">🛠️ 시뮬레이션 조정</div>
                    
                    <div style="display:flex; gap:4px; background:#ecf0f1; padding:4px; border-radius:8px;">
                        <button id="sim-btn-current" onclick="window.__setSimScoreMode('current')" style="padding:5px 12px; border-radius:6px; border:none; font-size:12px; font-weight:bold; cursor:pointer; transition:0.2s; background:#3498db; color:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1);">해당 모평</button>
                        
                        <div style="position:relative; display:inline-block;" 
                             onmouseenter="this.querySelector('.tt').style.opacity=1; this.querySelector('.tt').style.visibility='visible';" 
                             onmouseleave="this.querySelector('.tt').style.opacity=0; this.querySelector('.tt').style.visibility='hidden';" 
                             ontouchstart="this.querySelector('.tt').style.opacity=1; this.querySelector('.tt').style.visibility='visible';">
                            <button id="sim-btn-avg" onclick="window.__setSimScoreMode('avg')" style="padding:5px 12px; border-radius:6px; border:none; font-size:12px; font-weight:bold; cursor:help; transition:0.2s; background:transparent; color:#7f8c8d; text-decoration: underline dotted #bdc3c7; text-underline-offset: 3px;">누적 평균</button>
                            <div class="tt" style="visibility:hidden; opacity:0; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); background:rgba(44, 62, 80, 0.95); color:#fff; padding:8px 12px; border-radius:6px; font-size:11px; white-space:nowrap; z-index:100; transition:0.2s; pointer-events:none; box-shadow:0 4px 6px rgba(0,0,0,0.1); line-height:1.5; text-align:center;">
                                ${tooltipMsg}
                            </div>
                        </div>
                    </div>
                    
                    <select onchange="window.__setSimStream(this.value)" style="padding:6px 10px; border-radius:6px; border:1px solid #bdc3c7; color:#2c3e50; font-size:13px; font-weight:bold; outline:none; background:#fff; cursor:pointer;">
                        <option value="전체">전체 계열</option>
                        <option value="인문">인문 계열</option>
                        <option value="자연">자연 계열</option>
                        <option value="공통">공통 계열</option>
                        <option value="예체능">예체능</option>
                    </select>

                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:#7f8c8d; font-size:13px; font-weight:bold;">상향(+점):</span>
                        <input type="number" value="${window.__currentSimStatus.scoreDiff}" step="1" min="0" onchange="window.__setSimOffset(this.value)" style="width:45px; background:#fff; border:1px solid #e74c3c; color:#e74c3c; font-size:14px; font-weight:bold; text-align:center; outline:none; padding:4px; border-radius:6px;">
                    </div>

                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:#7f8c8d; font-size:13px; font-weight:bold;">🎯 검색:</span>
                        <input type="text" placeholder="대학/학과 검색" oninput="window.__setSimSearch(this.value)" style="width:140px; background:#fff; border:1px solid #bdc3c7; color:#3498db; font-size:13px; outline:none; padding:6px 10px; border-radius:6px; font-weight:bold;">
                    </div>

                    <div style="margin-left:auto; color:#2c3e50; font-size:13px; font-weight:bold; background:#fff; border:1px solid #ecf0f1; padding:8px 15px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        국 <span id="sim-score-kor" style="color:#3498db;">0</span> <span style="color:#dfe6e9; margin:0 5px;">|</span> 
                        수 <span id="sim-score-math" style="color:#e74c3c;">0</span> <span style="color:#dfe6e9; margin:0 5px;">|</span> 
                        탐(최고) <span id="sim-score-best-tam" style="color:#2ecc71;">0</span> <span style="color:#dfe6e9; margin:0 5px;">|</span> 
                        탐(평) <span id="sim-score-avg-tam" style="color:#f39c12;">0</span>
                    </div>
                </div>

                <div id="sim-tables-container" style="overflow-x:auto; background:#fff;"></div>
            </div>
        `;

        window.__setSimScoreMode = function(mode) { window.__currentSimStatus.scoreMode = mode; window.runUniversitySimulation(); };
        window.__setSimStream = function(val) { window.__currentSimStatus.streamFilter = val; window.runUniversitySimulation(); };
        window.__setSimOffset = function(val) { window.__currentSimStatus.scoreDiff = Math.max(0, Number(val)); window.runUniversitySimulation(); };
        window.__setSimSearch = function(val) { window.__currentSimStatus.search = val; window.runUniversitySimulation(); };

        const getMatches = (isStrict, aKor, aMath, aBestTam, aAvgTam) => {
            const st = window.__currentSimStatus;
            const matches = { '가': {}, '나': {}, '다': {}, '군외': {} };
            const univSet = new Set();

            const keyword = isStrict ? "" : st.search.trim();

            cutoffs.forEach(c => {
                const cutScore = Number(c.cut_total) || 0;
                if (!cutScore) return;

                if (st.streamFilter !== '전체') {
                    const typeStr = String(c.type || "");
                    if (!typeStr.includes(st.streamFilter)) return;
                }

                const reqTamCount = Number(c.tam_cnt_1) || 2; 
                const myScoreForThisUniv = Math.round(aKor + aMath + (reqTamCount === 1 ? aBestTam : aAvgTam));

                if (keyword) {
                    if (!String(c.univ_name).includes(keyword) && !String(c.dept_name).includes(keyword)) return;
                } else {
                    if (isStrict) { 
                        // 현재 ±1 오차 유지 (수정 없음)
                        if (cutScore < myScoreForThisUniv - 1 || cutScore > myScoreForThisUniv + 1) return;
                    } else { 
                        const targetScore = myScoreForThisUniv + st.scoreDiff;
                        const minCut = myScoreForThisUniv + 2; 
                        const maxCut = targetScore + 1; 
                        if (cutScore < minCut || cutScore > maxCut) return;
                    }
                }

                const combo = String(c.reflect_combo || "");
                if (mathType === "확통" && (combo.includes("미/기") || combo === "미기")) return;
                if (mathType === "미기" && (combo.includes("[확]") || combo === "확통")) return;
                
                const tamReq = String(c.tam_reflect || "");
                if (tamType === "사탐" && (tamReq === "과" || tamReq === "과탐")) return;
                if (tamType === "과탐" && (tamReq === "사" || tamReq === "사탐")) return;

                const badges = [];
                if (reqTamCount === 1) badges.push(tamReq === "과" || tamReq === "과탐" ? "[과1]" : tamReq === "사" || tamReq === "사탐" ? "[사1]" : "[탐1]");
                
                if (c.note) {
                    let nStr = String(c.note).replace(/0\.\d+/g, m => Math.round(Number(m) * 100) + "%").replace(/%%/g, "%");
                    badges.push(...nStr.split(" ")); 
                }

                const formatBonus = (val) => {
                    let num = Number(val);
                    if (isNaN(num) || num <= 0) return "";
                    return num < 1 ? Math.round(num * 100) : Math.round(num);
                };

                let fMi = formatBonus(c.rate_math_mi);
                let fGi = formatBonus(c.rate_math_gi);
                let fGwa = formatBonus(c.rate_tam_gwa);
                let fSa = formatBonus(c.rate_tam_sa);
                
                if (fMi && fMi === fGi) badges.push(`[미기+${fMi}%]`);
                else {
                    if (fMi) badges.push(`[미적+${fMi}%]`);
                    if (fGi) badges.push(`[기하+${fGi}%]`);
                }
                if (fGwa && fGwa === fSa) badges.push(`[사과+${fGwa}%]`);
                else {
                    if (fGwa) badges.push(`[과탐+${fGwa}%]`);
                    if (fSa) badges.push(`[사탐+${fSa}%]`);
                }

                // 💡 유불리 배지 로직 삭제 완료 💡

                const gun = String(c.gun || "가").trim();
                const univ = String(c.univ_name).trim();
                if (!matches[gun]) matches[gun] = {};
                if (!matches[gun][univ]) matches[gun][univ] = [];
                
                matches[gun][univ].push({
                    dept: c.dept_name, type: c.type, cut: cutScore,
                    diff: Math.round((myScoreForThisUniv - cutScore) * 10) / 10,
                    badges: badges, region: c.region
                });
                univSet.add(univ);
            });

            Object.keys(matches).forEach(g => {
                Object.keys(matches[g]).forEach(u => { matches[g][u].sort((a,b) => b.cut - a.cut); });
            });

            const univRankOrder = [
                "서울대", "연세대", "고려대", "서강대", "성균관대", "한양대", 
                "이화여대", "중앙대", "경희대", "한국외대", "서울시립대", 
                "건국대", "동국대", "홍익대", "숙명여대", "국민대", "숭실대", "세종대", "단국대", 
                "인하대", "아주대", "한양대(ERICA)", "항공대", "가천대", "광운대", "명지대", "상명대", 
                "가톨릭대", "한국외대(글로벌)", "서울과기대", "성신여대", "동덕여대", "덕성여대", "서울여대", 
                "삼육대", "한성대", "서경대", "한국교원대", "경기대", "인천대"
            ];
            
            const getUnivRank = (uName) => {
                let safeIdx = -1;
                if (uName.includes("ERICA") || uName.includes("에리카")) safeIdx = univRankOrder.indexOf("한양대(ERICA)");
                else if (uName.includes("외대") && uName.includes("글로벌")) safeIdx = univRankOrder.indexOf("한국외대(글로벌)");
                else if (uName.includes("항공")) safeIdx = univRankOrder.indexOf("항공대");
                else safeIdx = univRankOrder.findIndex(u => uName.startsWith(u) || uName === u);
                
                return safeIdx !== -1 ? safeIdx : 999;
            };

            const getCategoryRank = (univ, dept, regionStr) => {
                if (/(의예|의학|의과)/.test(dept) && !/(식물|의공|의생명|의료|의과학)/.test(dept)) return 10;
                if (/(치의예|치의학)/.test(dept)) return 11;
                if (/(한의예|한의학)/.test(dept)) return 12;
                if (/(수의예|수의과)/.test(dept)) return 13;
                if (/(약학|약대)/.test(dept) && !/(신약|제약|약과학|한약)/.test(dept)) return 14;

                if (/(미래|세종|천안|글로컬|WISE|와이즈|다빈치|에리카|ERICA|바이오|글로벌|메디컬)/i.test(univ)) return 35;

                const isRanked = univRankOrder.some(u => univ.startsWith(u) || univ === u);
                if (isRanked) return 20;

                const region = String(regionStr || "");
                if (region.includes("서울")) return 21; 
                if (region.includes("경기") || region.includes("인천")) return 30; 
                if (/(부산대|경북대|전남대|충남대|전북대|충북대|강원대|경상국립대|제주대)/.test(univ)) return 40;
                
                return 50;
            };

            const sortedUnivs = Array.from(univSet).sort((a, b) => {
                let deptA = "", deptB = "", regA = "", regB = "";
                ['가','나','다','군외'].forEach(g => {
                    if(matches[g][a] && matches[g][a][0]) { deptA = matches[g][a][0].dept; regA = matches[g][a][0].region; }
                    if(matches[g][b] && matches[g][b][0]) { deptB = matches[g][b][0].dept; regB = matches[g][b][0].region; }
                });
                
                const baseA = a.replace(/\(.*?\)/g, '').trim();
                const baseB = b.replace(/\(.*?\)/g, '').trim();
                
                if (baseA === baseB && baseA.length > 0) {
                    const isMainA = a.includes("서울") || (!a.includes("(") && !/(에리카|ERICA|와이즈|WISE|바이오|글로벌|글로컬|미래|세종|천안|다빈치|메디컬)/i.test(a));
                    const isMainB = b.includes("서울") || (!b.includes("(") && !/(에리카|ERICA|와이즈|WISE|바이오|글로벌|글로컬|미래|세종|천안|다빈치|메디컬)/i.test(b));
                    
                    if (isMainA && !isMainB) return -1;
                    if (!isMainA && isMainB) return 1;
                    
                    return a.localeCompare(b);
                }

                const catA = getCategoryRank(a, deptA, regA);
                const catB = getCategoryRank(b, deptB, regB);
                if (catA !== catB) return catA - catB; 
                
                const rankA = getUnivRank(a);
                const rankB = getUnivRank(b);
                if (rankA !== rankB) return rankA - rankB; 
                
                if (a.includes(b) && a.length > b.length) return 1;
                if (b.includes(a) && b.length > a.length) return -1;
                
                return a.localeCompare(b); 
            });

            return { matches, sortedUnivs };
        };

        window.runUniversitySimulation = function() {
            const st = window.__currentSimStatus;
            
            const aKor = st.scoreMode === 'avg' ? avgKorPct : korPct;
            const aMath = st.scoreMode === 'avg' ? avgMathPct : mathPct;
            const aT1 = st.scoreMode === 'avg' ? avgT1Pct : t1;
            const aT2 = st.scoreMode === 'avg' ? avgT2Pct : t2;
            
            const aBestTam = Math.max(aT1, aT2);
            const aTamCnt = (aT1 > 0 ? 1 : 0) + (aT2 > 0 ? 1 : 0);
            const aAvgTam = aTamCnt > 0 ? (aT1 + aT2) / aTamCnt : 0;
            const sumScore = Math.round(aKor + aMath + aAvgTam); 

            const scoreTitle = st.scoreMode === 'avg' ? '누적<br>평균' : '내<br>점<br>수';

            const korEl = document.getElementById('sim-score-kor');
            if (korEl) {
                korEl.innerText = Math.round(aKor * 10) / 10;
                document.getElementById('sim-score-math').innerText = Math.round(aMath * 10) / 10;
                document.getElementById('sim-score-best-tam').innerText = Math.round(aBestTam * 10) / 10;
                document.getElementById('sim-score-avg-tam').innerText = Math.round(aAvgTam * 10) / 10;
                
                const btnCur = document.getElementById('sim-btn-current');
                const btnAvg = document.getElementById('sim-btn-avg');
                if(st.scoreMode === 'current') {
                    btnCur.style.background = '#3498db'; btnCur.style.color = '#fff'; btnCur.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    btnAvg.style.background = 'transparent'; btnAvg.style.color = '#7f8c8d'; btnAvg.style.boxShadow = 'none';
                    btnAvg.style.textDecoration = 'underline dotted #bdc3c7'; 
                } else {
                    btnAvg.style.background = '#3498db'; btnAvg.style.color = '#fff'; btnAvg.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    btnCur.style.background = 'transparent'; btnCur.style.color = '#7f8c8d'; btnCur.style.boxShadow = 'none';
                    btnAvg.style.textDecoration = 'none';
                }
            }

            const leftData = getMatches(true, aKor, aMath, aBestTam, aAvgTam);
            const shouldShowRight = st.scoreDiff > 0 || st.search.trim() !== "";
            const rightData = shouldShowRight ? getMatches(false, aKor, aMath, aBestTam, aAvgTam) : { matches: {}, sortedUnivs: [] };
            
            const ALL_GROUPS = ['가', '나', '다', '군외'];
            
            const renderCards = (univData, isSearchResult = false) => {
                if(!univData || univData.length === 0) return '';
                const keyword = st.search.trim();
                const regex = keyword ? new RegExp(`(${keyword})`, 'gi') : null;

                const limit = isSearchResult ? 999 : 6; 
                const slicedData = univData.slice(0, limit);

                let htmlStr = slicedData.map(d => {
                    const diffColor = d.diff > 0 ? '#2ecc71' : (d.diff < 0 ? '#e74c3c' : '#f39c12');
                    const diffStr = d.diff > 0 ? `+${d.diff}` : (d.diff === 0 ? '±0' : d.diff);
                    
                    let badgeHtml = "";
                    d.badges.forEach(b => {
                        let badgeText = String(b).replace(/0\.\d+/g, match => Math.round(Number(match) * 100) + "%").replace(/%%/g, "%");

                        let bg = "#f1f2f6"; let color = "#7f8c8d"; let bo = "1px solid #dfe6e9";
                        if(badgeText.includes("🟢")) { bg = "#e8f8f5"; color = "#27ae60"; bo = "1px solid #2ecc71"; }
                        else if(badgeText.includes("🔴")) { bg = "#fdedec"; color = "#c0392b"; bo = "1px solid #e74c3c"; }
                        else if(badgeText.includes("미적") || badgeText.includes("기하") || badgeText.includes("미기")) { bg = "#fdf3f2"; color = "#e74c3c"; bo="1px solid #fadbd8"; }
                        else if(badgeText.includes("과탐") || badgeText.includes("과1") || badgeText.includes("사1") || badgeText.includes("탐1")) { bg = "#eaf2f8"; color = "#2980b9"; bo="1px solid #d4e6f1"; }
                        badgeHtml += `<span style="background:${bg}; border:${bo}; color:${color}; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; display:inline-block; margin:2px 1px;">${badgeText}</span>`;
                    });

                    let dispDept = d.dept;
                    if (isSearchResult && regex) dispDept = dispDept.replace(regex, `<span style="background:#f1c40f; color:#000; padding:0 2px; border-radius:2px;">$1</span>`);

                    return `
                        <div style="background:#fff; border:1px solid #ecf0f1; border-radius:8px; padding:10px; margin-bottom:6px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.02); transition:0.2s;">
                            <div style="font-size:11px; color:#95a5a6; margin-bottom:2px;">[${d.type}]</div>
                            <div style="font-size:13px; color:#2c3e50; font-weight:bold; margin-bottom:6px; word-break:keep-all; line-height:1.3;">${dispDept}</div>
                            <div style="font-size:15px; color:${diffColor}; font-weight:900;">${d.cut} <span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(${diffStr})</span></div>
                            ${badgeHtml ? `<div style="margin-top:6px;">${badgeHtml}</div>` : ''}
                        </div>
                    `;
                }).join('');
                
                if (isSearchResult && univData.length > 6) {
                    return `<div class="dept-scroll" style="max-height: 480px; overflow-y: auto; overflow-x: hidden; padding-right: 4px; margin-right: -4px;">
                              <style>
                                .dept-scroll::-webkit-scrollbar { width: 6px; }
                                .dept-scroll::-webkit-scrollbar-thumb { background: #bdc3c7; border-radius: 4px; }
                              </style>
                              ${htmlStr}
                            </div>`;
                }

                if (!isSearchResult && univData.length > limit) {
                    htmlStr += `<div style="font-size:11px; color:#95a5a6; padding:6px 0 2px 0; font-weight:bold;">...외 ${univData.length - limit}개 학과 숨김</div>`;
                }
                return htmlStr;
            };

            const renderTableCols = (univs, matchDict, gun, isSearchResult) => {
                let html = '';
                const keyword = st.search.trim();
                const regex = keyword ? new RegExp(`(${keyword})`, 'gi') : null;

                univs.forEach(u => {
                    let dispU = u;
                    if (isSearchResult && regex) dispU = dispU.replace(regex, `<span style="background:#f1c40f; color:#000; padding:0 2px; border-radius:2px;">$1</span>`);
                    
                    const tableHtml = `<table style="width:100%; border-collapse:collapse; height:100%;">
                                        <thead><tr><th style="background:rgba(0,0,0,0.03); color:#34495e; font-size:13px; padding:10px; border-bottom:1px solid #dee2e6; border-right:1px solid #ecf0f1; white-space:nowrap; position:sticky; top:0; z-index:2;">${dispU}</th></tr></thead>
                                        <tbody><tr><td style="vertical-align:top; padding:8px; border:1px solid #ecf0f1; min-width:130px; background:#fdfdfd;">${renderCards(matchDict[gun][u], isSearchResult)}</td></tr></tbody>
                                       </table>`;
                    html += `<td style="padding:0; border:none; vertical-align:top;">${tableHtml}</td>`;
                });
                return html;
            };

            let rowsHtml = '';
            ALL_GROUPS.forEach((gun, idx) => {
                const isFirst = (idx === 0);
                
                const limitLeft = 6;
                const limitRight = st.search.trim() ? 20 : 6;

                const gunLeftUnivs = leftData.sortedUnivs.filter(u => leftData.matches[gun][u] && leftData.matches[gun][u].length > 0).slice(0, limitLeft);
                const gunRightUnivs = rightData.sortedUnivs.filter(u => rightData.matches[gun][u] && rightData.matches[gun][u].length > 0).slice(0, limitRight);
                
                let hasLeft = gunLeftUnivs.length > 0;
                let hasRight = shouldShowRight && gunRightUnivs.length > 0; 
                
                if (hasLeft || hasRight) {
                    
                    let leftTableHtml = hasLeft ? 
                        `<table style="width:100%; border-collapse:collapse; height:100%;">
                            <tbody><tr>${renderTableCols(gunLeftUnivs, leftData.matches, gun, false)}</tr></tbody>
                         </table>` : `<div style="padding:20px; color:#bdc3c7; text-align:center; font-size:12px; font-weight:bold;">조건에 맞는 대학 없음</div>`;
                         
                    let rightTableHtml = hasRight ? 
                        `<table style="width:100%; border-collapse:collapse; height:100%;">
                            <tbody><tr>${renderTableCols(gunRightUnivs, rightData.matches, gun, true)}</tr></tbody>
                         </table>` : `<div style="padding:20px; color:#f5b041; text-align:center; font-size:12px; font-weight:bold;">조건에 맞는 검색/상향 대학 없음</div>`;

                    rowsHtml += `<tr style="border-bottom:1px solid #dee2e6;">`;
                    
                    if (isFirst) rowsHtml += `<td rowspan="4" style="width:50px; background:#e8f4f8; color:#2980b9; text-align:center; font-weight:900; font-size:14px; border-right:1px solid #dee2e6; border-bottom:1px solid #dee2e6;">${scoreTitle}<br><br><span style="font-size:18px; color:#e74c3c;">${sumScore}</span></td>`;
                    rowsHtml += `<td style="width:35px; text-align:center; font-weight:bold; font-size:14px; background:#f8f9fa; color:#2c3e50; border-right:1px solid #dee2e6; border-bottom:1px solid #dee2e6;">${gun}</td>`;
                    rowsHtml += `<td style="padding:0; vertical-align:top; border-right:1px solid #dee2e6; background:#fff;">${leftTableHtml}</td>`;
                    
                    if (shouldShowRight) {
                        const rightTitle = st.search.trim() ? "검색<br>결과" : "상향<br>지원";
                        if (isFirst) rowsHtml += `<td rowspan="4" style="width:45px; text-align:center; color:#e74c3c; font-size:18px; font-weight:bold; border-right:1px solid #dee2e6; background:#fdf3f2; border-bottom:1px solid #dee2e6;">▶<br><span style="font-size:11px; color:#e74c3c; display:block; margin-top:8px;">${rightTitle}</span></td>`;
                        rowsHtml += `<td style="width:35px; text-align:center; font-weight:bold; font-size:14px; background:#f8f9fa; color:#2c3e50; border-right:1px solid #dee2e6; border-bottom:1px solid #dee2e6;">${gun}</td>`;
                        rowsHtml += `<td style="padding:0; vertical-align:top; background:#fff;">${rightTableHtml}</td>`;
                    }
                    rowsHtml += `</tr>`;
                }
            });

            const tableContainer = document.getElementById('sim-tables-container');
            if (tableContainer) {
                tableContainer.innerHTML = `<table style="width:100%; border-collapse:collapse; min-width:900px; height:100%;"><tbody>${rowsHtml}</tbody></table>`;
            }
        };

        window.runUniversitySimulation();

    } catch (err) {
        area.innerHTML = `<div style="text-align:center; padding:30px; background:#fdedec; border:1px solid #fadbd8; color:#c0392b; border-radius:8px; margin-top:20px;"><b>오류가 발생했습니다:</b><br>${err.message}</div>`;
    }
};

// =========================================================
// 💡 [버그 수정 & 업그레이드] 드롭다운 시험 변경 마스터 컨트롤러
// =========================================================
window.__changeSummaryExam = function(examLabel) {
    // 1. 전역 상태(현재 선택된 시험명) 업데이트
    window.__currentSummaryExam = examLabel;
    
    // 2. 첫 번째 구역: [성적 요약 테이블] 즉시 변경
    if (typeof window.__renderGradeSummaryTable === 'function') {
        window.__renderGradeSummaryTable();
    }

    // 3. 두 번째 & 세 번째 구역: [취약 영역 레이더 차트] & [정오표 상세 분석] 업데이트
    // 사용자가 멈춘 것으로 오해하지 않도록 로딩 UI 즉시 표출
    const vulnArea = document.getElementById('vulnerability-area');
    if (vulnArea) {
        vulnArea.innerHTML = '<div style="text-align:center; padding:40px; color:#3498db; font-weight:bold;">⏳ 새로운 시험의 취약 영역을 분석 중입니다...</div>';
    }
    const errataArea = document.getElementById('grade-errata-area');
    if (errataArea) {
        errataArea.innerHTML = '<div style="text-align:center; padding:40px; color:#3498db; font-weight:bold;">⏳ 해당 시험의 정오표 데이터를 불러오는 중입니다...</div>';
    }

    // 수퍼베이스에서 바뀐 시험의 정오표/취약영역 데이터를 다시 끌어오기
    if (typeof window.__loadGradeErrata === 'function') {
        window.__loadGradeErrata(examLabel);
    }

    // 4. 🌟 [강력 추가] 정시 시뮬레이션 보드 자동 동기화
    // 만약 시뮬레이션 보드가 화면에 열려있는 상태라면? -> 바뀐 점수로 즉시 자동 재계산!
    const simArea = document.getElementById('univ-simulation-area');
    if (simArea && simArea.style.display === 'block') {
        simArea.style.display = 'none'; // 잠깐 숨겼다가
        window.__openUnivSimulation();  // 새로운 점수로 시뮬레이터 즉시 재가동!
    }
};

// =========================================================
// 💡 [데이터 연동 수정] 성적 요약 테이블 (한국사 extra_raw 반영)
// =========================================================
window.__renderGradeSummaryTable = function() {
    const area = document.getElementById('grade-summary-table-area');
    const score = window.__currentStudentScores.find(s => s.exam_label === window.__currentSummaryExam) || {};
    
    // 💡 [도우미 1] 줄임말 과목명을 표준 명칭으로 변경
    const stdName = (n) => {
        if (!n || n === '-' || n === 'null') return '-';
        let s = String(n).trim();
        const map = {
            '언매': '언어와 매체', '화작': '화법과 작문',
            '확통': '확률과 통계', '미적': '미적분',
            '생윤': '생활과 윤리', '윤사': '윤리와 사상',
            '한지': '한국 지리', '세지': '세계 지리',
            '동사': '동아시아사', '정법': '정치와 법',
            '사문': '사회 문화', '물1': '물리학1',
            '화1': '화학1', '생1': '생명과학1', '지1': '지구과학1',
            '지학1': '지구과학1', '생물1': '생명과학1'
        };
        return map[s] || s;
    };

    // 💡 [도우미 2] 값이 0이거나 없을 때 하이픈(-) 처리
    const v = (val) => {
        if (val === null || val === undefined || val === "" || val === 0 || val === "0") return '-';
        return val;
    };

    area.innerHTML = `
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #dee2e6;">
            <style>
                .sum-table { width:100%; border-collapse:collapse; font-size:13px; text-align:center; color:#2c3e50; min-width:750px; background:#fff; }
                .sum-table th, .sum-table td { border-bottom:1px solid #ecf0f1; padding:12px 10px; height: 45px; }
                .sum-table th { color:#7f8c8d; background:#fbfbfc; border-bottom:2px solid #dee2e6; font-weight:bold; }
                .sum-table td.header-col { font-weight:bold; color:#7f8c8d; background:#fbfbfc; border-right:1px solid #ecf0f1; width:110px; text-align:left; padding-left:20px; }
                .sum-table td { font-weight:bold; font-size: 14px; }
                .sum-kor { color:#3498db; } .sum-math { color:#e74c3c; } .sum-tam1 { color:#27ae60; } .sum-tam2 { color:#f39c12; }
                .sum-eng { color:#9b59b6; }
            </style>
            <table class="sum-table">
                <thead>
                    <tr><th>과목</th><th>국어</th><th>수학</th><th>영어</th><th>한국사</th><th>탐구1</th><th>탐구2</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="header-col">선택과목</td>
                        <td class="sum-kor">${stdName(score.kor_choice)}</td>
                        <td class="sum-math">${stdName(score.math_choice)}</td>
                        <td>-</td>
                        <td>-</td>
                        <td class="sum-tam1">${stdName(score.tam1_name)}</td>
                        <td class="sum-tam2">${stdName(score.tam2_name)}</td>
                    </tr>
                    <tr>
                        <td class="header-col">원점수</td>
                        <td>${v(score.kor_raw_total)}</td>
                        <td>${v(score.math_raw_total)}</td>
                        <td>${v(score.eng_raw)}</td>
                        <td>${v(score.extra_raw)}</td>
                        <td>${v(score.tam1_raw)}</td>
                        <td>${v(score.tam2_raw)}</td>
                    </tr>
                    <tr>
                        <td class="header-col">표준점수</td>
                        <td>${v(score.kor_exp_std)}</td>
                        <td>${v(score.math_exp_std)}</td>
                        <td>-</td>
                        <td>-</td>
                        <td>${v(score.tam1_exp_std)}</td>
                        <td>${v(score.tam2_exp_std)}</td>
                    </tr>
                    <tr>
                        <td class="header-col">백분위</td>
                        <td class="sum-kor">${v(score.kor_exp_pct)}</td>
                        <td class="sum-math">${v(score.math_exp_pct)}</td>
                        <td>-</td>
                        <td>-</td>
                        <td class="sum-tam1">${v(score.tam1_exp_pct)}</td>
                        <td class="sum-tam2">${v(score.tam2_exp_pct)}</td>
                    </tr>
                    <tr>
                        <td class="header-col">등급</td>
                        <td>${v(score.kor_exp_grade)}</td>
                        <td>${v(score.math_exp_grade)}</td>
                        <td class="sum-eng">${v(score.eng_grade)}</td>
                        <td>${v(score.extra_grade || score.hist_grade || score.hist_exp_grade)}</td>
                        <td>${v(score.tam1_exp_grade)}</td>
                        <td>${v(score.tam2_exp_grade)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
};

// =========================================================
// 💡 [과탐 오류 해결] 로마자(I, II) 자동 변환 및 과탐/사탐 그룹 매칭 강화
// =========================================================
window.__loadGradeErrata = async function(examLabel) {
    const container = document.getElementById('grade-errata-area');
    const vulnArea = document.getElementById('vulnerability-area');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#95a5a6;"><span style="font-size:24px; display:block; margin-bottom:10px;">⏳</span>상세 데이터를 모아 분석하는 중입니다...</div>';

    const studentScoresMap = {};
    window.__currentStudentScores.forEach(s => studentScoresMap[s.exam_label] = s);
    const scoreInfo = studentScoresMap[examLabel];
    
    if (!scoreInfo) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#7f8c8d;">데이터가 없습니다.</div>';
        if (vulnArea) vulnArea.innerHTML = '<div style="text-align:center; padding:20px; color:#7f8c8d;">데이터가 없습니다.</div>';
        return;
    }
    
    const studentId = String(scoreInfo.student_id || "").trim();
    const targetExams = window.__isCumulativeRadar ? window.__currentStudentScores.map(s => s.exam_label) : [examLabel];

    try {
        const { data: unitMapData } = await _supabase.from('unit_map').select('*');
        window.__unitMap = unitMapData || [];

        let allMyErrata = [];
        let allQInfos = [];
        let currentExamAllErrata = [];

        // window.__loadGradeErrata 내부의 fetchExamData 함수만 이 코드로 교체하세요
const fetchExamData = async (ex) => {
    // 1. 정오표(Errata) 가져오기 (기존 유지)
    let allExErrata = [];
    let fetchMoreE = true; let startIdxE = 0;
    while(fetchMoreE) {
        const {data, error} = await _supabase.from('mock_errata').select('*').eq('exam_label', ex).range(startIdxE, startIdxE + 999);
        if (error) break;
        if (data && data.length > 0) { allExErrata = allExErrata.concat(data); startIdxE += 1000; if(data.length < 1000) fetchMoreE = false; } else fetchMoreE = false;
    }
    
    const studentExErrata = allExErrata.filter(e => String(e.student_id || "").trim() === studentId || Object.values(e).some(val => String(val).trim() === studentId));

    // 2. 문항 정보(Question Info) 가져오기 (페이지네이션 추가)
    let qInfos = [];
    let fetchMoreQ = true; let startIdxQ = 0;
    while(fetchMoreQ) {
        const { data: qData, error: qErr } = await _supabase.from('mock_question_info').select('*').eq('exam_label', ex).range(startIdxQ, startIdxQ + 999);
        if (qErr) break;
        if (qData && qData.length > 0) { qInfos = qInfos.concat(qData); startIdxQ += 1000; if(qData.length < 1000) fetchMoreQ = false; } else fetchMoreQ = false;
    }

    return { ex, allExErrata, studentExErrata, qInfos };
};

        const results = await Promise.all(targetExams.map(ex => fetchExamData(ex)));
        results.forEach(res => {
            if (res.ex === examLabel) currentExamAllErrata = res.allExErrata;
            allMyErrata = allMyErrata.concat(res.studentExErrata);
            allQInfos = allQInfos.concat(res.qInfos);
        });

        if (currentExamAllErrata.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#e74c3c;">DB에서 데이터를 가져오지 못했습니다.</div>';
            return;
        }

        const myCurrentErrata = allMyErrata.filter(e => e.exam_label === examLabel);
        if (myCurrentErrata.length === 0) {
            const msg = '<div style="text-align:center; padding:30px; color:#95a5a6; border:1px solid #f1f2f6; border-radius:8px;">이 시험의 정오표 데이터가 아직 등록되지 않았습니다.</div>';
            container.innerHTML = msg;
            if (vulnArea) vulnArea.innerHTML = msg;
            return;
        }

        const normalizeSubj = (name) => {
            let s = String(name || "").trim().replace(/\s+/g, '').replace(/·/g, '');
            s = s.replace(/II/g, '2').replace(/I/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1');
            if (s.includes('화법') || s.includes('화작')) return '화법과작문';
            if (s.includes('언어') || s.includes('언매')) return '언어와매체';
            if (s.includes('미적')) return '미적분';
            if (s.includes('확률') || s.includes('확통')) return '확률과통계';
            if (s.includes('기하')) return '기하';
            if (s.includes('생활') || s.includes('생윤')) return '생활과윤리';
            if ((s.includes('윤리') && s.includes('사상')) || s.includes('윤사')) return '윤리와사상';
            if (s.includes('한국지리') || s.includes('한지')) return '한국지리';
            if (s.includes('세계지리') || s.includes('세지')) return '세계지리';
            if (s.includes('동아시아') || s.includes('동사')) return '동아시아사';
            if (s.includes('세계사')) return '세계사';
            if (s.includes('정치') || s.includes('정법')) return '정치와법';
            if (s.includes('경제')) return '경제';
            if ((s.includes('사회') && s.includes('문화')) || s.includes('사문')) return '사회문화';
            if (s.includes('물리') && s.includes('1')) return '물리학1';
            if (s.includes('화학') && s.includes('1')) return '화학1';
            if ((s.includes('생명') || s.includes('생물')) && s.includes('1')) return '생명과학1';
            if ((s.includes('지구') || s.includes('지학')) && s.includes('1')) return '지구과학1';
            if (s.includes('물리') && s.includes('2')) return '물리학2';
            if (s.includes('화학') && s.includes('2')) return '화학2';
            if ((s.includes('생명') || s.includes('생물')) && s.includes('2')) return '생명과학2';
            if ((s.includes('지구') || s.includes('지학')) && s.includes('2')) return '지구과학2';
            if (s === '수학1' || s === '수1') return '수학1';
            if (s === '수학2' || s === '수2') return '수학2';
            if (s.includes('영어')) return '영어';
            if (s.includes('국어')) return '국어';
            if (s.includes('수학')) return '수학';
            return s;
        };

        const stats = {}; 
        const addToStats = (targetKey, rowData) => {
            if (!stats[targetKey]) stats[targetKey] = {};
            for (let i = 1; i <= 45; i++) {
                const val = String(rowData[`q${i}`] || "").trim();
                if (['O', 'X', '○', '×', 'o', 'x'].includes(val)) {
                    if (!stats[targetKey][i]) stats[targetKey][i] = { o: 0, total: 0 };
                    stats[targetKey][i].total++;
                    if (['O', '○', 'o'].includes(val)) stats[targetKey][i].o++;
                }
            }
        };

        currentExamAllErrata.forEach(row => {
            const normSubj = normalizeSubj(row.subject);
            addToStats(normSubj, row);
            if (['화법과작문', '언어와매체', '국어'].includes(normSubj)) addToStats('국어공통', row);
            if (['미적분', '기하', '확률과통계', '수학', '수학1', '수학2'].includes(normSubj)) addToStats('수학공통', row);
        });

        const qInfoMap = {}; 
        const qInfoRawMap = {}; 
        
        allQInfos.forEach(q => {
            const exLabel = q.exam_label;
            const normSubj = normalizeSubj(q.subject);
            if (!qInfoMap[normSubj]) qInfoMap[normSubj] = {};
            if (!qInfoRawMap[exLabel]) qInfoRawMap[exLabel] = {};
            if (!qInfoRawMap[exLabel][normSubj]) qInfoRawMap[exLabel][normSubj] = {};
            
            const qNum = parseInt(String(q.question_num).replace(/[^0-9]/g, ''), 10);
            if (isNaN(qNum)) return;

            let rawUnit = String(q.unit_name || '').replace(/^\d+\.?\s*/, '').trim(); 
            const subUnitName = String(q.sub_unit || q.subunit || '').replace(/^\d+\.?\s*/, '').trim();
            let rawBeh = String(q.behavior_domain || q.eval_name || '').replace(/^\d+\.?\s*/, '').trim();
            
            let uKey = 9999; let bKey = 'Z'; 
            const cleanU = rawUnit.replace(/\s+/g, '');
            const cleanB = rawBeh.replace(/\s+/g, ''); 
            
            // 💡 [핵심 교정] 로마자 변환 및 과탐/사탐 포괄 허용 로직
            const isSubjMatch = (u) => {
                if (!u.subject) return true;
                let mSubj = String(u.subject).replace(/\s+/g, '');
                
                // 1. 수퍼베이스에 잘못 올라간 로마자를 1, 2로 강제 번역 (물리학I -> 물리학1)
                mSubj = mSubj.replace(/II/g, '2').replace(/I/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1');
                
                // 2. DB에 '과탐'이나 '사탐'이라고 뭉뚱그려 적은 경우도 모두 통과시켜줌
                if (['과탐', '과학탐구'].includes(mSubj) && ['물리학1', '화학1', '생명과학1', '지구과학1', '물리학2', '화학2', '생명과학2', '지구과학2'].includes(normSubj)) return true;
                if (['사탐', '사회탐구'].includes(mSubj) && ['생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사', '정치와법', '경제', '사회문화'].includes(normSubj)) return true;

                const baseNorm = normSubj.replace(/[12ⅠⅡIIV]/g, '').replace(/과학/g, '').replace(/학/g, '');
                const baseMap = mSubj.replace(/[12ⅠⅡIIV]/g, '').replace(/과학/g, '').replace(/학/g, '');
                const isTamguMatch = baseNorm && baseMap && (baseNorm.includes(baseMap) || baseMap.includes(baseNorm)) && (normSubj.slice(-1) === mSubj.slice(-1));
                return mSubj === normSubj || mSubj.includes(normSubj) || normSubj.includes(mSubj) || isTamguMatch;
            };

            const getNum = (v) => { const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 9999 : n; };

            if (window.__unitMap && window.__unitMap.length > 0) {
                let foundUnit = window.__unitMap.find(u => isSubjMatch(u) && String(u.unit_name || u.unit || '').replace(/\s+/g, '') === cleanU);
                if (!foundUnit) {
                    foundUnit = window.__unitMap.find(u => {
                        const mName = String(u.unit_name || u.unit || '').replace(/\s+/g, '');
                        return isSubjMatch(u) && mName && (mName.includes(cleanU) || cleanU.includes(mName));
                    });
                }
                if (foundUnit) {
                    rawUnit = foundUnit.unit_name || rawUnit;
                    uKey = getNum(foundUnit.unit_key ?? foundUnit.unit_code);
                }

                if (cleanB && cleanB !== '-') {
                    let foundBeh = window.__unitMap.find(u => {
                        const mBehName = String(u.eval_name || u.eval || '').replace(/\s+/g, '');
                        const mBehKey = String(u.eval_key || u.eval_code || '').trim();
                        return isSubjMatch(u) && ((mBehName && mBehName === cleanB) || (q.eval_key && q.eval_key === mBehKey));
                    });
                    if (!foundBeh) {
                        foundBeh = window.__unitMap.find(u => {
                            const mBehName = String(u.eval_name || u.eval || '').replace(/\s+/g, '');
                            return isSubjMatch(u) && mBehName && (mBehName.includes(cleanB) || cleanB.includes(mBehName));
                        });
                    }
                    if (foundBeh) {
                        rawBeh = foundBeh.eval_name || rawBeh;
                        bKey = String(foundBeh.eval_key || foundBeh.eval_code || 'Z');
                    }
                }
            }

            qInfoRawMap[exLabel][normSubj][qNum] = { unit: rawUnit, subUnit: subUnitName, beh: rawBeh, unitKey: uKey, behKey: bKey, qSubj: normSubj };

            if (exLabel === examLabel) {
                let labelHtml = '';
                if (normSubj === '수학' || normSubj === '수학공통') {
                    const uStr = rawUnit.replace(/\s+/g, '');
                    if (uStr.includes('지수') || uStr.includes('로그') || uStr.includes('삼각') || uStr.includes('수열')) labelHtml += `<span style="color:#2980b9; font-weight:900; margin-right:6px;">[수학I]</span>`;
                    else if (uStr.includes('극한') || uStr.includes('연속') || uStr.includes('미분') || uStr.includes('적분')) labelHtml += `<span style="color:#2ecc71; font-weight:900; margin-right:6px;">[수학II]</span>`;
                    else if (uStr.includes('다항식') || uStr.includes('방정식') || uStr.includes('부등식') || uStr.includes('도형') || uStr.includes('함수') || uStr.includes('경우')) labelHtml += `<span style="color:#27ae60; font-weight:900; margin-right:6px;">[고1수학]</span>`;
                } else if (normSubj === '수학1') labelHtml += `<span style="color:#2980b9; font-weight:900; margin-right:6px;">[수학I]</span>`;
                else if (normSubj === '수학2') labelHtml += `<span style="color:#2ecc71; font-weight:900; margin-right:6px;">[수학II]</span>`;
                
                const isTamgu = !['국어', '국어공통', '화법과작문', '언어와매체', '수학', '수학공통', '미적분', '기하', '확률과통계', '영어', '수학1', '수학2'].includes(normSubj);
                if (isTamgu && uKey !== 9999) labelHtml += `<span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; background:#8e44ad; color:#fff; border-radius:4px; font-size:11px; font-weight:bold; margin-right:8px; vertical-align:middle;">${uKey}</span>`;
                let labelArr = [];
                if (rawUnit !== '기타') labelArr.push(rawUnit);
                if (isTamgu && subUnitName && subUnitName !== '-' && subUnitName !== 'null') labelArr.push(subUnitName.replace(/^\d+\.?\s*/, ''));
                let joinedUnit = labelArr.join(' - ');
                if (!joinedUnit) joinedUnit = '단원 정보 없음';
                labelHtml += joinedUnit;
                if (rawBeh !== '기타') labelHtml += ` <span style="font-size:11px; color:#95a5a6; border:1px solid #ecf0f1; padding:2px 6px; border-radius:4px; margin-left:6px; background:#f8f9fa;">${rawBeh}</span>`;
                qInfoMap[normSubj][qNum] = labelHtml;
            }
        });

        const radarStats = {};

        allMyErrata.forEach(row => {
            const exLabel = row.exam_label;
            const normS = normalizeSubj(row.subject);
            const exScoreInfo = studentScoresMap[exLabel] || scoreInfo;
            const myKorChoice = normalizeSubj(exScoreInfo.kor_choice);
            const myMathChoice = normalizeSubj(exScoreInfo.math_choice);
            
            const getMajorCategory = (s) => {
                if (['국어', '국어공통', '화법과작문', '언어와매체'].includes(s) || s === myKorChoice) return '국어';
                if (['수학', '수학공통', '수학1', '수학2', '미적분', '기하', '확률과통계'].includes(s) || s === myMathChoice) return '수학';
                if (s === '영어') return '영어';
                
                const normTam1 = normalizeSubj(exScoreInfo.tam1_name);
                const normTam2 = normalizeSubj(exScoreInfo.tam2_name);
                
                const prettyName = (name) => {
                    const map = {
                        '생활과윤리': '생활과 윤리', '사회문화': '사회·문화', '윤리와사상': '윤리와 사상',
                        '정치와법': '정치와 법', '한국지리': '한국 지리', '세계지리': '세계 지리'
                    };
                    return map[name] || name;
                };

                if (s === normTam1) return prettyName(normTam1);
                if (s === normTam2) return prettyName(normTam2);
                return null;
            };

            const majorCat = getMajorCategory(normS);
            if (!majorCat) return;
            if (!radarStats[majorCat]) radarStats[majorCat] = { units: {}, behaviors: {} };

            for (let i = 1; i <= 45; i++) {
                const ox = String(row[`q${i}`] || "").trim();
                if (!['O','X','○','×','o','x'].includes(ox)) continue;
                
                const isO = ['O','○','o'].includes(ox);
                let info = null;
                
                if (majorCat === '국어') {
                    if (i >= 35) info = qInfoRawMap[exLabel]?.[myKorChoice]?.[i];
                    if (!info) info = qInfoRawMap[exLabel]?.['국어공통']?.[i] || qInfoRawMap[exLabel]?.['국어']?.[i] || qInfoRawMap[exLabel]?.['공통']?.[i];
                } else if (majorCat === '수학') {
                    if (i >= 23) info = qInfoRawMap[exLabel]?.[myMathChoice]?.[i];
                    if (!info) info = qInfoRawMap[exLabel]?.['수학공통']?.[i] || qInfoRawMap[exLabel]?.['수학']?.[i] || qInfoRawMap[exLabel]?.['수학1']?.[i] || qInfoRawMap[exLabel]?.['수학2']?.[i];
                } else {
                    info = qInfoRawMap[exLabel]?.[normS]?.[i];
                }

                if (!info) info = { unit: '분류없음', subUnit: '분류없음', beh: '분류없음', unitKey: 9999, behKey: 'Z', qSubj: normS };

                const u = info.unit; const b = info.beh;

                if (!radarStats[majorCat].units[u]) radarStats[majorCat].units[u] = { o: 0, total: 0, unitKey: info.unitKey, qSubj: info.qSubj, details: {} };
                radarStats[majorCat].units[u].total++;
                if (isO) radarStats[majorCat].units[u].o++;

                const isTamgu = !['국어', '수학', '영어'].includes(majorCat);
                let detailKeyUnitView = isTamgu ? info.subUnit : info.beh;
                if (!detailKeyUnitView || detailKeyUnitView === '-' || detailKeyUnitView === 'null') detailKeyUnitView = '분류없음';

                if (!radarStats[majorCat].units[u].details[detailKeyUnitView]) radarStats[majorCat].units[u].details[detailKeyUnitView] = { o: 0, total: 0 };
                radarStats[majorCat].units[u].details[detailKeyUnitView].total++;
                if (isO) radarStats[majorCat].units[u].details[detailKeyUnitView].o++;

                if (b && b !== '-' && b !== 'null' && b !== '기타' && b !== '분류없음') {
                    if (!radarStats[majorCat].behaviors[b]) radarStats[majorCat].behaviors[b] = { o: 0, total: 0, behKey: info.behKey, qSubj: info.qSubj, details: {} };
                    radarStats[majorCat].behaviors[b].total++;
                    if (isO) radarStats[majorCat].behaviors[b].o++;
                    
                    if (!radarStats[majorCat].behaviors[b].details[u]) radarStats[majorCat].behaviors[b].details[u] = { o: 0, total: 0 };
                    radarStats[majorCat].behaviors[b].details[u].total++;
                    if (isO) radarStats[majorCat].behaviors[b].details[u].o++;
                }
            }
        });

        window.__radarStats = radarStats;
        window.__renderRadarChartUI();

        const findRowStrict = (targetName) => {
            if (!targetName) return null;
            const target = normalizeSubj(targetName);
            return myCurrentErrata.find(e => normalizeSubj(e.subject) === target);
        };
        
        const korRow = findRowStrict(scoreInfo.kor_choice) || myCurrentErrata.find(e => ['화법과작문', '언어와매체'].includes(normalizeSubj(e.subject))) || findRowStrict('국어');
        const mathRow = findRowStrict(scoreInfo.math_choice) || myCurrentErrata.find(e => ['미적분', '기하', '확률과통계'].includes(normalizeSubj(e.subject))) || findRowStrict('수학');
        const engRow = findRowStrict('영어');
        const tam1Row = findRowStrict(scoreInfo.tam1_name);
        const tam2Row = findRowStrict(scoreInfo.tam2_name);

        const renderSection = (title, subtitle, qStart, qEnd, errataRow, statKey, infoKey) => {
            if (!errataRow) return '';
            let hasData = false;
            for (let i = qStart; i <= qEnd; i++) { if (errataRow[`q${i}`]) { hasData = true; break; } }
            if (!hasData) return '';

            let rowsHtml = '';
            for (let i = qStart; i <= qEnd; i++) {
                const ox = String(errataRow[`q${i}`] || "").trim();
                if (!ox) continue;
                const isO = (ox === 'O' || ox === '○' || ox === 'o');
                const oxColor = isO ? '#3498db' : '#e74c3c';
                const oxBg = isO ? '#fff' : '#fdf3f2';
                const stat = (stats[statKey] && stats[statKey][i]) ? stats[statKey][i] : { o: 0, total: 0 };
                const rate = stat.total > 0 ? Math.round((stat.o / stat.total) * 1000) / 10 : 0;
                const barColor = rate >= 80 ? '#2ecc71' : (rate >= 50 ? '#f1c40f' : '#e74c3c');
                
                let qInfo = '-';
                if (infoKey === '수학공통') qInfo = (qInfoMap['수학1']?.[i]) || (qInfoMap['수학2']?.[i]) || (qInfoMap['수학']?.[i]) || (qInfoMap['수학공통']?.[i]) || (qInfoMap['공통']?.[i]) || '-';
                else if (infoKey === '국어공통') qInfo = (qInfoMap['국어']?.[i]) || (qInfoMap['국어공통']?.[i]) || (qInfoMap['공통']?.[i]) || '-';
                else qInfo = (qInfoMap[infoKey] && qInfoMap[infoKey][i]) || '-';

                rowsHtml += `<tr style="background:${oxBg}; border-bottom: 1px solid #f1f2f6;"><td style="padding:8px 5px; text-align:center; font-weight:bold; color:#7f8c8d; width:50px;">${i}</td><td style="padding:8px 5px; text-align:center; font-weight:900; color:${oxColor}; font-size:15px; width:60px;">${isO?'O':'X'}</td><td style="padding:8px 10px; text-align:left; color:#34495e; font-size:12px;">${qInfo}</td><td style="padding:8px 10px; text-align:right; font-size:12px; color:#2c3e50; width:120px;"><div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;"><span style="width:35px; text-align:right;">${rate}%</span><div style="width:50px; height:6px; background:#ecf0f1; border-radius:3px; overflow:hidden;"><div style="width:${rate}%; height:100%; background:${barColor};"></div></div></div></td><td style="padding:8px 10px; text-align:right; font-size:11px; color:#95a5a6; width:70px;">${stat.o}/${stat.total}</td></tr>`;
            }
            
            const sectionId = 'errata-' + Math.random().toString(36).substr(2, 9);
            const infoHeader = (infoKey === '수학공통' || infoKey === '국어공통' || infoKey === '영어' || infoKey === '미적분' || infoKey === '기하' || infoKey === '확률과통계' || infoKey === '화법과작문' || infoKey === '언어와매체') ? '출제 영역 (과목 / 대단원)' : '출제 영역 (대단원 - 소단원)';

            return `<div style="border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 10px; overflow:hidden; background:#fff;"><div onclick="const el = document.getElementById('${sectionId}'); el.style.display = el.style.display === 'none' ? 'block' : 'none';" style="padding: 12px 15px; background: #fbfbfc; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;"><div style="font-weight: bold; color: #2c3e50; font-size: 14px;">${title}</div><div style="font-size: 11px; color: #7f8c8d;">${subtitle}</div></div><div id="${sectionId}" style="display: none; padding: 0;"><table style="width: 100%; border-collapse: collapse; margin-bottom: 0;"><thead><tr style="border-bottom: 2px solid #dee2e6; background: #fff;"><th style="padding: 10px 5px; text-align:center; color:#95a5a6; font-size:11px;">문항</th><th style="padding: 10px 5px; text-align:center; color:#95a5a6; font-size:11px;">O/X</th><th style="padding: 10px; text-align:left; color:#95a5a6; font-size:11px;">${infoHeader}</th><th style="padding: 10px; text-align:right; color:#95a5a6; font-size:11px;">정답률</th><th style="padding: 10px; text-align:right; color:#95a5a6; font-size:11px;">O/응시</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
        };

        let html = '';
        html += renderSection('국어 공통', '문항 1~34 ▼', 1, 34, korRow, '국어공통', '국어공통');
        if (scoreInfo.kor_choice) html += renderSection('국어 선택', `문항 35~45 · ${scoreInfo.kor_choice} ▼`, 35, 45, korRow, normalizeSubj(scoreInfo.kor_choice), normalizeSubj(scoreInfo.kor_choice));
        html += renderSection('수학 공통', '문항 1~22 ▼', 1, 22, mathRow, '수학공통', '수학공통');
        if (scoreInfo.math_choice) html += renderSection('수학 선택', `문항 23~30 · ${scoreInfo.math_choice} ▼`, 23, 30, mathRow, normalizeSubj(scoreInfo.math_choice), normalizeSubj(scoreInfo.math_choice));
        html += renderSection('영어', '문항 1~45 ▼', 1, 45, engRow, '영어', '영어');
        if (scoreInfo.tam1_name) html += renderSection(`탐구 (${scoreInfo.tam1_name})`, '문항 1~20 ▼', 1, 20, tam1Row, normalizeSubj(scoreInfo.tam1_name), normalizeSubj(scoreInfo.tam1_name));
        if (scoreInfo.tam2_name) html += renderSection(`탐구 (${scoreInfo.tam2_name})`, '문항 1~20 ▼', 1, 20, tam2Row, normalizeSubj(scoreInfo.tam2_name), normalizeSubj(scoreInfo.tam2_name));
        container.innerHTML = html || '<div style="text-align:center; padding:20px; color:#7f8c8d;">해당 시험의 정오표 데이터가 없습니다.</div>';

    } catch (err) { console.error(err); }
};

// =========================================================
// 💡 [UI 렌더링] 누적 토글 스위치버튼 추가
// =========================================================
window.__switchRadarType = function(type) { window.__radarCurrentType = type; window.__renderRadarChartUI(); };
window.__switchRadarSubj = function(subj) { window.__radarCurrentSubj = subj; window.__renderRadarChartUI(); };

window.__renderRadarChartUI = function() {
    const area = document.getElementById('vulnerability-area');
    if (!area || !window.__radarStats) return;

    const subjs = Object.keys(window.__radarStats);
    if (subjs.length === 0) {
        area.innerHTML = '<div style="padding:20px; color:#95a5a6; text-align:center;">분석 가능한 데이터가 없습니다.</div>';
        return;
    }

    if (!window.__radarCurrentSubj || !subjs.includes(window.__radarCurrentSubj)) {
        window.__radarCurrentSubj = subjs[0];
    }

    const subj = window.__radarCurrentSubj;
    const type = window.__radarCurrentType || 'unit'; 
    const isCumul = window.__isCumulativeRadar; // 누적 상태 확인

    const btnSty = (isActive, bg) => `padding:6px 15px; border-radius:20px; border:1px solid ${isActive?bg:'#dee2e6'}; cursor:pointer; font-size:12px; font-weight:bold; transition:0.2s; background:${isActive?bg:'#f8f9fa'}; color:${isActive?'#fff':'#7f8c8d'};`;
    const cumulBtnSty = `padding:6px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; background:${isCumul ? '#e74c3c' : '#f1f2f6'}; color:${isCumul ? '#fff' : '#7f8c8d'}; box-shadow:${isCumul ? '0 2px 4px rgba(231,76,60,0.2)' : 'none'};`;

    let tabsHtml = subjs.map(s => {
        const isActive = s === subj;
        const bg = isActive ? '#3498db' : '#f8f9fa';
        const color = isActive ? '#fff' : '#7f8c8d';
        const border = isActive ? 'none' : '1px solid #dee2e6';
        return `<button onclick="window.__switchRadarSubj('${s}')" style="padding:6px 18px; border-radius:20px; border:${border}; cursor:pointer; font-size:13px; font-weight:bold; transition:0.2s; background:${bg}; color:${color}; margin-right:8px;">${s}</button>`;
    }).join('');

    area.innerHTML = `
        <div style="background:#ffffff; border-radius:12px; padding:25px; color:#2c3e50; border: 1px solid #dee2e6;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px; margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                    <button onclick="window.__toggleCumulativeRadar()" style="${cumulBtnSty}">
                        ${isCumul ? '📈 전체 시험 누적' : '📄 해당 시험만'}
                    </button>
                    <div style="width:1px; height:20px; background:#dee2e6; margin:0 5px;"></div>
                    <div>${tabsHtml}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="window.__switchRadarType('unit')" style="${btnSty(type==='unit', '#2980b9')}">단원별 성취도</button>
                    <button onclick="window.__switchRadarType('beh')" style="${btnSty(type==='beh', '#9b59b6')}">행동영역 보기</button>
                </div>
            </div>
            
            <div style="position:relative; height:350px; width:100%; max-width:650px; margin:0 auto;">
                <canvas id="radarChartCanvas"></canvas>
            </div>

            <div id="radar-detail-panel" style="margin-top:30px; background:#fbfbfc; border-radius:10px; padding:20px; border:1px solid #dee2e6; display:none; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
            </div>
        </div>
    `;

    setTimeout(() => { window.__renderRadarChartCanvas(); }, 50);
};

// =========================================================
// 💡 [글씨 색 복구] 캔버스 컬러 배정 및 라벨 렌더러
// =========================================================
window.__renderRadarChartCanvas = function() {
    const ctx = document.getElementById('radarChartCanvas');
    if (!ctx || !window.__radarStats) return;

    const subj = window.__radarCurrentSubj;
    const type = window.__radarCurrentType || 'unit'; 
    let dataObj = window.__radarStats[subj]?.[type === 'unit' ? 'units' : 'behaviors'] || {};
    
    if (Object.keys(dataObj).length === 0 && type === 'beh') {
        const p = document.getElementById('radar-detail-panel');
        p.style.display = 'block';
        p.innerHTML = `<div style="text-align:center; padding:20px; color:#e74c3c; font-weight:bold;">해당 과목은 분석 가능한 행동영역 데이터가 없습니다.</div>`;
        if (window.__radarChartInstance) window.__radarChartInstance.destroy();
        return;
    }

    let labels = Object.keys(dataObj).filter(k => k !== '기타' && k !== '분류없음' && k !== '');
    
    labels.sort((a, b) => {
        if (type === 'unit') {
            return (dataObj[a]?.unitKey ?? 9999) - (dataObj[b]?.unitKey ?? 9999);
        } else {
            const keyA = String(dataObj[a]?.behKey || 'Z');
            const keyB = String(dataObj[b]?.behKey || 'Z');
            return keyA.localeCompare(keyB, 'en'); 
        }
    });

    const dataPoints = labels.map(l => {
        return dataObj[l].total > 0 ? Math.round((dataObj[l].o / dataObj[l].total) * 100) : 0;
    });

    // 💡 [오류 해결 2] 예전의 화려한 세부 과목별 컬러 배정 함수 부활!
    const BEH_COLORS = ['#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#3498db', '#f1c40f'];
    const getLabelColor = (label, majorSubj, index) => {
        if (type === 'beh') return BEH_COLORS[index % BEH_COLORS.length];

        const info = dataObj[label];
        const qSubj = info?.qSubj || majorSubj; 

        if (majorSubj === '국어') {
            if (['화법과작문', '언어와매체'].includes(qSubj)) return '#f39c12'; // 선택(주황)
            if (/(시|소설|극|수필|문학|갈래)/.test(label)) return '#2ecc71'; // 문학(초록)
            return '#3498db'; // 독서/공통(파랑)
        } else if (majorSubj === '수학') {
            if (['미적분', '기하', '확률과통계'].includes(qSubj)) return '#f39c12'; // 선택(주황)
            if (qSubj === '수학2' || /(극한|연속|미분|적분)/.test(label)) return '#2ecc71'; // 수2(초록)
            if (qSubj === '수학1' || /(지수|로그|삼각|수열)/.test(label)) return '#3498db'; // 수1(파랑)
            return '#27ae60'; 
        }
        return '#3498db';
    };

    const pointColors = labels.map((l, i) => getLabelColor(l, subj, i));

    if (window.__radarChartInstance) window.__radarChartInstance.destroy();

    window.__renderRadarDetails = (unitNamesArray, activeUnit) => {
        const panel = document.getElementById('radar-detail-panel');
        if (!unitNamesArray || unitNamesArray.length === 0) { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        const target = activeUnit || unitNamesArray[0];

        if (window.__radarChartInstance) {
            const ds = window.__radarChartInstance.data.datasets[0];
            ds.pointRadius = labels.map(l => l === target ? 8 : 5);
            ds.pointBorderColor = labels.map(l => l === target ? '#2c3e50' : '#fff');
            window.__radarChartInstance.update();
        }
        
        let html = '';
        if (unitNamesArray.length > 1) {
            html += `<div style="margin-bottom:15px; padding:10px; background:#fdf3f2; border-radius:8px; border:1px dashed #e74c3c;"><div style="font-size:12px; color:#e74c3c; font-weight:bold; margin-bottom:8px;">🚨 겹쳐있는 취약점(0%)을 선택하세요:</div><div style="display:flex; gap:5px; flex-wrap:wrap;">`;
            unitNamesArray.forEach(u => {
                const isAct = (u === target);
                html += `<button onclick="window.__renderRadarDetails(${JSON.stringify(unitNamesArray).replace(/"/g, '&quot;')}, '${u}')" style="padding:4px 10px; border-radius:15px; border:1px solid #e74c3c; background:${isAct?'#e74c3c':'#fff'}; color:${isAct?'#fff':'#e74c3c'}; font-size:11px; cursor:pointer;">${u}</button>`;
            });
            html += `</div></div>`;
        }
        
        const dTitle = type === 'unit' ? '세부 영역 분석' : '단원별 득점 비중';
        const isCumulText = window.__isCumulativeRadar ? '<span style="font-size:12px; color:#e74c3c; border:1px solid #e74c3c; padding:2px 6px; border-radius:4px; margin-left:8px;">누적</span>' : '';
        html += `<h4 style="margin:0 0 15px 0; color:#3498db; font-size:15px; display:flex; align-items:center;">🔍 [${target}] ${dTitle} ${isCumulText}</h4>`;
        
        const details = dataObj[target].details || {};
        Object.keys(details).forEach(dk => {
            const st = details[dk];
            const rt = st.total > 0 ? Math.round((st.o / st.total) * 100) : 0;
            let bc = rt < 50 ? '#e74c3c' : (rt < 100 ? '#f1c40f' : '#2ecc71');
            html += `<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${dk}</span><b>${rt}% (${st.o}/${st.total})</b></div><div style="width:100%; height:6px; background:#eee; border-radius:3px; overflow:hidden;"><div style="width:${rt}%; height:100%; background:${bc}; transition:0.3s;"></div></div></div>`;
        });
        panel.innerHTML = html;
    };

    window.__radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                backgroundColor: type==='beh'?'rgba(155, 89, 182, 0.1)':'rgba(52, 152, 219, 0.1)',
                borderColor: type==='beh'?'#9b59b6':'#3498db',
                pointBackgroundColor: pointColors,
                pointBorderColor: '#fff',
                pointRadius: 5,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            onClick: (e, el) => {
                if (el && el.length > 0) {
                    const idx = el[0].index;
                    let overlaps = dataPoints[idx] === 0 ? labels.filter((l, i) => dataPoints[i] === 0) : [labels[idx]];
                    window.__renderRadarDetails(overlaps, labels[idx]);
                }
            },
            onHover: (e, el) => { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            scales: { 
                r: { 
                    beginAtZero: true, max: 100, ticks: { display: false }, 
                    pointLabels: { 
                        // 💡 [글씨 색 복구] 라벨 텍스트 색상에 함수를 다시 입혀서 출력!
                        color: (context) => getLabelColor(context.label, subj, labels.indexOf(context.label)),
                        font: { size: 12, weight: 'bold' } 
                    } 
                } 
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}%` } } }
        }
    });

    if (labels.length > 0) {
        let minV = Math.min(...dataPoints);
        let minLabels = labels.filter((l, i) => dataPoints[i] === minV);
        window.__renderRadarDetails(minLabels, minLabels[0]);
    }
};

// =========================================================
// 💡 추이 & 그래프 로직 (UI 렌더링 - '우리반 30%' 버튼 제거)
// =========================================================
window.__renderGradeTrendUI = function() {
    const container = document.getElementById('grade-trend-container');
    if (!container) return;

    const btnSty = (isActive, bg, fg) => `border:1px solid #dee2e6; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; background:${isActive ? bg : 'transparent'}; color:${isActive ? '#fff' : fg}; transition:0.2s;`;
    
    // 시험 종류 토글 버튼 스타일
    const examTglBtn = (key) => {
        const isOn = window.__examTypeToggles[key];
        const colors = { '더프': '#34495e', '오메가': '#e67e22', '전대실모': '#27ae60', '평가원': '#2980b9' };
        return `<button onclick="window.__toggleExamType('${key}')" style="border:1px solid ${isOn ? colors[key] : '#dee2e6'}; padding:6px 15px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold; background:${isOn ? colors[key] : '#fff'}; color:${isOn ? '#fff' : '#bdc3c7'}; transition:0.2s; margin-right:5px;">${isOn ? '✅' : '⬜'} ${key}</button>`;
    };

    // 30% 컷 토글 버튼
    const tglBtn = (key, label) => {
        const isOn = window.__toggles[key];
        return `<button onclick="window.__toggleCutoff('${key}')" style="border:1px solid ${isOn ? '#3498db' : '#dee2e6'}; padding:5px 12px; border-radius:20px; cursor:pointer; font-size:11px; font-weight:bold; background:${isOn ? '#e8f4f8' : '#fff'}; color:${isOn ? '#2980b9' : '#7f8c8d'}; transition:0.2s;">${label}</button>`;
    };

    const latestScore = window.__currentStudentScores[window.__currentStudentScores.length - 1] || {};
    const kLabel = latestScore.kor_choice ? `국어(${latestScore.kor_choice})` : '국어';
    const mLabel = latestScore.math_choice ? `수학(${latestScore.math_choice})` : '수학';
    const t1Label = latestScore.tam1_name ? `탐구1(${latestScore.tam1_name})` : '탐구1';
    const t2Label = latestScore.tam2_name ? `탐구2(${latestScore.tam2_name})` : '탐구2';

    // 과목 켜기/끄기 버튼
    const subjBtn = (id, label, color) => {
        const isOn = window.__subjectToggles[id];
        return `<button onclick="window.__toggleSubject('${id}')" style="background:${isOn ? color : '#f1f2f6'}; color:${isOn ? '#fff' : '#bdc3c7'}; border:1px solid ${isOn ? color : '#dee2e6'}; padding:4px 12px; border-radius:15px; font-size:11px; font-weight:bold; cursor:pointer; transition:0.2s;">${label}</button>`;
    };

    container.innerHTML = `
        <div style="background:#fff; padding:25px; border-radius:12px; border:1px solid #dee2e6; box-shadow:0 4px 6px rgba(0,0,0,0.02); margin-top:20px;">
            <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #f1f2f6;">
                <div style="font-size:13px; font-weight:bold; color:#7f8c8d; margin-bottom:10px;">📋 분석할 시험 선택</div>
                <div style="display:flex; flex-wrap:wrap; gap:5px;">
                    ${examTglBtn('더프')}
                    ${examTglBtn('오메가')}
                    ${examTglBtn('전대실모')}
                    ${examTglBtn('평가원')}
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h4 style="margin:0; color:#2c3e50;">📈 성적 추이</h4>
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px;">
                        <button onclick="window.__switchGView('graph')" style="${btnSty(window.__currentViewMode==='graph', '#2c3e50', '#7f8c8d')}">그래프</button>
                        <button onclick="window.__switchGView('table')" style="${btnSty(window.__currentViewMode==='table', '#2c3e50', '#7f8c8d')}">표</button>
                    </div>
                    <div style="display:flex; gap:5px; background:#f1f2f6; padding:3px; border-radius:6px;">
                        <button onclick="window.__switchGMode('pct')" style="${btnSty(window.__currentGradeMode==='pct', '#3498db', '#7f8c8d')}">백분위</button>
                        <button onclick="window.__switchGMode('raw')" style="${btnSty(window.__currentGradeMode==='raw', '#3498db', '#7f8c8d')}">원점수</button>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; ${window.__currentViewMode==='table' ? 'display:none;' : ''}">
                ${tglBtn('topTotal', '전체 상위 30%')}
                ${tglBtn('topChoice', '선택 상위 30%')}
                ${tglBtn('topHS', 'HS반 30%')}
                ${tglBtn('topGreen', '그린 30%')}
                ${tglBtn('topBlue', '블루 30%')}
                ${tglBtn('topMed', '서/의치대 30%')}
                ${tglBtn('topSKY', '연고대 30%')}
            </div>

            <div style="display:flex; gap:8px; margin-bottom:15px; ${window.__currentViewMode==='table' ? 'display:none;' : ''}">
                ${subjBtn('kor', kLabel, '#3498db')}
                ${subjBtn('math', mLabel, '#e74c3c')}
                ${subjBtn('tam1', t1Label, '#27ae60')}
                ${subjBtn('tam2', t2Label, '#f39c12')}
                ${subjBtn('eng', '영어', '#9b59b6')}
            </div>
            
            <div id="grade-display-area" style="min-height:350px;"></div>
        </div>
    `;
    
    setTimeout(() => {
        window.__renderGradeDisplay();
    }, 50);
};

// 시험 타입 토글 함수
window.__toggleExamType = function(type) {
    window.__examTypeToggles[type] = !window.__examTypeToggles[type];
    window.__renderGradeTrendUI(); 
};

// 30% 컷 라인 토글 함수
window.__toggleCutoff = function(key) { 
    window.__toggles[key] = !window.__toggles[key]; 
    window.__renderGradeTrendUI(); 
};

// 과목 토글 함수
window.__toggleSubject = function(subjId) { 
    window.__subjectToggles[subjId] = !window.__subjectToggles[subjId]; 
    window.__renderGradeTrendUI(); 
};

window.__renderGradeDisplay = function() {
    const area = document.getElementById('grade-display-area');
    
    // 1. 선택된 시험 종류(더프, 오메가 등)만 필터링
    const scores = window.__currentStudentScores.filter(s => {
        const type = getExamType(s.exam_label);
        return window.__examTypeToggles[type] === true;
    });

    if (scores.length === 0) {
        area.innerHTML = '<div style="text-align:center; padding:100px 0; color:#bdc3c7; font-weight:bold; background:#f8f9fa; border-radius:8px;">위쪽에서 분석할 시험(더프, 오메가 등)을 먼저 선택해주세요.</div>';
        return;
    }
    
    const mode = window.__currentGradeMode; 
    const view = window.__currentViewMode; 
    const toggles = window.__toggles;

    const getVal = (s, subj) => {
        if (subj === 'eng' && mode === 'pct') return s.eng_grade ? Number(s.eng_grade) : null;
        if (mode === 'pct') return s[`${subj}_exp_pct`] ? Number(s[`${subj}_exp_pct`]) : null;
        return s[`${subj}_raw_total`] !== undefined ? (s[`${subj}_raw_total`] ? Number(s[`${subj}_raw_total`]) : null) : (s[`${subj}_raw`] ? Number(s[`${subj}_raw`]) : null);
    };

    const getTop30 = (examLabel, subj, valKey, filterMode, myScore) => {
        let pool = window.__allMockScores.filter(s => s.exam_label === examLabel);
        if (filterMode === 'topClass') pool = pool.filter(s => s.class_name === window.__currentStudentClass);
        else if (filterMode === 'topHS') pool = pool.filter(s => s.class_group && s.class_group.includes('HS'));
        else if (filterMode === 'topGreen') pool = pool.filter(s => s.class_group && s.class_group.includes('그린'));
        else if (filterMode === 'topBlue') pool = pool.filter(s => s.class_group && s.class_group.includes('블루'));
        else if (filterMode === 'topMed') pool = pool.filter(s => s.class_group && (s.class_group.includes('의치') || s.class_group.includes('서/')));
        else if (filterMode === 'topSKY') pool = pool.filter(s => s.class_group && s.class_group.includes('연고'));
        
        let vals = [];
        if (subj === 'kor' || subj === 'math') {
            if (filterMode === 'topChoice') {
                const choiceKey = subj === 'kor' ? 'kor_choice' : 'math_choice';
                const myChoice = myScore[choiceKey];
                if (!myChoice) return null;
                pool = pool.filter(s => s[choiceKey] === myChoice);
            }
            vals = pool.map(s => Number(s[valKey]) || 0);
        } else if (subj === 'tam1' || subj === 'tam2') {
            const myTamName = subj === 'tam1' ? myScore.tam1_name : myScore.tam2_name;
            if (!myTamName) return null;
            const suffix = valKey.replace(subj, ""); 
            pool.forEach(s => {
                if (s.tam1_name === myTamName) vals.push(Number(s["tam1" + suffix]) || 0);
                if (s.tam2_name === myTamName) vals.push(Number(s["tam2" + suffix]) || 0);
            });
        } else if (subj === 'eng') {
            vals = pool.map(s => Number(s[valKey]) || 0);
        }
        
        if (subj === 'eng' && valKey === 'eng_grade') vals = vals.filter(v => v > 0).sort((a, b) => a - b);
        else vals = vals.filter(v => v > 0).sort((a, b) => b - a);
        
        if (vals.length === 0) return null;
        let idx = Math.floor(vals.length * 0.3);
        if (idx >= vals.length) idx = vals.length - 1;
        return vals[idx];
    };

    if (view === 'graph') {
        area.innerHTML = '<canvas id="gradeChart"></canvas>';
        const ctx = document.getElementById('gradeChart').getContext('2d');
        const labels = scores.map(s => s.exam_label);
        const datasets = [];
        const colors = { kor:'#3498db', math:'#e74c3c', tam1:'#27ae60', tam2:'#f39c12', eng:'#9b59b6' };
        
        const subjs = [{id:'kor', name:'국어'}, {id:'math', name:'수학'}, {id:'tam1', name:'탐구1'}, {id:'tam2', name:'탐구2'}, {id:'eng', name:'영어'}];
        const rPt = scores.length === 1 ? 5 : 0;

        subjs.forEach(sbj => {
            if (!window.__subjectToggles[sbj.id]) return;

            let valKey = (sbj.id === 'eng') ? (mode === 'pct' ? 'eng_grade' : 'eng_raw') : (mode === 'pct' ? `${sbj.id}_exp_pct` : (sbj.id.startsWith('tam') ? `${sbj.id}_raw` : `${sbj.id}_raw_total`));
            const yAxisID = (sbj.id === 'eng' && mode === 'pct') ? 'yGrade' : 'y';
            
            // 학생 본인 성적 (실선)
            datasets.push({ 
                label: sbj.name, 
                data: scores.map(s => getVal(s, sbj.id)), 
                borderColor: colors[sbj.id], 
                backgroundColor: colors[sbj.id], 
                tension: 0.1, 
                borderWidth: 3,
                pointRadius: 4, 
                fill: false, 
                yAxisID: yAxisID 
            });

            // 💡 [핵심 교정] "if (sbj.id !== 'eng')" 차단막 삭제! 이제 영어도 30% 선을 그립니다.
            const addLine = (key, label, dashPattern, color) => {
                if (window.__toggles[key]) {
                    datasets.push({ 
                        label: `${sbj.name} (${label})`, 
                        data: scores.map(s => getTop30(s.exam_label, sbj.id, valKey, key, s)), 
                        borderColor: color || colors[sbj.id], 
                        borderDash: dashPattern, 
                        borderWidth: 1.5, 
                        pointRadius: rPt, 
                        pointStyle: 'rect', 
                        fill: false, 
                        yAxisID: yAxisID 
                    });
                }
            };

            addLine('topTotal', '전체상위30%', [5, 5], colors[sbj.id]);
            addLine('topChoice', '선택상위30%', [3, 3], '#9b59b6'); 
            addLine('topClass', '우리반30%', [2, 2], '#1abc9c');
            addLine('topHS', 'HS반30%', [4, 2], '#e67e22'); 
            addLine('topGreen', '그린30%', [4, 2], '#2ecc71');
            addLine('topBlue', '블루30%', [4, 2], '#3498db');
            addLine('topMed', '서/의치대30%', [4, 2], '#c0392b'); 
            addLine('topSKY', '연고대30%', [4, 2], '#2980b9');
        });

        Chart.defaults.color = '#7f8c8d';
        const chartScales = { 
            x: { grid: { display: false } }, 
            y: { type: 'linear', display: true, position: 'left', beginAtZero: true, max: 100, grid: { color: '#ecf0f1' }, title: { display: true, text: mode === 'pct' ? '백분위' : '원점수' } } 
        };

        if (window.__subjectToggles['eng'] && mode === 'pct') {
            chartScales.yGrade = { 
                type: 'linear', display: true, position: 'right', reverse: true, min: 1, max: 9, 
                ticks: { stepSize: 1, callback: function(value) { return value + '등급'; } }, 
                grid: { drawOnChartArea: false } 
            };
        }

        if (window.__gradeChartInstance) {
            window.__gradeChartInstance.destroy();
        }

        window.__gradeChartInstance = new Chart(ctx, { 
            type: 'line', 
            data: { labels, datasets }, 
            options: { 
                responsive: true, maintainAspectRatio: false, scales: chartScales, 
                plugins: { 
                    legend: { display: false }, 
                    tooltip: { 
                        mode: 'index', intersect: false, 
                        callbacks: { 
                            label: function(context) { 
                                let label = context.dataset.label || ''; 
                                if (label) label += ': '; 
                                if (context.parsed.y !== null) { 
                                    label += context.parsed.y; 
                                    if (context.dataset.yAxisID === 'yGrade') label += '등급'; 
                                    else label += (mode === 'pct' ? '%' : '점');
                                } 
                                return label; 
                            } 
                        } 
                    } 
                } 
            } 
        });

    } else {
        const v = (val) => (val === null || val === undefined || val === "" || val === "0" || val === 0) ? '-' : val;
        
        let h = `
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #dee2e6; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <style>
                .grade-trend-table { width:100%; border-collapse:collapse; text-align:center; font-size:13px; color:#2c3e50; min-width:1150px; background:#fff; }
                .grade-trend-table th, .grade-trend-table td { border:1px solid #ecf0f1; padding:10px 6px; }
                .grade-trend-table thead th { border-bottom:2px solid #dee2e6; }
                .grade-trend-table tbody tr:hover { background:#fbfbfc; }
                .grade-trend-table .g-kor { background:rgba(52, 152, 219, 0.03); }
                .grade-trend-table .g-math { background:rgba(231, 76, 60, 0.03); }
                .grade-trend-table .g-eng { background:rgba(155, 89, 182, 0.03); }
                .grade-trend-table .g-hist { background:rgba(142, 68, 173, 0.03); }
                .grade-trend-table .g-tam1 { background:rgba(39, 174, 96, 0.03); }
                .grade-trend-table .g-tam2 { background:rgba(243, 156, 18, 0.03); }
            </style>
            <table class="grade-trend-table">
                <thead>
                    <tr style="background:#f8f9fa;">
                        <th rowspan="2" style="font-weight:bold; color:#34495e; padding:12px;">시험구분</th>
                        <th colspan="4" style="color:#2980b9;">국어</th>
                        <th colspan="4" style="color:#c0392b;">수학</th>
                        <th colspan="2" style="color:#8e44ad;">영어</th>
                        <th colspan="2" style="color:#7f8c8d;">한국사</th>
                        <th colspan="5" style="color:#27ae60;">탐구1</th>
                        <th colspan="5" style="color:#d35400;">탐구2</th>
                    </tr>
                    <tr style="font-size:11px; color:#7f8c8d; background:#fff;">
                        <th>원점</th><th>표점</th><th>백분위</th><th>등급</th>
                        <th>원점</th><th>표점</th><th>백분위</th><th>등급</th>
                        <th>원점</th><th>등급</th>
                        <th>원점</th><th>등급</th>
                        <th>과목</th><th>원점</th><th>표점</th><th>백분위</th><th>등급</th>
                        <th>과목</th><th>원점</th><th>표점</th><th>백분위</th><th>등급</th>
                    </tr>
                </thead>
                <tbody>
        `;

        scores.forEach(s => {
            const stdName = (n) => {
                if (!n || n === '-' || n === 'null') return '-';
                let str = String(n).trim();
                str = str.replace(/생활과윤리|생윤/, '생윤').replace(/사회문화|사문/, '사문')
                         .replace(/한국지리|한지/, '한지').replace(/세계지리|세지/, '세지')
                         .replace(/동아시아사|동사/, '동사').replace(/정치와법|정법/, '정법')
                         .replace(/물리학1|물리1|물1/, '물1').replace(/화학1|화1/, '화1')
                         .replace(/생명과학1|생명1|생물1|생1/, '생1').replace(/지구과학1|지구1|지학1|지1/, '지1');
                return str;
            };

            h += `
            <tr>
                <td style="font-weight:bold; color:#2c3e50;">${s.exam_label}</td>
                <td class="g-kor">${v(s.kor_raw_total)}</td><td class="g-kor">${v(s.kor_exp_std)}</td><td class="g-kor">${v(s.kor_exp_pct)}</td><td class="g-kor"><b>${v(s.kor_exp_grade)}</b></td>
                <td class="g-math">${v(s.math_raw_total)}</td><td class="g-math">${v(s.math_exp_std)}</td><td class="g-math">${v(s.math_exp_pct)}</td><td class="g-math"><b>${v(s.math_exp_grade)}</b></td>
                <td class="g-eng">${v(s.eng_raw)}</td><td class="g-eng"><b>${v(s.eng_grade)}</b></td>
                <td class="g-hist">${v(s.extra_raw)}</td><td class="g-hist"><b>${v(s.hist_grade || s.hist_exp_grade)}</b></td>
                <td class="g-tam1" style="font-size:12px;">${stdName(s.tam1_name)}</td><td class="g-tam1">${v(s.tam1_raw)}</td><td class="g-tam1">${v(s.tam1_exp_std)}</td><td class="g-tam1">${v(s.tam1_exp_pct)}</td><td class="g-tam1"><b>${v(s.tam1_exp_grade)}</b></td>
                <td class="g-tam2" style="font-size:12px;">${stdName(s.tam2_name)}</td><td class="g-tam2">${v(s.tam2_raw)}</td><td class="g-tam2">${v(s.tam2_exp_std)}</td><td class="g-tam2">${v(s.tam2_exp_pct)}</td><td class="g-tam2"><b>${v(s.tam2_exp_grade)}</b></td>
            </tr>`;
        });

        h += '</tbody></table></div>'; 
        area.innerHTML = h;
    }
};

window.__switchGView = function(v) { window.__currentViewMode = v; window.__renderGradeTrendUI(); };
window.__switchGMode = function(m) { window.__currentGradeMode = m; window.__renderGradeTrendUI(); };

// =========================================================
// 💡 5. 상세 모달창 (주차별 타임테이블 등)
// =========================================================
window.__openDetailModal = async function(type, studentId, studentName) {
    let modalOverlay = document.getElementById('custom-detail-modal');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'custom-detail-modal';
        modalOverlay.style.position = 'fixed'; modalOverlay.style.top = '0'; modalOverlay.style.left = '0'; modalOverlay.style.width = '100%'; modalOverlay.style.height = '100%'; modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)'; modalOverlay.style.zIndex = '9999'; modalOverlay.style.display = 'flex'; modalOverlay.style.justifyContent = 'center'; modalOverlay.style.alignItems = 'center';
        modalOverlay.addEventListener('click', function(e) { if (e.target === modalOverlay) { modalOverlay.style.display = 'none'; document.body.style.overflow = ''; } });
        document.body.appendChild(modalOverlay);
    }
    modalOverlay.style.display = 'flex'; document.body.style.overflow = 'hidden';

    const titleMap = { 'attendance': '📅 출결 주차별 상세 내역', 'move': '🚶 이동 전체 내역', 'sleep': '💤 취침 전체 내역', 'eduscore': '🚨 교육점수 전체 내역' };
    modalOverlay.innerHTML = `<div style="background:#fff; width:98%; max-width:1000px; max-height:85vh; border-radius:12px; padding:25px; box-shadow:0 10px 30px rgba(0,0,0,0.2); display:flex; flex-direction:column;"><div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;"><h3 style="margin:0; color:#2c3e50;">${titleMap[type]} - ${studentName}</h3><button onclick="document.getElementById('custom-detail-modal').style.display='none'; document.body.style.overflow='';" style="background:none; border:none; font-size:20px; cursor:pointer; color:#7f8c8d; padding:0;">✖</button></div><div id="modal-content-area" style="flex:1; overflow-y:auto; padding-right:10px;"><div style="text-align:center; padding:50px; color:#7f8c8d;">⏳ 데이터를 불러오는 중입니다...</div></div></div>`;

    const contentArea = document.getElementById('modal-content-area');
    try {
        let contentHtml = '';
        if (type === 'attendance') {
            const [resAtt, resMove, resSurvey, resEdu] = await Promise.all([ 
                window.__fetchAllAttendance(studentId), // 👈 1000개 무제한 함수로 교체
                _supabase.from('move_log').select('*').eq('student_id', studentId), 
                _supabase.from('survey_log').select('*').eq('student_id', studentId), 
                _supabase.from('edu_score_log').select('*').eq('student_id', studentId) 
            ]);
            const data = resAtt.data || []; const moveData = resMove.data || []; const surveyData = resSurvey.data || []; const eduData = resEdu.data || [];
            if (!data || data.length === 0) { contentArea.innerHTML = '<div style="text-align:center; padding:30px; color:#7f8c8d;">기록이 없습니다.</div>'; return; }

            const now = new Date(); const todayIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; const currentP = parseInt(getCurrentPeriod(), 10) || 0;
            const schedMap = {};
            surveyData.forEach(sv => {
                const dStr = sv.survey_date; let reason = sv.reason ? sv.reason.split('(')[0].trim() : ''; const timeType = sv.arrival_time_type || ""; let startP = 0, endP = 0;
                if (timeType.includes("결석")) { startP = 1; endP = 8; } else if (timeType.includes("오전")) { startP = 1; endP = 3; } else if (timeType.includes("오후")) { startP = 1; endP = 6; } else if (timeType.includes("야간") || timeType.includes("저녁")) { startP = 1; endP = 7; }
                if (startP > 0) { if (!schedMap[dStr]) schedMap[dStr] = {}; for(let p=startP; p<=endP; p++) schedMap[dStr][p] = `[설문] ${reason}`; }
            });
            const getPeriodFromTime = (timeStr) => { if (!timeStr) return 0; const [h, m] = timeStr.split(':').map(Number); const t = h * 60 + m; if (t < 8*60+30) return 1; if (t < 10*60+10) return 2; if (t < 12*60) return 3; if (t < 14*60+30) return 4; if (t < 15*60+50) return 5; if (t < 17*60+30) return 6; if (t < 20*60+10) return 7; return 8; };
            moveData.forEach(mv => { 
                // 💡 [방어막 1] 화장실/정수기 뿐만 아니라 '취소'가 들어간 사유도 모달창에서 무시!
                if (mv.reason === "화장실/정수기" || mv.reason.includes("취소")) return; 
                
                const dStr = mv.move_date; 
                let rp = parseInt(mv.return_period, 10) || 0; 
                if (mv.return_period === "복귀안함") rp = 8; 
                const sp = getPeriodFromTime(mv.move_time); 
                
                // 💡 [방어막 2] 상담이거나, 복귀 교시에 날짜(-)가 잘못 입력된 경우 무조건 시작 교시 1칸으로 고정!
                if (mv.reason.includes("상담") || String(mv.return_period).includes("-")) {
                    rp = sp;
                }

                if (rp > 8) rp = 8; // 2026교시 방어막

                if (!schedMap[dStr]) schedMap[dStr] = {}; 
                if (rp > 0) { 
                    const start = sp > 0 ? sp : rp; 
                    for(let p=start; p<=rp; p++) schedMap[dStr][p] = schedMap[dStr][p] ? schedMap[dStr][p] + ` / ${mv.reason}` : mv.reason; 
                } else { 
                    const targetP = sp > 0 ? sp : 1; 
                    schedMap[dStr][targetP] = schedMap[dStr][targetP] ? schedMap[dStr][targetP] + ` / ${mv.reason}` : mv.reason; 
                } 
            });
            
            eduData.forEach(ed => { if (ed.reason.includes('지각')) { const dStr = ed.score_date; const sp = getPeriodFromTime(ed.score_time) || 1; if (!schedMap[dStr]) schedMap[dStr] = {}; schedMap[dStr][sp] = schedMap[dStr][sp] ? schedMap[dStr][sp] + ` / ${ed.reason}` : ed.reason; } });

            const weekMap = {}; const getMonday = (dStr) => { const d = new Date(dStr); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().split('T')[0]; };
            data.forEach(row => { const mon = getMonday(row.attendance_date); if (!weekMap[mon]) weekMap[mon] = {}; if (!weekMap[mon][row.attendance_date]) weekMap[mon][row.attendance_date] = {}; weekMap[mon][row.attendance_date][row.period] = { status: row.status_code, memo: row.memo }; });
            const weeks = Object.keys(weekMap).sort().reverse();
            contentHtml += `<div style="margin-bottom:15px;"><select id="week-selector" onchange="document.querySelectorAll('.week-table-container').forEach(el => el.style.display='none'); document.getElementById('week-'+this.value).style.display='block';" style="padding:8px 12px; border-radius:6px; border:1px solid #bdc3c7; background:#f8f9fa; font-size:14px; cursor:pointer; color:#2c3e50; font-weight:bold;">`;
            const formatDateShort = (dStr) => { const d = new Date(dStr); const days = ['일','월','화','수','목','금','토']; return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`; };
            weeks.forEach((mon, idx) => { const endDay = new Date(mon); endDay.setDate(endDay.getDate() + 6); const label = idx === 0 ? `최신 주차 (${formatDateShort(mon)} ~ ${formatDateShort(endDay.toISOString().split('T')[0])})` : `${formatDateShort(mon)} 주차`; contentHtml += `<option value="${mon}">${label}</option>`; });
            contentHtml += `</select></div><style>.att-table { width:100%; border-collapse:collapse; text-align:center; font-size:12px; color:#2c3e50; min-width:800px; } .att-table th, .att-table td { border:1px solid #dfe6e9; padding:8px 2px; } .att-table th { background:#f1f2f6; font-weight:bold; } .st-1 { background:#e8f8f5; color:#27ae60; font-weight:bold; border-radius:3px; padding:2px 0; } .st-2 { background:#fef9e7; color:#f39c12; font-weight:bold; border-radius:3px; padding:2px 0; } .st-3 { background:#fadedb; color:#e74c3c; font-weight:bold; border-radius:3px; padding:2px 0; } .st-memo { font-size:11px; color:#7f8c8d; max-width:80px; word-break:keep-all; font-weight:bold; }</style>`;
            
            weeks.forEach((mon, idx) => {
                const displayStyle = idx === 0 ? 'block' : 'none';
                contentHtml += `<div id="week-${mon}" class="week-table-container" style="display:${displayStyle}; overflow-x:auto;"><table class="att-table"><thead><tr><th rowspan="2" style="width:40px;">교시</th>`;
                const weekDates = []; for(let i=0; i<7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); const dStr = d.toISOString().split('T')[0]; weekDates.push(dStr); const dateColor = i === 6 ? '#e74c3c' : '#2c3e50'; contentHtml += `<th colspan="2" style="color:${dateColor}">${formatDateShort(dStr)}</th>`; }
                contentHtml += `</tr><tr>`; for(let i=0; i<7; i++) { contentHtml += `<th>스케줄</th><th>출/결</th>`; } contentHtml += `</tr></thead><tbody>`;
                for(let p=1; p<=8; p++) {
                    contentHtml += `<tr><td style="background:#fcfcfc; font-weight:bold;">${p}교시</td>`;
                    
                    weekDates.forEach(dateStr => {
                        const isFuture = dateStr > todayIso || (dateStr === todayIso && p > currentP); 
                        const cellData = (weekMap[mon][dateStr] && weekMap[mon][dateStr][p]) ? weekMap[mon][dateStr][p] : null; 
                        const baseMemo = cellData && cellData.memo ? cellData.memo.trim() : ''; 
                        const extraMemo = schedMap[dateStr]?.[p] || ''; 
                        
                        let memo = extraMemo || baseMemo || '-'; 

                        // 💡 [초강력 방어막 3] 출결 메모든 이동 스케줄이든 '취소' 글자가 있으면 무조건 화면에서 지우고 공결 처리를 막음!
                        if (memo.includes("취소")) {
                            memo = '-';
                        }

                        let statusHtml = '-';
                        if (isFuture) { 
                            statusHtml = '<span style="color:#bdc3c7;">-</span>'; 
                        } else { 
                            if (!cellData) { 
                                statusHtml = '<span style="color:#ccc;">미입력</span>'; 
                            } else { 
                                const isLate = cellData.status === '2' || memo.includes('지각'); 
                                const isUnexcusedAbs = cellData.status === '3' && !isLate && (!memo || memo === '-'); 
                                
                                if (isLate) { statusHtml = `<div class="st-2">지각</div>`; } 
                                else if (cellData.status === '1') { statusHtml = `<div class="st-1">출석</div>`; } 
                                else if (isUnexcusedAbs) { statusHtml = `<div class="st-3">결석</div>`; } 
                                else if (cellData.status === '3') { statusHtml = `<div style="background:#f1f2f6; color:#7f8c8d; font-weight:bold; border-radius:3px; padding:2px 0;">공결</div>`; } 
                                else { statusHtml = cellData.status; } 
                            } 
                        }
                        const memoStyle = (isFuture && memo !== '-') ? 'color:#3498db; font-weight:900;' : ''; 
                        contentHtml += `<td class="st-memo" style="${memoStyle}">${memo}</td><td>${statusHtml}</td>`;
                    });
                    
                    contentHtml += `</tr>`;
                }
                contentHtml += `</tbody></table></div>`;
            });
            contentArea.innerHTML = contentHtml;
        } 
        else {
            window.__modalData = { type: type, items: [] }; let tableQuery = null;
            if (type === 'move') { tableQuery = _supabase.from('move_log').select('*').eq('student_id', studentId).order('move_date', {ascending: false}).order('move_time', {ascending: false}); } else if (type === 'sleep') { tableQuery = _supabase.from('sleep_log').select('*').eq('student_id', studentId).order('sleep_date', {ascending: false}); } else if (type === 'eduscore') { tableQuery = _supabase.from('edu_score_log').select('*').eq('student_id', studentId).order('score_date', {ascending: false}); }
            
            const { data } = await tableQuery; 
            // 💡 [변경] 교육점수일 경우 전처리 함수 통과
            window.__modalData.items = (type === 'eduscore') ? window.__processEduScores(data) : (data || []);
            contentArea.innerHTML = `<style>.period-btn { background:#f1f2f6; border:1px solid #dfe6e9; padding:6px 16px; margin-left:6px; border-radius:6px; cursor:pointer; color:#7f8c8d; font-size:13px; font-weight:bold; transition:all 0.2s; } .period-btn.active { background:#2c3e50; color:#ffffff; border-color:#2c3e50; } .period-btn:hover:not(.active) { background:#e2e6ea; } .data-table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; color:#2c3e50; margin-top:10px; } .data-table th { padding:12px 10px; border-bottom:2px solid #ecf0f1; color:#7f8c8d; font-weight:normal; font-size:13px; } .data-table td { padding:12px 10px; border-bottom:1px solid #f1f2f6; } .data-table tbody tr:hover { background-color:#f8f9fa; }</style><div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:20px;"><span style="font-size:13px; color:#7f8c8d;">조회 기간:</span><button class="period-btn" id="btn-period-7" onclick="window.__renderModalTable(7)">7일</button><button class="period-btn" id="btn-period-15" onclick="window.__renderModalTable(15)">15일</button><button class="period-btn" id="btn-period-30" onclick="window.__renderModalTable(30)">30일</button></div><div id="modal-table-area"></div>`;
            window.__renderModalTable = function(days) {
                [7, 15, 30].forEach(d => { const btn = document.getElementById('btn-period-' + d); if (btn) { if (d === days) btn.classList.add('active'); else btn.classList.remove('active'); } });
                const now = new Date(); const targetDate = new Date(now); targetDate.setDate(now.getDate() - (days - 1)); const targetIso = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                const filtered = window.__modalData.items.filter(item => { const dStr = item.move_date || item.sleep_date || item.score_date; return dStr >= targetIso; });
                let tableHtml = '<table class="data-table"><thead><tr>';
                if (window.__modalData.type === 'move') { tableHtml += '<th>날짜</th><th>시간</th><th>사유</th><th>복귀교시</th></tr></thead><tbody>'; if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; else { filtered.forEach(d => { tableHtml += `<tr><td style="color:#7f8c8d;">${d.move_date}</td><td>${d.move_time || '-'}</td><td><b style="color:#2c3e50;">${d.reason}</b></td><td style="color:#95a5a6;">${d.return_period || '-'}</td></tr>`; }); } } else if (window.__modalData.type === 'sleep') { tableHtml += '<th>날짜</th><th>교시</th><th>기록</th><th>횟수</th></tr></thead><tbody>'; if (filtered.length === 0) tableHtml += '<tr><td colspan="4" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; else { filtered.forEach(d => { tableHtml += `<tr><td style="color:#7f8c8d;">${d.sleep_date}</td><td>${d.period}교시</td><td><b style="color:#2c3e50;">취침</b></td><td><b style="color:#8e44ad; background:#f4ebf7; padding:4px 8px; border-radius:4px; font-size:12px;">${d.count}회 적발</b></td></tr>`; }); } } else if (window.__modalData.type === 'eduscore') { 
                tableHtml += '<th>날짜</th><th>사유</th><th>점수</th></tr></thead><tbody>'; 
                if (filtered.length === 0) tableHtml += '<tr><td colspan="3" style="text-align:center; padding:40px; color:#95a5a6;">해당 기간에 기록이 없습니다.</td></tr>'; 
                else { 
                    filtered.forEach(d => { 
                        tableHtml += `<tr><td style="color:#7f8c8d;">${d.score_date}</td><td><b style="color:#2c3e50;">${d.display_reason}</b></td><td><b style="color:#e74c3c; background:#fdedec; padding:4px 8px; border-radius:4px; font-size:12px;">+${d.calculated_score}점</b></td></tr>`; 
                    }); 
                } 
            }
                tableHtml += '</tbody></table>'; document.getElementById('modal-table-area').innerHTML = tableHtml;
            };
            window.__renderModalTable(7);
        }
    } catch (err) { contentArea.innerHTML = `<div style="text-align:center;"><h3 style="color:#e74c3c;">오류 발생</h3><p>${err.message}</p></div>`; }
};

init();
