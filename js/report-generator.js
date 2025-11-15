/**
 * 성적표 생성 모듈
 */

class ReportGenerator {
    constructor() {
        this.currentExam = null;
        this.currentStudent = null;
        this.currentResult = null;
        this.chart = null;
        this.domainChart = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExamSelect();
    }

    setupEventListeners() {
        // 시험 선택
        document.getElementById('reportExamSelect').addEventListener('change', (e) => {
            const examId = e.target.value;
            if (examId) {
                this.currentExam = storage.getExam(examId);
                this.loadStudentSelect();
            } else {
                this.currentExam = null;
                this.clearStudentSelect();
            }
        });

        // 학생 선택
        document.getElementById('reportStudentSelect').addEventListener('change', (e) => {
            const studentId = e.target.value;
            if (studentId) {
                this.currentStudent = storage.getStudent(studentId);
            } else {
                this.currentStudent = null;
            }
        });

        // 성적표 생성
        document.getElementById('generateReportBtn').addEventListener('click', () => {
            this.generateReport();
        });

        // 인쇄
        document.getElementById('printReportBtn').addEventListener('click', () => {
            this.printReport();
        });

        // PDF 저장
        document.getElementById('exportPdfBtn').addEventListener('click', () => {
            this.exportPDF();
        });
    }

    /**
     * 시험 선택 드롭다운 로드
     */
    loadExamSelect() {
        const exams = storage.getAllExams();
        const select = document.getElementById('reportExamSelect');

        select.innerHTML = '<option value="">시험을 선택하세요</option>' +
            exams.map(exam => `<option value="${exam.id}"
                                      data-name="${exam.name}"
                                      data-organization="${exam.organization || ''}"
                                      data-school="${exam.school}"
                                      data-grade="${exam.grade}">
                ${exam.name} (${exam.organization || '국어농장'})
            </option>`).join('');
    }

    /**
     * 학생 선택 드롭다운 로드
     */
    loadStudentSelect() {
        if (!this.currentExam) return;

        const allAnswers = storage.getAnswersByExamId(this.currentExam.id);
        const studentIds = [...new Set(allAnswers.map(a => a.studentId))];
        const students = studentIds.map(id => storage.getStudent(id)).filter(s => s);

        const select = document.getElementById('reportStudentSelect');
        select.innerHTML = '<option value="">학생을 선택하세요</option>' +
            students.map(student =>
                `<option value="${student.id}"
                        data-name="${student.name}"
                        data-school="${student.school}"
                        data-grade="${student.grade}">
                    ${student.name} (${student.school} ${student.grade})
                </option>`
            ).join('');
    }

    /**
     * 학생 선택 초기화
     */
    clearStudentSelect() {
        const select = document.getElementById('reportStudentSelect');
        select.innerHTML = '<option value="">학생을 선택하세요</option>';
    }

    /**
     * 성적표 생성
     */
    generateReport() {
        if (!this.currentExam || !this.currentStudent) {
            alert('시험과 학생을 모두 선택해주세요.');
            return;
        }

        // 성적 결과 계산
        this.currentResult = storage.getExamResult(this.currentExam.id, this.currentStudent.id);

        if (!this.currentResult) {
            alert('성적 데이터가 없습니다.');
            return;
        }

        // 성적표 렌더링
        this.renderReport();
    }

    /**
     * 성적표 렌더링
     */
    renderReport() {
        const previewDiv = document.getElementById('reportPreview');

        const html = `
            <div class="report-container" id="reportContent">
                <div class="report-header">
                    <h2>${this.currentExam.name} 성적표</h2>
                    <div class="student-info-line">
                        <span><strong>이름:</strong> ${this.currentStudent.name}</span>
                        <span><strong>학교:</strong> ${this.currentStudent.school}</span>
                        <span><strong>학년:</strong> ${this.currentStudent.grade}</span>
                        <span><strong>시험일:</strong> ${this.currentExam.date}</span>
                    </div>
                </div>

                <div class="score-summary">
                    <h3>점수 요약</h3>
                    <div class="score-cards">
                        <div class="score-card primary">
                            <div class="score-label">총점</div>
                            <div class="score-value">${this.currentResult.totalScore.toFixed(1)} / ${this.currentResult.maxScore.toFixed(1)}</div>
                            <div class="score-percent">${((this.currentResult.totalScore / this.currentResult.maxScore) * 100).toFixed(1)}%</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">등수</div>
                            <div class="score-value">${this.currentResult.rank} / ${this.currentResult.totalStudents}</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">객관식</div>
                            <div class="score-value">${this.currentResult.multipleChoiceScore.toFixed(1)}</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">서술형</div>
                            <div class="score-value">${this.currentResult.essayScore.toFixed(1)}</div>
                        </div>
                    </div>
                </div>

                <div class="charts-section">
                    <div class="domain-scores">
                        <h3>영역별 성취도</h3>
                        <div class="domain-content">
                            <div class="domain-chart">
                                <canvas id="domainChart" width="400" height="400"></canvas>
                            </div>
                            <table class="domain-table">
                                <thead>
                                    <tr>
                                        <th>영역</th>
                                        <th>득점</th>
                                        <th>만점</th>
                                        <th>정답률</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.keys(this.currentResult.domainScores).map(domain => {
                                        const ds = this.currentResult.domainScores[domain];
                                        const rate = ds.total > 0 ? (ds.correct / ds.total * 100) : 0;
                                        return `
                                            <tr>
                                                <td>${domain}</td>
                                                <td>${ds.score.toFixed(1)}</td>
                                                <td>${ds.maxScore.toFixed(1)}</td>
                                                <td>${rate.toFixed(1)}% (${ds.correct}/${ds.total})</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="trend-scores">
                        <h3>성적 추이</h3>
                        <div class="trend-chart">
                            <canvas id="trendChart" width="800" height="320"></canvas>
                        </div>
                    </div>
                </div>

                <div class="wrong-questions">
                    <h3>오답 분석</h3>
                    ${this.currentResult.wrongQuestions.length === 0 ? `
                        <p class="no-wrong">모든 문제를 정확하게 풀었습니다! 🎉</p>
                    ` : `
                        <div class="wrong-list">
                            ${this.currentResult.wrongQuestions.map(wq => `
                                <div class="wrong-item">
                                    <div class="wrong-header">
                                        <strong>${wq.question.number}번</strong>
                                        <span class="question-type-badge ${wq.question.type === '객관식' ? 'multiple' : 'essay'}">
                                            ${wq.question.type}
                                        </span>
                                        <span class="wrong-points">${wq.question.points}점</span>
                                    </div>
                                    <div class="wrong-meta">
                                        영역: ${wq.question.domain} | ${wq.question.passage}
                                    </div>
                                    ${wq.question.intent ? `
                                        <div class="wrong-intent">
                                            <strong>출제 의도:</strong> ${wq.question.intent}
                                        </div>
                                    ` : ''}
                                    <div class="wrong-feedback">
                                        <pre style="white-space: pre-wrap; font-family: inherit;">${wq.feedback}</pre>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>

            <style>
                .report-container {
                    max-width: 900px;
                    margin: 0 auto;
                }

                .report-header {
                    text-align: center;
                    margin-bottom: 1.5rem;
                    padding-bottom: 1rem;
                    border-bottom: 3px solid var(--primary-color);
                }

                .report-header h2 {
                    color: var(--primary-color);
                    margin-bottom: 0.5rem;
                }

                .student-info-line {
                    display: flex;
                    justify-content: center;
                    gap: 1.5rem;
                    font-size: 0.95rem;
                    flex-wrap: wrap;
                }

                .student-info {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 0.5rem;
                    max-width: 400px;
                    margin: 0 auto;
                }

                .student-info p {
                    text-align: left;
                }

                .score-summary, .domain-scores, .wrong-questions, .chart-section {
                    margin-bottom: 2rem;
                }

                .score-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }

                .score-card {
                    background: var(--background-color);
                    padding: 1.5rem;
                    border-radius: 0.5rem;
                    text-align: center;
                    border: 2px solid var(--border-color);
                }

                .score-card.primary {
                    background: var(--primary-color);
                    color: white;
                    border: none;
                }

                .score-label {
                    font-size: 0.9rem;
                    margin-bottom: 0.5rem;
                }

                .score-card.primary .score-label {
                    opacity: 0.9;
                }

                .score-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 0.3rem;
                }

                .score-percent {
                    font-size: 1.1rem;
                    opacity: 0.9;
                }

                .domain-content {
                    display: grid;
                    grid-template-columns: 1.2fr 1fr;
                    gap: 2rem;
                    margin-top: 1rem;
                    align-items: center;
                }

                .domain-chart {
                    padding: 1rem;
                    background: var(--background-color);
                    border-radius: 0.5rem;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .domain-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.5em;
                }

                .domain-table th,
                .domain-table td {
                    padding: 0.4rem;
                    text-align: left;
                    border-bottom: 1px solid var(--border-color);
                }

                .domain-table th {
                    background: var(--background-color);
                    font-weight: 600;
                }

                @media (max-width: 768px) {
                    .domain-content {
                        grid-template-columns: 1fr;
                    }
                }

                .charts-section {
                    margin-bottom: 2rem;
                }

                .trend-scores {
                    margin-top: 2rem;
                }

                .trend-chart {
                    padding: 1rem;
                    background: var(--background-color);
                    border-radius: 0.5rem;
                    margin-top: 1rem;
                }

                .wrong-list {
                    display: grid;
                    gap: 1rem;
                    margin-top: 1rem;
                }

                .wrong-item {
                    padding: 1.2rem;
                    background: var(--background-color);
                    border-radius: 0.5rem;
                    border-left: 4px solid var(--danger-color);
                }

                .wrong-header {
                    display: flex;
                    gap: 0.5rem;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }

                .wrong-points {
                    margin-left: auto;
                    font-weight: 600;
                    color: var(--danger-color);
                }

                .wrong-meta {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.5rem;
                }

                .wrong-intent {
                    font-size: 0.9rem;
                    margin: 0.5rem 0;
                    padding: 0.6rem;
                    background: white;
                    border-radius: 0.375rem;
                }

                .wrong-feedback {
                    margin-top: 0.8rem;
                    padding: 0.8rem;
                    background: white;
                    border-radius: 0.375rem;
                    font-size: 0.9rem;
                }

                .no-wrong {
                    text-align: center;
                    padding: 2rem;
                    font-size: 1.2rem;
                    color: var(--success-color);
                }

                .chart-section {
                    padding: 1rem;
                    background: var(--background-color);
                    border-radius: 0.5rem;
                }

                @media print {
                    .score-card.primary {
                        background: var(--primary-color) !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        `;

        previewDiv.innerHTML = html;

        // 차트 렌더링
        this.renderDomainChart();
        this.renderChart();
    }

    /**
     * 영역별 점수 차트 렌더링 (레이더 차트)
     */
    renderDomainChart() {
        const canvas = document.getElementById('domainChart');
        if (!canvas) return;

        const domainScores = this.currentResult.domainScores;
        const domains = Object.keys(domainScores);

        if (domains.length === 0) {
            canvas.style.display = 'none';
            return;
        }

        // 데이터 준비 - 정답률 기준
        const labels = domains;
        const rates = domains.map(d => {
            const ds = domainScores[d];
            return ds.total > 0 ? (ds.correct / ds.total * 100) : 0;
        });

        // 기존 차트 제거
        if (this.domainChart) {
            this.domainChart.destroy();
        }

        // 새 차트 생성 - 레이더 차트
        const ctx = canvas.getContext('2d');
        this.domainChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
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
                            padding: 8,
                            font: {
                                size: 11
                            }
                        }
                    },
                    title: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.r !== null) {
                                    label += context.parsed.r.toFixed(1) + '%';
                                }
                                return label;
                            }
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
                            font: {
                                size: 10
                            }
                        },
                        pointLabels: {
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            padding: 5
                        }
                    }
                }
            }
        });
    }

    /**
     * 성적 추이 차트
     */
    renderChart() {
        const canvas = document.getElementById('trendChart');
        if (!canvas) return;

        // 같은 시리즈의 시험 중 해당 학생이 응시한 시험만 찾기 (최근 5개만)
        const allExams = storage.getAllExams().filter(e => {
            // 같은 시리즈 확인
            if (e.school !== this.currentExam.school ||
                e.grade !== this.currentExam.grade ||
                e.series !== this.currentExam.series) {
                return false;
            }
            // 해당 학생이 응시한 시험인지 확인
            const answers = storage.getAnswersByExamAndStudent(e.id, this.currentStudent.id);
            return answers.length > 0;
        }).sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-5); // 최근 5개 시험만 표시

        if (allExams.length === 0) {
            // 시리즈가 없으면 차트 숨김
            const trendSection = canvas.closest('.trend-scores');
            if (trendSection) {
                trendSection.style.display = 'none';
            }
            return;
        }

        // 차트 섹션 표시
        const trendSection = canvas.closest('.trend-scores');
        if (trendSection) {
            trendSection.style.display = 'block';
        }

        // 각 시험별 점수 데이터
        const labels = allExams.map(e => e.name);
        const scores = allExams.map(exam => {
            const result = storage.getExamResult(exam.id, this.currentStudent.id);
            return result ? result.totalScore : null;
        });

        const averages = allExams.map(exam => {
            const results = storage.getAllExamResults(exam.id);
            if (results.length === 0) return null;
            return results.reduce((sum, r) => sum + r.totalScore, 0) / results.length;
        });

        // 최고점과 최저점 계산
        const maxScores = allExams.map(exam => {
            const results = storage.getAllExamResults(exam.id);
            if (results.length === 0) return null;
            return Math.max(...results.map(r => r.totalScore));
        });

        const minScores = allExams.map(exam => {
            const results = storage.getAllExamResults(exam.id);
            if (results.length === 0) return null;
            return Math.min(...results.map(r => r.totalScore));
        });

        // 기존 차트 제거
        if (this.chart) {
            this.chart.destroy();
        }

        // 새 차트 생성
        const ctx = canvas.getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '최고점',
                    data: maxScores,
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: '+1', // 다음 데이터셋(최저점)까지 채움
                    tension: 0.3,
                    order: 3
                }, {
                    label: '최저점',
                    data: minScores,
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    backgroundColor: 'rgba(255, 255, 255, 0)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0.3,
                    order: 4
                }, {
                    label: '평균 점수',
                    data: averages,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    order: 2
                }, {
                    label: '내 점수',
                    data: scores,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.3,
                    order: 1
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
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(1) + '점';
                                }
                                return label;
                            }
                        }
                    },
                    filler: {
                        propagate: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '점수'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '점';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '시험'
                        }
                    }
                }
            }
        });
    }

    /**
     * 인쇄
     */
    printReport() {
        if (!this.currentResult) {
            alert('먼저 성적표를 생성해주세요.');
            return;
        }

        window.print();
    }

    /**
     * PDF 내보내기 (페이지 분할 적용)
     */
    async exportPDF() {
        if (!this.currentResult) {
            alert('먼저 성적표를 생성해주세요.');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            // 페이지 설정
            const pageWidth = 210; // A4 width
            const pageHeight = 297; // A4 height
            const margin = 15; // 여백 15mm
            const contentWidth = pageWidth - (margin * 2);

            // 1. 첫 페이지: 헤더 ~ 성적 추이까지
            const firstPageContent = document.createElement('div');
            firstPageContent.style.width = '900px';
            firstPageContent.style.padding = '20px';
            firstPageContent.style.backgroundColor = 'white';

            const header = document.querySelector('.report-header').cloneNode(true);
            const scoreSummary = document.querySelector('.score-summary').cloneNode(true);
            const chartsSection = document.querySelector('.charts-section').cloneNode(true);

            // 영역별 점수 차트를 이미지로 변환 (레이더 차트)
            const domainChartCanvas = document.getElementById('domainChart');
            if (domainChartCanvas) {
                const chartImgData = domainChartCanvas.toDataURL('image/png');
                const chartImg = document.createElement('img');
                chartImg.src = chartImgData;
                chartImg.style.width = '100%';
                chartImg.style.height = 'auto';

                // chartsSection 내의 domainChart canvas를 img로 교체
                const domainCanvas = chartsSection.querySelector('#domainChart');
                if (domainCanvas) {
                    domainCanvas.parentNode.replaceChild(chartImg, domainCanvas);
                }
            }

            // 성적 추이 차트를 이미지로 변환
            const trendChartCanvas = document.getElementById('trendChart');
            if (trendChartCanvas) {
                const trendImgData = trendChartCanvas.toDataURL('image/png');
                const trendImg = document.createElement('img');
                trendImg.src = trendImgData;
                trendImg.style.width = '100%';
                trendImg.style.height = 'auto';

                // chartsSection 내의 trendChart canvas를 img로 교체
                const trendCanvas = chartsSection.querySelector('#trendChart');
                if (trendCanvas) {
                    trendCanvas.parentNode.replaceChild(trendImg, trendCanvas);
                }
            }

            firstPageContent.appendChild(header);
            firstPageContent.appendChild(scoreSummary);
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

            // 2. 오답 문제 페이지 (한 페이지에 4문항씩)
            const wrongQuestions = this.currentResult.wrongQuestions;

            if (wrongQuestions.length > 0) {
                const questionsPerPage = 4;
                const totalPages = Math.ceil(wrongQuestions.length / questionsPerPage);

                for (let page = 0; page < totalPages; page++) {
                    pdf.addPage();

                    const startIdx = page * questionsPerPage;
                    const endIdx = Math.min(startIdx + questionsPerPage, wrongQuestions.length);
                    const pageQuestions = wrongQuestions.slice(startIdx, endIdx);

                    // 오답 문제 페이지 생성
                    const wrongPageContent = document.createElement('div');
                    wrongPageContent.style.width = '800px';
                    wrongPageContent.style.padding = '15px';
                    wrongPageContent.style.backgroundColor = 'white';
                    wrongPageContent.style.fontFamily = 'Arial, sans-serif';

                    const wrongTitle = document.createElement('h3');
                    wrongTitle.textContent = `오답 분석 (문제 ${startIdx + 1}~${endIdx})`;
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

                    pageQuestions.forEach(wq => {
                        const wrongItem = document.createElement('div');
                        wrongItem.style.padding = '10px';
                        wrongItem.style.background = '#f9fafb';
                        wrongItem.style.borderRadius = '6px';
                        wrongItem.style.borderLeft = '4px solid #ef4444';
                        wrongItem.style.pageBreakInside = 'avoid';

                        wrongItem.innerHTML = `
                            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
                                <strong style="font-size: 13px;">${wq.question.number}번</strong>
                                <span style="background: ${wq.question.type === '객관식' ? '#3b82f6' : '#8b5cf6'};
                                            color: white; padding: 2px 7px; border-radius: 3px; font-size: 10px;">
                                    ${wq.question.type}
                                </span>
                                <span style="font-size: 11px; color: #6b7280;">영역: ${wq.question.domain}${wq.question.subDomain ? ' > ' + wq.question.subDomain : ''}</span>
                                <span style="font-size: 11px; color: #6b7280;">${wq.question.passage}</span>
                                <span style="margin-left: auto; font-weight: 600; color: #ef4444; font-size: 12px;">배점 ${wq.question.points}점</span>
                            </div>
                            ${wq.question.intent ? `
                                <div style="font-size: 11px; margin: 5px 0; padding: 6px;
                                          background: white; border-radius: 4px;">
                                    <strong>출제 의도:</strong> ${wq.question.intent}
                                </div>
                            ` : ''}
                            <div style="margin-top: 6px; padding: 8px; background: white;
                                      border-radius: 4px; font-size: 11px; line-height: 1.4;">
                                <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${wq.feedback}</pre>
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

            pdf.save(`${this.currentExam.name}_${this.currentStudent.name}_성적표.pdf`);
            alert('PDF가 저장되었습니다.');

        } catch (error) {
            console.error('PDF 생성 오류:', error);
            alert('PDF 생성에 실패했습니다: ' + error.message);
        }
    }
}
