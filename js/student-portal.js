/**
 * Student Portal Navigation Controller
 * 학생 포털 사이드바 토글 및 페이지 전환 관리
 */

class StudentPortalController {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.hamburgerBtn = document.getElementById('hamburgerBtn');
        this.pageTitle = document.getElementById('pageTitle');
        this.currentPage = 'dashboard';

        this.pageTitles = {
            'dashboard': '대시보드',
            'my-reports': '내 성적표',
            'my-assignments': '내 과제',
            'wrong-notes': '오답 노트',
            'trend': '성적 추이',
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

        // 새로고침 시 항상 대시보드로 시작
        // 해시를 초기화하고 대시보드 표시
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname);
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

        // 현재 날짜 표시
        this.updateCurrentDate();
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
                if (typeof studentDashboard !== 'undefined' && studentDashboard.loadDashboardData) {
                    studentDashboard.loadDashboardData();
                }
                break;
            case 'my-reports':
                if (typeof studentDashboard !== 'undefined' && studentDashboard.loadExamCards) {
                    studentDashboard.loadExamCards();
                }
                break;
            case 'my-assignments':
                if (typeof studentAssignments !== 'undefined' && studentAssignments.loadAssignments) {
                    studentAssignments.loadAssignments();
                }
                break;
            case 'wrong-notes':
                if (typeof studentDashboard !== 'undefined' && studentDashboard.loadExamCheckboxes) {
                    studentDashboard.loadExamCheckboxes();
                }
                break;
            case 'trend':
                if (typeof studentDashboard !== 'undefined' && studentDashboard.loadTrendData) {
                    studentDashboard.loadTrendData();
                }
                break;
        }
    }

    handleLogout() {
        if (confirm('로그아웃 하시겠습니까?')) {
            // Cognito 로그아웃 사용
            if (typeof cognitoAuth !== 'undefined' && cognitoAuth.logout) {
                cognitoAuth.logout();
            } else if (typeof AuthService !== 'undefined' && AuthService.logout) {
                AuthService.logout();
            } else {
                // 토큰 제거 및 로그인 페이지로 이동
                SessionManager.clearSession();
                localStorage.removeItem('gradeapp_session');
                window.location.href = 'login.html';
            }
        }
    }

    // 사용자 정보 업데이트
    updateUserInfo(user) {
        const elements = {
            'sidebarUserName': user.name || user.username || '학생',
            'sidebarUserOrg': user.school || user.organization || '',
            'headerUserName': user.name || user.username || '학생',
            'dashboardUserName': user.name || user.username || '학생'
        };

        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        }

        // 아바타 초기화
        const avatarChar = (user.name || user.username || '학').charAt(0);
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
let studentPortalController;

document.addEventListener('DOMContentLoaded', () => {
    studentPortalController = new StudentPortalController();
});
