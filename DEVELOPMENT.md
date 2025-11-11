# 개발 가이드

## 🚀 빠른 시작

### 환경 정보
- **프로젝트 경로**: `C:\Users\권경아\Documents\성적표 생성 프로젝트`
- **GitHub Repository**: https://github.com/Amis99/grade-report-generator
- **배포 URL**: https://amis99.github.io/grade-report-generator/
- **Firebase Project**: grade-report-app
- **Firebase Database**: https://grade-report-app-default-rtdb.asia-southeast1.firebasedatabase.app

### 작업 재개 시 체크리스트
1. [ ] 프로젝트 경로로 이동
2. [ ] `git status` 확인
3. [ ] `git pull` (최신 코드 받기)
4. [ ] Firebase Console에서 데이터 확인
5. [ ] 로컬에서 `index.html` 열어서 작동 테스트

## 📂 프로젝트 구조 상세

### 핵심 파일
```
js/
├── models.js              # 데이터 클래스 (Exam, Question, Student, Answer)
├── firebase-config.js     # Firebase 초기화
├── storage.js            # 저장소 계층 (Firebase + localStorage)
├── app.js                # 앱 초기화 및 탭 관리
├── csv-utils.js          # CSV 파싱 및 변환
├── exam-manager.js       # 시험 관리 기본 로직
├── exam-manager-sheet.js # 시험 관리 시트 UI
├── answer-input.js       # 답안 입력 기본 로직
├── answer-input-sheet.js # 답안 입력 시트 UI
├── grading.js            # 채점 및 분석
├── report-generator.js   # 개별 성적표
├── wrong-note.js         # 학생별 오답 노트
└── searchable-select.js  # 검색 드롭다운
```

### 파일별 역할

#### `models.js`
- 4개 데이터 클래스 정의
- `Exam`, `Question`, `Student`, `Answer`
- UUID 생성 및 초기화

#### `firebase-config.js`
- Firebase 초기화
- `firebaseApp`, `firebaseDatabase` 전역 변수 생성
- 연결 실패 시 알림

#### `storage.js` ⭐ **가장 중요**
- Firebase 우선, localStorage 폴백
- 모든 CRUD 작업은 여기서
- **반드시 async/await 사용**
- 캐시 메커니즘 (`this.cache`)

#### `app.js`
- 앱 초기화 및 전역 상태 관리
- Firebase 캐시 로드 대기
- 탭 전환 및 백업/복원
- 로컬→Firebase 마이그레이션

#### `csv-utils.js`
- CSV ↔ 객체 변환
- 시험명/날짜 추출
- 중복 답안 방지 로직
- 검증 (시험명 필수, 문항번호 필수)

## 🔥 Firebase 작업 규칙

### 1. 항상 async/await 사용
```javascript
// ❌ 잘못된 예
function saveExam() {
    storage.saveExam(exam);  // await 없음
    this.loadExamList();      // 저장 완료 전에 실행
}

// ✅ 올바른 예
async function saveExam() {
    await storage.saveExam(exam);  // 저장 완료 대기
    this.loadExamList();            // 저장 후 UI 업데이트
}
```

### 2. 이벤트 리스너에서 async 사용
```javascript
// ✅ 올바른 예
button.addEventListener('click', async () => {
    await storage.saveExam(exam);
    alert('저장 완료');
});
```

### 3. 순회에서 async 처리
```javascript
// ❌ forEach는 async 대기 안 됨
questions.forEach(async q => {
    await storage.saveQuestion(q);
});

// ✅ for...of 사용
for (const q of questions) {
    await storage.saveQuestion(q);
}
```

## 📝 CSV 가져오기 플로우

### 문제 정보 CSV
1. 사용자가 시험 선택
2. CSV 파일 선택
3. `CSVUtils.importQuestionsFromCSV()` 호출
4. **시험명 충돌 체크**
   - 기존 문제가 있고 시험명이 다르면 경고
   - [확인] → 새 시험 자동 생성
   - [취소] → 덮어쓰기 (기존 문제 삭제)
5. 시험명/날짜 반영
6. 문제 저장

### 답안 CSV
1. 시험 선택
2. CSV 파일 선택
3. `CSVUtils.importAnswersFromCSV()` 호출
4. **중복 답안 체크**
   - `(examId, studentId, questionId)` 조합으로 체크
   - 기존 답안 있으면 업데이트
   - 없으면 새로 생성
5. 통계 표시 (새로 추가 / 업데이트)
6. 답안 저장

## 🐛 일반적인 문제 해결

### 문제: 데이터가 즉시 반영되지 않음
**원인**: Firebase 작업에 await 누락
**해결**:
```javascript
// 수정 전
storage.saveExam(exam);
this.loadExamList();

// 수정 후
await storage.saveExam(exam);
this.loadExamList();
```

### 문제: 점수가 두 배로 나옴
**원인**: 답안 중복 저장
**해결**: `csv-utils.js`의 `importAnswersFromCSV()`에서 중복 체크 구현됨

### 문제: 다른 시험이 합쳐짐
**원인**: 시험명 검증 없이 덮어쓰기
**해결**: `exam-manager.js`의 `importQuestions()`에서 시험명 충돌 체크 구현됨

### 문제: 브라우저마다 다른 데이터
**원인**: localStorage 사용 (구버전)
**해결**: Firebase 사용 중이므로 모든 브라우저에서 동일한 데이터 접근 가능

## 🎨 스타일 수정

### 글자 크기 조정
- **전역**: `css/style.css`
- **모바일** (768px 이하): 50% 축소
- **특정 탭** (시험 관리, 답안 입력, 채점): 80%
- **성적 테이블**: 추가 축소 (전체 약 64%)

```css
/* 특정 탭만 축소 */
#exam-management,
#answer-input,
#grading {
    font-size: 80%;
}

/* 모바일 전체 축소 */
@media (max-width: 768px) {
    html {
        font-size: 50%;
    }
}
```

## 🔄 Git 워크플로우

### 기본 작업 흐름
```bash
# 1. 최신 코드 받기
git pull

# 2. 파일 수정

# 3. 변경사항 확인
git status
git diff

# 4. 스테이징
git add .

# 5. 커밋
git commit -m "feat: 새 기능 추가"

# 6. 푸시 (자동 배포)
git push
```

### 커밋 메시지 규칙
- `feat:` 새 기능
- `fix:` 버그 수정
- `style:` 스타일 변경
- `refactor:` 리팩토링
- `docs:` 문서 수정

### 배포 확인
1. `git push` 실행
2. 1-2분 대기
3. https://amis99.github.io/grade-report-generator/ 새로고침
4. 브라우저 캐시 클리어 (Ctrl+Shift+R)

## 📊 데이터 백업

### Firebase 콘솔에서
1. https://console.firebase.google.com/project/grade-report-app
2. Realtime Database 선택
3. 오른쪽 상단 ⋮ 메뉴
4. "데이터 내보내기" → JSON 다운로드

### 앱 내에서
1. "데이터 백업" 버튼 클릭
2. JSON 파일 다운로드
3. 안전한 곳에 보관

## 🔍 디버깅 팁

### 브라우저 개발자 도구
```javascript
// 콘솔에서 전역 객체 접근
storage          // 저장소 객체
storage.cache    // 캐시된 데이터
examManager      // 시험 관리 인스턴스
answerInput      // 답안 입력 인스턴스
grading          // 채점 인스턴스
```

### Firebase 데이터 확인
1. Firebase Console 열기
2. Realtime Database 탭
3. 실시간 데이터 구조 확인
4. 특정 노드 편집/삭제 가능

### 네트워크 요청 확인
1. 개발자 도구 → Network 탭
2. 필터: `firebasedatabase.app`
3. Firebase API 호출 확인

## ⚡ 성능 최적화

### 현재 구현된 최적화
1. **캐시 메커니즘**: Firebase 데이터를 메모리에 캐싱
2. **배치 읽기**: 앱 시작 시 모든 데이터 한 번에 로드
3. **비동기 처리**: 블로킹 없이 Firebase 작업

### 추가 최적화 가능 항목
- [ ] 큰 데이터셋에 대한 페이지네이션
- [ ] 차트 렌더링 디바운싱
- [ ] 이미지 지연 로딩

## 🚨 주의사항

### 절대 하지 말아야 할 것
1. **Firebase Config 공개하지 않기** (이미 README에 있으므로 private repo 유지)
2. **localStorage 직접 사용 금지** (항상 `storage` 객체 사용)
3. **동기 코드로 Firebase 작업** (반드시 async/await)
4. **main 브랜치 force push** (`git push --force` 금지)

### 데이터 무결성
- 시험 삭제 시 관련 문제/답안 자동 삭제
- 답안 저장 시 중복 체크
- CSV 가져오기 시 검증

## 📞 문제 발생 시

### 체크리스트
1. [ ] 콘솔에 에러 메시지 있는가?
2. [ ] Firebase 연결 상태 확인 (네트워크 탭)
3. [ ] 최신 코드로 업데이트했는가? (`git pull`)
4. [ ] 브라우저 캐시 클리어했는가?
5. [ ] `storage.cacheLoaded === true` 인가?

### 긴급 복구
```bash
# 백업 파일에서 복원
1. 앱에서 "데이터 복원" 클릭
2. JSON 파일 선택
3. 확인 후 페이지 새로고침
```

---

**마지막 업데이트**: 2025-01-11
**작성자**: Claude Code (AI Assistant)
**프로젝트 담당자**: 권경아 (국어농장)
