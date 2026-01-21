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
            const items = [];

            // 마감 임박 과제 조회
            if (typeof storage !== 'undefined' && storage.getAssignments) {
                const assignments = await storage.getAssignments();
                const now = new Date();

                assignments.forEach(assignment => {
                    if (assignment.status === 'active' && assignment.dueDate) {
                        const dueDate = new Date(assignment.dueDate);
                        const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

                        if (daysLeft >= 0 && daysLeft <= 7) {
                            items.push({
                                type: 'assignment',
                                urgent: daysLeft <= 3,
                                title: assignment.title,
                                description: daysLeft === 0 ? '오늘 마감' : `${daysLeft}일 뒤 마감`,
                                dueDate: dueDate,
                                daysLeft: daysLeft,
                                id: assignment.id
                            });
                        }
                    }
                });
            }

            // 채점 대기 시험 조회
            if (typeof storage !== 'undefined' && storage.getExams && storage.getAnswers) {
                const exams = await storage.getExams();
                const answers = await storage.getAnswers();

                for (const exam of exams) {
                    const examAnswers = answers.filter(a => a.examId === exam.id);
                    const ungradedCount = examAnswers.filter(a => !a.isGraded).length;

                    if (ungradedCount > 0) {
                        items.push({
                            type: 'grading',
                            urgent: false,
                            title: exam.name,
                            description: `미채점 답안 ${ungradedCount}건`,
                            id: exam.id
                        });
                    }
                }
            }

            // 정렬 (긴급한 것 먼저)
            items.sort((a, b) => {
                if (a.urgent && !b.urgent) return -1;
                if (!a.urgent && b.urgent) return 1;
                if (a.daysLeft !== undefined && b.daysLeft !== undefined) {
                    return a.daysLeft - b.daysLeft;
                }
                return 0;
            });

            this.renderTodoItems(items.slice(0, 5));
        } catch (error) {
            console.error('할 일 목록 로드 실패:', error);
            this.renderEmptyTodo();
        }
    }

    renderTodoItems(items) {
        if (!this.todoFeedList) return;

        if (items.length === 0) {
            this.renderEmptyTodo();
            return;
        }

        this.todoFeedList.innerHTML = items.map(item => {
            const indicatorClass = item.urgent ? 'urgent' : item.type === 'grading' ? 'pending' : 'info';
            const tagClass = item.urgent ? 'urgent' : item.type === 'grading' ? 'pending' : 'info';
            const tagText = item.urgent ? '긴급' : item.type === 'grading' ? '채점 대기' : '마감 예정';
            const icon = item.type === 'assignment' ? '⏰' : '📊';

            return `
                <div class="feed-item" onclick="${item.type === 'assignment' ? `portalController.navigateTo('assignment-management')` : `portalController.navigateTo('grading')`}">
                    <div class="feed-item-indicator ${indicatorClass}">${icon}</div>
                    <div class="feed-item-content">
                        <div class="feed-item-meta">
                            <span class="feed-item-tag ${tagClass}">${tagText}</span>
                            <span class="feed-item-time">${item.description}</span>
                        </div>
                        <div class="feed-item-title">${this.escapeHtml(item.title)}</div>
                    </div>
                    <div class="feed-item-arrow">→</div>
                </div>
            `;
        }).join('');
    }

    renderEmptyTodo() {
        if (!this.todoFeedList) return;

        this.todoFeedList.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">✅</div>
                <div class="feed-empty-title">할 일이 없습니다</div>
                <div class="feed-empty-text">마감 예정인 과제나 채점할 시험이 없습니다.</div>
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
                            text: `<strong>${student.name}</strong> 학생의 '${exam.name}' 답안이 입력되었습니다.`,
                            time: new Date(answer.updatedAt),
                            isNew: this.isRecent(answer.updatedAt, 1) // 1시간 이내
                        });
                    }
                });
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
                        text: `새 학생 '<strong>${student.name}</strong>'가 등록되었습니다.`,
                        time: new Date(student.createdAt),
                        isNew: this.isRecent(student.createdAt, 24) // 24시간 이내
                    });
                });
            }

            // 시간순 정렬 (최신순)
            activities.sort((a, b) => b.time - a.time);

            this.renderActivityTimeline(activities.slice(0, 10));
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
                <div class="activity-dot ${activity.isNew ? 'new' : ''}"></div>
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
