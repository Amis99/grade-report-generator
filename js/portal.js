/**
 * Portal Navigation Controller
 * 사이드바 토글 및 페이지 전환 관리
 */

class PortalController {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.hamburgerBtn = document.getElementById('hamburgerBtn');
        this.pageTitle = document.getElementById('pageTitle');
        this.currentPage = 'dashboard';

        this.pageTitles = {
            'dashboard': '대시보드',
            'exam-management': '시험 관리',
            'student-management': '학생 관리',
            'class-management': '수강반 관리',
            'assignment-management': '과제 관리',
            'answer-input': '답안 입력',
            'grading': '채점 및 분석',
            'report': '성적표 생성',
            'wrong-note': '오답 노트',
            'settings': '설정'
        };

        this.init();
    }

    init() {
        // 햄버거 버튼 클릭 이벤트
        if (this.hamburgerBtn) {
            this.hamburgerBtn.addEventListener('click', () => this.toggleSidebar());
        }

        // 사이드바 오버레이 클릭시 닫기
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }

        // 네비게이션 아이템 클릭 이벤트
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = item.getAttribute('data-page');
                this.navigateTo(pageId);
            });
        });

        // 피드 링크 클릭 이벤트
        document.querySelectorAll('.feed-link[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.getAttribute('data-page');
                this.navigateTo(pageId);
            });
        });

        // 로그아웃 버튼
        const logoutBtn = document.getElementById('sidebarLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // ESC 키로 사이드바 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.sidebar && this.sidebar.classList.contains('open')) {
                this.closeSidebar();
            }
        });

        // URL 해시 변경 감지
        window.addEventListener('hashchange', () => this.handleHashChange());

        // 초기 해시 체크는 인증 완료 후 app.js에서 호출됨
        // 대시보드만 바로 표시 (API 호출 없음)
        const hash = window.location.hash.slice(1);
        if (hash && hash !== 'dashboard' && this.pageTitles[hash]) {
            // 인증 완료 후 처리하기 위해 저장
            this.pendingPage = hash;
        }

        // 윈도우 리사이즈 이벤트
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.sidebar) {
                this.sidebar.classList.remove('open');
                if (this.sidebarOverlay) {
                    this.sidebarOverlay.classList.remove('active');
                }
            }
        });
    }

    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('open');
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.classList.toggle('active');
        }
    }

    closeSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.remove('open');
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.classList.remove('active');
        }
    }

    navigateTo(pageId) {
        if (pageId === this.currentPage) {
            this.closeSidebar();
            return;
        }

        // 모든 페이지 숨기기
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 선택된 페이지 표시
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // 네비게이션 아이템 활성화
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeNavItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // 페이지 타이틀 업데이트
        if (this.pageTitle && this.pageTitles[pageId]) {
            this.pageTitle.textContent = this.pageTitles[pageId];
        }

        // URL 해시 업데이트
        history.pushState(null, '', `#${pageId}`);

        // 현재 페이지 업데이트
        this.currentPage = pageId;

        // 사이드바 닫기 (모바일)
        this.closeSidebar();

        // 페이지 전환 콜백
        this.onPageChange(pageId);
    }

    handleHashChange() {
        const hash = window.location.hash.slice(1);
        if (hash && this.pageTitles[hash]) {
            this.navigateTo(hash);
        }
    }

    onPageChange(pageId) {
        // 각 페이지별 초기화 로직
        switch (pageId) {
            case 'dashboard':
                if (typeof adminDashboard !== 'undefined') {
                    adminDashboard.loadDashboardData();
                }
                break;
            case 'exam-management':
                if (typeof examManager !== 'undefined' && examManager.loadExams) {
                    examManager.loadExams();
                }
                break;
            case 'student-management':
                if (typeof studentManager !== 'undefined' && studentManager.loadStudents) {
                    studentManager.loadStudents();
                }
                break;
            case 'class-management':
                if (typeof classManager !== 'undefined' && classManager.loadClasses) {
                    classManager.loadClasses();
                }
                break;
            case 'assignment-management':
                if (typeof assignmentManager !== 'undefined') {
                    // init()을 호출하면 loadClasses와 loadAssignments가 모두 실행됨
                    if (assignmentManager.init) {
                        assignmentManager.init();
                    } else if (assignmentManager.loadAssignments) {
                        assignmentManager.loadAssignments();
                    }
                }
                break;
            case 'answer-input':
                if (typeof answerInput !== 'undefined' && answerInput.loadExamOptions) {
                    answerInput.loadExamOptions();
                }
                break;
            case 'grading':
                if (typeof grading !== 'undefined' && grading.loadExamOptions) {
                    grading.loadExamOptions();
                }
                break;
            case 'report':
                if (typeof reportGenerator !== 'undefined' && reportGenerator.loadExamOptions) {
                    reportGenerator.loadExamOptions();
                }
                break;
            case 'wrong-note':
                if (typeof wrongNote !== 'undefined' && wrongNote.loadStudentOptions) {
                    wrongNote.loadStudentOptions();
                }
                break;
        }
    }

    handleLogout() {
        if (confirm('로그아웃 하시겠습니까?')) {
            if (typeof authService !== 'undefined' && authService.logout) {
                authService.logout();
            } else {
                // 토큰 제거 및 로그인 페이지로 이동
                localStorage.removeItem('authToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('userData');
                window.location.href = 'login.html';
            }
        }
    }

    // 사용자 정보 업데이트
    updateUserInfo(user) {
        const elements = {
            'sidebarUserName': user.name || user.username || '사용자',
            'sidebarUserOrg': user.organization || '',
            'headerUserName': user.name || user.username || '사용자',
            'dashboardUserName': user.name || user.username || '사용자'
        };

        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        }

        // 아바타 초기화
        const avatarChar = (user.name || user.username || '관').charAt(0);
        ['sidebarUserAvatar', 'headerUserAvatar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = avatarChar;
            }
        });
    }

    // 날짜 표시 업데이트
    updateCurrentDate() {
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            const now = new Date();
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            };
            dateEl.textContent = now.toLocaleDateString('ko-KR', options);
        }
    }
}

// 전역 인스턴스 생성
let portalController;

document.addEventListener('DOMContentLoaded', () => {
    portalController = new PortalController();
    portalController.updateCurrentDate();
});
