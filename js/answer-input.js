/**
 * 답안 입력 모듈
 */

class AnswerInput {
    constructor() {
        this.currentExam = null;
        this.currentStudent = null;
        this.answerData = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExamSelect();
    }

    setupEventListeners() {
        // 시험 선택
        document.getElementById('answerExamSelect').addEventListener('change', (e) => {
            const examId = e.target.value;
            if (examId) {
                this.currentExam = storage.getExam(examId);
                // 시험 선택 시 자동으로 답안 시트 표시
                this.showAnswerForm();
            } else {
                this.currentExam = null;
                // 시험 선택 해제 시 답안 시트 숨김
                document.getElementById('answerFormSection').style.display = 'none';
            }
        });

        // 학생 선택/추가 (답안 입력 시작)
        const selectBtn = document.getElementById('selectStudentBtn');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                this.selectOrCreateStudent();
            });
        }

        // 답안 CSV 업로드
        const importBtn = document.getElementById('importAnswersBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.importAnswers();
            });
        }

        // 답안 CSV 내보내기
        const exportBtn = document.getElementById('exportAnswersBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAnswers();
            });
        }
    }

    /**
     * 시험 선택 드롭다운 로드
     */
    loadExamSelect() {
        const exams = storage.getAllExams();
        const select = document.getElementById('answerExamSelect');

        select.innerHTML = '<option value="">시험을 선택하세요</option>' +
            exams.map(exam => {
                const questions = storage.getQuestionsByExamId(exam.id);
                return `<option value="${exam.id}"
                               data-name="${exam.name}"
                               data-organization="${exam.organization || ''}"
                               data-school="${exam.school}"
                               data-grade="${exam.grade}">
                    ${exam.name} (${exam.organization || '국어농장'} | ${questions.length}문제)
                </option>`;
            }).join('');
    }

    /**
     * 학생 선택 또는 생성 (시트 형식에서 오버라이드됨)
     */
    selectOrCreateStudent() {
        if (!this.currentExam) {
            alert('먼저 시험을 선택해주세요.');
            return;
        }

        // 이 함수는 answer-input-sheet.js에서 오버라이드됨
        // 기존 방식 유지 (호환성)
        const nameInput = document.getElementById('studentName');
        const schoolInput = document.getElementById('studentSchool');
        const gradeInput = document.getElementById('studentGrade');

        if (!nameInput || !schoolInput || !gradeInput) {
            // HTML 요소가 없으면 시트 형식으로 전환
            this.showAnswerForm();
            return;
        }

        const name = nameInput.value.trim();
        const school = schoolInput.value.trim();
        const grade = gradeInput.value.trim();

        if (!name) {
            alert('학생 이름을 입력해주세요.');
            return;
        }

        // 기존 학생 찾기
        let student = storage.getStudentByName(name, school, grade);

        if (!student) {
            // 새 학생 생성
            student = new Student({ name, school, grade });
            storage.saveStudent(student);
        }

        this.currentStudent = student;

        // 답안 입력 폼 표시
        this.showAnswerForm();
    }

    /**
     * 답안 입력 폼 표시
     */
    showAnswerForm() {
        if (!this.currentExam || !this.currentStudent) return;

        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        if (questions.length === 0) {
            alert('이 시험에는 문제가 없습니다. 먼저 문제를 추가해주세요.');
            return;
        }

        // 학생 정보 표시
        document.getElementById('currentStudentInfo').textContent =
            `${this.currentStudent.name} (${this.currentStudent.school} ${this.currentStudent.grade})`;

        // 기존 답안 로드
        const existingAnswers = storage.getAnswersByExamAndStudent(
            this.currentExam.id,
            this.currentStudent.id
        );

        this.answerData = {};
        existingAnswers.forEach(answer => {
            this.answerData[answer.questionId] = answer;
        });

        // 답안 입력 폼 생성
        const container = document.getElementById('answerFormContainer');
        container.innerHTML = questions.map(q => {
            const existingAnswer = this.answerData[q.id];

            if (q.type === '객관식') {
                return this.renderMultipleChoiceInput(q, existingAnswer);
            } else {
                return this.renderEssayInput(q, existingAnswer);
            }
        }).join('');

        // 답안 입력 섹션 표시
        document.getElementById('answerFormSection').style.display = 'block';
    }

    /**
     * 객관식 입력 필드 렌더링
     */
    renderMultipleChoiceInput(question, existingAnswer) {
        const selectedValue = existingAnswer ? existingAnswer.answerText : '';

        return `
            <div class="answer-item" data-question-id="${question.id}">
                <div class="answer-question-info">
                    <h5>${question.number}번. ${question.passage || '(지문 없음)'}</h5>
                    <div class="question-meta">
                        <span>영역: ${question.domain}${question.subDomain ? ' > ' + question.subDomain : ''}</span>
                        <span>배점: ${question.points}점</span>
                    </div>
                </div>
                <div class="answer-input-field">
                    <label>답:</label>
                    <select class="form-control answer-input" data-question-id="${question.id}" style="max-width: 200px;">
                        <option value="">선택 안 함</option>
                        ${[1, 2, 3, 4, 5].map(num => `
                            <option value="${num}" ${selectedValue == num ? 'selected' : ''}>
                                ${num}번
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * 서술형 입력 필드 렌더링
     */
    renderEssayInput(question, existingAnswer) {
        const answerText = existingAnswer ? existingAnswer.answerText : '';
        const scoreReceived = existingAnswer && existingAnswer.scoreReceived !== null
            ? existingAnswer.scoreReceived
            : '';

        return `
            <div class="answer-item" data-question-id="${question.id}">
                <div class="answer-question-info">
                    <h5>${question.number}번. ${question.passage || '(지문 없음)'}</h5>
                    <div class="question-meta">
                        <span>영역: ${question.domain}${question.subDomain ? ' > ' + question.subDomain : ''}</span>
                        <span>배점: ${question.points}점</span>
                    </div>
                    ${question.correctAnswer ? `
                        <details style="margin-top: 0.5rem;">
                            <summary style="cursor: pointer; color: var(--text-secondary);">모범 답안 보기</summary>
                            <div style="margin-top: 0.5rem; padding: 0.8rem; background: white; border-radius: 0.375rem;">
                                ${question.correctAnswer}
                            </div>
                        </details>
                    ` : ''}
                </div>
                <div class="answer-input-field essay">
                    <label>학생 답안:</label>
                    <textarea class="form-control answer-text-input" data-question-id="${question.id}" rows="4" placeholder="학생이 작성한 답안을 입력하세요">${answerText}</textarea>
                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;">
                        <label style="margin: 0;">채점 점수:</label>
                        <input type="number" class="form-control answer-score-input" data-question-id="${question.id}"
                               min="0" max="${question.points}" step="0.5" value="${scoreReceived}"
                               placeholder="채점 후 점수 입력" style="width: 100px;">
                        <span>/ ${question.points}점</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 답안 저장
     */
    saveAnswers() {
        if (!this.currentExam || !this.currentStudent) return;

        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        const answers = [];

        questions.forEach(question => {
            let answerText = '';
            let scoreReceived = null;

            if (question.type === '객관식') {
                const select = document.querySelector(
                    `select.answer-input[data-question-id="${question.id}"]`
                );
                answerText = select ? select.value : '';
            } else {
                const textarea = document.querySelector(
                    `textarea.answer-text-input[data-question-id="${question.id}"]`
                );
                const scoreInput = document.querySelector(
                    `input.answer-score-input[data-question-id="${question.id}"]`
                );

                answerText = textarea ? textarea.value.trim() : '';
                const scoreValue = scoreInput ? scoreInput.value : '';
                scoreReceived = scoreValue !== '' ? parseFloat(scoreValue) : null;
            }

            // 답안이 있는 경우만 저장
            if (answerText || scoreReceived !== null) {
                const existingAnswer = this.answerData[question.id];
                const answer = new Answer({
                    id: existingAnswer ? existingAnswer.id : undefined,
                    examId: this.currentExam.id,
                    studentId: this.currentStudent.id,
                    questionId: question.id,
                    answerText: answerText,
                    scoreReceived: scoreReceived
                });

                answers.push(answer);
            }
        });

        if (answers.length === 0) {
            alert('입력된 답안이 없습니다.');
            return;
        }

        // 저장
        storage.saveAnswers(answers);

        alert(`답안이 저장되었습니다. (${answers.length}개 문제)`);

        // 폼 초기화
        this.cancelAnswerInput();
    }

    /**
     * 답안 입력 취소
     */
    cancelAnswerInput() {
        document.getElementById('answerFormSection').style.display = 'none';
        document.getElementById('studentName').value = '';
        document.getElementById('studentSchool').value = '';
        document.getElementById('studentGrade').value = '';
        this.currentStudent = null;
        this.answerData = {};
    }

    /**
     * 답안 CSV 일괄 업로드
     */
    async importAnswers() {
        const examId = document.getElementById('answerExamSelect').value;
        if (!examId) {
            alert('먼저 시험을 선택해주세요.');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        fileInput.accept = '.csv';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await CSVUtils.readFile(file);
                const answers = CSVUtils.importAnswersFromCSV(text, examId);

                if (confirm(`${answers.length}개의 답안을 가져왔습니다. 저장하시겠습니까?`)) {
                    storage.saveAnswers(answers);
                    alert('답안이 저장되었습니다.');

                    // 시험 선택되어 있으면 답안 시트 갱신
                    if (this.currentExam) {
                        this.showAnswerForm();
                    }
                }
            } catch (error) {
                alert('CSV 가져오기 실패: ' + error.message);
            }

            e.target.value = '';
        };

        fileInput.click();
    }

    /**
     * 답안 CSV 내보내기
     */
    exportAnswers() {
        const examId = document.getElementById('answerExamSelect').value;
        if (!examId) {
            alert('먼저 시험을 선택해주세요.');
            return;
        }

        const exam = storage.getExam(examId);
        const answers = storage.getAnswersByExamId(examId);

        if (answers.length === 0) {
            alert('내보낼 답안이 없습니다.');
            return;
        }

        const csv = CSVUtils.exportAnswersToCSV(examId);
        CSVUtils.downloadCSV(`${exam.name}_답안.csv`, csv);
    }
}
