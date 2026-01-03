/**
 * 채점 및 분석 모듈
 */

class Grading {
    constructor() {
        this.currentExam = null;
        this.currentQuestionStats = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExamSelect();
    }

    setupEventListeners() {
        // 시험 선택
        document.getElementById('gradingExamSelect').addEventListener('change', async (e) => {
            const examId = e.target.value;
            if (examId) {
                this.currentExam = storage.getExam(examId);
                await this.loadGradingResults();
            } else {
                this.currentExam = null;
                document.getElementById('gradingResultsSection').style.display = 'none';
            }
        });

        // 성적표 CSV 내보내기
        document.getElementById('exportResultsBtn').addEventListener('click', () => {
            this.exportResults();
        });

        // 모달 외부 클릭 시 닫기
        const modal = document.getElementById('questionAnalysisModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeQuestionModal();
                }
            });
        }
    }

    /**
     * 시험 선택 드롭다운 로드
     */
    loadExamSelect() {
        let exams = storage.getAllExams();

        // 권한에 따른 시험 필터링
        exams = AuthService.filterExams(exams);

        const select = document.getElementById('gradingExamSelect');

        select.innerHTML = '<option value="">시험을 선택하세요</option>' +
            exams.map(exam => {
                return `<option value="${exam.id}"
                               data-name="${exam.name}"
                               data-organization="${exam.organization || ''}"
                               data-school="${exam.school}"
                               data-grade="${exam.grade}">
                    ${exam.name} (${exam.organization || '국어농장'})
                </option>`;
            }).join('');
    }

    /**
     * 채점 결과 로드 (API에서 모든 응시 학생 데이터 가져옴)
     */
    async loadGradingResults() {
        if (!this.currentExam) return;

        // API에서 결과 가져오기 (모든 응시 학생 포함)
        const results = await storage.fetchExamResults(this.currentExam.id);

        if (results.length === 0) {
            document.getElementById('gradingResultsSection').style.display = 'none';
            alert('이 시험의 답안이 없습니다.');
            return;
        }

        // 요약 통계 표시
        this.renderSummary(results);

        // 서술형 채점 인터페이스 표시
        this.renderEssayGrading();

        // 성적표 테이블 표시
        this.renderResultsTable(results);

        // 문제별 분석 표시
        this.renderQuestionAnalysis(results);

        document.getElementById('gradingResultsSection').style.display = 'block';
    }

    /**
     * 채점 요약 통계
     */
    renderSummary(results) {
        const totalStudents = results.length;
        const avgScore = results.reduce((sum, r) => sum + r.totalScore, 0) / totalStudents;
        const maxScore = results.length > 0 ? results[0].maxScore : 0;

        // 서술형 채점 필요 여부
        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        const essayQuestions = questions.filter(q => q.type === '서술형');
        const allAnswers = storage.getAnswersByExamId(this.currentExam.id);
        const ungradedEssays = allAnswers.filter(a => {
            const question = questions.find(q => q.id === a.questionId);
            return question && question.type === '서술형' && a.scoreReceived === null;
        });

        const summaryDiv = document.getElementById('gradingSummary');
        summaryDiv.innerHTML = `
            <div class="summary-card">
                <h4>응시 인원</h4>
                <div class="value">${totalStudents}명</div>
            </div>
            <div class="summary-card">
                <h4>평균 점수</h4>
                <div class="value">${avgScore.toFixed(1)}점</div>
            </div>
            <div class="summary-card">
                <h4>만점</h4>
                <div class="value">${maxScore.toFixed(1)}점</div>
            </div>
            <div class="summary-card">
                <h4>서술형 미채점</h4>
                <div class="value" style="color: ${ungradedEssays.length > 0 ? 'var(--danger-color)' : 'var(--success-color)'}">
                    ${ungradedEssays.length}개
                </div>
            </div>
        `;
    }

    /**
     * 서술형 채점 인터페이스
     */
    renderEssayGrading() {
        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        const essayQuestions = questions.filter(q => q.type === '서술형');

        // 서술형 채점 섹션 element가 없으면 (HTML에서 제거됨) 그냥 리턴
        const essaySection = document.querySelector('.essay-grading-section');
        const listDiv = document.getElementById('essayGradingList');

        if (!essaySection || !listDiv) {
            // 서술형 채점 섹션이 제거되어 있으므로 채점 불필요
            return;
        }

        if (essayQuestions.length === 0) {
            essaySection.style.display = 'none';
            return;
        }

        const allAnswers = storage.getAnswersByExamId(this.currentExam.id);
        const essayAnswers = allAnswers.filter(a => {
            const question = questions.find(q => q.id === a.questionId);
            return question && question.type === '서술형';
        });

        // 미채점 답안만 표시
        const ungradedAnswers = essayAnswers.filter(a => a.scoreReceived === null);

        if (ungradedAnswers.length === 0) {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-text">모든 서술형 문제가 채점되었습니다.</div>
                </div>
            `;
            return;
        }

        listDiv.innerHTML = ungradedAnswers.map(answer => {
            const question = questions.find(q => q.id === answer.questionId);
            const student = storage.getStudent(answer.studentId);

            return `
                <div class="essay-grading-item" data-answer-id="${answer.id}">
                    <div class="essay-grading-header">
                        <div>
                            <strong>${student.name}</strong> - ${question.number}번 문제
                        </div>
                        <div>배점: ${question.points}점</div>
                    </div>
                    <div class="essay-question-info">
                        <strong>문제:</strong> ${question.passage}
                    </div>
                    ${question.correctAnswer ? `
                        <details style="margin: 0.5rem 0;">
                            <summary style="cursor: pointer; color: var(--text-secondary); font-size: 0.9rem;">모범 답안</summary>
                            <div style="margin-top: 0.5rem; padding: 0.8rem; background: white; border-radius: 0.375rem; font-size: 0.9rem;">
                                ${question.correctAnswer}
                            </div>
                        </details>
                    ` : ''}
                    <div class="essay-student-answer">
                        <strong>학생 답안:</strong>
                        <div style="margin-top: 0.5rem; white-space: pre-wrap;">
                            ${answer.answerText || '(답안 없음)'}
                        </div>
                    </div>
                    <div class="essay-score-input">
                        <label>채점 점수:</label>
                        <input type="number" class="form-control score-input" min="0" max="${question.points}" step="0.5" placeholder="점수 입력">
                        <span>/ ${question.points}점</span>
                        <button class="btn btn-primary btn-sm save-score-btn">저장</button>
                    </div>
                </div>
            `;
        }).join('');

        // 점수 저장 이벤트
        listDiv.querySelectorAll('.save-score-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const item = btn.closest('.essay-grading-item');
                const answerId = item.getAttribute('data-answer-id');
                const scoreInput = item.querySelector('.score-input');
                const score = parseFloat(scoreInput.value);

                if (isNaN(score)) {
                    alert('점수를 입력해주세요.');
                    return;
                }

                // answerId로 정확히 찾기 (인덱스 불일치 방지)
                const answer = ungradedAnswers.find(a => a.id === answerId);
                if (!answer) {
                    alert('답안을 찾을 수 없습니다.');
                    return;
                }

                const question = questions.find(q => q.id === answer.questionId);

                if (score < 0 || score > question.points) {
                    alert(`점수는 0에서 ${question.points} 사이여야 합니다.`);
                    return;
                }

                // 점수 저장
                answer.scoreReceived = score;
                await storage.saveAnswer(answer);

                // UI 새로고침
                await this.loadGradingResults();

                alert('채점이 저장되었습니다.');
            });
        });
    }

    /**
     * 성적표 테이블
     */
    renderResultsTable(results) {
        const tableDiv = document.getElementById('resultsTable');

        // 영역 목록 추출
        const domains = new Set();
        results.forEach(result => {
            Object.keys(result.domainScores).forEach(domain => domains.add(domain));
        });
        const domainList = Array.from(domains);

        tableDiv.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>등수</th>
                        <th>이름</th>
                        <th>학교</th>
                        <th>학년</th>
                        <th>총점</th>
                        <th>객관식</th>
                        <th>서술형</th>
                        ${domainList.map(d => `<th>${d}</th>`).join('')}
                        <th>틀린 문제</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(result => `
                        <tr>
                            <td>${result.rank}</td>
                            <td>${result.student.name}</td>
                            <td>${result.student.school}</td>
                            <td>${result.student.grade}</td>
                            <td><strong>${result.totalScore.toFixed(1)}</strong> / ${result.maxScore.toFixed(1)}</td>
                            <td>${result.multipleChoiceScore.toFixed(1)}</td>
                            <td>${result.essayScore.toFixed(1)}</td>
                            ${domainList.map(d => {
                                const ds = result.domainScores[d] || { score: 0, maxScore: 0 };
                                return `<td>${ds.score.toFixed(1)} / ${ds.maxScore.toFixed(1)}</td>`;
                            }).join('')}
                            <td>${result.wrongQuestions.map(wq => wq.questionNumber || wq.question?.number).join(', ')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * 문제 분석 모달 열기
     */
    showQuestionModal(index) {
        const stat = this.currentQuestionStats[index];
        if (!stat) return;

        const q = stat.question;
        const isMultiple = q.type === '객관식';

        // 모달 제목 설정
        document.getElementById('modalQuestionTitle').textContent =
            `${q.number}번 문제 분석 - ${q.type}`;

        // 모달 내용 설정
        const modalBody = document.getElementById('modalQuestionBody');
        modalBody.innerHTML = `
            <div class="modal-question-info">
                <div class="modal-info-row">
                    <span class="info-label">영역:</span>
                    <span class="info-value">${q.domain}</span>
                </div>
                <div class="modal-info-row">
                    <span class="info-label">배점:</span>
                    <span class="info-value">${q.points}점</span>
                </div>
                ${q.passage ? `
                    <div class="modal-info-row">
                        <span class="info-label">작품/지문:</span>
                        <span class="info-value">${q.passage}</span>
                    </div>
                ` : ''}
                <div class="modal-info-row">
                    <span class="info-label">오답률:</span>
                    <span class="info-value" style="color: ${stat.wrongRate > 50 ? '#ef4444' : stat.wrongRate > 30 ? '#f59e0b' : '#22c55e'}; font-weight: 700;">
                        ${stat.wrongRate.toFixed(1)}% (${stat.wrongCount}/${stat.totalAnswers}명)
                    </span>
                </div>
                ${q.intent ? `
                    <div class="modal-info-row">
                        <span class="info-label">출제 의도:</span>
                        <span class="info-value">${q.intent}</span>
                    </div>
                ` : ''}
            </div>

            ${isMultiple ? `
                <div class="choice-stats">
                    <h5>선택지별 선택 비율</h5>
                    <div class="choice-bars">
                        ${[1, 2, 3, 4, 5].map(num => {
                            const choiceData = stat.choiceStats[num.toString()] || { count: 0, students: [] };
                            const count = choiceData.count;
                            const percentage = stat.totalAnswers > 0 ? (count / stat.totalAnswers * 100) : 0;
                            const isCorrect = q.correctAnswer === num.toString();
                            const explanation = q.choiceExplanations ? q.choiceExplanations[num.toString()] : '';

                            return `
                                <div class="choice-bar-item">
                                    <div class="choice-label">
                                        <span class="choice-num ${isCorrect ? 'correct' : ''}">${num}번</span>
                                        ${isCorrect ? '<span class="correct-badge">정답</span>' : ''}
                                        <span class="choice-count ${count > 0 ? 'clickable' : ''}"
                                              ${count > 0 ? `onclick="grading.showStudentList('${num}', ${index})"` : ''}>
                                            ${count}명 (${percentage.toFixed(1)}%)
                                        </span>
                                    </div>
                                    <div class="choice-bar-container">
                                        <div class="choice-bar ${isCorrect ? 'correct' : ''}"
                                             style="width: ${percentage}%"></div>
                                    </div>
                                    ${explanation ? `
                                        <div class="choice-explanation">
                                            ${explanation}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : `
                <div class="score-distribution">
                    <h5>부분 점수 현황</h5>
                    <div class="score-dist-chart">
                        ${Object.entries(stat.scoreDistribution)
                            .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
                            .map(([score, scoreData]) => {
                                const count = scoreData.count;
                                const percentage = stat.totalAnswers > 0 ? (count / stat.totalAnswers * 100) : 0;
                                const scoreNum = parseFloat(score);
                                const isFullScore = scoreNum === q.points;

                                return `
                                    <div class="score-dist-item">
                                        <div class="score-label">
                                            <span class="score-value ${isFullScore ? 'full-score' : ''}">${score}점</span>
                                            <span class="score-count ${count > 0 ? 'clickable' : ''}"
                                                  ${count > 0 ? `onclick="grading.showEssayStudentList('${score}', ${index})"` : ''}>
                                                ${count}명 (${percentage.toFixed(1)}%)
                                            </span>
                                        </div>
                                        <div class="score-bar-container">
                                            <div class="score-bar ${isFullScore ? 'full-score' : ''}"
                                                 style="width: ${percentage}%"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                    </div>
                    ${q.correctAnswer && q.correctAnswer.trim() !== '' && q.correctAnswer !== '서술형' ? `
                        <details class="model-answer">
                            <summary>모범 답안 보기</summary>
                            <div class="model-answer-content">
                                ${q.correctAnswer}
                            </div>
                        </details>
                    ` : ''}
                </div>
            `}
        `;

        // 모달 표시
        document.getElementById('questionAnalysisModal').style.display = 'block';
    }

    /**
     * 문제 분석 모달 닫기
     */
    closeQuestionModal() {
        document.getElementById('questionAnalysisModal').style.display = 'none';
    }

    /**
     * 선택지를 선택한 학생 목록 표시
     */
    showStudentList(choiceNum, questionIndex) {
        const stat = this.currentQuestionStats[questionIndex];
        if (!stat) return;

        const choiceData = stat.choiceStats[choiceNum] || { count: 0, students: [] };
        if (choiceData.count === 0) return;

        const q = stat.question;
        const isCorrect = q.correctAnswer === choiceNum;

        // 학생 정보 가져오기
        const studentInfos = choiceData.students.map(studentId => {
            const student = storage.getStudent(studentId);
            const result = storage.getExamResult(this.currentExam.id, studentId);
            return { student, result };
        }).filter(info => info.student);

        // 점수순으로 정렬
        studentInfos.sort((a, b) => b.result.totalScore - a.result.totalScore);

        // 모달 제목 설정
        document.getElementById('studentListModalTitle').textContent =
            `${q.number}번 문제 - ${choiceNum}번 선택지를 선택한 학생 (${choiceData.count}명)`;

        // 모달 내용 설정
        const modalBody = document.getElementById('studentListModalBody');
        modalBody.innerHTML = `
            <div class="student-list-info">
                <div class="choice-info ${isCorrect ? 'correct-choice' : 'wrong-choice'}">
                    <span class="choice-badge">${choiceNum}번</span>
                    <span class="choice-status">${isCorrect ? '정답' : '오답'}</span>
                </div>
            </div>
            <div class="student-list-table">
                <table>
                    <thead>
                        <tr>
                            <th>이름</th>
                            <th>학교</th>
                            <th>학년</th>
                            <th>총점</th>
                            <th>등수</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentInfos.map(info => `
                            <tr>
                                <td><strong>${info.student.name}</strong></td>
                                <td>${info.student.school}</td>
                                <td>${info.student.grade}</td>
                                <td>${info.result.totalScore.toFixed(1)}점</td>
                                <td>${info.result.rank} / ${info.result.totalStudents}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // 모달 표시
        document.getElementById('studentListModal').style.display = 'block';
    }

    /**
     * 학생 목록 모달 닫기
     */
    closeStudentListModal() {
        document.getElementById('studentListModal').style.display = 'none';
    }

    /**
     * 서술형 점수별 학생 목록 표시
     */
    showEssayStudentList(score, questionIndex) {
        const stat = this.currentQuestionStats[questionIndex];
        if (!stat) return;

        const scoreData = stat.scoreDistribution[score] || { count: 0, students: [] };
        if (scoreData.count === 0) return;

        const q = stat.question;
        const scoreNum = parseFloat(score);
        const isFullScore = scoreNum === q.points;

        // 학생 정보 가져오기
        const studentInfos = scoreData.students.map(studentId => {
            const student = storage.getStudent(studentId);
            const result = storage.getExamResult(this.currentExam.id, studentId);
            return { student, result };
        }).filter(info => info.student);

        // 점수순으로 정렬
        studentInfos.sort((a, b) => b.result.totalScore - a.result.totalScore);

        // 모달 제목 설정
        document.getElementById('studentListModalTitle').textContent =
            `${q.number}번 문제 - ${score}점 획득한 학생 (${scoreData.count}명)`;

        // 모달 내용 설정
        const modalBody = document.getElementById('studentListModalBody');
        modalBody.innerHTML = `
            <div class="student-list-info">
                <div class="choice-info ${isFullScore ? 'correct-choice' : 'wrong-choice'}">
                    <span class="choice-badge">${score}점</span>
                    <span class="choice-status">${isFullScore ? '만점' : `${q.points}점 만점`}</span>
                </div>
            </div>
            <div class="student-list-table">
                <table>
                    <thead>
                        <tr>
                            <th>이름</th>
                            <th>학교</th>
                            <th>학년</th>
                            <th>총점</th>
                            <th>등수</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentInfos.map(info => `
                            <tr>
                                <td><strong>${info.student.name}</strong></td>
                                <td>${info.student.school}</td>
                                <td>${info.student.grade}</td>
                                <td>${info.result.totalScore.toFixed(1)}점</td>
                                <td>${info.result.rank} / ${info.result.totalStudents}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // 모달 표시
        document.getElementById('studentListModal').style.display = 'block';
    }

    /**
     * 문제별 분석
     */
    renderQuestionAnalysis(results) {
        const questions = storage.getQuestionsByExamId(this.currentExam.id);
        const allAnswers = storage.getAnswersByExamId(this.currentExam.id);
        const totalStudents = results.length;

        // 각 문제별 통계 계산
        const questionStats = questions.map(question => {
            const questionAnswers = allAnswers.filter(a => a.questionId === question.id);
            const totalAnswers = questionAnswers.length;

            let wrongCount = 0;
            let choiceStats = {
                '1': { count: 0, students: [] },
                '2': { count: 0, students: [] },
                '3': { count: 0, students: [] },
                '4': { count: 0, students: [] },
                '5': { count: 0, students: [] }
            };
            let scoreDistribution = {};

            if (question.type === '객관식') {
                // 객관식: 선택지별 카운트 및 학생 목록
                questionAnswers.forEach(answer => {
                    if (answer.answerText !== question.correctAnswer) {
                        wrongCount++;
                    }
                    if (answer.answerText && answer.answerText >= '1' && answer.answerText <= '5') {
                        choiceStats[answer.answerText].count++;
                        choiceStats[answer.answerText].students.push(answer.studentId);
                    }
                });
            } else if (question.type === '서술형') {
                // 서술형: 점수 분포 및 학생 목록
                questionAnswers.forEach(answer => {
                    const score = answer.scoreReceived !== null ? answer.scoreReceived : 0;
                    if (score < question.points) {
                        wrongCount++;
                    }
                    const scoreKey = score.toString();
                    if (!scoreDistribution[scoreKey]) {
                        scoreDistribution[scoreKey] = { count: 0, students: [] };
                    }
                    scoreDistribution[scoreKey].count++;
                    scoreDistribution[scoreKey].students.push(answer.studentId);
                });
            }

            const wrongRate = totalAnswers > 0 ? (wrongCount / totalAnswers * 100) : 0;

            return {
                question,
                totalAnswers,
                wrongCount,
                wrongRate,
                choiceStats,
                scoreDistribution
            };
        });

        // 오답률 높은 순으로 정렬
        questionStats.sort((a, b) => b.wrongRate - a.wrongRate);

        // 렌더링 - 간단한 카드만 표시
        const analysisDiv = document.getElementById('questionAnalysis');
        analysisDiv.innerHTML = questionStats.map((stat, index) => {
            const q = stat.question;
            const isMultiple = q.type === '객관식';

            return `
                <div class="question-analysis-item clickable" onclick="grading.showQuestionModal(${index})">
                    <div class="question-analysis-header">
                        <div class="question-info">
                            <strong>${q.number}번</strong>
                            <span class="question-type-badge ${isMultiple ? 'multiple' : 'essay'}">
                                ${q.type}
                            </span>
                            <span class="question-domain">${q.domain}</span>
                            <span class="question-points">${q.points}점</span>
                        </div>
                        <div class="question-stats">
                            <span class="wrong-rate" style="color: ${stat.wrongRate > 50 ? '#ef4444' : stat.wrongRate > 30 ? '#f59e0b' : '#22c55e'}">
                                오답률 ${stat.wrongRate.toFixed(1)}%
                            </span>
                            <span class="answer-count">${stat.totalAnswers}명 응답</span>
                        </div>
                    </div>

                    ${q.passage ? `
                        <div class="question-passage">
                            작품/지문: ${q.passage}
                        </div>
                    ` : ''}

                    <div class="click-hint">클릭하여 상세 분석 보기 →</div>
                </div>
            `;
        }).join('');

        // 통계 데이터 저장 (모달에서 사용)
        this.currentQuestionStats = questionStats;
    }

    /**
     * 성적표 CSV 내보내기
     */
    exportResults() {
        if (!this.currentExam) {
            alert('먼저 시험을 선택해주세요.');
            return;
        }

        const csv = CSVUtils.exportResultsToCSV(this.currentExam.id);
        CSVUtils.downloadCSV(`${this.currentExam.name}_성적표.csv`, csv);
    }
}
