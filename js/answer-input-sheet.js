/**
 * 답안 입력 모듈 - 그리드 형식 (학생별 개별 입력)
 * 한 줄에 5개 답안, 세로 스크롤
 */

// 현재 선택된 학생
AnswerInput.prototype.currentStudent = null;
AnswerInput.prototype.studentList = [];

AnswerInput.prototype.loadExamSelect = function() {
    let exams = storage.getAllExams();
    exams = AuthService.filterExams(exams);

    // 시행일 최신순 정렬
    exams.sort((a, b) => {
        const dateA = a.date ? new Date(a.date) : new Date(0);
        const dateB = b.date ? new Date(b.date) : new Date(0);
        return dateB - dateA;
    });

    const select = document.getElementById('answerExamSelect');
    select.innerHTML = '<option value="">시험을 선택하세요</option>' +
        exams.map(exam => {
            const questions = storage.getQuestionsByExamId(exam.id);
            return `<option value="${exam.id}">${exam.name} (${questions.length}문제)</option>`;
        }).join('');
};

/**
 * 답안 입력 폼 표시
 */
AnswerInput.prototype.showAnswerForm = async function() {
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

    // API에서 답안 데이터 로드
    let allAnswers;
    try {
        allAnswers = await storage.fetchAnswersByExamId(examId);
    } catch (error) {
        console.error('답안 로드 실패:', error);
        allAnswers = storage.getAnswersByExamId(examId);
    }

    // 답안이 있는 학생 목록 구성
    const studentIds = [...new Set(allAnswers.map(a => a.studentId))];
    this.studentList = [];

    for (const id of studentIds) {
        let student = storage.getStudent(id);
        if (!student) {
            const studentAnswers = allAnswers.filter(a => a.studentId === id);
            if (studentAnswers.length > 0 && studentAnswers[0].studentInfo) {
                student = studentAnswers[0].studentInfo;
            }
        }
        if (student) {
            this.studentList.push(student);
        }
    }

    this.currentExam = exam;
    this.currentStudent = null;
    this.renderAnswerUI(questions);

    document.getElementById('answerFormSection').style.display = 'block';
};

/**
 * 새로운 UI 렌더링
 */
AnswerInput.prototype.renderAnswerUI = function(questions) {
    const container = document.getElementById('answerFormContainer');

    const html = `
        <div class="answer-grid-wrapper">
            <!-- 상단: 시험 정보 및 학생 선택 -->
            <div class="answer-header-section">
                <div class="exam-info">
                    <h3>${this.currentExam.name}</h3>
                    <span class="question-count">${questions.length}개 문제</span>
                </div>

                <div class="student-selector-section">
                    <div class="student-selector">
                        <label>학생 선택</label>
                        <div class="student-select-row">
                            <select id="currentStudentSelect" class="form-control" onchange="answerInput.onStudentChange()">
                                <option value="">-- 학생을 선택하세요 --</option>
                                ${this.studentList.map(s => `
                                    <option value="${s.id}">${s.name} (${s.school} ${s.grade})</option>
                                `).join('')}
                            </select>
                            <button class="btn btn-pink" onclick="answerInput.showAddStudentModal()">
                                + 추가
                            </button>
                        </div>
                    </div>

                    <!-- 학생 네비게이션 -->
                    <div class="student-nav" id="studentNav" style="display: none;">
                        <button class="btn btn-sm btn-secondary" onclick="answerInput.prevStudent()" id="prevStudentBtn">
                            ◀ 이전
                        </button>
                        <span class="student-position" id="studentPosition">1 / 10</span>
                        <button class="btn btn-sm btn-secondary" onclick="answerInput.nextStudent()" id="nextStudentBtn">
                            다음 ▶
                        </button>
                    </div>
                </div>
            </div>

            <!-- 답안 입력 그리드 -->
            <div class="answer-grid-section" id="answerGridSection">
                <div class="empty-student-message">
                    학생을 선택하거나 새 학생을 추가하세요.
                </div>
            </div>

            <!-- 하단 버튼 -->
            <div class="answer-footer-section">
                <button class="btn btn-pink-outline" onclick="answerInput.showAddStudentModal()">
                    + 학생 추가
                </button>
                <button class="btn btn-success" onclick="answerInput.completeInputAndMerge()">
                    ✅ 입력 완료
                </button>
            </div>
        </div>
    `;

    container.innerHTML = html;
};

/**
 * 학생 선택 변경
 */
AnswerInput.prototype.onStudentChange = function() {
    const select = document.getElementById('currentStudentSelect');
    const studentId = select.value;

    if (!studentId) {
        this.currentStudent = null;
        document.getElementById('answerGridSection').innerHTML = `
            <div class="empty-student-message">
                학생을 선택하거나 새 학생을 추가하세요.
            </div>
        `;
        document.getElementById('studentNav').style.display = 'none';
        return;
    }

    this.currentStudent = storage.getStudent(studentId);
    this.renderAnswerGrid();
    this.updateStudentNav();
};

/**
 * 답안 그리드 렌더링 (5열)
 */
AnswerInput.prototype.renderAnswerGrid = function() {
    if (!this.currentStudent || !this.currentExam) return;

    const questions = storage.getQuestionsByExamId(this.currentExam.id);
    const answers = storage.getAnswersByExamAndStudent(this.currentExam.id, this.currentStudent.id);

    // 답안 맵 생성
    const answerMap = {};
    answers.forEach(a => {
        answerMap[a.questionId] = a;
    });

    // 5개씩 행으로 묶기
    const rows = [];
    for (let i = 0; i < questions.length; i += 5) {
        rows.push(questions.slice(i, i + 5));
    }

    const html = `
        <div class="student-info-bar">
            <span class="student-name">${this.currentStudent.name}</span>
            <span class="student-detail">${this.currentStudent.school} ${this.currentStudent.grade}</span>
            <button class="btn btn-sm btn-danger" onclick="answerInput.deleteCurrentStudentAnswers()">
                🗑️ 이 학생 답안 삭제
            </button>
        </div>

        <div class="answer-grid">
            ${rows.map((rowQuestions, rowIndex) => `
                <div class="answer-row">
                    ${rowQuestions.map((q, colIndex) => {
                        const answer = answerMap[q.id];
                        let value = '';
                        if (answer) {
                            value = q.type === '객관식' ? (answer.answerText || '') : (answer.scoreReceived ?? '');
                        }
                        const tabIndex = rowIndex * 5 + colIndex + 1;

                        return `
                            <div class="answer-cell">
                                <div class="question-label">
                                    <span class="q-number">${q.number}번</span>
                                    <span class="q-type ${q.type === '객관식' ? 'multiple' : 'essay'}">${q.type === '객관식' ? '객' : '서'}</span>
                                    <span class="q-points">${q.points}점</span>
                                </div>
                                ${q.type === '객관식' ? `
                                    <select class="answer-input"
                                            data-question-id="${q.id}"
                                            data-question-type="${q.type}"
                                            tabindex="${tabIndex}"
                                            onchange="answerInput.saveAnswer(this)">
                                        <option value="">-</option>
                                        ${[1,2,3,4,5].map(n => `
                                            <option value="${n}" ${value == n ? 'selected' : ''}>${n}</option>
                                        `).join('')}
                                    </select>
                                ` : `
                                    <input type="number"
                                           class="answer-input"
                                           data-question-id="${q.id}"
                                           data-question-type="${q.type}"
                                           data-max-points="${q.points}"
                                           value="${value}"
                                           min="0" max="${q.points}" step="0.5"
                                           placeholder="점수"
                                           tabindex="${tabIndex}"
                                           onchange="answerInput.saveAnswer(this)"
                                           onblur="answerInput.saveAnswer(this)">
                                `}
                            </div>
                        `;
                    }).join('')}
                    ${rowQuestions.length < 5 ? `<div class="answer-cell empty" style="flex: ${5 - rowQuestions.length};"></div>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    document.getElementById('answerGridSection').innerHTML = html;

    // 첫 번째 입력에 포커스
    const firstInput = document.querySelector('.answer-grid .answer-input');
    if (firstInput) {
        firstInput.focus();
    }
};

/**
 * 답안 저장
 */
AnswerInput.prototype.saveAnswer = async function(inputElement) {
    if (!this.currentStudent || !this.currentExam) return;

    if (inputElement.dataset.saving === 'true') return;

    const questionId = inputElement.getAttribute('data-question-id');
    const questionType = inputElement.getAttribute('data-question-type');
    const value = inputElement.value;

    inputElement.dataset.saving = 'true';

    try {
        const existingAnswers = storage.getAnswersByExamAndStudent(this.currentExam.id, this.currentStudent.id);
        let answer = existingAnswers.find(a => a.questionId === questionId);

        if (value) {
            if (!answer) {
                answer = new Answer({
                    examId: this.currentExam.id,
                    studentId: this.currentStudent.id,
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
            if (answer) {
                await storage.deleteAnswer(answer.id);
            }
        }

        inputElement.classList.add('saved');
        setTimeout(() => inputElement.classList.remove('saved'), 300);
    } catch (error) {
        console.error('답안 저장 실패:', error);
        inputElement.classList.add('error');
        setTimeout(() => inputElement.classList.remove('error'), 1000);
    } finally {
        inputElement.dataset.saving = 'false';
    }
};

/**
 * 학생 네비게이션 업데이트
 */
AnswerInput.prototype.updateStudentNav = function() {
    const nav = document.getElementById('studentNav');
    if (this.studentList.length <= 1) {
        nav.style.display = 'none';
        return;
    }

    nav.style.display = 'flex';

    const currentIndex = this.studentList.findIndex(s => s.id === this.currentStudent?.id);
    document.getElementById('studentPosition').textContent = `${currentIndex + 1} / ${this.studentList.length}`;
    document.getElementById('prevStudentBtn').disabled = currentIndex <= 0;
    document.getElementById('nextStudentBtn').disabled = currentIndex >= this.studentList.length - 1;
};

/**
 * 이전 학생
 */
AnswerInput.prototype.prevStudent = function() {
    const currentIndex = this.studentList.findIndex(s => s.id === this.currentStudent?.id);
    if (currentIndex > 0) {
        const select = document.getElementById('currentStudentSelect');
        select.value = this.studentList[currentIndex - 1].id;
        this.onStudentChange();
    }
};

/**
 * 다음 학생
 */
AnswerInput.prototype.nextStudent = function() {
    const currentIndex = this.studentList.findIndex(s => s.id === this.currentStudent?.id);
    if (currentIndex < this.studentList.length - 1) {
        const select = document.getElementById('currentStudentSelect');
        select.value = this.studentList[currentIndex + 1].id;
        this.onStudentChange();
    }
};

/**
 * 새 학생 추가 모달
 */
AnswerInput.prototype.showAddStudentModal = function() {
    const existingModal = document.getElementById('addStudentAnswerModal');
    if (existingModal) existingModal.remove();

    // 아직 답안이 없는 학생 목록
    const existingIds = new Set(this.studentList.map(s => s.id));
    let availableStudents = storage.getAllStudents();
    availableStudents = AuthService.filterStudents(availableStudents);
    availableStudents = availableStudents.filter(s => !existingIds.has(s.id));
    availableStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    const modal = document.createElement('div');
    modal.id = 'addStudentAnswerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>학생 추가</h3>
                <button class="modal-close" onclick="document.getElementById('addStudentAnswerModal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <input type="text" id="addStudentSearch" class="form-control"
                           placeholder="이름, 학교로 검색..." autocomplete="off">
                </div>
                <div class="student-select-list" id="addStudentList" style="max-height: 300px; overflow-y: auto;">
                    ${availableStudents.length > 0
                        ? availableStudents.map(s => `
                            <div class="student-select-item" data-id="${s.id}">
                                <strong>${s.name}</strong>
                                <span style="color: #666; margin-left: 8px;">${s.school} ${s.grade}</span>
                            </div>
                        `).join('')
                        : '<div class="empty-state-small">추가할 수 있는 학생이 없습니다.</div>'
                    }
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 검색
    document.getElementById('addStudentSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#addStudentList .student-select-item').forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query) ? 'block' : 'none';
        });
    });

    // 선택
    document.querySelectorAll('#addStudentList .student-select-item').forEach(item => {
        item.addEventListener('click', () => {
            const studentId = item.getAttribute('data-id');
            this.addStudentToList(studentId);
            modal.remove();
        });
    });

    // 배경 클릭 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};

/**
 * 학생을 목록에 추가하고 선택
 */
AnswerInput.prototype.addStudentToList = function(studentId) {
    const student = storage.getStudent(studentId);
    if (!student) return;

    // 목록에 추가
    if (!this.studentList.find(s => s.id === studentId)) {
        this.studentList.push(student);
    }

    // select 옵션 업데이트
    const select = document.getElementById('currentStudentSelect');
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.school} ${student.grade})`;
    select.appendChild(option);

    // 선택
    select.value = studentId;
    this.onStudentChange();
};

/**
 * 현재 학생 답안 삭제
 */
AnswerInput.prototype.deleteCurrentStudentAnswers = async function() {
    if (!this.currentStudent || !this.currentExam) return;

    if (!confirm(`${this.currentStudent.name} 학생의 모든 답안을 삭제하시겠습니까?`)) {
        return;
    }

    const answers = storage.getAnswersByExamAndStudent(this.currentExam.id, this.currentStudent.id);
    for (const answer of answers) {
        await storage.deleteAnswer(answer.id);
    }

    // 목록에서 제거
    this.studentList = this.studentList.filter(s => s.id !== this.currentStudent.id);

    // select 옵션 업데이트
    const select = document.getElementById('currentStudentSelect');
    const option = select.querySelector(`option[value="${this.currentStudent.id}"]`);
    if (option) option.remove();

    // 선택 초기화
    select.value = '';
    this.onStudentChange();

    alert('답안이 삭제되었습니다.');
};

/**
 * 입력 취소
 */
AnswerInput.prototype.cancelAnswerInput = function() {
    document.getElementById('answerFormSection').style.display = 'none';
    document.getElementById('answerExamSelect').value = '';
    this.currentExam = null;
    this.currentStudent = null;
};

/**
 * 입력 완료 - 중복 학생 자동 병합
 */
AnswerInput.prototype.completeInputAndMerge = async function() {
    const duplicateGroups = storage.findDuplicateStudents();

    if (duplicateGroups.length === 0) {
        alert('✅ 입력이 완료되었습니다.\n중복된 학생이 없습니다.');
        return;
    }

    const plan = duplicateGroups.map(group => {
        const answerCounts = group.map(student => {
            const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
            return { student, answerCount: answers.length };
        });
        answerCounts.sort((a, b) => b.answerCount - a.answerCount);
        return { target: answerCounts[0], sources: answerCounts.slice(1) };
    });

    const totalMerges = plan.reduce((sum, p) => sum + p.sources.length, 0);

    if (!confirm(`⚠️ 중복 학생 ${totalMerges}명을 자동 병합합니다.\n계속하시겠습니까?`)) {
        return;
    }

    let successCount = 0;
    for (const p of plan) {
        for (const source of p.sources) {
            try {
                await storage.mergeStudents(p.target.student.id, source.student.id);
                successCount++;
            } catch (e) {
                console.error('병합 실패:', e);
            }
        }
    }

    const deletedCount = await storage.removeStudentsWithNoAnswers();

    alert(`✅ 완료!\n병합: ${successCount}명${deletedCount > 0 ? `\n삭제: ${deletedCount}명` : ''}`);

    if (window.studentManager) {
        studentManager.loadStudentList();
    }
};

// 기존 함수들 무효화
AnswerInput.prototype.selectOrCreateStudent = function() { this.showAnswerForm(); };
AnswerInput.prototype.saveAnswers = function() { alert('답안이 자동으로 저장됩니다.'); };
AnswerInput.prototype.renderMultipleChoiceInput = function() {};
AnswerInput.prototype.renderEssayInput = function() {};
AnswerInput.prototype.addStudentRow = function() { this.showAddStudentModal(); };
