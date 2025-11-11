# 성적표 생성 프로그램

국어 시험 채점 및 성적표 생성을 위한 웹 기반 애플리케이션입니다.

## 주요 기능

### 📝 시험 관리
- 시험 정보 등록 (시험명, 시행 기관, 학교, 학년, 시험일)
- 문제 정보 관리 (문항별 유형, 영역, 세부영역, 작품/지문, 배점, 출제의도)
- 객관식 문제: 선택지 및 해설 관리
- 서술형 문제: 모범답안 관리
- CSV 파일 가져오기/내보내기

### ✍️ 답안 입력
- 학생 정보 등록 (이름, 학교, 학년)
- 시험별 학생 답안 입력 (시트 형식)
- 객관식: 선택지 번호 입력
- 서술형: 부분점수 입력
- 답안 CSV 일괄 업로드/다운로드

### 📊 채점 및 분석
- 자동 채점 시스템
- 학생별 성적 조회 (점수순 정렬, 등수 표시)
- 문제별 분석
  - 오답률 순 정렬
  - 선택지별 선택 비율 (객관식)
  - 부분점수별 분포 (서술형)
- 학생 목록 모달 (선택지별, 점수별)
- 성적표 CSV 내보내기

### 📄 성적표 생성
- 개인별 상세 성적표 생성
- 포함 내용:
  - 기본 정보 (학생명, 학교, 학년, 시험일)
  - 점수 요약 (총점, 등수, 평균, 최고점, 최저점)
  - 성적 추이 그래프 (과거 시험 포함)
  - 영역별 성취도 레이더 차트
  - 오답 분석 (문제별 피드백)
- 인쇄 및 PDF 저장 기능

### 📚 학생별 오답 노트
- 학생 선택 후 복수 시험 선택
- 통합 학습 통계
  - 총 문제 수, 오답 수, 평균 정답률
  - 성적 추이 그래프
  - 영역별 정답률 (레이더 차트 + 테이블)
  - 단원/지문별 통계 (취약 단원 분석)
- 선택한 시험들의 오답 문제 통합 출력
- 인쇄 및 PDF 저장
  - 1페이지: 통계 및 차트
  - 2페이지: 단원/지문별 통계
  - 3페이지~: 오답 문제 (4개씩)

### 💾 데이터 관리
- 브라우저 로컬 스토리지 기반 데이터 저장
- 데이터 백업/복원 기능 (JSON)
- 검색 가능한 드롭다운 (시험 선택, 학생 선택)

## 사용 방법

### 1. 시험 관리
1. "새 시험 만들기" 버튼 클릭
2. 시험 정보 입력 (시험명, 시행기관, 학교, 학년, 시험일)
3. 문제 추가 버튼으로 문항별 정보 입력
   - 객관식: 선택지 및 정답, 해설 입력
   - 서술형: 모범답안 입력
4. CSV로 일괄 가져오기/내보내기 가능

### 2. 답안 입력
1. 시험 선택
2. "답안 입력 시작" 클릭
3. 학생 정보 입력 (신규 학생 자동 등록)
4. 답안 시트에 답안 입력
   - 객관식: 1~5 숫자 입력
   - 서술형: 점수 입력 (0 ~ 배점)
5. 자동 저장됨

### 3. 채점 및 분석
1. 시험 선택
2. 학생별 성적 확인 (점수순 정렬)
3. 문제별 분석 확인
   - 문제 클릭 시 상세 분석 모달
   - 선택지별 선택 학생 목록 확인
   - 부분점수별 학생 목록 확인

### 4. 성적표 생성
1. 시험 선택
2. 학생 선택
3. "성적표 생성" 클릭
4. 미리보기 확인 후 인쇄 또는 PDF 저장

### 5. 학생별 오답 노트
1. 학생 선택
2. 분석할 시험들 체크박스로 선택
3. "오답 노트 생성" 클릭
4. 통계 및 차트 확인
5. 인쇄 또는 PDF 저장

## 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Charts**: Chart.js 3.9.1
- **PDF Export**: jsPDF 2.5.1, html2canvas 1.4.1
- **Storage**: Browser LocalStorage
- **CSV Parsing**: Custom CSV Utils

## 브라우저 호환성

- Chrome (권장)
- Edge
- Firefox
- Safari

## 데이터 저장

**🔥 Firebase Realtime Database (클라우드 저장)**

모든 데이터는 Google Firebase 클라우드 데이터베이스에 저장됩니다.

### 장점:
- ✅ 모든 브라우저와 기기에서 동일한 데이터 접근
- ✅ 자동 동기화 및 백업
- ✅ 인터넷만 있으면 어디서든 사용 가능
- ✅ 브라우저 변경 또는 데이터 삭제 시에도 안전

### 백업:
Firebase에 저장되므로 자동으로 백업되지만, 추가로 "데이터 백업" 기능을 사용하여 JSON 파일로 로컬 백업을 만들 수 있습니다.

## 배포

### GitHub Pages
- **Repository**: https://github.com/Amis99/grade-report-generator
- **Live URL**: https://amis99.github.io/grade-report-generator/
- 별도의 서버 설치가 필요 없이 브라우저에서 바로 사용 가능

### 배포 방법
```bash
git add .
git commit -m "커밋 메시지"
git push
```
- main 브랜치에 push하면 자동으로 GitHub Pages에 배포됨
- 배포 후 약 1-2분 소요

## 개발 환경 설정

### 프로젝트 구조
```
성적표 생성 프로젝트/
├── index.html                 # 메인 HTML
├── css/
│   └── style.css             # 전역 스타일
├── js/
│   ├── models.js             # 데이터 모델 (Exam, Question, Student, Answer)
│   ├── firebase-config.js    # Firebase 설정
│   ├── storage.js            # 데이터 저장소 (Firebase + 로컬)
│   ├── csv-utils.js          # CSV 가져오기/내보내기
│   ├── app.js                # 메인 앱 컨트롤러
│   ├── exam-manager.js       # 시험 관리
│   ├── exam-manager-sheet.js # 시험 관리 (시트 UI)
│   ├── answer-input.js       # 답안 입력
│   ├── answer-input-sheet.js # 답안 입력 (시트 UI)
│   ├── grading.js            # 채점 및 분석
│   ├── report-generator.js   # 성적표 생성
│   ├── wrong-note.js         # 학생별 오답 노트
│   └── searchable-select.js  # 검색 가능한 드롭다운
└── README.md
```

### Firebase 설정
**프로젝트**: grade-report-app
**Database URL**: https://grade-report-app-default-rtdb.asia-southeast1.firebasedatabase.app

#### Firebase 데이터 구조
```
/
├── exams/
│   └── {examId}/
│       ├── id
│       ├── name
│       ├── school
│       ├── grade
│       ├── series
│       ├── date
│       └── organization
├── questions/
│   └── {questionId}/
│       ├── id
│       ├── examId
│       ├── number
│       ├── type
│       ├── domain
│       ├── subDomain
│       ├── passage
│       ├── points
│       ├── correctAnswer
│       ├── intent
│       └── choiceExplanations (객관식)
├── students/
│   └── {studentId}/
│       ├── id
│       ├── name
│       ├── school
│       └── grade
└── answers/
    └── {answerId}/
        ├── id
        ├── examId
        ├── studentId
        ├── questionId
        ├── answerText (객관식)
        └── scoreReceived (서술형)
```

### Git 설정
```bash
# 저장소 정보
git remote -v
# origin  https://github.com/Amis99/grade-report-generator.git

# 현재 브랜치
git branch
# * main

# 최근 커밋 이력
git log --oneline -10
```

### 로컬 개발
1. 파일 수정
2. 브라우저에서 `index.html` 열기
3. 개발자 도구 (F12)에서 콘솔 확인
4. Firebase Console에서 데이터 확인 가능

## 개발 가이드

### 코드 스타일
- **JavaScript**: Vanilla JS (ES6+)
- **비동기 처리**: async/await 사용 (Firebase 작업)
- **클래스 기반**: 각 모듈은 클래스로 구현
- **이벤트 리스너**: async 콜백 사용

### 중요 원칙
1. **Firebase 작업은 반드시 async/await**
   ```javascript
   async function saveData() {
       await storage.saveExam(exam);
       await storage.saveQuestions(questions);
       this.loadExamList(); // UI 업데이트는 저장 완료 후
   }
   ```

2. **시험명이 다르면 다른 시험**
   - CSV 가져오기 시 시험명 충돌 체크
   - 자동으로 새 시험 생성 옵션 제공

3. **중복 데이터 방지**
   - 답안 업로드 시 기존 답안 확인
   - (examId, studentId, questionId) 조합으로 중복 체크
   - 기존 답안은 업데이트, 없으면 생성

4. **CSV 검증**
   - 시험명이 없는 행은 제외
   - 문항 번호가 없는 행은 제외

### 주요 작업 이력 (2025-01-11)

#### 1. Firebase 통합
- localStorage에서 Firebase Realtime Database로 마이그레이션
- 하이브리드 모드: Firebase 우선, localStorage 폴백
- 자동 마이그레이션 기능

#### 2. 비동기 처리 개선
- 모든 storage 작업에 async/await 적용
- UI 업데이트 전 Firebase 작업 완료 대기
- 데이터 로딩 완료 모달 추가

#### 3. CSV 기능 개선
- 시험명 충돌 감지 및 자동 시험 분리
- 시험 날짜 자동 반영
- 답안 중복 방지 (업데이트 모드)
- 시험명 없는 행 자동 제외

#### 4. UI 개선
- 모바일 폰트 크기 50% 축소 (768px 이하)
- 시험 관리/답안 입력/채점 탭 글자 20% 축소
- 학생별 성적 테이블 추가 축소
- 데이터 로딩 완료 모달

#### 5. 차트 최적화
- 성적 추이 그래프 최근 5개 시험만 표시
- 학생이 응시한 시험만 표시
- 오답 노트 그래프 y축 범위 자동 조정 (최저점~100점)

#### 6. 버그 수정
- 점수 두 배로 나오는 문제 (답안 중복 저장)
- 시험 합쳐지는 문제 (시험명 검증)
- 부동소수점 표시 오류 (.toFixed(1) 적용)
- 데이터 즉각 반영 문제 (캐시 로드 대기)

### 문제 해결 체크리스트
- [ ] Firebase 작업에 await 붙였는가?
- [ ] UI 업데이트 전 데이터 저장 완료했는가?
- [ ] CSV 가져오기 시 시험명 체크했는가?
- [ ] 중복 데이터 방지 로직이 있는가?
- [ ] 콘솔에 적절한 로그를 남겼는가?

## Firebase Console 접근
https://console.firebase.google.com/project/grade-report-app

**주의**: Firebase Realtime Database에 모든 데이터가 저장되어 있으므로, 작업 전 항상 백업을 권장합니다.

## 라이선스

이 프로젝트는 교육 목적으로 제작되었습니다.

## 기여

버그 리포트 및 기능 제안은 Issues를 통해 제출해 주세요.

---

**개발**: 국어농장
**최종 업데이트**: 2025년 1월 11일
**프로젝트 디렉토리**: `C:\Users\권경아\Documents\성적표 생성 프로젝트`
