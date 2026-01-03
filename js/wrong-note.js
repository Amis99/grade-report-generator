/**
 * 학생별 오답 노트 모듈
 */

class WrongNote {
    constructor() {
        this.currentStudent = null;
        this.selectedExams = [];
        this.trendChart = null;
        this.domainChart = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStudentSelect();
    }

    // 모바일 여부 확인
    isMobile() {
        return window.innerWidth <= 768;
    }

    setupEventListeners() {
        // 학생 선택
        document.getElementById('wrongNoteStudentSelect').addEventListener('change', (e) => {
            const studentId = e.target.value;
            if (studentId) {
                this.currentStudent = storage.getStudent(studentId);
                this.loadStudentExams();
            } else {
                this.currentStudent = null;
                document.getElementById('wrongNoteExamSelection').style.display = 'none';
                document.getElementById('wrongNoteResultsSection').style.display = 'none';
            }
        });

        // 모두 선택/해제
        document.getElementById('selectAllExamsBtn').addEventListener('click', () => {
            this.toggleSelectAllExams();
        });

        // 오답 노트 생성
        document.getElementById('generateWrongNoteBtn').addEventListener('click', () => {
            this.generateWrongNote();
        });

        // 인쇄
        document.getElementById('printWrongNoteBtn').addEventListener('click', () => {
            this.printWrongNote();
        });

        // PDF 저장
        document.getElementById('exportWrongNotePdfBtn').addEventListener('click', () => {
            this.exportPDF();
        });
    }

    /**
     * 학생 선택 드롭다운 로드
     */
    loadStudentSelect() {
        let students = storage.getAllStudents();

        // 권한에 따른 학생 필터링
        students = AuthService.filterStudents(students);

        const select = document.getElementById('wrongNoteStudentSelect');

        select.innerHTML = '<option value="">학생을 선택하세요</option>' +
            students.map(student => `<option value="${student.id}"
                                           data-name="${student.name}"
                                           data-school="${student.school}"
                                           data-grade="${student.grade}">
                ${student.name} (${student.school} ${student.grade})
            </option>`).join('');
    }

    /**
     * 학생의 시험 목록 로드
     */
    loadStudentExams() {
        if (!this.currentStudent) return;

        const allExams = storage.getAllExams();
        const studentExams = allExams.filter(exam => {
            const answers = storage.getAnswersByExamAndStudent(exam.id, this.currentStudent.id);
            return answers.length > 0;
        });

        if (studentExams.length === 0) {
            alert('이 학생의 답안 데이터가 없습니다.');
            return;
        }

        // 시험 체크박스 목록 생성
        const examListDiv = document.getElementById('wrongNoteExamList');
        examListDiv.innerHTML = studentExams.map(exam => {
            const questions = storage.getQuestionsByExamId(exam.id);
            return `
                <label class="exam-checkbox-item">
                    <input type="checkbox" class="exam-checkbox" value="${exam.id}" data-exam-date="${exam.date}">
                    <span class="exam-checkbox-label">
                        <strong>${exam.name}</strong>
                        <span class="exam-meta">${exam.date} | ${questions.length}문제</span>
                    </span>
                </label>
            `;
        }).join('');

        document.getElementById('wrongNoteExamSelection').style.display = 'block';
    }

    /**
     * 모두 선택/해제 토글
     */
    toggleSelectAllExams() {
        const checkboxes = document.querySelectorAll('.exam-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const btn = document.getElementById('selectAllExamsBtn');

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });

        // 버튼 텍스트 변경
        btn.textContent = allChecked ? '모두 선택' : '선택 해제';
    }

    /**
     * 오답 노트 생성
     */
    generateWrongNote() {
        const checkboxes = document.querySelectorAll('.exam-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('최소 1개 이상의 시험을 선택해주세요.');
            return;
        }

        this.selectedExams = Array.from(checkboxes).map(cb => {
            return storage.getExam(cb.value);
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        // 통계 생성 및 표시
        this.renderStatistics();
        this.renderCharts();
        this.renderWrongNoteContent();

        document.getElementById('wrongNoteResultsSection').style.display = 'block';
    }

    /**
     * 통계 렌더링
     */
    renderStatistics() {
        const stats = this.calculateStatistics();

        const summaryDiv = document.getElementById('wrongNoteSummary');
        summaryDiv.innerHTML = `
            <div class="summary-card">
                <div class="summary-label">분석 시험</div>
                <div class="summary-value">${this.selectedExams.length}회</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">총 문제</div>
                <div class="summary-value">${stats.totalQuestions}문제</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">오답</div>
                <div class="summary-value">${stats.totalWrong}문제</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">평균 정답률</div>
                <div class="summary-value">${stats.averageCorrectRate.toFixed(1)}%</div>
            </div>
        `;
    }

    /**
     * 통계 계산
     */
    calculateStatistics() {
        let totalQuestions = 0;
        let totalWrong = 0;
        let totalCorrect = 0;

        this.selectedExams.forEach(exam => {
            const result = storage.getExamResult(exam.id, this.currentStudent.id);
            if (result) {
                const questions = storage.getQuestionsByExamId(exam.id);
                totalQuestions += questions.length;
                totalWrong += result.wrongQuestions.length;
                totalCorrect += (questions.length - result.wrongQuestions.length);
            }
        });

        const averageCorrectRate = totalQuestions > 0 ? (totalCorrect / totalQuestions * 100) : 0;

        return {
            totalQuestions,
            totalWrong,
            totalCorrect,
            averageCorrectRate
        };
    }

    /**
     * 차트 렌더링
     */
    renderCharts() {
        this.renderTrendChart();
        this.renderDomainChart();
        this.renderPassageStats();
    }

    /**
     * 추이 차트
     */
    renderTrendChart() {
        const canvas = document.getElementById('wrongNoteTrendChart');
        if (!canvas) return;

        // 유효한 결과가 있는 시험만 필터링
        const validExamData = this.selectedExams
            .map(exam => {
                const result = storage.getExamResult(exam.id, this.currentStudent.id);
                if (!result) return null;

                const questions = storage.getQuestionsByExamId(exam.id);
                const wrongCount = result.wrongQuestions?.length || 0;
                const correctCount = questions.length - wrongCount;
                const correctRate = questions.length > 0
                    ? (correctCount / questions.length * 100)
                    : 0;

                return {
                    name: exam.name,
                    score: result.totalScore || 0,
                    correctRate: correctRate
                };
            })
            .filter(data => data !== null);

        // 유효한 데이터가 없으면 차트 숨김
        if (validExamData.length === 0) {
            canvas.style.display = 'none';
            return;
        }
        canvas.style.display = 'block';

        const labels = validExamData.map(d => d.name);
        const scores = validExamData.map(d => d.score);
        const correctRates = validExamData.map(d => d.correctRate);

        // 기존 차트 제거
        if (this.trendChart) {
            this.trendChart.destroy();
        }

        // 점수 축 범위 계산 (유효한 값만 사용)
        const validScores = scores.filter(s => s > 0);
        const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
        const yAxisMin = Math.max(0, Math.floor(minScore / 10) * 10 - 10);
        const yAxisMax = 100;

        const ctx = canvas.getContext('2d');
        const isMobile = this.isMobile();
        this.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '점수',
                    data: scores,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: isMobile ? 2 : 3,
                    pointRadius: isMobile ? 2 : 5,
                    pointHoverRadius: isMobile ? 4 : 7,
                    yAxisID: 'y'
                }, {
                    label: '정답률',
                    data: correctRates,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: isMobile ? 2 : 3,
                    pointRadius: isMobile ? 2 : 5,
                    pointHoverRadius: isMobile ? 4 : 7,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: !this.isMobile(),  // 모바일에서 범례 숨김
                        position: 'top',
                        labels: {
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        enabled: true,
                        titleFont: {
                            size: isMobile ? 9 : 14  // 모바일에서 1/3 축소
                        },
                        bodyFont: {
                            size: isMobile ? 8 : 13  // 모바일에서 1/3 축소
                        },
                        padding: isMobile ? 4 : 10,
                        boxPadding: isMobile ? 2 : 4,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;  // 시험명 표시
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: !this.isMobile(),  // 모바일에서 축 제목 숨김
                            text: '점수',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            font: {
                                size: this.isMobile() ? 9 : 12
                            }
                        },
                        min: yAxisMin,
                        max: yAxisMax
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: !this.isMobile(),  // 모바일에서 축 제목 숨김
                            text: '정답률 (%)',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            font: {
                                size: this.isMobile() ? 9 : 12
                            }
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        min: 0,
                        max: 100
                    },
                    x: {
                        ticks: {
                            display: !this.isMobile(),  // 모바일에서 시험명 숨김
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * 영역별 차트
     */
    renderDomainChart() {
        const canvas = document.getElementById('wrongNoteDomainChart');
        if (!canvas) return;

        // 영역별 통계 집계
        const domainStats = {};

        this.selectedExams.forEach(exam => {
            const result = storage.getExamResult(exam.id, this.currentStudent.id);
            if (!result) return;

            Object.keys(result.domainScores).forEach(domain => {
                if (!domainStats[domain]) {
                    domainStats[domain] = { correct: 0, total: 0 };
                }
                domainStats[domain].correct += result.domainScores[domain].correct;
                domainStats[domain].total += result.domainScores[domain].total;
            });
        });

        const domains = Object.keys(domainStats);
        const rates = domains.map(d => {
            const stats = domainStats[d];
            return stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
        });

        // 기존 차트 제거
        if (this.domainChart) {
            this.domainChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        this.domainChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: domains,
                datasets: [{
                    label: '정답률',
                    data: rates,
                    backgroundColor: 'rgba(37, 99, 235, 0.2)',
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointBackgroundColor: '#2563eb',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                layout: {
                    padding: {
                        top: 5,
                        bottom: 5,
                        left: 5,
                        right: 5
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: this.isMobile() ? 4 : 8,
                            font: { size: this.isMobile() ? 6 : 11 }  // 모바일에서 절반
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            callback: function(value) {
                                return value + '%';
                            },
                            font: { size: this.isMobile() ? 5 : 10 }  // 모바일에서 절반
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,  // 모바일에서 절반
                                weight: 'bold'
                            },
                            padding: this.isMobile() ? 2 : 5
                        }
                    }
                }
            }
        });
    }

    /**
     * 단원/지문별 통계
     */
    renderPassageStats() {
        const passageStats = {};

        this.selectedExams.forEach(exam => {
            const questions = storage.getQuestionsByExamId(exam.id);
            const result = storage.getExamResult(exam.id, this.currentStudent.id);
            if (!result) return;

            const wrongQuestionIds = result.wrongQuestions.map(wq => wq.question.id);

            questions.forEach(question => {
                const key = question.passage || '기타';
                if (!passageStats[key]) {
                    passageStats[key] = { correct: 0, wrong: 0 };
                }

                if (wrongQuestionIds.includes(question.id)) {
                    passageStats[key].wrong++;
                } else {
                    passageStats[key].correct++;
                }
            });
        });

        // 정렬: 단원/지문명 순 (가나다순)
        const sortedPassages = Object.entries(passageStats)
            .sort((a, b) => a[0].localeCompare(b[0], 'ko-KR'));

        const statsDiv = document.getElementById('wrongNotePassageStats');
        statsDiv.innerHTML = sortedPassages.map(([passage, stats]) => {
            const total = stats.correct + stats.wrong;
            const correctRate = total > 0 ? (stats.correct / total * 100) : 0;
            const wrongRate = total > 0 ? (stats.wrong / total * 100) : 0;

            return `
                <div class="passage-stat-item">
                    <div class="passage-name">${passage}</div>
                    <div class="passage-bars">
                        <div class="passage-bar-container">
                            <div class="passage-bar correct" style="width: ${correctRate}%"></div>
                            <div class="passage-bar wrong" style="width: ${wrongRate}%"></div>
                        </div>
                        <div class="passage-stats-text">
                            <span class="correct-text">정답 ${stats.correct}</span>
                            <span class="wrong-text">오답 ${stats.wrong}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 오답 노트 내용 렌더링
     */
    renderWrongNoteContent() {
        const allWrongQuestions = [];

        this.selectedExams.forEach(exam => {
            const result = storage.getExamResult(exam.id, this.currentStudent.id);
            if (!result) return;

            result.wrongQuestions.forEach(wq => {
                allWrongQuestions.push({
                    exam: exam,
                    question: wq.question,
                    feedback: wq.feedback
                });
            });
        });

        const previewDiv = document.getElementById('wrongNotePreview');
        previewDiv.innerHTML = `
            <div class="wrong-note-container">
                <div class="wrong-note-header">
                    <h2>${this.currentStudent.name} 학생 오답 노트</h2>
                    <p class="wrong-note-info">
                        ${this.currentStudent.school} ${this.currentStudent.grade} |
                        분석 기간: ${this.selectedExams[0].date} ~ ${this.selectedExams[this.selectedExams.length - 1].date}
                    </p>
                </div>

                <div class="wrong-questions-list">
                    <h3>오답 문제 목록 (총 ${allWrongQuestions.length}문제)</h3>
                    ${allWrongQuestions.map((item, index) => `
                        <div class="wrong-question-item">
                            <div class="wrong-question-header">
                                <span class="question-index">${index + 1}</span>
                                <span class="exam-name">${item.exam.name}</span>
                                <strong>${item.question.number}번</strong>
                                <span class="question-type-badge ${item.question.type === '객관식' ? 'multiple' : 'essay'}">
                                    ${item.question.type}
                                </span>
                                <span class="question-points">${item.question.points}점</span>
                            </div>
                            <div class="question-meta">
                                영역: ${item.question.domain}${item.question.subDomain ? ' > ' + item.question.subDomain : ''} |
                                ${item.question.passage}
                            </div>
                            ${item.question.intent ? `
                                <div class="question-intent">
                                    <strong>출제 의도:</strong> ${item.question.intent}
                                </div>
                            ` : ''}
                            <div class="question-feedback">
                                <pre style="white-space: pre-wrap; font-family: inherit;">${item.feedback}</pre>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 인쇄
     */
    printWrongNote() {
        if (!this.currentStudent || this.selectedExams.length === 0) {
            alert('먼저 오답 노트를 생성해주세요.');
            return;
        }
        window.print();
    }

    /**
     * PDF 내보내기 (페이지 분할 적용)
     */
    async exportPDF() {
        if (!this.currentStudent || this.selectedExams.length === 0) {
            alert('먼저 오답 노트를 생성해주세요.');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pageWidth = 210; // A4 width
            const pageHeight = 297; // A4 height
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);

            // 1. 첫 페이지: 헤더 + 학습 통계 + 차트들
            const firstPageContent = document.createElement('div');
            firstPageContent.style.width = '900px';
            firstPageContent.style.padding = '20px';
            firstPageContent.style.backgroundColor = 'white';

            // 헤더 생성
            const header = document.createElement('div');
            header.style.textAlign = 'center';
            header.style.marginBottom = '20px';
            header.style.paddingBottom = '15px';
            header.style.borderBottom = '2px solid #e5e7eb';
            header.innerHTML = `
                <h2 style="font-size: 24px; color: #2563eb; margin-bottom: 8px;">
                    ${this.currentStudent.name} 학생 오답 노트
                </h2>
                <div style="font-size: 14px; color: #6b7280;">
                    ${this.currentStudent.school} ${this.currentStudent.grade} |
                    분석 기간: ${this.selectedExams[0].date} ~ ${this.selectedExams[this.selectedExams.length - 1].date}
                </div>
            `;
            firstPageContent.appendChild(header);

            // 학습 통계 복사
            const summarySection = document.querySelector('#wrongNoteSummary').cloneNode(true);
            summarySection.style.marginBottom = '20px';
            firstPageContent.appendChild(summarySection);

            // 차트 섹션 생성
            const chartsSection = document.createElement('div');
            chartsSection.style.marginBottom = '20px';

            // 성적 추이 차트를 이미지로 변환
            const trendChartCanvas = document.getElementById('wrongNoteTrendChart');
            if (trendChartCanvas) {
                const trendImgData = trendChartCanvas.toDataURL('image/png');
                const trendSection = document.createElement('div');
                trendSection.style.marginBottom = '20px';
                trendSection.innerHTML = `
                    <h3 style="font-size: 16px; margin-bottom: 10px; color: #1e293b;">성적 추이</h3>
                    <div style="text-align: center;">
                        <img src="${trendImgData}" style="width: 100%; height: auto;" />
                    </div>
                `;
                chartsSection.appendChild(trendSection);
            }

            // 영역별 정답률 레이더 차트를 이미지로 변환
            const domainChartCanvas = document.getElementById('wrongNoteDomainChart');
            if (domainChartCanvas) {
                const domainImgData = domainChartCanvas.toDataURL('image/png');

                // 영역별 통계 데이터 계산
                const domainStats = {};
                this.selectedExams.forEach(exam => {
                    const result = storage.getExamResult(exam.id, this.currentStudent.id);
                    if (!result) return;

                    Object.keys(result.domainScores).forEach(domain => {
                        if (!domainStats[domain]) {
                            domainStats[domain] = { correct: 0, total: 0 };
                        }
                        domainStats[domain].correct += result.domainScores[domain].correct;
                        domainStats[domain].total += result.domainScores[domain].total;
                    });
                });

                // 영역별 데이터 테이블 HTML 생성
                const domainTableHTML = Object.entries(domainStats)
                    .map(([domain, stats]) => {
                        const rate = stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : 0;
                        return `
                            <tr>
                                <td style="padding: 4px; border: 1px solid #e5e7eb; font-weight: 500;">${domain}</td>
                                <td style="padding: 4px; border: 1px solid #e5e7eb; text-align: center;">${stats.correct} / ${stats.total}</td>
                                <td style="padding: 4px; border: 1px solid #e5e7eb; text-align: center; font-weight: 600; color: ${rate >= 70 ? '#16a34a' : rate >= 50 ? '#f59e0b' : '#ef4444'};">${rate}%</td>
                            </tr>
                        `;
                    }).join('');

                const domainSection = document.createElement('div');
                domainSection.style.marginBottom = '20px';
                domainSection.innerHTML = `
                    <h3 style="font-size: 16px; margin-bottom: 10px; color: #1e293b;">영역별 정답률</h3>
                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                        <div style="flex: 1; text-align: center;">
                            <img src="${domainImgData}" style="width: 100%; height: auto; max-width: 350px;" />
                        </div>
                        <div style="flex: 1;">
                            <table style="width: 100%; border-collapse: collapse; background: white; font-size: 6.5px;">
                                <thead>
                                    <tr style="background: #f3f4f6;">
                                        <th style="padding: 4px; border: 1px solid #e5e7eb; font-weight: 600;">영역</th>
                                        <th style="padding: 4px; border: 1px solid #e5e7eb; font-weight: 600;">정답 수</th>
                                        <th style="padding: 4px; border: 1px solid #e5e7eb; font-weight: 600;">정답률</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${domainTableHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                chartsSection.appendChild(domainSection);
            }

            firstPageContent.appendChild(chartsSection);
            document.body.appendChild(firstPageContent);

            const firstPageCanvas = await html2canvas(firstPageContent, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const firstPageImgHeight = (firstPageCanvas.height * contentWidth) / firstPageCanvas.width;
            const firstPageImgData = firstPageCanvas.toDataURL('image/png');

            pdf.addImage(firstPageImgData, 'PNG', margin, margin, contentWidth, firstPageImgHeight);

            document.body.removeChild(firstPageContent);

            // 2. 단원/지문별 통계 페이지 (10개씩 분할)

            // 통계 데이터 재계산 (정렬된 상태)
            const passageStatsData = {};
            this.selectedExams.forEach(exam => {
                const questions = storage.getQuestionsByExamId(exam.id);
                const result = storage.getExamResult(exam.id, this.currentStudent.id);
                if (!result) return;

                const wrongQuestionIds = result.wrongQuestions.map(wq => wq.question.id);

                questions.forEach(question => {
                    const key = question.passage || '기타';
                    if (!passageStatsData[key]) {
                        passageStatsData[key] = { correct: 0, wrong: 0 };
                    }

                    if (wrongQuestionIds.includes(question.id)) {
                        passageStatsData[key].wrong++;
                    } else {
                        passageStatsData[key].correct++;
                    }
                });
            });

            // 단원/지문명 순 정렬
            const sortedPassageStats = Object.entries(passageStatsData)
                .sort((a, b) => a[0].localeCompare(b[0], 'ko-KR'));

            // 10개씩 페이지 분할
            const passagesPerPage = 10;
            const totalPassagePages = Math.ceil(sortedPassageStats.length / passagesPerPage);

            for (let page = 0; page < totalPassagePages; page++) {
                pdf.addPage();

                const startIdx = page * passagesPerPage;
                const endIdx = Math.min(startIdx + passagesPerPage, sortedPassageStats.length);
                const pagePassages = sortedPassageStats.slice(startIdx, endIdx);

                const passagePageContent = document.createElement('div');
                passagePageContent.style.width = '900px';
                passagePageContent.style.padding = '20px';
                passagePageContent.style.backgroundColor = 'white';

                const passageTitle = document.createElement('h3');
                passageTitle.textContent = `단원/지문별 통계 (${startIdx + 1}~${endIdx})`;
                passageTitle.style.fontSize = '18px';
                passageTitle.style.marginBottom = '15px';
                passageTitle.style.marginTop = '0';
                passageTitle.style.color = '#1e293b';
                passagePageContent.appendChild(passageTitle);

                // 통계 항목 생성
                const statsContainer = document.createElement('div');
                statsContainer.style.display = 'flex';
                statsContainer.style.flexDirection = 'column';
                statsContainer.style.gap = '1rem';

                pagePassages.forEach(([passage, stats]) => {
                    const total = stats.correct + stats.wrong;
                    const correctRate = total > 0 ? (stats.correct / total * 100) : 0;
                    const wrongRate = total > 0 ? (stats.wrong / total * 100) : 0;

                    const statItem = document.createElement('div');
                    statItem.style.padding = '1rem';
                    statItem.style.background = '#f8fafc';
                    statItem.style.borderRadius = '6px';
                    statItem.style.borderLeft = '4px solid #2563eb';

                    statItem.innerHTML = `
                        <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.5rem;">${passage}</div>
                        <div style="display: flex; height: 24px; border-radius: 4px; overflow: hidden; background: #e5e7eb; margin-bottom: 0.5rem;">
                            <div style="display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: white; background: #16a34a; width: ${correctRate}%;"></div>
                            <div style="display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: white; background: #ef4444; width: ${wrongRate}%;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.875rem; padding: 0.25rem 0;">
                            <span style="color: #16a34a; font-weight: 600;">정답 ${stats.correct}</span>
                            <span style="color: #ef4444; font-weight: 600;">오답 ${stats.wrong}</span>
                        </div>
                    `;
                    statsContainer.appendChild(statItem);
                });

                passagePageContent.appendChild(statsContainer);
                document.body.appendChild(passagePageContent);

                const passagePageCanvas = await html2canvas(passagePageContent, {
                    scale: 2,
                    logging: false,
                    useCORS: true,
                    backgroundColor: '#ffffff'
                });

                const passagePageImgHeight = (passagePageCanvas.height * contentWidth) / passagePageCanvas.width;
                const passagePageImgData = passagePageCanvas.toDataURL('image/png');

                // 페이지 높이를 넘지 않도록 조정
                const maxHeight = pageHeight - (margin * 2);
                const passageFinalHeight = Math.min(passagePageImgHeight, maxHeight);

                pdf.addImage(passagePageImgData, 'PNG', margin, margin, contentWidth, passageFinalHeight);

                document.body.removeChild(passagePageContent);
            }

            // 3. 오답 문제 페이지 (한 페이지에 4문항씩)
            const allWrongQuestions = [];
            this.selectedExams.forEach(exam => {
                const result = storage.getExamResult(exam.id, this.currentStudent.id);
                if (!result) return;

                result.wrongQuestions.forEach(wq => {
                    allWrongQuestions.push({
                        exam: exam,
                        question: wq.question,
                        feedback: wq.feedback
                    });
                });
            });

            if (allWrongQuestions.length > 0) {
                const questionsPerPage = 4;
                const totalPages = Math.ceil(allWrongQuestions.length / questionsPerPage);

                for (let page = 0; page < totalPages; page++) {
                    pdf.addPage();

                    const startIdx = page * questionsPerPage;
                    const endIdx = Math.min(startIdx + questionsPerPage, allWrongQuestions.length);
                    const pageQuestions = allWrongQuestions.slice(startIdx, endIdx);

                    // 오답 문제 페이지 생성
                    const wrongPageContent = document.createElement('div');
                    wrongPageContent.style.width = '800px';
                    wrongPageContent.style.padding = '15px';
                    wrongPageContent.style.backgroundColor = 'white';
                    wrongPageContent.style.fontFamily = 'Arial, sans-serif';

                    const wrongTitle = document.createElement('h3');
                    wrongTitle.textContent = `오답 문제 목록 (${startIdx + 1}~${endIdx}번)`;
                    wrongTitle.style.marginBottom = '15px';
                    wrongTitle.style.marginTop = '0';
                    wrongTitle.style.color = '#333';
                    wrongTitle.style.fontSize = '18px';
                    wrongTitle.style.fontWeight = 'bold';
                    wrongPageContent.appendChild(wrongTitle);

                    const wrongList = document.createElement('div');
                    wrongList.style.display = 'flex';
                    wrongList.style.flexDirection = 'column';
                    wrongList.style.gap = '12px';

                    pageQuestions.forEach((item, idx) => {
                        const wrongItem = document.createElement('div');
                        wrongItem.style.padding = '10px';
                        wrongItem.style.background = '#f9fafb';
                        wrongItem.style.borderRadius = '6px';
                        wrongItem.style.borderLeft = '4px solid #ef4444';
                        wrongItem.style.pageBreakInside = 'avoid';

                        wrongItem.innerHTML = `
                            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
                                <strong style="font-size: 13px;">${startIdx + idx + 1}. ${item.exam.name} - ${item.question.number}번</strong>
                                <span style="background: ${item.question.type === '객관식' ? '#3b82f6' : '#8b5cf6'};
                                            color: white; padding: 2px 7px; border-radius: 3px; font-size: 10px;">
                                    ${item.question.type}
                                </span>
                                <span style="font-size: 11px; color: #6b7280;">영역: ${item.question.domain}${item.question.subDomain ? ' > ' + item.question.subDomain : ''}</span>
                                <span style="font-size: 11px; color: #6b7280;">${item.question.passage}</span>
                                <span style="margin-left: auto; font-weight: 600; color: #ef4444; font-size: 12px;">배점 ${item.question.points}점</span>
                            </div>
                            ${item.question.intent ? `
                                <div style="font-size: 11px; margin: 5px 0; padding: 6px;
                                          background: white; border-radius: 4px;">
                                    <strong>출제 의도:</strong> ${item.question.intent}
                                </div>
                            ` : ''}
                            <div style="margin-top: 6px; padding: 8px; background: white;
                                      border-radius: 4px; font-size: 11px; line-height: 1.4;">
                                <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${item.feedback}</pre>
                            </div>
                        `;

                        wrongList.appendChild(wrongItem);
                    });

                    wrongPageContent.appendChild(wrongList);
                    document.body.appendChild(wrongPageContent);

                    const wrongPageCanvas = await html2canvas(wrongPageContent, {
                        scale: 2,
                        logging: false,
                        useCORS: true,
                        backgroundColor: '#ffffff'
                    });

                    const wrongPageImgHeight = (wrongPageCanvas.height * contentWidth) / wrongPageCanvas.width;
                    const wrongPageImgData = wrongPageCanvas.toDataURL('image/png');

                    // 페이지 높이를 넘지 않도록 조정
                    const maxHeight = pageHeight - (margin * 2);
                    const finalHeight = Math.min(wrongPageImgHeight, maxHeight);

                    pdf.addImage(wrongPageImgData, 'PNG', margin, margin, contentWidth, finalHeight);

                    document.body.removeChild(wrongPageContent);
                }
            }

            pdf.save(`${this.currentStudent.name}_오답노트.pdf`);
            alert('PDF가 저장되었습니다.');

        } catch (error) {
            console.error('PDF 생성 오류:', error);
            alert('PDF 생성에 실패했습니다: ' + error.message);
        }
    }
}
