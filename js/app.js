/**
 * 메인 애플리케이션 컨트롤러
 */

class App {
    constructor() {
        this.currentTab = 'exam-management';
        this.init();
    }

    async init() {
        // Cognito 초기화
        await cognitoAuth.init();

        // 인증 체크
        if (!this.checkAuth()) {
            return;
        }

        try {
            // API에서 데이터 로드
            await this.loadDataFromAPI();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.handleInitError(error);
            return;
        }

        // 헤더 UI 설정
        this.setupHeaderUI();

        // 데이터 정리
        await this.cleanupData();
        this.setupTabNavigation();
        this.setupBackupRestore();
        this.initializeModules();

        // 포털 컨트롤러의 pendingPage 처리 (인증 전에 해시가 있었던 경우)
        if (typeof portalController !== 'undefined' && portalController.pendingPage) {
            portalController.navigateTo(portalController.pendingPage);
            portalController.pendingPage = null;
        }
    }

    /**
     * API에서 데이터 로드
     */
    async loadDataFromAPI() {
        console.log('Loading data from API...');
        const startTime = Date.now();

        await storage.loadAllDataToCache();

        const loadTime = Date.now() - startTime;
        console.log(`Data loaded in ${loadTime}ms`);

        if (loadTime > 500) {
            this.showLoadingCompleteModal(storage.cache, loadTime);
        }
    }

    /**
     * 초기화 오류 처리
     */
    handleInitError(error) {
        const errorMessage = error.message || '알 수 없는 오류';

        // 에러 유형별 사용자 친화적 메시지
        let userMessage = '';
        let shouldLogout = false;

        if (errorMessage.includes('인증') || errorMessage.includes('토큰') || errorMessage.includes('401')) {
            userMessage = '로그인 세션이 만료되었습니다.\n다시 로그인해주세요.';
            shouldLogout = true;
        } else if (errorMessage.includes('네트워크') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
            userMessage = '서버에 연결할 수 없습니다.\n\n인터넷 연결을 확인하고 다시 시도해주세요.';
        } else if (errorMessage.includes('500') || errorMessage.includes('서버')) {
            userMessage = '서버에 일시적인 문제가 발생했습니다.\n\n잠시 후 다시 시도해주세요.';
        } else if (errorMessage.includes('권한') || errorMessage.includes('403')) {
            userMessage = '접근 권한이 없습니다.\n\n관리자에게 문의해주세요.';
            shouldLogout = true;
        } else {
            userMessage = `데이터를 불러오는 중 오류가 발생했습니다.\n\n${errorMessage}\n\n문제가 계속되면 관리자에게 문의해주세요.`;
        }

        alert(userMessage);

        if (shouldLogout) {
            cognitoAuth.logout();
        }
    }

    /**
     * 인증 체크
     */
    checkAuth() {
        if (!cognitoAuth.isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    /**
     * 헤더 UI 설정
     */
    setupHeaderUI() {
        const user = cognitoAuth.getCurrentUser();

        // 햄버거 메뉴 토글 설정 (레거시)
        this.setupHamburgerMenu();

        if (user) {
            // 새 포털 레이아웃 사용자 정보 업데이트
            if (typeof portalController !== 'undefined') {
                portalController.updateUserInfo(user);
            }

            // 레거시 사용자 정보 표시 (요소가 존재할 때만)
            const userInfoDisplay = document.getElementById('userInfoDisplay');
            if (userInfoDisplay) {
                userInfoDisplay.style.display = 'flex';
            }
            const headerUserName = document.getElementById('headerUserName');
            if (headerUserName) {
                headerUserName.textContent = user.name;
            }
            const headerUserOrg = document.getElementById('headerUserOrg');
            if (headerUserOrg) {
                headerUserOrg.textContent = `(${user.organization})`;
            }

            // 로그아웃 버튼 표시 (레거시)
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.style.display = 'flex';
                logoutBtn.addEventListener('click', () => {
                    if (confirm('로그아웃 하시겠습니까?')) {
                        cognitoAuth.logout();
                    }
                });
            }

            // 비밀번호 변경 버튼
            const changePasswordBtn = document.getElementById('changePasswordBtn');
            if (changePasswordBtn) {
                changePasswordBtn.style.display = 'flex';
                changePasswordBtn.addEventListener('click', () => {
                    this.closeHeaderMenu();
                    this.openChangePasswordModal();
                });
            }

            // 학생 계정 관리 버튼 (admin, org_admin 모두)
            if (user.role === 'admin' || user.role === 'org_admin') {
                const studentAccountBtn = document.getElementById('studentAccountBtn');
                if (studentAccountBtn) {
                    studentAccountBtn.style.display = 'flex';
                    const menuDivider1 = document.getElementById('menuDivider1');
                    if (menuDivider1) menuDivider1.style.display = 'block';
                    studentAccountBtn.addEventListener('click', () => {
                        this.closeHeaderMenu();
                        studentAccountManager.open();
                    });
                }
            }

            // 관리자 메뉴 (admin만)
            if (user.role === 'admin') {
                const adminBtn = document.getElementById('adminMenuBtn');
                if (adminBtn) {
                    adminBtn.style.display = 'flex';
                    const menuDivider1 = document.getElementById('menuDivider1');
                    if (menuDivider1) menuDivider1.style.display = 'block';

                    // 대기 중인 가입 신청 수 로드
                    this.loadPendingCount();

                    adminBtn.addEventListener('click', () => {
                        this.closeHeaderMenu();
                        adminPanel.open();
                    });
                }
            }
        }

        // 비밀번호 변경 모달 이벤트 설정
        this.setupChangePasswordModal();
    }

    /**
     * 햄버거 메뉴 설정
     */
    setupHamburgerMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const headerMenu = document.getElementById('headerMenu');

        if (!hamburgerBtn || !headerMenu) return;

        // 햄버거 버튼 클릭
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hamburgerBtn.classList.toggle('active');
            headerMenu.classList.toggle('open');
        });

        // 외부 클릭 시 메뉴 닫기
        document.addEventListener('click', (e) => {
            if (!headerMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                this.closeHeaderMenu();
            }
        });

        // ESC 키로 메뉴 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeHeaderMenu();
            }
        });

        // 백업/복원 버튼 이벤트
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            this.closeHeaderMenu();
        });

        document.getElementById('importDataBtn').addEventListener('click', () => {
            this.closeHeaderMenu();
        });
    }

    /**
     * 헤더 메뉴 닫기
     */
    closeHeaderMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const headerMenu = document.getElementById('headerMenu');
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        if (headerMenu) headerMenu.classList.remove('open');
    }

    /**
     * 대기 중인 가입 신청 수 로드
     */
    async loadPendingCount() {
        try {
            await storage.loadRegistrations();
            const pendingCount = storage.getPendingRegistrations().length;
            const badge = document.getElementById('pendingCount');
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load pending count:', error);
        }
    }

    /**
     * 비밀번호 변경 모달 설정
     */
    setupChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        const closeBtn = document.getElementById('closeChangePasswordModal');
        const cancelBtn = document.getElementById('cancelChangePasswordBtn');
        const saveBtn = document.getElementById('saveChangePasswordBtn');

        // 모달 닫기
        const closeModal = () => {
            modal.classList.remove('active');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // 비밀번호 변경 저장
        saveBtn.addEventListener('click', async () => {
            await this.changePassword();
        });

        // Enter 키로 저장
        document.getElementById('confirmNewPassword').addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await this.changePassword();
            }
        });
    }

    /**
     * 비밀번호 변경 모달 열기
     */
    openChangePasswordModal() {
        document.getElementById('changePasswordModal').classList.add('active');
        document.getElementById('currentPassword').focus();
    }

    /**
     * 비밀번호 변경 (Cognito)
     */
    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        // 유효성 검사
        if (!currentPassword) {
            alert('현재 비밀번호를 입력해주세요.');
            return;
        }

        if (!newPassword || newPassword.length < 8) {
            alert('새 비밀번호는 8자 이상이어야 합니다.');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            alert('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            const result = await cognitoAuth.changePassword(currentPassword, newPassword);

            if (result.success) {
                alert('비밀번호가 변경되었습니다.');

                // 모달 닫기
                document.getElementById('changePasswordModal').classList.remove('active');
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmNewPassword').value = '';
            }
        } catch (error) {
            console.error('비밀번호 변경 오류:', error);
            alert(error.message || '비밀번호 변경 중 오류가 발생했습니다.');
        }
    }

    /**
     * 데이터 로딩 완료 모달 표시
     */
    showLoadingCompleteModal(stats, loadTime) {
        const modal = document.createElement('div');
        modal.className = 'loading-complete-modal';
        modal.innerHTML = `
            <div class="loading-complete-content">
                <div class="loading-complete-header">
                    <span class="loading-complete-icon">OK</span>
                    <h3>데이터 로딩 완료</h3>
                </div>
                <div class="loading-complete-body">
                    <p>서버에서 데이터를 성공적으로 가져왔습니다.</p>
                    <div class="loading-stats">
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">시험</span>
                            <span class="loading-stat-value">${stats.exams.length}개</span>
                        </div>
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">학생</span>
                            <span class="loading-stat-value">${stats.students.length}명</span>
                        </div>
                    </div>
                    <p class="loading-time">로딩 시간: ${(loadTime / 1000).toFixed(2)}초</p>
                </div>
                <div class="loading-complete-footer">
                    <button class="btn btn-primary" onclick="this.closest('.loading-complete-modal').remove()">
                        확인
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 3초 후 자동 닫기
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 3000);
    }

    /**
     * 데이터 정리 (중복 답안 제거 및 고아 답안 제거)
     */
    async cleanupData() {
        try {
            const removedCount = storage.removeDuplicateAnswers();
            if (removedCount > 0) {
                console.log(`Removed ${removedCount} duplicate answers.`);
            }

            const orphanedCount = storage.removeOrphanedAnswers();
            if (orphanedCount > 0) {
                console.log(`Removed ${orphanedCount} orphaned answers.`);
            }
        } catch (error) {
            console.error('Data cleanup error:', error);
        }
    }

    /**
     * 탭 네비게이션 설정
     */
    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');

                // 모든 탭 비활성화
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // 선택된 탭 활성화
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');

                this.currentTab = tabId;

                // 탭 전환 시 데이터 새로고침
                this.refreshCurrentTab();
            });
        });
    }

    /**
     * 현재 탭 새로고침
     */
    refreshCurrentTab() {
        switch (this.currentTab) {
            case 'exam-management':
                if (window.examManager) {
                    examManager.loadExamList();
                }
                break;
            case 'student-management':
                if (window.studentManager) {
                    studentManager.loadStudentList();
                }
                break;
            case 'class-management':
                if (window.classManager) {
                    classManager.init();
                }
                break;
            case 'assignment-management':
                if (window.assignmentManager) {
                    assignmentManager.init();
                }
                break;
            case 'answer-input':
                if (window.answerInput) {
                    answerInput.loadExamSelect();
                }
                break;
            case 'grading':
                if (window.grading) {
                    grading.loadExamSelect();
                }
                break;
            case 'report':
                if (window.reportGenerator) {
                    reportGenerator.loadExamSelect();
                }
                break;
            case 'wrong-note':
                if (window.wrongNote) {
                    wrongNote.loadStudentSelect();
                }
                break;
        }
    }

    /**
     * 백업 및 복원 기능
     */
    setupBackupRestore() {
        // 데이터 백업
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            const data = storage.exportAllData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `성적표_백업_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);

            alert('데이터가 백업되었습니다.');
        });

        // 데이터 복원
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('backupInput').click();
        });

        document.getElementById('backupInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await CSVUtils.readFile(file);
                const data = JSON.parse(text);

                if (confirm('기존 데이터를 모두 삭제하고 백업 데이터를 복원하시겠습니까?')) {
                    storage.importAllData(data);
                    alert('데이터가 복원되었습니다. 페이지를 새로고침합니다.');
                    location.reload();
                }
            } catch (error) {
                alert('데이터 복원에 실패했습니다: ' + error.message);
            }

            e.target.value = '';
        });
    }

    /**
     * 모듈 초기화
     */
    initializeModules() {
        // 각 모듈이 로드되면 자동으로 초기화됨
        window.examManager = new ExamManager();
        window.studentManager = new StudentManager();
        window.answerInput = new AnswerInput();
        window.grading = new Grading();
        window.reportGenerator = new ReportGenerator();
        window.wrongNote = new WrongNote();

        // SearchableSelect 초기화
        setTimeout(() => {
            initSearchableSelects();
        }, 100);
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
