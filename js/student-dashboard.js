/**
 * Student Dashboard Module
 * Handles the student-facing views for reports, wrong notes, and trends
 */

class StudentDashboard {
    constructor() {
        this.profile = null;
        this.exams = [];
        this.selectedExamId = null;
        this.selectedExamIds = [];
        this.charts = {};
        this.init();
    }

    async init() {
        // Initialize Cognito first to restore session
        await cognitoAuth.init();

        // Check authentication
        if (!this.checkAuth()) return;

        // Load profile and exams
        await this.loadProfile();
        await this.loadExams();

        // Setup event listeners
        this.setupEventListeners();
    }

    // 모바일 여부 확인
    isMobile() {
        return window.innerWidth <= 768;
    }

    checkAuth() {
        const session = SessionManager.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return false;
        }

        // Redirect non-students to admin page
        if (session.role !== 'student') {
            window.location.href = 'index.html';
            return false;
        }

        return true;
    }

    async getAuthToken() {
        const token = await cognitoAuth.getIdToken();
        if (!token) {
            // Cognito 세션 만료 - 로그인 페이지로 리다이렉트
            SessionManager.clearSession();
            window.location.href = 'login.html';
            throw new Error('Session expired');
        }
        return token;
    }

    async loadProfile() {
        try {
            const token = await this.getAuthToken();
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/student/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                SessionManager.clearSession();
                window.location.href = 'login.html';
                return;
            }

            if (!response.ok) throw new Error('Failed to load profile');

            const result = await response.json();
            this.profile = result.data;

            // Update header
            document.getElementById('studentInfo').textContent =
                `${this.profile.name} (${this.profile.school} ${this.profile.grade})`;
        } catch (error) {
            if (error.message === 'Session expired') return;
            console.error('Load profile error:', error);
            this.showError('프로필을 불러오는데 실패했습니다.');
        }
    }

    async loadExams() {
        try {
            const token = await this.getAuthToken();
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/student/exams`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                SessionManager.clearSession();
                window.location.href = 'login.html';
                return;
            }

            if (!response.ok) throw new Error('Failed to load exams');

            const result = await response.json();
            this.exams = result.data;

            this.renderExamCards();
            this.renderExamCheckboxes();
            this.renderTrendCharts();
        } catch (error) {
            if (error.message === 'Session expired') return;
            console.error('Load exams error:', error);
            this.showError('시험 목록을 불러오는데 실패했습니다.');
        }
    }

    // 점수 포맷팅 (항상 소수점 1자리)
    formatScore(score) {
        if (score === null || score === undefined) return '0.0';
        return (Math.round(score * 10) / 10).toFixed(1);
    }

    setupEventListeners() {
        // Hamburger menu
        this.setupHamburgerMenu();

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            cognitoAuth.logout();
        });

        // Change password
        document.getElementById('changePasswordBtn').addEventListener('click', () => {
            this.closeHeaderMenu();
            this.showChangePasswordModal();
        });

        // Select all exams
        document.getElementById('selectAllExamsBtn').addEventListener('click', () => {
            this.toggleSelectAllExams();
        });

        // Generate wrong note
        document.getElementById('generateWrongNoteBtn').addEventListener('click', () => {
            this.generateWrongNote();
        });
    }

    setupHamburgerMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const headerMenu = document.getElementById('headerMenu');

        if (!hamburgerBtn || !headerMenu) return;

        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hamburgerBtn.classList.toggle('active');
            headerMenu.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!headerMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                this.closeHeaderMenu();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeHeaderMenu();
            }
        });
    }

    closeHeaderMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const headerMenu = document.getElementById('headerMenu');
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        if (headerMenu) headerMenu.classList.remove('open');
    }

    showChangePasswordModal() {
        const currentPassword = prompt('현재 비밀번호를 입력하세요:');
        if (!currentPassword) return;

        const newPassword = prompt('새 비밀번호를 입력하세요 (8자 이상):');
        if (!newPassword || newPassword.length < 8) {
            alert('비밀번호는 8자 이상이어야 합니다.');
            return;
        }

        const confirmPassword = prompt('새 비밀번호를 다시 입력하세요:');
        if (newPassword !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        cognitoAuth.changePassword(currentPassword, newPassword)
            .then(result => {
                if (result.success) {
                    alert('비밀번호가 변경되었습니다.');
                }
            })
            .catch(error => {
                alert(error.message || '비밀번호 변경에 실패했습니다.');
            });
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        // Refresh charts if needed
        if (tabId === 'trend') {
            this.renderTrendCharts();
        }
    }

    renderExamCards() {
        const container = document.getElementById('examCards');

        if (this.exams.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>아직 응시한 시험이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.exams.map(exam => `
            <div class="exam-card ${this.selectedExamId === exam.id ? 'selected' : ''}"
                 data-exam-id="${exam.id}">
                <h4>${exam.name}</h4>
                <div class="exam-card-meta">
                    ${exam.school} ${exam.grade}<br>
                    ${exam.date || '날짜 미지정'}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.exam-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectExam(card.dataset.examId);
            });
        });
    }

    renderExamCheckboxes() {
        const container = document.getElementById('examCheckboxes');

        if (this.exams.length === 0) {
            container.innerHTML = '<p>응시한 시험이 없습니다.</p>';
            return;
        }

        container.innerHTML = this.exams.map(exam => `
            <div class="exam-checkbox-item">
                <input type="checkbox" id="exam-${exam.id}" value="${exam.id}">
                <label for="exam-${exam.id}">${exam.name} (${exam.date || '날짜 미지정'})</label>
            </div>
        `).join('');
    }

    toggleSelectAllExams() {
        const checkboxes = document.querySelectorAll('#examCheckboxes input[type="checkbox"]');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });

        document.getElementById('selectAllExamsBtn').textContent =
            allChecked ? '모두 선택' : '선택 해제';
    }

    async selectExam(examId) {
        this.selectedExamId = examId;

        // Update card selection
        document.querySelectorAll('.exam-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.examId === examId);
        });

        // Load and display report
        await this.loadReport(examId);
    }

    async loadReport(examId) {
        const container = document.getElementById('reportContainer');
        container.style.display = 'block';
        container.innerHTML = '<div class="loading">성적표를 불러오는 중...</div>';

        try {
            const token = await cognitoAuth.getIdToken();
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/student/exams/${examId}/result`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load result');

            const result = await response.json();
            this.renderReport(result.data);
        } catch (error) {
            console.error('Load report error:', error);
            container.innerHTML = '<div class="empty-state">성적표를 불러오는데 실패했습니다.</div>';
        }
    }

    renderReport(data) {
        const container = document.getElementById('reportContainer');

        container.innerHTML = `
            <div class="report-container" id="reportContent">
                <div class="report-header">
                    <h2>${data.exam.name} 성적표</h2>
                    <div class="student-info-line">
                        <span><strong>이름:</strong> ${this.profile.name}</span>
                        <span><strong>학교:</strong> ${this.profile.school}</span>
                        <span><strong>학년:</strong> ${this.profile.grade}</span>
                        <span><strong>시험일:</strong> ${data.exam.date || ''}</span>
                    </div>
                </div>

                <div class="score-summary">
                    <h3>점수 요약</h3>
                    <div class="score-cards">
                        <div class="score-card primary">
                            <div class="score-label">총점</div>
                            <div class="score-value">${this.formatScore(data.totalScore)} / ${this.formatScore(data.maxScore)}</div>
                            <div class="score-percent">${Math.round(data.percentage)}%</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">등수</div>
                            <div class="score-value">${data.rank} / ${data.totalStudents}</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">객관식</div>
                            <div class="score-value">${this.formatScore(data.multipleChoiceScore)}</div>
                        </div>
                        <div class="score-card">
                            <div class="score-label">서술형</div>
                            <div class="score-value">${this.formatScore(data.essayScore)}</div>
                        </div>
                    </div>
                </div>

                <div class="charts-section">
                    <div class="domain-scores">
                        <h3>영역별 성취도</h3>
                        <div class="domain-content">
                            <div class="domain-chart">
                                <canvas id="reportDomainChart" width="400" height="400"></canvas>
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
                                    ${Object.keys(data.domainScores).map(domain => {
                                        const ds = data.domainScores[domain];
                                        const rate = ds.total > 0 ? Math.round(ds.correct / ds.total * 100) : 0;
                                        return `
                                            <tr>
                                                <td>${domain}</td>
                                                <td>${this.formatScore(ds.score)}</td>
                                                <td>${this.formatScore(ds.maxScore)}</td>
                                                <td>${rate}% (${ds.correct}/${ds.total})</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="wrong-questions">
                    <h3>오답 분석</h3>
                    ${data.wrongQuestions.length === 0 ? `
                        <p class="no-wrong">모든 문제를 정확하게 풀었습니다! 🎉</p>
                    ` : `
                        <div class="wrong-list">
                            ${data.wrongQuestions.map(wq => `
                                <div class="wrong-item">
                                    <div class="wrong-header">
                                        <strong>${wq.questionNumber}번</strong>
                                        <span class="question-type-badge ${wq.questionType === '객관식' ? 'multiple' : 'essay'}">
                                            ${wq.questionType}
                                        </span>
                                        <span class="wrong-points">${wq.points}점</span>
                                    </div>
                                    <div class="wrong-meta">
                                        영역: ${wq.domain}${wq.subDomain ? ' > ' + wq.subDomain : ''} | ${wq.passage || ''}
                                    </div>
                                    <div class="wrong-feedback">
                                        <pre style="white-space: pre-wrap; font-family: inherit;">${wq.feedback}</pre>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>

            <button class="btn btn-primary pdf-export-btn" onclick="studentDashboard.exportReportPdf()">
                PDF 다운로드
            </button>
        `;

        // Render domain chart
        this.renderDomainChart('reportDomainChart', data.domainScores);
    }

    renderDomainChart(canvasId, domainScores) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const labels = Object.keys(domainScores);
        const data = labels.map(domain => {
            const score = domainScores[domain];
            return score.maxScore > 0 ? Math.round((score.score / score.maxScore) * 100) : 0;
        });

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        this.charts[canvasId] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: '성취도 (%)',
                    data: data,
                    backgroundColor: 'rgba(74, 124, 89, 0.2)',
                    borderColor: 'rgba(74, 124, 89, 1)',
                    pointBackgroundColor: 'rgba(74, 124, 89, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(74, 124, 89, 1)'
                }]
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            font: { size: this.isMobile() ? 5 : 10 }  // 모바일에서 절반
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,  // 모바일에서 절반
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    async generateWrongNote() {
        const checkboxes = document.querySelectorAll('#examCheckboxes input[type="checkbox"]:checked');
        const examIds = Array.from(checkboxes).map(cb => cb.value);

        if (examIds.length === 0) {
            alert('시험을 선택해주세요.');
            return;
        }

        const container = document.getElementById('wrongNoteContainer');
        container.style.display = 'block';
        container.innerHTML = '<div class="loading">오답 노트를 생성하는 중...</div>';

        try {
            const token = await cognitoAuth.getIdToken();
            const response = await fetch(
                `${APP_CONFIG.API_BASE_URL}/student/wrong-notes?examIds=${examIds.join(',')}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) throw new Error('Failed to load wrong notes');

            const result = await response.json();
            this.renderWrongNote(result.data);
        } catch (error) {
            console.error('Generate wrong note error:', error);
            container.innerHTML = '<div class="empty-state">오답 노트 생성에 실패했습니다.</div>';
        }
    }

    renderWrongNote(data) {
        const container = document.getElementById('wrongNoteContainer');

        // 첫 시험과 마지막 시험 날짜
        const dates = data.exams.map(e => e.date).filter(d => d).sort();
        const dateRange = dates.length > 1
            ? `${dates[0]} ~ ${dates[dates.length - 1]}`
            : (dates[0] || '');

        container.innerHTML = `
            <div class="wrong-note-container" id="wrongNoteContent">
                <div class="wrong-note-header">
                    <h2>${this.profile.name} 학생 오답 노트</h2>
                    <p class="wrong-note-info">
                        ${this.profile.school} ${this.profile.grade} |
                        분석 기간: ${dateRange}
                    </p>
                </div>

                <div class="summary-cards" id="wrongNoteSummary">
                    <div class="summary-card">
                        <div class="summary-label">분석 시험</div>
                        <div class="summary-value">${data.summary.totalExams}회</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">총 문제</div>
                        <div class="summary-value">${data.summary.totalQuestions}문제</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">오답</div>
                        <div class="summary-value">${data.summary.totalWrong}문제</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">평균 정답률</div>
                        <div class="summary-value">${data.summary.accuracyRate}%</div>
                    </div>
                </div>

                <div class="wrong-note-charts">
                    <div class="chart-section">
                        <h3>영역별 정답률</h3>
                        <div class="domain-content">
                            <div class="domain-chart">
                                <canvas id="wrongNoteDomainChart" width="300" height="300"></canvas>
                            </div>
                            <table class="domain-table">
                                <thead>
                                    <tr>
                                        <th>영역</th>
                                        <th>정답 수</th>
                                        <th>정답률</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(data.domainAccuracy).map(([domain, stats]) => `
                                        <tr>
                                            <td>${domain}</td>
                                            <td>${stats.correct} / ${stats.total}</td>
                                            <td class="${stats.rate >= 70 ? 'rate-good' : stats.rate >= 50 ? 'rate-mid' : 'rate-bad'}">${stats.rate}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="wrong-questions-list">
                    <h3>오답 문제 목록 (총 ${data.wrongQuestions.length}문제)</h3>
                    ${data.wrongQuestions.length === 0 ? `
                        <p class="no-wrong">선택한 시험에서 오답이 없습니다! 🎉</p>
                    ` : `
                        ${data.wrongQuestions.map((item, index) => `
                            <div class="wrong-question-item">
                                <div class="wrong-question-header">
                                    <span class="question-index">${index + 1}</span>
                                    <span class="exam-name">${item.examName}</span>
                                    <strong>${item.questionNumber}번</strong>
                                    <span class="question-type-badge ${item.questionType === '객관식' ? 'multiple' : 'essay'}">
                                        ${item.questionType}
                                    </span>
                                    <span class="question-points">${item.points}점</span>
                                </div>
                                <div class="question-meta">
                                    영역: ${item.domain}${item.subDomain ? ' > ' + item.subDomain : ''} |
                                    ${item.passage || ''}
                                </div>
                                ${item.questionIntent ? `
                                    <div class="question-intent">
                                        <strong>출제 의도:</strong> ${item.questionIntent}
                                    </div>
                                ` : ''}
                                <div class="question-feedback">
                                    <pre style="white-space: pre-wrap; font-family: inherit;">${item.feedback}</pre>
                                </div>
                            </div>
                        `).join('')}
                    `}
                </div>
            </div>

            <button class="btn btn-primary pdf-export-btn" onclick="studentDashboard.exportWrongNotePdf()">
                PDF 다운로드
            </button>
        `;

        // Render domain chart
        this.renderWrongNoteDomainChart(data.domainAccuracy);
    }

    renderWrongNoteDomainChart(domainAccuracy) {
        const canvas = document.getElementById('wrongNoteDomainChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const labels = Object.keys(domainAccuracy);
        const rates = labels.map(domain => domainAccuracy[domain].rate);

        if (this.charts['wrongNoteDomainChart']) {
            this.charts['wrongNoteDomainChart'].destroy();
        }

        this.charts['wrongNoteDomainChart'] = new Chart(ctx, {
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
                plugins: {
                    legend: {
                        display: false
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
                            }
                        }
                    }
                }
            }
        });
    }

    async renderTrendCharts() {
        if (this.exams.length === 0) {
            document.getElementById('trendSummary').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📈</div>
                    <p>아직 성적 추이 데이터가 없습니다.</p>
                </div>
            `;
            return;
        }

        // Load all exam results
        const results = [];
        const token = await cognitoAuth.getIdToken();

        for (const exam of this.exams.slice(0, 10)) { // Limit to recent 10 exams
            try {
                const response = await fetch(
                    `${APP_CONFIG.API_BASE_URL}/student/exams/${exam.id}/result`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (response.ok) {
                    const result = await response.json();
                    results.push({
                        exam: exam,
                        result: result.data
                    });
                }
            } catch (error) {
                console.error('Load result error:', error);
            }
        }

        if (results.length === 0) return;

        // Sort by date
        results.sort((a, b) => new Date(a.exam.date || 0) - new Date(b.exam.date || 0));

        // Render score trend chart
        this.renderScoreTrendChart(results);

        // Render domain chart (aggregate)
        this.renderAggregateDomainChart(results);

        // Render summary
        this.renderTrendSummary(results);
    }

    renderScoreTrendChart(results) {
        const canvas = document.getElementById('scoreTrendChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const labels = results.map(r => r.exam.name);
        const scores = results.map(r => r.result.percentage);

        if (this.charts['scoreTrend']) {
            this.charts['scoreTrend'].destroy();
        }

        this.charts['scoreTrend'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '백분율 (%)',
                    data: scores,
                    borderColor: 'rgba(74, 124, 89, 1)',
                    backgroundColor: 'rgba(74, 124, 89, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            font: { size: this.isMobile() ? 8 : 12 }  // 모바일에서 1/3 축소
                        }
                    },
                    x: {
                        ticks: {
                            font: { size: this.isMobile() ? 8 : 12 }  // 모바일에서 1/3 축소
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    renderAggregateDomainChart(results) {
        const canvas = document.getElementById('domainChart');
        if (!canvas) return;

        // Aggregate domain scores
        const domainTotals = {};
        for (const r of results) {
            for (const [domain, scores] of Object.entries(r.result.domainScores)) {
                if (!domainTotals[domain]) {
                    domainTotals[domain] = { score: 0, maxScore: 0 };
                }
                domainTotals[domain].score += scores.score;
                domainTotals[domain].maxScore += scores.maxScore;
            }
        }

        const ctx = canvas.getContext('2d');
        const labels = Object.keys(domainTotals);
        const data = labels.map(domain => {
            const totals = domainTotals[domain];
            return totals.maxScore > 0 ? Math.round((totals.score / totals.maxScore) * 100) : 0;
        });

        if (this.charts['domainTrend']) {
            this.charts['domainTrend'].destroy();
        }

        this.charts['domainTrend'] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: '평균 정답률 (%)',
                    data: data,
                    backgroundColor: 'rgba(74, 124, 89, 0.2)',
                    borderColor: 'rgba(74, 124, 89, 1)',
                    pointBackgroundColor: 'rgba(74, 124, 89, 1)'
                }]
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            font: { size: this.isMobile() ? 5 : 10 }  // 모바일에서 절반
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,  // 모바일에서 절반
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    renderTrendSummary(results) {
        const container = document.getElementById('trendSummary');

        // Calculate averages
        const avgScore = results.reduce((sum, r) => sum + r.result.percentage, 0) / results.length;
        const avgRank = results.reduce((sum, r) => sum + r.result.rank, 0) / results.length;

        // Find best/worst
        const best = results.reduce((max, r) => r.result.percentage > max.result.percentage ? r : max, results[0]);
        const worst = results.reduce((min, r) => r.result.percentage < min.result.percentage ? r : min, results[0]);

        container.innerHTML = `
            <h3>성적 분석</h3>
            <div class="trend-stats">
                <div class="stat-item">
                    <span class="stat-label">평균 점수:</span>
                    <span class="stat-value">${avgScore.toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">평균 등수:</span>
                    <span class="stat-value">${avgRank.toFixed(1)}등</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">최고 성적:</span>
                    <span class="stat-value">${best.exam.name} (${best.result.percentage}%)</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">분석 시험 수:</span>
                    <span class="stat-value">${results.length}개</span>
                </div>
            </div>
        `;
    }

    async exportReportPdf() {
        const { jsPDF } = window.jspdf;
        const content = document.getElementById('reportContent');

        try {
            const canvas = await html2canvas(content, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`성적표_${this.profile.name}.pdf`);
        } catch (error) {
            console.error('PDF export error:', error);
            alert('PDF 생성에 실패했습니다.');
        }
    }

    async exportWrongNotePdf() {
        const { jsPDF } = window.jspdf;
        const content = document.getElementById('wrongNoteContent');

        try {
            const canvas = await html2canvas(content, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pdf.internal.pageSize.getHeight();

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pdf.internal.pageSize.getHeight();
            }

            pdf.save(`오답노트_${this.profile.name}.pdf`);
        } catch (error) {
            console.error('PDF export error:', error);
            alert('PDF 생성에 실패했습니다.');
        }
    }

    showError(message) {
        alert(message);
    }
}

// Initialize dashboard
let studentDashboard;
document.addEventListener('DOMContentLoaded', () => {
    studentDashboard = new StudentDashboard();
});
