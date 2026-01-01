/**
 * 인증 UI 모듈
 * Cognito 기반 로그인, 회원가입 처리
 */

class AuthUI {
    constructor() {
        this.pendingCognitoUser = null;
        this.init();
    }

    async init() {
        // Cognito 초기화
        await cognitoAuth.init();

        // 이미 로그인되어 있으면 메인 페이지로 이동
        if (cognitoAuth.isLoggedIn()) {
            window.location.href = 'index.html';
            return;
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // 로그인/회원가입 전환
        document.getElementById('showRegisterLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegister();
        });

        document.getElementById('showLoginLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });

        document.getElementById('backToLoginBtn').addEventListener('click', () => {
            this.showLogin();
        });

        // 로그인 폼 제출
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // 회원가입 폼 제출
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });

        // 비밀번호 변경 폼 (신규 사용자용)
        const newPasswordForm = document.getElementById('newPasswordForm');
        if (newPasswordForm) {
            newPasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleNewPassword();
            });
        }

        // 비밀번호 찾기 링크
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPassword();
            });
        }
    }

    showLogin() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('pendingSection').style.display = 'none';
        const newPasswordSection = document.getElementById('newPasswordSection');
        if (newPasswordSection) newPasswordSection.style.display = 'none';
        this.clearErrors();
    }

    showRegister() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('registerSection').style.display = 'block';
        document.getElementById('pendingSection').style.display = 'none';
        this.clearErrors();
    }

    showPending() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('pendingSection').style.display = 'block';
    }

    showNewPassword() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('pendingSection').style.display = 'none';
        const newPasswordSection = document.getElementById('newPasswordSection');
        if (newPasswordSection) newPasswordSection.style.display = 'block';
    }

    clearErrors() {
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('registerError').style.display = 'none';
        document.getElementById('registerSuccess').style.display = 'none';
    }

    showLoginError(message) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    showRegisterError(message) {
        const errorDiv = document.getElementById('registerError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        document.getElementById('registerSuccess').style.display = 'none';
    }

    showRegisterSuccess(message) {
        const successDiv = document.getElementById('registerSuccess');
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        document.getElementById('registerError').style.display = 'none';
    }

    async handleLogin() {
        const email = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        this.clearErrors();

        if (!email || !password) {
            this.showLoginError('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        try {
            const result = await cognitoAuth.login(email, password);

            if (result.success) {
                // 로그인 성공
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('로그인 오류:', error);

            if (error.code === 'NewPasswordRequired') {
                // 새 비밀번호 설정 필요
                this.pendingCognitoUser = error.cognitoUser;
                this.showNewPassword();
                return;
            }

            this.showLoginError(error.message || '로그인 중 오류가 발생했습니다.');
        }
    }

    async handleNewPassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;

        if (!newPassword || newPassword.length < 8) {
            alert('비밀번호는 최소 8자 이상이어야 합니다.');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            const result = await cognitoAuth.completeNewPasswordChallenge(
                this.pendingCognitoUser,
                newPassword,
                {}
            );

            if (result.success) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('비밀번호 변경 오류:', error);
            alert(error.message || '비밀번호 변경에 실패했습니다.');
        }
    }

    async handleRegister() {
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const passwordConfirm = document.getElementById('regPasswordConfirm').value;
        const name = document.getElementById('regName').value.trim();
        const organization = document.getElementById('regOrganization').value.trim();

        this.clearErrors();

        // 유효성 검사
        if (!email || !email.includes('@')) {
            this.showRegisterError('올바른 이메일을 입력해주세요.');
            return;
        }

        if (!password || password.length < 8) {
            this.showRegisterError('비밀번호는 최소 8자 이상이어야 합니다.');
            return;
        }

        if (password !== passwordConfirm) {
            this.showRegisterError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (!name) {
            this.showRegisterError('이름을 입력해주세요.');
            return;
        }

        if (!organization) {
            this.showRegisterError('소속 기관을 입력해주세요.');
            return;
        }

        try {
            // API를 통해 가입 신청
            const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name,
                    organization
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '가입 신청에 실패했습니다.');
            }

            // 폼 초기화
            document.getElementById('registerForm').reset();

            // 승인 대기 화면 표시
            this.showPending();

        } catch (error) {
            console.error('회원가입 오류:', error);
            this.showRegisterError(error.message || '회원가입 중 오류가 발생했습니다.');
        }
    }

    showForgotPassword() {
        const email = prompt('비밀번호를 재설정할 이메일을 입력하세요:');
        if (!email) return;

        cognitoAuth.forgotPassword(email)
            .then(result => {
                const code = prompt('이메일로 발송된 인증 코드를 입력하세요:');
                if (!code) return;

                const newPassword = prompt('새 비밀번호를 입력하세요 (8자 이상):');
                if (!newPassword || newPassword.length < 8) {
                    alert('비밀번호는 8자 이상이어야 합니다.');
                    return;
                }

                return cognitoAuth.confirmForgotPassword(email, code, newPassword);
            })
            .then(result => {
                if (result && result.success) {
                    alert('비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.');
                }
            })
            .catch(error => {
                alert(error.message || '비밀번호 재설정에 실패했습니다.');
            });
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    new AuthUI();
});
