/**
 * 시험 관리 모듈 - 시트 형식 전용
 * 시험 정보와 문제를 모두 시트에서 편집
 */

// 기존 ExamManager를 완전히 시트 형식으로 대체
ExamManager.prototype.loadQuestionList = function() {
    if (!this.currentExam) return;

    const questions = storage.getQuestionsByExamId(this.currentExam.id);

    // 통계 업데이트
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
    document.getElementById('questionCount').textContent = questions.length;
    document.getElementById('totalPoints').textContent = totalPoints.toFixed(1);

    this.renderFullSheet(questions);
};

/**
 * 전체 시트 렌더링 (시험 정보 + 문제 목록)
 */
ExamManager.prototype.renderFullSheet = function(questions) {
    const questionListDiv = document.getElementById('questionList');

    const html = `
        <div class="question-sheet-wrapper">
            <!-- 시험 정보 섹션 -->
            <div class="exam-info-sheet">
                <h4>시험 정보</h4>
                <div class="exam-info-grid">
                    <div class="exam-info-item">
                        <label>시험명</label>
                        <input type="text" class="form-control" id="sheetExamName" value="${this.currentExam.name}">
                    </div>
                    <div class="exam-info-item">
                        <label>시행 기관</label>
                        <input type="text" class="form-control" id="sheetExamOrganization" value="${this.currentExam.organization}" ${AuthService.isAdmin() ? '' : 'readonly style="background-color: #e9ecef; cursor: not-allowed;"'}>
                    </div>
                    <div class="exam-info-item">
                        <label>학교</label>
                        <input type="text" class="form-control" id="sheetExamSchool" value="${this.currentExam.school}">
                    </div>
                    <div class="exam-info-item">
                        <label>학년</label>
                        <input type="text" class="form-control" id="sheetExamGrade" value="${this.currentExam.grade}">
                    </div>
                    <div class="exam-info-item">
                        <label>시험 날짜</label>
                        <input type="date" class="form-control" id="sheetExamDate" value="${this.currentExam.date}">
                    </div>
                    <div class="exam-info-item">
                        <label>시리즈</label>
                        <input type="text" class="form-control" id="sheetExamSeries" value="${this.currentExam.series}" placeholder="예: 1학기 중간고사">
                    </div>
                    <div class="exam-info-item exam-pdf-item">
                        <label>시험지 PDF</label>
                        <div class="pdf-controls">
                            ${this.currentExam.pdfFileName ? `
                                <span class="pdf-filename" title="${this.currentExam.pdfFileName}">
                                    📄 ${this.currentExam.pdfFileName}
                                </span>
                                <button type="button" class="btn btn-sm btn-primary" onclick="examManager.downloadPdf()">
                                    다운로드
                                </button>
                                <button type="button" class="btn btn-sm btn-danger" onclick="examManager.deletePdf()">
                                    삭제
                                </button>
                            ` : `
                                <span class="pdf-filename no-file">파일 없음</span>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="examManager.uploadPdf()">
                                    PDF 업로드
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 툴바 -->
            <div class="sheet-toolbar">
                <div class="sheet-toolbar-left">
                    <span class="sheet-info">
                        <strong>${questions.length}</strong>개 문제,
                        <strong>${questions.reduce((sum, q) => sum + q.points, 0).toFixed(1)}</strong>점
                    </span>
                </div>
                <div class="sheet-toolbar-right">
                    <button class="btn btn-sm btn-success" onclick="examManager.addNewQuestionRow()">
                        ➕ 행 추가
                    </button>
                </div>
            </div>

            <!-- 문제 테이블 -->
            <div class="question-sheet-container">
                <table class="question-sheet">
                    <thead>
                        <tr>
                            <th class="col-number">번호</th>
                            <th class="col-type">유형</th>
                            <th class="col-domain">영역</th>
                            <th class="col-subdomain">세부영역</th>
                            <th class="col-passage">작품/지문</th>
                            <th class="col-points">배점</th>
                            <th class="col-answer">정답</th>
                            <th class="col-intent">출제의도</th>
                            <th class="col-explanation">1번 해설</th>
                            <th class="col-explanation">2번 해설</th>
                            <th class="col-explanation">3번 해설</th>
                            <th class="col-explanation">4번 해설</th>
                            <th class="col-explanation">5번 해설</th>
                            <th class="col-actions">작업</th>
                        </tr>
                    </thead>
                    <tbody id="questionSheetBody">
                        ${questions.length > 0 ? questions.map(q => this.renderQuestionRow(q)).join('') : this.renderEmptyRow()}
                    </tbody>
                </table>
            </div>

            <div class="add-row-section">
                <button class="add-row-btn" onclick="examManager.addNewQuestionRow()">
                    ➕ 새 문제 추가
                </button>
            </div>
        </div>
    `;

    questionListDiv.innerHTML = html;
    this.attachSheetEventListeners();
};

/**
 * 빈 행 렌더링
 */
ExamManager.prototype.renderEmptyRow = function() {
    return `
        <tr class="empty-row">
            <td colspan="14" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                "행 추가" 버튼을 클릭하여 문제를 추가하세요
            </td>
        </tr>
    `;
};

/**
 * 문제 행 렌더링
 */
ExamManager.prototype.renderQuestionRow = function(question) {
    const isMultiple = question.type === '객관식';
    const isEssay = question.type === '서술형';

    return `
        <tr data-question-id="${question.id}">
            <td class="col-number">
                <input type="number"
                       class="sheet-cell-input"
                       value="${question.number}"
                       min="1"
                       data-field="number">
            </td>
            <td class="col-type">
                <select class="sheet-cell-select" data-field="type">
                    <option value="객관식" ${question.type === '객관식' ? 'selected' : ''}>객관식</option>
                    <option value="서술형" ${question.type === '서술형' ? 'selected' : ''}>서술형</option>
                </select>
            </td>
            <td class="col-domain">
                <input type="text"
                       class="sheet-cell-input"
                       value="${question.domain}"
                       placeholder="문학"
                       data-field="domain">
            </td>
            <td class="col-subdomain">
                <input type="text"
                       class="sheet-cell-input"
                       value="${question.subDomain}"
                       placeholder="고전시가"
                       data-field="subDomain">
            </td>
            <td class="col-passage">
                <input type="text"
                       class="sheet-cell-input"
                       value="${question.passage}"
                       placeholder="작품명"
                       data-field="passage">
            </td>
            <td class="col-points">
                <input type="number"
                       class="sheet-cell-input"
                       value="${question.points}"
                       min="0"
                       step="0.5"
                       data-field="points">
            </td>
            <td class="col-answer">
                <input type="text"
                       class="sheet-cell-input"
                       value="${isMultiple ? question.correctAnswer : ''}"
                       placeholder="${isMultiple ? '1~5' : '(→1번 해설에 입력)'}"
                       data-field="correctAnswer"
                       ${isEssay ? 'readonly style="background: #f5f5f5;"' : ''}>
            </td>
            <td class="col-intent">
                <textarea class="sheet-cell-textarea"
                          data-field="intent"
                          placeholder="출제 의도">${question.intent}</textarea>
            </td>
            ${[1, 2, 3, 4, 5].map(i => {
                // 서술형의 경우 1번만 활성화 (모범 답안용)
                const enabled = isMultiple || (isEssay && i === 1);
                const value = isMultiple
                    ? (question.choiceExplanations[i.toString()] || '')
                    : (isEssay && i === 1 ? question.correctAnswer : '');
                const placeholder = isMultiple
                    ? `${i}번 해설`
                    : (isEssay && i === 1 ? '모범 답안' : '-');

                return `
                    <td class="col-explanation">
                        <textarea class="sheet-cell-textarea"
                                  data-field="choiceExplanation${i}"
                                  placeholder="${placeholder}"
                                  ${!enabled ? 'disabled style="background: #f5f5f5;"' : ''}>${value}</textarea>
                    </td>
                `;
            }).join('')}
            <td class="col-actions">
                <div class="sheet-action-cell">
                    <button class="sheet-btn sheet-btn-delete"
                            onclick="examManager.deleteQuestionFromSheet('${question.id}')"
                            title="삭제">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `;
};

/**
 * 시트 이벤트 리스너 연결
 */
ExamManager.prototype.attachSheetEventListeners = function() {
    // 시험 정보 자동 저장
    ['sheetExamName', 'sheetExamOrganization', 'sheetExamSchool', 'sheetExamGrade', 'sheetExamDate', 'sheetExamSeries'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', (e) => this.saveExamInfo());
            element.addEventListener('blur', (e) => this.saveExamInfo());
        }
    });

    const tbody = document.getElementById('questionSheetBody');
    if (!tbody) return;

    // 문제 입력 필드 변경 감지
    tbody.querySelectorAll('.sheet-cell-input, .sheet-cell-select, .sheet-cell-textarea').forEach(input => {
        input.addEventListener('change', async (e) => {
            await this.updateQuestionField(e.target);
        });

        if (input.tagName === 'TEXTAREA') {
            input.addEventListener('blur', async (e) => {
                await this.updateQuestionField(e.target);
            });
        }
    });

    // 유형 변경 시 선택지 해설 필드 활성화/비활성화
    tbody.querySelectorAll('select[data-field="type"]').forEach(select => {
        select.addEventListener('change', async (e) => {
            const row = e.target.closest('tr');
            const isMultiple = e.target.value === '객관식';
            const isEssay = e.target.value === '서술형';

            // 정답/모범답안 컬럼 처리
            const answerInput = row.querySelector('input[data-field="correctAnswer"]');
            if (answerInput) {
                if (isEssay) {
                    answerInput.value = '';
                    answerInput.placeholder = '(→1번 해설에 입력)';
                    answerInput.readOnly = true;
                    answerInput.style.background = '#f5f5f5';
                } else {
                    answerInput.placeholder = '1~5';
                    answerInput.readOnly = false;
                    answerInput.style.background = '';
                }
            }

            // 선택지 해설 필드 활성화/비활성화
            for (let i = 1; i <= 5; i++) {
                const textarea = row.querySelector(`textarea[data-field="choiceExplanation${i}"]`);
                if (textarea) {
                    // 객관식: 1~5번 모두 활성화
                    // 서술형: 1번만 활성화 (모범 답안용), 2~5번 비활성화
                    const enabled = isMultiple || (isEssay && i === 1);

                    textarea.disabled = !enabled;
                    textarea.style.background = enabled ? '' : '#f5f5f5';

                    if (isMultiple) {
                        textarea.placeholder = `${i}번 해설`;
                    } else if (isEssay && i === 1) {
                        textarea.placeholder = '모범 답안';
                        // 1번 해설에 기존 correctAnswer 값 복사
                        const questionId = row.getAttribute('data-question-id');
                        const question = storage.getQuestion(questionId);
                        if (question && question.correctAnswer) {
                            textarea.value = question.correctAnswer;
                        }
                    } else {
                        textarea.placeholder = '-';
                        textarea.value = '';
                    }
                }
            }

            // 타입 변경 저장
            await this.updateQuestionField(e.target);
        });
    });
};

/**
 * 시험 정보 저장
 */
ExamManager.prototype.saveExamInfo = async function() {
    if (!this.currentExam) return;

    this.currentExam.name = document.getElementById('sheetExamName').value;
    this.currentExam.organization = document.getElementById('sheetExamOrganization').value;
    this.currentExam.school = document.getElementById('sheetExamSchool').value;
    this.currentExam.grade = document.getElementById('sheetExamGrade').value;
    this.currentExam.date = document.getElementById('sheetExamDate').value;
    this.currentExam.series = document.getElementById('sheetExamSeries').value;

    await storage.saveExam(this.currentExam);
    this.loadExamList(); // 목록 새로고침
};

/**
 * 문제 필드 업데이트
 */
ExamManager.prototype.updateQuestionField = async function(inputElement) {
    const row = inputElement.closest('tr');
    const questionId = row.getAttribute('data-question-id');
    const field = inputElement.getAttribute('data-field');
    let value = inputElement.value;

    const question = storage.getQuestion(questionId);
    if (!question) return;

    // 선택지 해설 필드 처리
    if (field.startsWith('choiceExplanation')) {
        const choiceNum = field.replace('choiceExplanation', '');

        if (question.type === '객관식') {
            // 객관식: choiceExplanations에 저장
            if (!question.choiceExplanations) {
                question.choiceExplanations = {};
            }
            question.choiceExplanations[choiceNum] = value;
        } else if (question.type === '서술형' && choiceNum === '1') {
            // 서술형의 1번 해설: correctAnswer에 저장 (모범 답안)
            question.correctAnswer = value;
        }
    } else {
        // 일반 필드 처리
        if (field === 'number') {
            value = parseInt(value) || 0;
        } else if (field === 'points') {
            value = parseFloat(value) || 0;
        }
        question[field] = value;
    }

    // 저장
    await storage.saveQuestion(question);

    // 시각적 피드백
    inputElement.classList.add('success');
    setTimeout(() => {
        inputElement.classList.remove('success');
    }, 500);

    // 통계 업데이트
    this.updateStatistics();
};

/**
 * 통계 업데이트
 */
ExamManager.prototype.updateStatistics = function() {
    if (!this.currentExam) return;
    const questions = storage.getQuestionsByExamId(this.currentExam.id);
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
    document.getElementById('questionCount').textContent = questions.length;
    document.getElementById('totalPoints').textContent = totalPoints.toFixed(1);

    // 툴바 통계도 업데이트
    const sheetInfo = document.querySelector('.sheet-info');
    if (sheetInfo) {
        sheetInfo.innerHTML = `
            <strong>${questions.length}</strong>개 문제,
            <strong>${totalPoints.toFixed(1)}</strong>점
        `;
    }
};

/**
 * 새 문제 행 추가
 */
ExamManager.prototype.addNewQuestionRow = async function() {
    if (!this.currentExam) return;

    const questions = storage.getQuestionsByExamId(this.currentExam.id);
    const nextNumber = questions.length > 0 ? Math.max(...questions.map(q => q.number)) + 1 : 1;

    const newQuestion = new Question({
        examId: this.currentExam.id,
        number: nextNumber,
        type: '객관식',
        domain: '',
        subDomain: '',
        passage: '',
        points: 0,
        correctAnswer: '',
        intent: '',
        choiceExplanations: {}
    });

    await storage.saveQuestion(newQuestion);
    this.loadQuestionList();

    // 새로 추가된 행으로 스크롤
    setTimeout(() => {
        const newRow = document.querySelector(`tr[data-question-id="${newQuestion.id}"]`);
        if (newRow) {
            newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const firstInput = newRow.querySelector('.sheet-cell-input');
            if (firstInput) firstInput.focus();
        }
    }, 100);
};

/**
 * 시트에서 문제 삭제
 */
ExamManager.prototype.deleteQuestionFromSheet = async function(questionId) {
    if (!confirm('이 문제를 삭제하시겠습니까?')) return;

    await storage.deleteQuestion(questionId);
    this.loadQuestionList();
};

// 기존 모달 관련 함수들 무효화 (사용하지 않음)
ExamManager.prototype.showQuestionModal = function(question = null) {
    // 더 이상 사용하지 않음
};

ExamManager.prototype.editQuestionChoices = function(questionId) {
    // 더 이상 사용하지 않음
};

/**
 * PDF 업로드
 */
ExamManager.prototype.uploadPdf = function() {
    if (!this.currentExam) {
        alert('먼저 시험을 선택해주세요.');
        return;
    }

    const fileInput = document.getElementById('fileInput');
    fileInput.accept = '.pdf';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 파일 크기 체크 (10MB 제한)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('파일 크기는 10MB를 초과할 수 없습니다.');
            e.target.value = '';
            return;
        }

        try {
            // 파일을 base64로 변환
            const base64Data = await this.fileToBase64(file);

            // 시험 정보 업데이트
            this.currentExam.pdfFileName = file.name;
            this.currentExam.pdfData = base64Data;
            await storage.saveExam(this.currentExam);

            alert('PDF가 업로드되었습니다.');
            this.loadQuestionList(); // UI 새로고침
        } catch (error) {
            console.error('PDF 업로드 실패:', error);
            alert('PDF 업로드에 실패했습니다: ' + error.message);
        }

        e.target.value = '';
    };

    fileInput.click();
};

/**
 * 파일을 base64로 변환
 */
ExamManager.prototype.fileToBase64 = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

/**
 * PDF 다운로드
 */
ExamManager.prototype.downloadPdf = function() {
    if (!this.currentExam || !this.currentExam.pdfData) {
        alert('다운로드할 PDF가 없습니다.');
        return;
    }

    try {
        // base64 데이터에서 Blob 생성
        const base64Data = this.currentExam.pdfData;
        const byteCharacters = atob(base64Data.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });

        // 다운로드 링크 생성
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.currentExam.pdfFileName || `${this.currentExam.name}_시험지.pdf`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('PDF 다운로드 실패:', error);
        alert('PDF 다운로드에 실패했습니다.');
    }
};

/**
 * PDF 삭제
 */
ExamManager.prototype.deletePdf = async function() {
    if (!this.currentExam) return;

    if (!confirm('업로드된 PDF를 삭제하시겠습니까?')) return;

    try {
        this.currentExam.pdfFileName = '';
        this.currentExam.pdfData = '';
        await storage.saveExam(this.currentExam);

        alert('PDF가 삭제되었습니다.');
        this.loadQuestionList(); // UI 새로고침
    } catch (error) {
        console.error('PDF 삭제 실패:', error);
        alert('PDF 삭제에 실패했습니다.');
    }
};
