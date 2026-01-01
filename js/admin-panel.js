/**
 * 관리자 패널 모듈
 * 가입 승인, 사용자 관리
 */

class AdminPanel {
    constructor() {
        this.isOpen = false;
    }

    /**
     * 관리자 패널 열기
     */
    open() {
        if (!AuthService.isAdmin()) {
            alert('관리자 권한이 필요합니다.');
            return;
        }

        this.isOpen = true;
        this.render();
    }

    /**
     * 관리자 패널 닫기
     */
    close() {
        this.isOpen = false;
        const overlay = document.getElementById('adminPanelOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * 패널 렌더링
     */
    render() {
        // 기존 패널 제거
        const existingOverlay = document.getElementById('adminPanelOverlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const pendingRegistrations = storage.getPendingRegistrations();
        const users = storage.getAllUsers();

        const overlay = document.createElement('div');
        overlay.id = 'adminPanelOverlay';
        overlay.className = 'admin-panel-overlay';
        overlay.innerHTML = `
            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h2>관리자 패널</h2>
                    <button class="admin-panel-close" id="closeAdminPanel">&times;</button>
                </div>
                <div class="admin-panel-body">
                    <!-- 가입 승인 섹션 -->
                    <div class="admin-section">
                        <h3>가입 승인 대기 (${pendingRegistrations.length}건)</h3>
                        <div id="pendingRegistrationsList">
                            ${this.renderPendingRegistrations(pendingRegistrations)}
                        </div>
                    </div>

                    <!-- 사용자 관리 섹션 -->
                    <div class="admin-section">
                        <h3>사용자 관리 (${users.length}명)</h3>
                        <div id="userManagementList">
                            ${this.renderUserList(users)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 이벤트 리스너
        document.getElementById('closeAdminPanel').addEventListener('click', () => {
            this.close();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        this.attachRegistrationListeners();
        this.attachUserListeners();
    }

    /**
     * 가입 신청 목록 렌더링
     */
    renderPendingRegistrations(registrations) {
        if (registrations.length === 0) {
            return '<div class="empty-state-small">대기 중인 가입 신청이 없습니다.</div>';
        }

        return registrations.map(reg => `
            <div class="registration-card" data-registration-id="${reg.id}">
                <div class="registration-card-header">
                    <span class="registration-card-name">${reg.name} (${reg.username})</span>
                    <span class="registration-card-date">${new Date(reg.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="registration-card-info">
                    <span>이메일: <strong>${reg.email}</strong></span>
                    <span>소속 기관: <strong>${reg.organization}</strong></span>
                </div>
                <div class="registration-card-actions">
                    <button class="btn btn-sm btn-danger reject-registration-btn" data-id="${reg.id}">거절</button>
                    <button class="btn btn-sm btn-success approve-registration-btn" data-id="${reg.id}">승인</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * 사용자 목록 렌더링
     */
    renderUserList(users) {
        if (users.length === 0) {
            return '<div class="empty-state-small">등록된 사용자가 없습니다.</div>';
        }

        const currentUser = AuthService.getCurrentUser();

        return `
            <table class="user-table">
                <thead>
                    <tr>
                        <th>이름</th>
                        <th>아이디</th>
                        <th>소속 기관</th>
                        <th>역할</th>
                        <th>상태</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr data-user-id="${user.id}">
                            <td>${user.name}</td>
                            <td>${user.username}</td>
                            <td>${user.organization}</td>
                            <td>
                                <span class="role-badge ${user.role}">
                                    ${user.role === 'admin' ? '전체 관리자' : '기관 관리자'}
                                </span>
                            </td>
                            <td class="${user.isActive ? 'status-active' : 'status-inactive'}">
                                ${user.isActive ? '활성' : '비활성'}
                            </td>
                            <td>
                                ${user.id !== currentUser.userId ? `
                                    <button class="btn btn-sm btn-secondary toggle-role-btn" data-id="${user.id}" data-role="${user.role}">
                                        ${user.role === 'admin' ? '기관 관리자로' : '전체 관리자로'}
                                    </button>
                                    <button class="btn btn-sm ${user.isActive ? 'btn-warning' : 'btn-success'} toggle-active-btn" data-id="${user.id}" data-active="${user.isActive}">
                                        ${user.isActive ? '비활성화' : '활성화'}
                                    </button>
                                ` : '<span style="color: #888;">본인</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * 가입 신청 이벤트 리스너
     */
    attachRegistrationListeners() {
        // 승인 버튼
        document.querySelectorAll('.approve-registration-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const regId = btn.getAttribute('data-id');
                await this.approveRegistration(regId);
            });
        });

        // 거절 버튼
        document.querySelectorAll('.reject-registration-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const regId = btn.getAttribute('data-id');
                await this.rejectRegistration(regId);
            });
        });
    }

    /**
     * 사용자 관리 이벤트 리스너
     */
    attachUserListeners() {
        // 역할 변경 버튼
        document.querySelectorAll('.toggle-role-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.getAttribute('data-id');
                const currentRole = btn.getAttribute('data-role');
                await this.toggleUserRole(userId, currentRole);
            });
        });

        // 활성화/비활성화 버튼
        document.querySelectorAll('.toggle-active-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.getAttribute('data-id');
                const isActive = btn.getAttribute('data-active') === 'true';
                await this.toggleUserActive(userId, isActive);
            });
        });
    }

    /**
     * 가입 신청 승인
     */
    async approveRegistration(registrationId) {
        if (!confirm('이 가입 신청을 승인하시겠습니까?')) return;

        try {
            const currentUser = AuthService.getCurrentUser();
            await storage.approveRegistration(registrationId, currentUser.userId);
            alert('가입 신청이 승인되었습니다.');
            this.render();
            this.updatePendingBadge();
        } catch (error) {
            console.error('승인 오류:', error);
            alert('승인 중 오류가 발생했습니다.');
        }
    }

    /**
     * 가입 신청 거절
     */
    async rejectRegistration(registrationId) {
        if (!confirm('이 가입 신청을 거절하시겠습니까?')) return;

        try {
            const currentUser = AuthService.getCurrentUser();
            await storage.rejectRegistration(registrationId, currentUser.userId);
            alert('가입 신청이 거절되었습니다.');
            this.render();
            this.updatePendingBadge();
        } catch (error) {
            console.error('거절 오류:', error);
            alert('거절 중 오류가 발생했습니다.');
        }
    }

    /**
     * 사용자 역할 변경
     */
    async toggleUserRole(userId, currentRole) {
        const newRole = currentRole === 'admin' ? 'org_admin' : 'admin';
        const roleText = newRole === 'admin' ? '전체 관리자' : '기관 관리자';

        if (!confirm(`이 사용자를 ${roleText}로 변경하시겠습니까?`)) return;

        try {
            const user = storage.getUser(userId);
            user.role = newRole;
            await storage.saveUser(user);
            alert('역할이 변경되었습니다.');
            this.render();
        } catch (error) {
            console.error('역할 변경 오류:', error);
            alert('역할 변경 중 오류가 발생했습니다.');
        }
    }

    /**
     * 사용자 활성화/비활성화
     */
    async toggleUserActive(userId, isActive) {
        const action = isActive ? '비활성화' : '활성화';

        if (!confirm(`이 사용자를 ${action}하시겠습니까?`)) return;

        try {
            const user = storage.getUser(userId);
            user.isActive = !isActive;
            await storage.saveUser(user);
            alert(`사용자가 ${action}되었습니다.`);
            this.render();
        } catch (error) {
            console.error('상태 변경 오류:', error);
            alert('상태 변경 중 오류가 발생했습니다.');
        }
    }

    /**
     * 대기 중인 가입 신청 배지 업데이트
     */
    updatePendingBadge() {
        const pendingCount = storage.getPendingRegistrations().length;
        const badge = document.getElementById('pendingCount');
        if (badge) {
            badge.textContent = pendingCount > 0 ? pendingCount : '';
            badge.style.display = pendingCount > 0 ? 'inline' : 'none';
        }
    }
}

// 전역 인스턴스
const adminPanel = new AdminPanel();
