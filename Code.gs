/**
 * 구글 시트와 Supabase를 1:1 거울처럼 동기화 (삭제 및 필터링 포함)
 */
function syncStudentsToSupabase() {
  const props = PropertiesService.getScriptProperties();
  
  // 1. 금고에서 주소와 키 가져오기
  const SB_URL = props.getProperty("SUPABASE_URL"); 
  const SB_KEY = props.getProperty("SUPABASE_KEY"); 
  
  // 2. 공용 시트 연결 (ID와 탭 이름 확인)
  const SHEET_ID = "1XUfHetnxXxyxksEi1Ne0sIHoKTNxDFXRb4DPkcHMB7w"; 
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("전층통합"); 
  
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1); // 첫 번째 줄(헤더) 제외

  // 3. 데이터 포장 및 불필요한 데이터 거르기
  const rawPayload = rows.map(row => {
    return {
      "original_no": String(row[0] || ""),     
      "entry_date": String(row[1] || ""),      
      "exit_date": String(row[2] || ""),       
      "status": String(row[3] || ""),          
      "seat_no": String(row[4] || ""),         
      "teacher_name": String(row[5] || ""),    
      "name": String(row[6] || ""),            
      "student_id": String(row[7] || ""),      
      "class_name": String(row[8] || ""),      
      "gender": String(row[9] || ""),          
      "school_name": String(row[10] || ""),    
      "grade_level": String(row[11] || ""),    
      "student_phone": String(row[16] || ""),  
      "parent_phone": String(row[17] || ""),   
      "building_section": String(row[21] || "") 
    };
  }).filter(item => {
    // 학번을 기준으로 진짜 데이터인지 판별합니다.
    const id = String(item.student_id).trim();
    return id !== "" && id !== "학번" && id !== "무효" && id !== "NULL" && id !== "undefined";
  });

  // 4. 학번 중복 제거 (시트 내에 중복된 학번이 있을 경우 에러 방지)
  const uniqueMap = new Map();
  rawPayload.forEach(item => uniqueMap.set(item.student_id, item));
  const payload = Array.from(uniqueMap.values());

  // 5. 공통 헤더 설정
  const baseHeaders = {
    "apikey": SB_KEY,
    "Authorization": "Bearer " + SB_KEY,
    "Content-Type": "application/json"
  };

  try {
    // [STEP A] Supabase 기존 데이터 싹 비우기 (삭제 반영)
    const deleteOptions = {
      "method": "delete",
      "headers": baseHeaders,
      "muteHttpExceptions": true
    };
    // 테이블 이름을 '학생'으로 설정했습니다. 영어 테이블이면 'student'로 수정하세요.
    UrlFetchApp.fetch(`${SB_URL}/rest/v1/student?seat_no=not.is.null`, deleteOptions);
    console.log("기존 DB 데이터를 비웠습니다.");

    // [STEP B] 시트의 최신 명단 통째로 넣기
    const insertOptions = {
      "method": "post",
      "headers": baseHeaders,
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    const response = UrlFetchApp.fetch(`${SB_URL}/rest/v1/student`, insertOptions);
    
    console.log("동기화 완료! 결과:", response.getContentText());
  } catch (e) {
    console.error("실행 중 에러 발생:", e.toString());
  }
}
