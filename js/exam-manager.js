/**
 * 시험 관리 모듈
 */

class ExamManager {
    constructor() {
        this.currentExam = null;
        this.currentQuestion = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExamList();
    }

    setupEventListeners() {
        // 새 시험 만들기
        document.getElementById('createExamBtn').addEventListener('click', async () => {
            await this.createNewExam();
        });

        // 시험 삭제
        document.getElementById('deleteExamBtn').addEventListener('click', async () => {
            await this.deleteExam();
        });

        // 문제 CSV 가져오기/내보내기
        document.getElementById('importQuestionsBtn').addEventListener('click', () => {
            this.importQuestions();
        });

        document.getElementById('exportQuestionsBtn').addEventListener('click', () => {
            this.exportQuestions();
        });

        // 시험 검색
        const searchInput = document.getElementById('examSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterExamList(e.target.value);
            });
        }
    }

    /**
     * 시험 목록 로드
     */
    loadExamList() {
        const exams = storage.getAllExams();
        const examListDiv = document.getElementById('examList');

        if (exams.length === 0) {
            examListDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">등록된 시험이 없습니다.<br>"새 시험 만들기"를 클릭하여 시작하세요.</div>
                </div>
            `;
            return;
        }

        examListDiv.innerHTML = exams.map(exam => {
            const questions = storage.getQuestionsByExamId(exam.id);
            return `
                <div class="exam-item" data-exam-id="${exam.id}"
                     data-name="${exam.name}"
                     data-organization="${exam.organization || ''}"
                     data-school="${exam.school}"
                     data-grade="${exam.grade}">
                    <div class="exam-item-info">
                        <h4>${exam.name}</h4>
                        <div class="exam-item-meta">
                            ${exam.organization || '국어농장'} | ${exam.school} ${exam.grade} | ${exam.date} | 문제 ${questions.length}개
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 시험 클릭 이벤트
        examListDiv.querySelectorAll('.exam-item').forEach(item => {
            item.addEventListener('click', () => {
                const examId = item.getAttribute('data-exam-id');
                this.loadExamDetail(examId);

                // 선택 표시
                examListDiv.querySelectorAll('.exam-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }

    /**
     * 시험 목록 필터링
     */
    filterExamList(searchText) {
        const examItems = document.querySelectorAll('.exam-item');
        const lowerSearch = searchText.toLowerCase();

        examItems.forEach(item => {
            const name = item.getAttribute('data-name').toLowerCase();
            const organization = item.getAttribute('data-organization').toLowerCase();
            const school = item.getAttribute('data-school').toLowerCase();
            const grade = item.getAttribute('data-grade').toLowerCase();

            const matches = name.includes(lowerSearch) ||
                          organization.includes(lowerSearch) ||
                          school.includes(lowerSearch) ||
                          grade.includes(lowerSearch);

            item.style.display = matches ? 'flex' : 'none';
        });
    }

    /**
     * 새 시험 만들기
     */
    async createNewExam() {
        const exam = new Exam({
            name: '새 시험',
            school: '',
            grade: '',
            series: ''
        });

        await storage.saveExam(exam);
        this.loadExamList();
        this.loadExamDetail(exam.id);

        alert('새 시험이 생성되었습니다. 시험 정보를 입력해주세요.');
    }

    /**
     * 시험 상세 정보 로드
     */
    loadExamDetail(examId) {
        const exam = storage.getExam(examId);
        if (!exam) return;

        this.currentExam = exam;

        // 상세 섹션 표시
        document.getElementById('examDetailSection').style.display = 'block';

        // 문제 목록 로드 (시험 정보도 시트에 포함)
        this.loadQuestionList();
    }

    /**
     * 시험 삭제
     */
    async deleteExam() {
        if (!this.currentExam) return;

        if (!confirm('이 시험과 관련된 모든 데이터(문제, 답안)가 삭제됩니다. 계속하시겠습니까?')) {
            return;
        }

        await storage.deleteExam(this.currentExam.id);
        this.currentExam = null;

        document.getElementById('examDetailSection').style.display = 'none';
        this.loadExamList();

        alert('시험이 삭제되었습니다.');
    }

    /**
     * 문제 목록 로드 (exam-manager-sheet.js에서 오버라이드됨)
     * 이 함수는 시트 형식으로 대체됩니다.
     */
    loadQuestionList() {
        // 이 함수는 exam-manager-sheet.js에서 완전히 오버라이드됩니다.
        // 만약 이 메시지가 보인다면 exam-manager-sheet.js가 로드되지 않은 것입니다.
        console.error('loadQuestionList: exam-manager-sheet.js가 로드되지 않았습니다!');
    }

    /**
     * 문제 모달 설정 (시트 형식에서는 사용하지 않음)
     */
    setupQuestionModal() {
        // 시트 형식에서는 모달을 사용하지 않고 직접 시트에서 편집합니다.
    }

    /**
     * 문제 모달 표시 (시트 형식에서는 사용하지 않음)
     */
    showQuestionModal(question = null) {
        // 시트 형식에서는 모달을 사용하지 않습니다.
    }

    closeQuestionModal() {
        // 시트 형식에서는 모달을 사용하지 않습니다.
    }

    getNextQuestionNumber() {
        // 시트 형식에서는 사용하지 않습니다.
        return 1;
    }

    loadChoices(choices) {
        // 시트 형식에서는 사용하지 않습니다.
    }

    addChoiceField(choice = null) {
        // 시트 형식에서는 사용하지 않습니다.
    }

    saveQuestion() {
        // 시트 형식에서는 사용하지 않습니다.
    }

    /**
     * 문제 CSV 가져오기
     */
    async importQuestions() {
        if (!this.currentExam) {
            alert('먼저 시험을 선택하거나 생성해주세요.');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        fileInput.accept = '.csv';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await CSVUtils.readFile(file);
                const result = CSVUtils.importQuestionsFromCSV(text, this.currentExam.id);

                // 기존 문제 확인
                const existingQuestions = storage.getQuestionsByExamId(this.currentExam.id);
                const csvExamName = result.examName && result.examName.trim() !== '' ? result.examName.trim() : '';
                const currentExamName = this.currentExam.name.trim();

                // 시험명 충돌 체크
                if (existingQuestions.length > 0 && csvExamName && csvExamName !== currentExamName) {
                    // 기존 문제가 있고 시험명이 다른 경우
                    const action = confirm(
                        `⚠️ 시험명이 다릅니다!\n\n` +
                        `현재 시험: "${currentExamName}"\n` +
                        `CSV 시험: "${csvExamName}"\n\n` +
                        `[확인] 새 시험으로 생성 (권장)\n` +
                        `[취소] 현재 시험에 덮어쓰기 (기존 문제 삭제됨)`
                    );

                    if (action) {
                        // 새 시험 생성
                        const newExam = new Exam({
                            name: csvExamName,
                            school: this.currentExam.school,
                            grade: this.currentExam.grade,
                            series: this.currentExam.series,
                            date: result.examDate || ''
                        });
                        await storage.saveExam(newExam);

                        // 새 시험 ID로 문제 생성
                        result.questions.forEach(q => q.examId = newExam.id);

                        await storage.saveQuestions(result.questions);
                        this.loadExamList();
                        this.loadExamDetail(newExam.id);

                        alert(`✅ 새 시험 "${csvExamName}"이(가) 생성되었습니다.\n\n문제 ${result.questions.length}개가 추가되었습니다.`);
                    } else {
                        // 기존 시험 덮어쓰기
                        if (confirm('⚠️ 기존 문제를 모두 삭제하고 새 문제로 교체하시겠습니까?')) {
                            // 기존 문제 삭제
                            for (const q of existingQuestions) {
                                await storage.deleteQuestion(q.id);
                            }

                            // 시험 정보 업데이트
                            this.currentExam.name = csvExamName;
                            if (result.examDate && result.examDate.trim() !== '') {
                                this.currentExam.date = result.examDate;
                            }
                            await storage.saveExam(this.currentExam);

                            // 새 문제 저장
                            await storage.saveQuestions(result.questions);
                            this.loadQuestionList();
                            this.loadExamList();

                            alert(`✅ 시험이 업데이트되었습니다.\n\n문제 ${result.questions.length}개가 추가되었습니다.`);
                        }
                    }
                } else {
                    // 빈 시험이거나 시험명이 같은 경우 - 기존 로직
                    let updated = false;
                    if (csvExamName) {
                        this.currentExam.name = csvExamName;
                        updated = true;
                        console.log(`시험명 업데이트: ${csvExamName}`);
                    }
                    if (result.examDate && result.examDate.trim() !== '') {
                        this.currentExam.date = result.examDate;
                        updated = true;
                        console.log(`시험일 업데이트: ${result.examDate}`);
                    }
                    if (updated) {
                        await storage.saveExam(this.currentExam);
                    }

                    if (confirm(`${result.questions.length}개의 문제를 가져왔습니다. 저장하시겠습니까?`)) {
                        await storage.saveQuestions(result.questions);
                        this.loadQuestionList();
                        this.loadExamList();
                        alert('문제가 저장되었습니다.');
                    }
                }
            } catch (error) {
                alert('CSV 가져오기 실패: ' + error.message);
                console.error(error);
            }

            e.target.value = '';
        };

        fileInput.click();
    }

    /**
     * 문제 CSV 내보내기
     */
    exportQuestions() {
        if (!this.currentExam) {
            alert('먼저 시험을 선택해주세요.');
            return;
        }

        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        if (questions.length === 0) {
            alert('내보낼 문제가 없습니다.');
            return;
        }

        const csv = CSVUtils.exportQuestionsToCSV(questions);
        CSVUtils.downloadCSV(`${this.currentExam.name}_문제정보.csv`, csv);
    }
}
