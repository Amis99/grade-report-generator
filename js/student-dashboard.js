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

        // Load dashboard data for new portal layout
        await this.loadDashboardData();

        // 포털 컨트롤러의 pendingPage 처리 (인증 전에 해시가 있었던 경우)
        if (typeof studentPortalController !== 'undefined' && studentPortalController.pendingPage) {
            studentPortalController.navigateTo(studentPortalController.pendingPage);
            studentPortalController.pendingPage = null;
        }

        if (typeof onStudentDashboardReady === 'function') {
            onStudentDashboardReady();
        }
    }

    /**
     * 영역의 정렬 우선순위 반환 (화법 → 작문 → 매체 → 문법 → 문학 → 비문학)
     */
    getDomainSortOrder(domain) {
        if (/^화법/.test(domain)) return 0;
        if (/^작문/.test(domain)) return 1;
        if (/^매체/.test(domain)) return 2;
        if (/^문법/.test(domain)) return 3;
        if (/^문학/.test(domain)) return 4;
        if (/^비문학/.test(domain)) return 5;
        return 6;
    }

    /**
     * 영역의 대분류 그룹 반환 (배경색용)
     */
    getDomainGroup(domain) {
        if (/^화법|^작문|^매체/.test(domain)) return 0;
        if (/^문법/.test(domain)) return 1;
        if (/^문학/.test(domain)) return 2;
        if (/^비문학/.test(domain)) return 3;
        return 4;
    }

    /**
     * 레이더 차트 배경색 플러그인 생성
     */
    createRadarBackgroundPlugin(domains) {
        const self = this;
        const groupColors = [
            'rgba(147, 197, 253, 0.3)',  // 화법/작문/매체 - 파랑
            'rgba(167, 243, 208, 0.3)',  // 문법 - 초록
            'rgba(253, 230, 138, 0.3)',  // 문학 - 노랑
            'rgba(252, 165, 165, 0.3)',  // 비문학 - 빨강
            'rgba(209, 213, 219, 0.3)'   // 기타 - 회색
        ];

        return {
            id: 'radarBackground',
            beforeDraw: function(chart) {
                const ctx = chart.ctx;
                const scale = chart.scales.r;

                if (!scale || domains.length === 0) return;

                const centerX = scale.xCenter;
                const centerY = scale.yCenter;
                const radius = scale.drawingArea;
                const anglePerLabel = (2 * Math.PI) / domains.length;
                const startAngle = -Math.PI / 2;

                let currentGroup = -1;
                let groupStartIndex = 0;

                for (let i = 0; i <= domains.length; i++) {
                    const group = i < domains.length ? self.getDomainGroup(domains[i]) : -1;

                    if (group !== currentGroup || i === domains.length) {
                        if (currentGroup >= 0 && i > groupStartIndex) {
                            const sectorStartAngle = startAngle + (groupStartIndex - 0.5) * anglePerLabel;
                            const sectorEndAngle = startAngle + (i - 0.5) * anglePerLabel;

                            ctx.save();
                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY);
                            ctx.arc(centerX, centerY, radius, sectorStartAngle, sectorEndAngle);
                            ctx.closePath();
                            ctx.fillStyle = groupColors[currentGroup] || groupColors[4];
                            ctx.fill();
                            ctx.restore();
                        }

                        currentGroup = group;
                        groupStartIndex = i;
                    }
                }
            }
        };
    }

    // New dashboard data loading methods for portal layout
    async loadDashboardData() {
        try {
            await Promise.all([
                this.loadTodoItems(),
                this.loadRecentScore()
            ]);
        } catch (error) {
            console.error('대시보드 데이터 로드 실패:', error);
        }
    }

    async loadTodoItems() {
        const container = document.getElementById('studentTodoList');
        if (!container) return;

        try {
            // Load pending assignments
            const token = await this.getAuthToken();
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/student/assignments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load assignments');

            const result = await response.json();
            const assignments = result.assignments || [];

            // Filter active assignments (not completed by student)
            const now = new Date();
            const pendingAssignments = assignments.filter(a => {
                // 완료된 과제는 제외
                if (a.isComplete) return false;
                // 마감일이 지난 과제는 제외
                if (a.dueDate && new Date(a.dueDate) < now) return false;
                return true;
            });

            // Sort by due date
            pendingAssignments.sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            });

            this.renderTodoItems(pendingAssignments.slice(0, 5), container);
        } catch (error) {
            console.error('할 일 목록 로드 실패:', error);
            this.renderEmptyTodo(container);
        }
    }

    renderTodoItems(assignments, container) {
        if (assignments.length === 0) {
            this.renderEmptyTodo(container);
            return;
        }

        const now = new Date();

        container.innerHTML = assignments.map(assignment => {
            const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
            const daysLeft = dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : null;

            let timeText = '마감 없음';
            let isUrgent = false;
            if (daysLeft !== null) {
                if (daysLeft <= 0) {
                    timeText = '오늘 마감';
                    isUrgent = true;
                } else if (daysLeft === 1) {
                    timeText = '내일 마감';
                    isUrgent = true;
                } else if (daysLeft <= 3) {
                    timeText = `${daysLeft}일 뒤 마감`;
                    isUrgent = true;
                } else {
                    timeText = `${daysLeft}일 뒤 마감`;
                }
            }

            const indicatorClass = isUrgent ? 'urgent' : 'pending';
            const tagClass = isUrgent ? 'urgent' : 'info';
            const tagText = isUrgent ? '긴급' : '과제';

            return `
                <div class="feed-item" onclick="${typeof studentPortalController !== 'undefined' ? `studentPortalController.navigateTo('my-assignments')` : ''}">
                    <div class="feed-item-indicator ${indicatorClass}">📋</div>
                    <div class="feed-item-content">
                        <div class="feed-item-meta">
                            <span class="feed-item-tag ${tagClass}">${tagText}</span>
                            <span class="feed-item-time">${timeText}</span>
                        </div>
                        <div class="feed-item-title">${this.escapeHtml(assignment.name)}</div>
                        <div class="feed-item-description">${assignment.className || assignment.description || ''}</div>
                    </div>
                    <div class="feed-item-arrow">→</div>
                </div>
            `;
        }).join('');
    }

    renderEmptyTodo(container) {
        container.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">✅</div>
                <div class="feed-empty-title">할 일이 없습니다</div>
                <div class="feed-empty-text">제출할 과제가 없습니다.</div>
            </div>
        `;
    }

    async loadRecentScore() {
        const container = document.getElementById('recentScoreCard');
        if (!container) return;

        try {
            if (this.exams.length === 0) {
                this.renderEmptyScore(container);
                return;
            }

            // Get most recent exam result
            const recentExam = this.exams[0];
            const token = await this.getAuthToken();
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/student/exams/${recentExam.id}/result`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load result');

            const result = await response.json();
            this.renderRecentScore(recentExam, result.data, container);
        } catch (error) {
            console.error('최근 성적 로드 실패:', error);
            this.renderEmptyScore(container);
        }
    }

    renderRecentScore(exam, data, container) {
        const percentile = data.totalStudents > 0 ? Math.round((1 - (data.rank / data.totalStudents)) * 100) : 0;
        const badgeClass = percentile >= 80 ? 'high' : percentile >= 50 ? 'mid' : 'low';
        const badgeText = percentile >= 80 ? '상위' : percentile >= 50 ? '중위' : '하위';

        container.innerHTML = `
            <div class="score-card">
                <div class="score-card-header">
                    <div class="score-card-title">${this.escapeHtml(exam.name)}</div>
                    <span class="score-card-badge ${badgeClass}">${badgeText} ${100 - percentile}%</span>
                </div>
                <div class="score-card-body">
                    <div class="score-value">${Math.round(data.percentage)}<span>점</span></div>
                    <div class="score-details">
                        <div class="score-detail-item">
                            <span class="score-detail-label">등수</span>
                            <span class="score-detail-value">${data.rank}등 / ${data.totalStudents}명</span>
                        </div>
                        <div class="score-detail-item">
                            <span class="score-detail-label">평균</span>
                            <span class="score-detail-value">${data.averageScore ? Math.round(data.averageScore) : '-'}점</span>
                        </div>
                    </div>
                </div>
                <div class="score-card-footer">
                    <a href="#" class="link" onclick="event.preventDefault(); ${typeof studentPortalController !== 'undefined' ? `studentPortalController.navigateTo('my-reports')` : ''}">성적표 보기 →</a>
                </div>
            </div>
        `;
    }

    renderEmptyScore(container) {
        container.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">📊</div>
                <div class="feed-empty-title">아직 성적이 없습니다</div>
                <div class="feed-empty-text">응시한 시험이 없습니다.</div>
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // For portal navigation compatibility
    loadExamCards() {
        this.renderExamCards();
    }

    loadExamCheckboxes() {
        this.renderExamCheckboxes();
    }

    loadTrendData() {
        this.renderTrendCharts();
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

            // Update header (legacy)
            const studentInfo = document.getElementById('studentInfo');
            if (studentInfo) {
                studentInfo.textContent = `${this.profile.name} (${this.profile.school} ${this.profile.grade})`;
            }

            // Update portal user info (new layout)
            if (typeof studentPortalController !== 'undefined') {
                studentPortalController.updateUserInfo(this.profile);
            }
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
        // Hamburger menu (legacy)
        this.setupHamburgerMenu();

        // Tab switching (legacy)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Logout (legacy)
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                cognitoAuth.logout();
            });
        }

        // Change password
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => {
                this.closeHeaderMenu();
                this.showChangePasswordModal();
            });
        }

        // Select all exams
        const selectAllExamsBtn = document.getElementById('selectAllExamsBtn');
        if (selectAllExamsBtn) {
            selectAllExamsBtn.addEventListener('click', () => {
                this.toggleSelectAllExams();
            });
        }

        // Generate wrong note
        const generateWrongNoteBtn = document.getElementById('generateWrongNoteBtn');
        if (generateWrongNoteBtn) {
            generateWrongNoteBtn.addEventListener('click', () => {
                this.generateWrongNote();
            });
        }
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

        // Refresh content based on tab
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

        // 영역 정렬
        const labels = Object.keys(domainScores).sort((a, b) => {
            const orderA = this.getDomainSortOrder(a);
            const orderB = this.getDomainSortOrder(b);
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, 'ko');
        });

        const data = labels.map(domain => {
            const score = domainScores[domain];
            return score.maxScore > 0 ? Math.round((score.score / score.maxScore) * 100) : 0;
        });

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const backgroundPlugin = this.createRadarBackgroundPlugin(labels);

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
                            font: { size: this.isMobile() ? 5 : 10 }
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            },
            plugins: [backgroundPlugin]
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

        // 영역 정렬
        const labels = Object.keys(domainAccuracy).sort((a, b) => {
            const orderA = this.getDomainSortOrder(a);
            const orderB = this.getDomainSortOrder(b);
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, 'ko');
        });

        const rates = labels.map(domain => domainAccuracy[domain].rate);

        if (this.charts['wrongNoteDomainChart']) {
            this.charts['wrongNoteDomainChart'].destroy();
        }

        const backgroundPlugin = this.createRadarBackgroundPlugin(labels);

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
                            font: { size: this.isMobile() ? 5 : 10 }
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,
                                weight: 'bold'
                            }
                        }
                    }
                }
            },
            plugins: [backgroundPlugin]
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

        const isMobile = this.isMobile();
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
                    fill: true,
                    borderWidth: isMobile ? 2 : 3,
                    pointRadius: isMobile ? 2 : 5,
                    pointHoverRadius: isMobile ? 4 : 7,
                    pointHitRadius: isMobile ? 20 : 10  // 모바일 터치 영역 확대
                }]
            },
            options: {
                interaction: {
                    mode: isMobile ? 'nearest' : 'index',  // 모바일에서 가장 가까운 점 감지
                    intersect: false,
                    axis: 'x'
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            font: { size: isMobile ? 9 : 12 }
                        }
                    },
                    x: {
                        ticks: {
                            display: !isMobile,  // 모바일에서 시험명 숨김
                            font: { size: 12 }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
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

        // 영역 정렬
        const labels = Object.keys(domainTotals).sort((a, b) => {
            const orderA = this.getDomainSortOrder(a);
            const orderB = this.getDomainSortOrder(b);
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, 'ko');
        });

        const data = labels.map(domain => {
            const totals = domainTotals[domain];
            return totals.maxScore > 0 ? Math.round((totals.score / totals.maxScore) * 100) : 0;
        });

        if (this.charts['domainTrend']) {
            this.charts['domainTrend'].destroy();
        }

        const backgroundPlugin = this.createRadarBackgroundPlugin(labels);

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
                            font: { size: this.isMobile() ? 5 : 10 }
                        },
                        pointLabels: {
                            font: {
                                size: this.isMobile() ? 6 : 11,
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            },
            plugins: [backgroundPlugin]
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
