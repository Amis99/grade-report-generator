/**
 * Admin Dashboard Controller
 * 관리자 대시보드 데이터 로드 및 표시
 */

class AdminDashboard {
    constructor() {
        this.todoFeedList = document.getElementById('todoFeedList');
        this.activityTimeline = document.getElementById('activityTimeline');
        this.initialized = false;
    }

    async loadDashboardData() {
        if (!this.initialized) {
            this.initialized = true;
        }

        try {
            await Promise.all([
                this.loadTodoItems(),
                this.loadRecentActivity()
            ]);
        } catch (error) {
            console.error('대시보드 데이터 로드 실패:', error);
        }
    }

    async loadTodoItems() {
        if (!this.todoFeedList) return;

        try {
            const stats = [];

            // 1. 진행중인 과제 수
            if (typeof storage !== 'undefined' && storage.getAssignments) {
                const assignments = await storage.getAssignments();
                const activeAssignments = assignments.filter(a => a.status === 'active');

                stats.push({
                    icon: '📋',
                    title: '진행중인 과제',
                    count: activeAssignments.length,
                    unit: '개',
                    color: 'primary',
                    page: 'assignment-management'
                });
            }

            // 2. 답안 입력이 없는 시험 수
            if (typeof storage !== 'undefined' && storage.getExams && storage.getAnswers) {
                const exams = await storage.getExams();
                const answers = await storage.getAnswers();

                let noAnswerExamCount = 0;
                for (const exam of exams) {
                    const examAnswers = answers.filter(a => a.examId === exam.id);
                    if (examAnswers.length === 0) {
                        noAnswerExamCount++;
                    }
                }

                stats.push({
                    icon: '✏️',
                    title: '답안 미입력 시험',
                    count: noAnswerExamCount,
                    unit: '개',
                    color: noAnswerExamCount > 0 ? 'warning' : 'success',
                    page: 'answer-input'
                });
            }

            // 3. 최근 3일간 채점한 시험 수
            if (typeof storage !== 'undefined' && storage.getExams && storage.getAnswers) {
                const exams = await storage.getExams();
                const answers = await storage.getAnswers();
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

                const recentlyGradedExamIds = new Set();

                answers.forEach(answer => {
                    if (answer.gradedAt) {
                        const gradedDate = new Date(answer.gradedAt);
                        if (gradedDate >= threeDaysAgo) {
                            recentlyGradedExamIds.add(answer.examId);
                        }
                    }
                    // gradedAt이 없는 경우 updatedAt으로 대체 (채점된 답안인 경우)
                    else if (answer.isGraded && answer.updatedAt) {
                        const updatedDate = new Date(answer.updatedAt);
                        if (updatedDate >= threeDaysAgo) {
                            recentlyGradedExamIds.add(answer.examId);
                        }
                    }
                });

                stats.push({
                    icon: '📊',
                    title: '최근 3일 채점 시험',
                    count: recentlyGradedExamIds.size,
                    unit: '개',
                    color: 'info',
                    page: 'grading'
                });
            }

            this.renderTodoStats(stats);
        } catch (error) {
            console.error('할 일 목록 로드 실패:', error);
            this.renderEmptyTodo();
        }
    }

    renderTodoStats(stats) {
        if (!this.todoFeedList) return;

        if (stats.length === 0) {
            this.renderEmptyTodo();
            return;
        }

        this.todoFeedList.innerHTML = stats.map(stat => `
            <div class="todo-stat-item" onclick="portalController.navigateTo('${stat.page}')">
                <div class="todo-stat-icon ${stat.color}">${stat.icon}</div>
                <div class="todo-stat-content">
                    <div class="todo-stat-title">${stat.title}</div>
                    <div class="todo-stat-value">
                        <span class="todo-stat-count">${stat.count}</span>
                        <span class="todo-stat-unit">${stat.unit}</span>
                    </div>
                </div>
                <div class="todo-stat-arrow">→</div>
            </div>
        `).join('');
    }

    renderEmptyTodo() {
        if (!this.todoFeedList) return;

        this.todoFeedList.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">✅</div>
                <div class="feed-empty-title">데이터 로딩 중...</div>
                <div class="feed-empty-text">잠시만 기다려주세요.</div>
            </div>
        `;
    }

    async loadRecentActivity() {
        if (!this.activityTimeline) return;

        try {
            const activities = [];

            // 최근 답안 입력 조회
            if (typeof storage !== 'undefined' && storage.getAnswers && storage.getStudents && storage.getExams) {
                const answers = await storage.getAnswers();
                const students = await storage.getStudents();
                const exams = await storage.getExams();

                const studentMap = new Map(students.map(s => [s.id, s]));
                const examMap = new Map(exams.map(e => [e.id, e]));

                // 최근 답안 (updatedAt 기준 정렬)
                const recentAnswers = answers
                    .filter(a => a.updatedAt)
                    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                    .slice(0, 10);

                recentAnswers.forEach(answer => {
                    const student = studentMap.get(answer.studentId);
                    const exam = examMap.get(answer.examId);

                    if (student && exam) {
                        activities.push({
                            type: 'answer',
                            icon: '📝',
                            text: `<strong>${this.escapeHtml(student.name)}</strong> 학생의 '${this.escapeHtml(exam.name)}' 답안이 입력되었습니다.`,
                            time: new Date(answer.updatedAt),
                            isNew: this.isRecent(answer.updatedAt, 1) // 1시간 이내
                        });
                    }
                });
            }

            // 최근 과제 제출 조회
            if (typeof storage !== 'undefined' && storage.getAssignments && storage.getAssignmentSubmissions) {
                try {
                    const assignments = await storage.getAssignments();
                    const activeAssignments = assignments.filter(a => a.status === 'active');

                    // 각 과제별 제출 현황 조회 (최근 5개 과제만)
                    const recentAssignments = activeAssignments.slice(0, 5);

                    for (const assignment of recentAssignments) {
                        try {
                            // 모든 반의 제출 현황 조회
                            const result = await storage.getAssignmentSubmissions(assignment.id, {});
                            const submissions = result.submissions || [];

                            // 최근 제출이 있는 학생들 필터링
                            submissions.forEach(sub => {
                                if (sub.lastSubmittedAt) {
                                    activities.push({
                                        type: 'submission',
                                        icon: '📤',
                                        text: `<strong>${this.escapeHtml(sub.student.name)}</strong> 학생이 '${this.escapeHtml(assignment.title)}' 과제를 제출했습니다.`,
                                        time: new Date(sub.lastSubmittedAt),
                                        isNew: this.isRecent(sub.lastSubmittedAt, 1) // 1시간 이내
                                    });
                                }
                            });
                        } catch (e) {
                            // 개별 과제 조회 실패 시 무시
                            console.log('과제 제출 현황 조회 실패:', assignment.id);
                        }
                    }
                } catch (e) {
                    console.log('과제 목록 조회 실패:', e);
                }
            }

            // 최근 학생 등록 조회
            if (typeof storage !== 'undefined' && storage.getStudents) {
                const students = await storage.getStudents();

                const recentStudents = students
                    .filter(s => s.createdAt)
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);

                recentStudents.forEach(student => {
                    activities.push({
                        type: 'student',
                        icon: '👤',
                        text: `새 학생 '<strong>${this.escapeHtml(student.name)}</strong>'가 등록되었습니다.`,
                        time: new Date(student.createdAt),
                        isNew: this.isRecent(student.createdAt, 24) // 24시간 이내
                    });
                });
            }

            // 시간순 정렬 (최신순)
            activities.sort((a, b) => b.time - a.time);

            this.renderActivityTimeline(activities.slice(0, 15));
        } catch (error) {
            console.error('최근 활동 로드 실패:', error);
            this.renderEmptyActivity();
        }
    }

    renderActivityTimeline(activities) {
        if (!this.activityTimeline) return;

        if (activities.length === 0) {
            this.renderEmptyActivity();
            return;
        }

        this.activityTimeline.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.isNew ? 'new' : ''}">${activity.icon || '📌'}</div>
                <div class="activity-content">
                    <div class="activity-text">${activity.text}</div>
                    <div class="activity-time">${this.formatRelativeTime(activity.time)}</div>
                </div>
            </div>
        `).join('');
    }

    renderEmptyActivity() {
        if (!this.activityTimeline) return;

        this.activityTimeline.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">📝</div>
                <div class="feed-empty-title">아직 활동이 없습니다</div>
                <div class="feed-empty-text">시험을 만들고 학생들의 답안을 입력해보세요.</div>
            </div>
        `;
    }

    isRecent(dateStr, hours) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = (now - date) / (1000 * 60 * 60);
        return diff <= hours;
    }

    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 1) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;
        if (hours < 24) return `${hours}시간 전`;
        if (days === 1) return '어제';
        if (days < 7) return `${days}일 전`;

        const options = { month: 'long', day: 'numeric' };
        return date.toLocaleDateString('ko-KR', options);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 전역 인스턴스 생성
let adminDashboard;

document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();

    // 초기 대시보드 데이터 로드
    setTimeout(() => {
        if (typeof storage !== 'undefined') {
            adminDashboard.loadDashboardData();
        }
    }, 500);
});
