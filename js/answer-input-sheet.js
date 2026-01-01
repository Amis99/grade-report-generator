/**
 * 답안 입력 모듈 - 시트 형식 (CSV와 동일한 구조)
 * 학생별로 한 행, 문제 번호별로 컬럼
 */

// 기존 AnswerInput의 탭 전환 로직을 유지하고 시트만 교체
AnswerInput.prototype.loadExamSelect = function() {
    let exams = storage.getAllExams();

    // 권한에 따른 시험 필터링
    exams = AuthService.filterExams(exams);

    const select = document.getElementById('answerExamSelect');

    select.innerHTML = '<option value="">시험을 선택하세요</option>' +
        exams.map(exam => {
            const questions = storage.getQuestionsByExamId(exam.id);
            return `<option value="${exam.id}">${exam.name} (${questions.length}문제)</option>`;
        }).join('');
};

/**
 * 답안 입력 폼을 시트 형식으로 표시
 */
AnswerInput.prototype.showAnswerForm = function() {
    const examId = document.getElementById('answerExamSelect').value;
    if (!examId) {
        alert('먼저 시험을 선택해주세요.');
        return;
    }

    const exam = storage.getExam(examId);
    const questions = storage.getQuestionsByExamId(examId);

    if (questions.length === 0) {
        alert('이 시험에는 문제가 없습니다. 먼저 문제를 추가해주세요.');
        return;
    }

    // 기존 답안 데이터 로드
    const allAnswers = storage.getAnswersByExamId(examId);
    const studentIds = [...new Set(allAnswers.map(a => a.studentId))];

    const students = studentIds.map(id => {
        const student = storage.getStudent(id);
        const answers = allAnswers.filter(a => a.studentId === id);
        return { student, answers };
    }).filter(s => s.student !== null); // null 학생 제외

    this.currentExam = exam;
    this.renderAnswerSheet(questions, students);

    // 답안 입력 섹션 표시
    document.getElementById('answerFormSection').style.display = 'block';
};

/**
 * 답안 시트 렌더링
 */
AnswerInput.prototype.renderAnswerSheet = function(questions, students) {
    const container = document.getElementById('answerFormContainer');

    const html = `
        <div class="answer-sheet-wrapper">
            <div class="sheet-toolbar">
                <div class="sheet-toolbar-left">
                    <span class="sheet-info">
                        <strong>${this.currentExam.name}</strong> - ${questions.length}개 문제
                    </span>
                </div>
                <div class="sheet-toolbar-right">
                    <button class="btn btn-sm btn-success" onclick="answerInput.addStudentRow()">
                        ➕ 학생 추가
                    </button>
                </div>
            </div>

            <div class="question-sheet-container">
                <table class="question-sheet answer-sheet">
                    <thead>
                        <tr>
                            <th class="col-student-name">이름</th>
                            <th class="col-student-info">학교</th>
                            <th class="col-student-info">학년</th>
                            ${questions.map(q => `
                                <th class="col-answer-cell" title="${q.type} / ${q.domain} / ${q.points}점">
                                    ${q.number}번
                                </th>
                            `).join('')}
                            <th class="col-actions">작업</th>
                        </tr>
                        <tr class="question-info-row">
                            <th colspan="3">문제 정보</th>
                            ${questions.map(q => `
                                <th class="question-info-cell">
                                    <div class="question-type-badge ${q.type === '객관식' ? 'multiple' : 'essay'}">${q.type}</div>
                                    <div style="font-size: 0.75rem; font-weight: normal;">${q.points}점</div>
                                </th>
                            `).join('')}
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="answerSheetBody">
                        ${students.length > 0
                            ? students.map(s => this.renderStudentRow(questions, s.student, s.answers)).join('')
                            : this.renderEmptyRow(questions.length)
                        }
                    </tbody>
                </table>
            </div>

            <div class="add-row-section">
                <button class="add-row-btn" onclick="answerInput.addStudentRow()">
                    ➕ 학생 추가
                </button>
            </div>
        </div>
    `;

    container.innerHTML = html;
    this.attachAnswerSheetListeners();
};

/**
 * 빈 행 렌더링
 */
AnswerInput.prototype.renderEmptyRow = function(questionCount) {
    return `
        <tr class="empty-row">
            <td colspan="${questionCount + 4}" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                "학생 추가" 버튼을 클릭하여 답안을 입력하세요
            </td>
        </tr>
    `;
};

/**
 * 학생 행 렌더링
 */
AnswerInput.prototype.renderStudentRow = function(questions, student, answers = []) {
    // 답안 맵 생성
    const answerMap = {};
    answers.forEach(answer => {
        answerMap[answer.questionId] = answer;
    });

    return `
        <tr data-student-id="${student ? student.id : 'new'}">
            <td class="col-student-name">
                <input type="text"
                       class="sheet-cell-input student-name"
                       value="${student ? student.name : ''}"
                       placeholder="이름"
                       data-field="name">
            </td>
            <td class="col-student-info">
                <input type="text"
                       class="sheet-cell-input student-school"
                       value="${student ? student.school : ''}"
                       placeholder="학교"
                       data-field="school">
            </td>
            <td class="col-student-info">
                <input type="text"
                       class="sheet-cell-input student-grade"
                       value="${student ? student.grade : ''}"
                       placeholder="학년"
                       data-field="grade">
            </td>
            ${questions.map(q => {
                const answer = answerMap[q.id];
                let value = '';

                if (answer) {
                    if (q.type === '객관식') {
                        value = answer.answerText || '';
                    } else {
                        value = answer.scoreReceived !== null ? answer.scoreReceived : '';
                    }
                }

                if (q.type === '객관식') {
                    return `
                        <td class="col-answer-cell">
                            <select class="sheet-cell-select answer-value"
                                    data-question-id="${q.id}"
                                    data-question-type="${q.type}">
                                <option value=""></option>
                                ${[1, 2, 3, 4, 5].map(num => `
                                    <option value="${num}" ${value == num ? 'selected' : ''}>${num}</option>
                                `).join('')}
                            </select>
                        </td>
                    `;
                } else {
                    return `
                        <td class="col-answer-cell">
                            <input type="number"
                                   class="sheet-cell-input answer-value"
                                   data-question-id="${q.id}"
                                   data-question-type="${q.type}"
                                   data-max-points="${q.points}"
                                   value="${value}"
                                   min="0"
                                   max="${q.points}"
                                   step="0.5"
                                   placeholder="득점">
                        </td>
                    `;
                }
            }).join('')}
            <td class="col-actions">
                <div class="sheet-action-cell">
                    <button class="sheet-btn sheet-btn-delete"
                            onclick="answerInput.deleteStudentRow(this)"
                            title="삭제">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `;
};

/**
 * 답안 시트 이벤트 리스너
 */
AnswerInput.prototype.attachAnswerSheetListeners = function() {
    const tbody = document.getElementById('answerSheetBody');
    if (!tbody) return;

    // 학생 정보 및 답안 자동 저장
    tbody.querySelectorAll('.sheet-cell-input, .sheet-cell-select').forEach(input => {
        input.addEventListener('change', async (e) => {
            await this.autoSaveRow(e.target);
        });

        if (input.classList.contains('sheet-cell-input')) {
            input.addEventListener('blur', async (e) => {
                await this.autoSaveRow(e.target);
            });
        }
    });
};

/**
 * 행 자동 저장
 */
AnswerInput.prototype.autoSaveRow = async function(inputElement) {
    const row = inputElement.closest('tr');
    const studentId = row.getAttribute('data-student-id');

    // 학생 정보 수집
    const nameInput = row.querySelector('.student-name');
    const schoolInput = row.querySelector('.student-school');
    const gradeInput = row.querySelector('.student-grade');

    const name = nameInput.value.trim();
    const school = schoolInput.value.trim();
    const grade = gradeInput.value.trim();

    if (!name) return; // 이름이 없으면 저장하지 않음

    // 학생 찾기 또는 생성
    let student;
    if (studentId === 'new' || !studentId) {
        student = storage.getStudentByName(name, school, grade);
        if (!student) {
            // 새 학생 생성 시 현재 사용자의 기관 정보 설정
            const currentOrg = AuthService.getCurrentOrganization() || '국어농장';
            student = new Student({ name, school, grade, organization: currentOrg });
            await storage.saveStudent(student);
            row.setAttribute('data-student-id', student.id);
        }
    } else {
        student = storage.getStudent(studentId);
        if (student) {
            student.name = name;
            student.school = school;
            student.grade = grade;
            await storage.saveStudent(student);
        }
    }

    if (!student) return;

    // 변경된 답안만 저장 (답안 입력 필드인 경우에만)
    if (inputElement.classList.contains('answer-value')) {
        const questionId = inputElement.getAttribute('data-question-id');
        const questionType = inputElement.getAttribute('data-question-type');
        const value = inputElement.value;

        // 기존 답안 찾기
        const existingAnswers = storage.getAnswersByExamAndStudent(this.currentExam.id, student.id);
        let answer = existingAnswers.find(a => a.questionId === questionId);

        if (value) {
            // 값이 있으면 저장 또는 업데이트
            if (!answer) {
                answer = new Answer({
                    examId: this.currentExam.id,
                    studentId: student.id,
                    questionId: questionId
                });
            }

            if (questionType === '객관식') {
                answer.answerText = value;
                answer.scoreReceived = null;
            } else {
                answer.answerText = '';
                answer.scoreReceived = parseFloat(value) || 0;
            }

            await storage.saveAnswer(answer);
        } else {
            // 값이 없으면 기존 답안 삭제
            if (answer) {
                await storage.deleteAnswer(answer.id);
            }
        }
    }

    // 시각적 피드백
    inputElement.classList.add('success');
    setTimeout(() => {
        inputElement.classList.remove('success');
    }, 500);
};

/**
 * 학생 행 추가
 */
AnswerInput.prototype.addStudentRow = function() {
    if (!this.currentExam) {
        alert('먼저 시험을 선택해주세요.');
        return;
    }

    const questions = storage.getQuestionsByExamId(this.currentExam.id);
    const tbody = document.getElementById('answerSheetBody');

    if (!tbody) return;

    // 빈 행 제거
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) {
        emptyRow.remove();
    }

    // 새 행 추가
    const newRow = this.renderStudentRow(questions, null, []);
    tbody.insertAdjacentHTML('beforeend', newRow);

    // 이벤트 리스너 재연결
    this.attachAnswerSheetListeners();

    // 첫 번째 입력 필드에 포커스
    const newRowElement = tbody.lastElementChild;
    const firstInput = newRowElement.querySelector('.student-name');
    if (firstInput) {
        firstInput.focus();
    }
};

/**
 * 학생 행 삭제
 */
AnswerInput.prototype.deleteStudentRow = async function(button) {
    const row = button.closest('tr');
    const studentId = row.getAttribute('data-student-id');

    if (studentId && studentId !== 'new') {
        if (!confirm('이 학생의 답안을 삭제하시겠습니까?')) {
            return;
        }

        // 답안 삭제
        const answers = storage.getAnswersByExamAndStudent(this.currentExam.id, studentId);
        for (const answer of answers) {
            await storage.deleteAnswer(answer.id);
        }
    }

    row.remove();

    // 행이 없으면 빈 행 표시
    const tbody = document.getElementById('answerSheetBody');
    if (tbody && tbody.children.length === 0) {
        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        tbody.innerHTML = this.renderEmptyRow(questions.length);
    }
};

// 기존 함수들 무효화
AnswerInput.prototype.selectOrCreateStudent = function() {
    this.showAnswerForm();
};

AnswerInput.prototype.cancelAnswerInput = function() {
    document.getElementById('answerFormSection').style.display = 'none';
    document.getElementById('answerExamSelect').value = '';
    this.currentExam = null;
};

AnswerInput.prototype.saveAnswers = function() {
    alert('답안이 자동으로 저장되었습니다.');
};

AnswerInput.prototype.renderMultipleChoiceInput = function() {
    // 더 이상 사용하지 않음
};

AnswerInput.prototype.renderEssayInput = function() {
    // 더 이상 사용하지 않음
};
