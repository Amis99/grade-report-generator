/**
 * 인증 UI 모듈
 * 로그인, 회원가입 처리
 */

class AuthUI {
    constructor() {
        this.init();
    }

    async init() {
        // Firebase 초기화 대기
        if (typeof initializeFirebase === 'function') {
            await initializeFirebase();
        }

        // storage 캐시 로드 대기
        await this.waitForStorageCache();

        // 이미 로그인되어 있으면 메인 페이지로 이동
        if (SessionManager.isLoggedIn()) {
            window.location.href = 'index.html';
            return;
        }

        this.setupEventListeners();
    }

    async waitForStorageCache() {
        if (!storage.useFirebase) return;

        let attempts = 0;
        while (!storage.cacheLoaded && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
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
    }

    showLogin() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('pendingSection').style.display = 'none';
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
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        this.clearErrors();

        if (!username || !password) {
            this.showLoginError('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        try {
            // 사용자 조회
            const user = storage.getUserByUsername(username);

            if (!user) {
                this.showLoginError('아이디 또는 비밀번호가 올바르지 않습니다.');
                return;
            }

            // 비밀번호 검증
            const isValid = await AuthUtils.verifyPassword(password, user.passwordHash, user.salt);

            if (!isValid) {
                this.showLoginError('아이디 또는 비밀번호가 올바르지 않습니다.');
                return;
            }

            // 활성화 여부 확인
            if (!user.isActive) {
                this.showLoginError('계정이 비활성화되어 있습니다. 관리자에게 문의하세요.');
                return;
            }

            // 로그인 성공
            user.lastLoginAt = new Date().toISOString();
            await storage.saveUser(user);

            SessionManager.setSession(user);
            window.location.href = 'index.html';

        } catch (error) {
            console.error('로그인 오류:', error);
            this.showLoginError('로그인 중 오류가 발생했습니다.');
        }
    }

    async handleRegister() {
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const passwordConfirm = document.getElementById('regPasswordConfirm').value;
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const organization = document.getElementById('regOrganization').value.trim();

        this.clearErrors();

        // 유효성 검사
        const usernameValidation = AuthUtils.validateUsername(username);
        if (!usernameValidation.valid) {
            this.showRegisterError(usernameValidation.message);
            return;
        }

        const passwordValidation = AuthUtils.validatePassword(password);
        if (!passwordValidation.valid) {
            this.showRegisterError(passwordValidation.message);
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

        const emailValidation = AuthUtils.validateEmail(email);
        if (!emailValidation.valid) {
            this.showRegisterError(emailValidation.message);
            return;
        }

        if (!organization) {
            this.showRegisterError('소속 기관을 입력해주세요.');
            return;
        }

        try {
            // 아이디 중복 확인
            const existingUser = storage.getUserByUsername(username);
            if (existingUser) {
                this.showRegisterError('이미 사용 중인 아이디입니다.');
                return;
            }

            const existingRegistration = storage.getRegistrationByUsername(username);
            if (existingRegistration && existingRegistration.status === 'pending') {
                this.showRegisterError('이미 가입 신청 중인 아이디입니다.');
                return;
            }

            // 비밀번호 해시
            const salt = AuthUtils.generateSalt();
            const passwordHash = await AuthUtils.hashPassword(password, salt);

            // 가입 신청 생성
            const registration = new RegistrationRequest({
                username,
                passwordHash,
                salt,
                name,
                email,
                organization
            });

            await storage.saveRegistration(registration);

            // 폼 초기화
            document.getElementById('registerForm').reset();

            // 승인 대기 화면 표시
            this.showPending();

        } catch (error) {
            console.error('회원가입 오류:', error);
            this.showRegisterError('회원가입 중 오류가 발생했습니다.');
        }
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    new AuthUI();
});
