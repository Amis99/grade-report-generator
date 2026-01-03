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

    // API에서 모든 답안 데이터 로드 (기관 필터링 없이)
    let allAnswers;
    try {
        allAnswers = await storage.fetchAnswersByExamId(examId);
    } catch (error) {
        console.error('답안 로드 실패:', error);
        // 실패 시 캐시된 답안 사용
        allAnswers = storage.getAnswersByExamId(examId);
    }

    const studentIds = [...new Set(allAnswers.map(a => a.studentId))];

    // 학생 정보도 API에서 가져올 수 있도록 처리
    const students = [];
    for (const id of studentIds) {
        let student = storage.getStudent(id);
        // 캐시에 없는 학생은 답안에서 정보 추출 시도
        if (!student) {
            const studentAnswers = allAnswers.filter(a => a.studentId === id);
            if (studentAnswers.length > 0 && studentAnswers[0].studentInfo) {
                student = studentAnswers[0].studentInfo;
            }
        }
        if (student) {
            const answers = allAnswers.filter(a => a.studentId === id);
            students.push({ student, answers });
        }
    }

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

            <div class="answer-sheet-scroll-container">
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
                <button class="add-row-btn complete-btn" onclick="answerInput.completeInputAndMerge()">
                    ✅ 입력 완료
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
 * 학생 행 렌더링 (등록된 학생만 선택 가능)
 */
AnswerInput.prototype.renderStudentRow = function(questions, student, answers = []) {
    // 답안 맵 생성
    const answerMap = {};
    answers.forEach(answer => {
        answerMap[answer.questionId] = answer;
    });

    // 학생이 없으면 "선택 필요" 상태로 렌더링
    const hasStudent = student && student.id;
    const studentDisplay = hasStudent
        ? `<span class="student-display">${student.name}</span>`
        : `<button class="btn btn-sm btn-secondary select-student-btn">학생 선택</button>`;

    return `
        <tr data-student-id="${hasStudent ? student.id : 'pending'}">
            <td class="col-student-name">
                ${studentDisplay}
                <input type="hidden" class="student-id" value="${hasStudent ? student.id : ''}">
            </td>
            <td class="col-student-info">
                <span class="student-school-display">${hasStudent ? student.school : '-'}</span>
            </td>
            <td class="col-student-info">
                <span class="student-grade-display">${hasStudent ? student.grade : '-'}</span>
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

                // 학생이 선택되지 않은 경우 답안 입력 비활성화
                const disabled = !hasStudent ? 'disabled' : '';

                if (q.type === '객관식') {
                    return `
                        <td class="col-answer-cell">
                            <select class="sheet-cell-select answer-value"
                                    data-question-id="${q.id}"
                                    data-question-type="${q.type}"
                                    ${disabled}>
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
                                   placeholder="득점"
                                   ${disabled}>
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

    // 학생 선택 버튼
    tbody.querySelectorAll('.select-student-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            this.showStudentSelectModal(row);
        });
    });

    // 답안 자동 저장
    tbody.querySelectorAll('.sheet-cell-input.answer-value, .sheet-cell-select.answer-value').forEach(input => {
        input.addEventListener('change', async (e) => {
            await this.autoSaveAnswer(e.target);
        });

        if (input.classList.contains('sheet-cell-input')) {
            input.addEventListener('blur', async (e) => {
                await this.autoSaveAnswer(e.target);
            });
        }
    });
};

/**
 * 답안 자동 저장 (학생이 선택된 행에서만)
 * 동시성 제어: 저장 중일 때 중복 요청 방지
 */
AnswerInput.prototype.autoSaveAnswer = async function(inputElement) {
    const row = inputElement.closest('tr');
    const studentId = row.getAttribute('data-student-id');

    // 학생이 선택되지 않은 경우 저장하지 않음
    if (!studentId || studentId === 'pending') {
        return;
    }

    // 동시성 제어: 이미 저장 중이면 건너뜀
    if (inputElement.dataset.saving === 'true') {
        console.log('⏳ 이미 저장 중, 건너뜀');
        return;
    }

    const student = storage.getStudent(studentId);
    if (!student) {
        return;
    }

    const questionId = inputElement.getAttribute('data-question-id');
    const questionType = inputElement.getAttribute('data-question-type');
    const value = inputElement.value;

    // 저장 시작 플래그
    inputElement.dataset.saving = 'true';

    try {
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

        // 성공 피드백
        inputElement.classList.add('success');
        setTimeout(() => {
            inputElement.classList.remove('success');
        }, 500);
    } catch (error) {
        console.error('답안 저장 실패:', error);
        inputElement.classList.add('error');
        setTimeout(() => {
            inputElement.classList.remove('error');
        }, 1000);
    } finally {
        // 저장 완료 플래그
        inputElement.dataset.saving = 'false';
    }
};

/**
 * 학생 선택 모달 표시
 */
AnswerInput.prototype.showStudentSelectModal = function(targetRow) {
    // 기존 모달 제거
    const existingModal = document.getElementById('studentSelectModal');
    if (existingModal) existingModal.remove();

    // 이미 답안이 입력된 학생들 제외
    const existingStudentIds = new Set();
    document.querySelectorAll('#answerSheetBody tr').forEach(row => {
        const sid = row.getAttribute('data-student-id');
        if (sid && sid !== 'pending') {
            existingStudentIds.add(sid);
        }
    });

    // 선택 가능한 학생 목록 (권한에 따라 필터링)
    let students = storage.getAllStudents();
    students = AuthService.filterStudents(students);
    students = students.filter(s => !existingStudentIds.has(s.id));
    students.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    const modal = document.createElement('div');
    modal.id = 'studentSelectModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>학생 선택</h3>
                <button class="modal-close" onclick="document.getElementById('studentSelectModal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <input type="text" id="studentSelectSearch" class="form-control"
                           placeholder="이름, 학교로 검색..." autocomplete="off">
                </div>
                <div class="student-select-list" id="studentSelectList" style="max-height: 300px; overflow-y: auto;">
                    ${students.length > 0
                        ? students.map(s => `
                            <div class="student-select-item" data-id="${s.id}" data-name="${s.name}" data-school="${s.school}" data-grade="${s.grade}">
                                <strong>${s.name}</strong>
                                <span style="color: #666; margin-left: 8px;">${s.school} ${s.grade}</span>
                            </div>
                        `).join('')
                        : '<div class="empty-state-small">선택 가능한 학생이 없습니다.</div>'
                    }
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 검색 기능
    document.getElementById('studentSelectSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.student-select-item').forEach(item => {
            const name = item.getAttribute('data-name').toLowerCase();
            const school = item.getAttribute('data-school').toLowerCase();
            item.style.display = (name.includes(query) || school.includes(query)) ? 'block' : 'none';
        });
    });

    // 학생 선택
    document.querySelectorAll('.student-select-item').forEach(item => {
        item.addEventListener('click', () => {
            const studentId = item.getAttribute('data-id');
            const studentName = item.getAttribute('data-name');
            const studentSchool = item.getAttribute('data-school');
            const studentGrade = item.getAttribute('data-grade');

            this.selectStudentForRow(targetRow, studentId, studentName, studentSchool, studentGrade);
            modal.remove();
        });
    });

    // 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
};

/**
 * 행에 학생 선택 적용
 */
AnswerInput.prototype.selectStudentForRow = function(row, studentId, studentName, studentSchool, studentGrade) {
    // 학생 ID 및 정보 업데이트
    row.setAttribute('data-student-id', studentId);
    row.querySelector('.student-id').value = studentId;
    row.querySelector('.col-student-name').innerHTML = `
        <span class="student-display">${studentName}</span>
        <input type="hidden" class="student-id" value="${studentId}">
    `;
    row.querySelector('.student-school-display').textContent = studentSchool;
    row.querySelector('.student-grade-display').textContent = studentGrade;

    // 답안 입력 필드 활성화
    row.querySelectorAll('.answer-value').forEach(input => {
        input.disabled = false;
    });

    // 이벤트 리스너 재연결
    this.attachAnswerSheetListeners();
};

/**
 * 학생 행 추가 (학생 선택 모달 표시)
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

    // 새 행 추가 (학생 미선택 상태)
    const newRow = this.renderStudentRow(questions, null, []);
    tbody.insertAdjacentHTML('beforeend', newRow);

    // 이벤트 리스너 재연결
    this.attachAnswerSheetListeners();

    // 학생 선택 모달 자동 표시
    const newRowElement = tbody.lastElementChild;
    this.showStudentSelectModal(newRowElement);
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

/**
 * 입력 완료 - 중복 학생 자동 병합
 */
AnswerInput.prototype.completeInputAndMerge = async function() {
    // 먼저 중복 학생 확인
    const duplicateGroups = storage.findDuplicateStudents();

    if (duplicateGroups.length === 0) {
        alert('✅ 입력이 완료되었습니다.\n중복된 학생이 없습니다.');
        return;
    }

    // 병합 계획 생성
    const plan = duplicateGroups.map((group, index) => {
        const answerCounts = group.map(student => {
            const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
            const examCount = new Set(answers.map(a => a.examId)).size;
            return {
                student,
                answerCount: answers.length,
                examCount
            };
        });

        // 가장 많은 답안을 가진 학생을 타겟으로 선택
        answerCounts.sort((a, b) => b.answerCount - a.answerCount);
        const target = answerCounts[0];
        const sources = answerCounts.slice(1);

        return { target, sources };
    });

    const totalMerges = plan.reduce((sum, p) => sum + p.sources.length, 0);

    const confirmed = confirm(
        `⚠️ 중복 학생이 발견되었습니다!\n\n` +
        `${duplicateGroups.length}개 그룹에서 ${totalMerges}명의 중복 학생을 자동 병합합니다.\n` +
        `(각 그룹에서 가장 많은 답안을 가진 학생으로 통합)\n\n` +
        `계속하시겠습니까?`
    );

    if (!confirmed) {
        return;
    }

    // 병합 실행
    let successCount = 0;
    let failCount = 0;

    for (const p of plan) {
        for (const source of p.sources) {
            try {
                await storage.mergeStudents(p.target.student.id, source.student.id);
                successCount++;
            } catch (error) {
                console.error('병합 실패:', error);
                failCount++;
            }
        }
    }

    // 답안이 없는 학생 삭제
    const deletedCount = await storage.removeStudentsWithNoAnswers();

    // 결과 알림
    let message = `✅ 입력 완료!\n\n`;
    message += `중복 학생 병합: ${successCount}명\n`;
    if (failCount > 0) {
        message += `병합 실패: ${failCount}명\n`;
    }
    if (deletedCount > 0) {
        message += `답안 없는 학생 삭제: ${deletedCount}명\n`;
    }

    alert(message);

    // 학생 관리 탭 새로고침
    if (window.studentManager) {
        studentManager.loadStudentList();
    }
};
