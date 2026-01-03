/**
 * Cognito 인증 모듈
 * AWS Cognito를 사용한 인증 관리
 */

class CognitoAuth {
    constructor() {
        this.userPool = null;
        this.currentUser = null;
        this.session = null;
        this.initialized = false;
    }

    /**
     * Cognito 초기화
     */
    async init() {
        if (this.initialized) return;

        // Amazon Cognito Identity SDK 확인
        if (typeof AmazonCognitoIdentity === 'undefined') {
            console.error('Amazon Cognito Identity SDK not loaded');
            return;
        }

        const poolData = {
            UserPoolId: APP_CONFIG.COGNITO.USER_POOL_ID,
            ClientId: APP_CONFIG.COGNITO.CLIENT_ID
        };

        this.userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
        this.currentUser = this.userPool.getCurrentUser();

        // 기존 세션 복원 시도
        if (this.currentUser) {
            try {
                this.session = await this.getSession();
                console.log('Session restored');
            } catch (error) {
                console.log('No valid session');
                this.currentUser = null;
            }
        }

        this.initialized = true;
    }

    /**
     * 로그인
     */
    async login(email, password) {
        await this.init();

        return new Promise((resolve, reject) => {
            const authenticationData = {
                Username: email,
                Password: password
            };

            const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

            const userData = {
                Username: email,
                Pool: this.userPool
            };

            const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

            cognitoUser.authenticateUser(authenticationDetails, {
                onSuccess: async (result) => {
                    this.currentUser = cognitoUser;
                    this.session = result;

                    // 사용자 속성 가져오기
                    const userInfo = await this.getUserAttributes();

                    // 세션 저장 (기존 SessionManager 호환)
                    this.saveLocalSession(userInfo);

                    resolve({
                        success: true,
                        user: userInfo
                    });
                },

                onFailure: (err) => {
                    console.error('Login failed:', err);
                    let message = '로그인에 실패했습니다.';

                    switch (err.code) {
                        case 'NotAuthorizedException':
                            message = '아이디 또는 비밀번호가 올바르지 않습니다.';
                            break;
                        case 'UserNotConfirmedException':
                            message = '이메일 인증이 필요합니다.';
                            break;
                        case 'UserNotFoundException':
                            message = '등록되지 않은 사용자입니다.';
                            break;
                        case 'PasswordResetRequiredException':
                            message = '비밀번호 재설정이 필요합니다.';
                            break;
                    }

                    reject({ success: false, message, code: err.code });
                },

                newPasswordRequired: (userAttributes, requiredAttributes) => {
                    // 임시 비밀번호로 첫 로그인 시
                    reject({
                        success: false,
                        message: '비밀번호 변경이 필요합니다.',
                        code: 'NewPasswordRequired',
                        cognitoUser,
                        userAttributes
                    });
                }
            });
        });
    }

    /**
     * 새 비밀번호 설정 (첫 로그인 시)
     */
    async completeNewPasswordChallenge(cognitoUser, newPassword, userAttributes) {
        return new Promise((resolve, reject) => {
            cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
                onSuccess: async (result) => {
                    this.currentUser = cognitoUser;
                    this.session = result;

                    const userInfo = await this.getUserAttributes();
                    this.saveLocalSession(userInfo);

                    resolve({ success: true, user: userInfo });
                },
                onFailure: (err) => {
                    reject({ success: false, message: err.message });
                }
            });
        });
    }

    /**
     * 로그아웃
     */
    logout() {
        if (this.currentUser) {
            this.currentUser.signOut();
        }
        this.currentUser = null;
        this.session = null;
        localStorage.removeItem('gradeapp_session');
        window.location.href = 'login.html';
    }

    /**
     * 현재 세션 가져오기
     */
    getSession() {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject(new Error('No user'));
                return;
            }

            this.currentUser.getSession((err, session) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!session.isValid()) {
                    reject(new Error('Session invalid'));
                    return;
                }

                this.session = session;
                resolve(session);
            });
        });
    }

    /**
     * ID 토큰 가져오기 (API 인증용)
     */
    async getIdToken() {
        try {
            // 현재 유저가 없으면 userPool에서 가져오기
            if (!this.currentUser && this.userPool) {
                this.currentUser = this.userPool.getCurrentUser();
            }

            if (!this.currentUser) {
                console.error('No current user for getIdToken');
                return null;
            }

            const session = await this.getSession();
            return session.getIdToken().getJwtToken();
        } catch (error) {
            console.error('Failed to get ID token:', error);
            return null;
        }
    }

    /**
     * 사용자 속성 가져오기
     */
    async getUserAttributes() {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject(new Error('No user'));
                return;
            }

            this.currentUser.getUserAttributes((err, attributes) => {
                if (err) {
                    reject(err);
                    return;
                }

                const userInfo = {
                    sub: '',
                    email: '',
                    name: '',
                    organization: '',
                    role: 'org_admin'
                };

                attributes.forEach(attr => {
                    switch (attr.getName()) {
                        case 'sub':
                            userInfo.sub = attr.getValue();
                            break;
                        case 'email':
                            userInfo.email = attr.getValue();
                            userInfo.username = attr.getValue();
                            break;
                        case 'name':
                            userInfo.name = attr.getValue();
                            break;
                        case 'custom:organization':
                            userInfo.organization = attr.getValue();
                            break;
                        case 'custom:role':
                            userInfo.role = attr.getValue();
                            break;
                    }
                });

                resolve(userInfo);
            });
        });
    }

    /**
     * 비밀번호 변경
     */
    async changePassword(oldPassword, newPassword) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ success: false, message: '로그인이 필요합니다.' });
                return;
            }

            this.currentUser.changePassword(oldPassword, newPassword, (err, result) => {
                if (err) {
                    let message = '비밀번호 변경에 실패했습니다.';
                    if (err.code === 'NotAuthorizedException') {
                        message = '현재 비밀번호가 올바르지 않습니다.';
                    } else if (err.code === 'InvalidPasswordException') {
                        message = '새 비밀번호가 요구 조건을 충족하지 않습니다.';
                    }
                    reject({ success: false, message });
                    return;
                }
                resolve({ success: true, message: '비밀번호가 변경되었습니다.' });
            });
        });
    }

    /**
     * 비밀번호 찾기 (재설정 코드 발송)
     */
    async forgotPassword(email) {
        await this.init();

        return new Promise((resolve, reject) => {
            const userData = {
                Username: email,
                Pool: this.userPool
            };

            const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

            cognitoUser.forgotPassword({
                onSuccess: () => {
                    resolve({ success: true, message: '비밀번호 재설정 코드가 이메일로 발송되었습니다.' });
                },
                onFailure: (err) => {
                    let message = '비밀번호 재설정 요청에 실패했습니다.';
                    if (err.code === 'UserNotFoundException') {
                        message = '등록되지 않은 이메일입니다.';
                    }
                    reject({ success: false, message });
                }
            });
        });
    }

    /**
     * 비밀번호 재설정 확인
     */
    async confirmForgotPassword(email, code, newPassword) {
        await this.init();

        return new Promise((resolve, reject) => {
            const userData = {
                Username: email,
                Pool: this.userPool
            };

            const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

            cognitoUser.confirmPassword(code, newPassword, {
                onSuccess: () => {
                    resolve({ success: true, message: '비밀번호가 재설정되었습니다.' });
                },
                onFailure: (err) => {
                    let message = '비밀번호 재설정에 실패했습니다.';
                    if (err.code === 'CodeMismatchException') {
                        message = '인증 코드가 올바르지 않습니다.';
                    } else if (err.code === 'ExpiredCodeException') {
                        message = '인증 코드가 만료되었습니다.';
                    }
                    reject({ success: false, message });
                }
            });
        });
    }

    /**
     * 로그인 여부 확인
     */
    isLoggedIn() {
        // 로컬 세션 확인
        const session = localStorage.getItem('gradeapp_session');
        if (!session) return false;

        try {
            const parsed = JSON.parse(session);
            if (Date.now() > parsed.expiresAt) {
                localStorage.removeItem('gradeapp_session');
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 현재 사용자 정보 (로컬 세션에서)
     */
    getCurrentUser() {
        const session = localStorage.getItem('gradeapp_session');
        if (!session) return null;

        try {
            const parsed = JSON.parse(session);
            if (Date.now() > parsed.expiresAt) {
                localStorage.removeItem('gradeapp_session');
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * 관리자 여부 확인
     */
    isAdmin() {
        const user = this.getCurrentUser();
        return user && user.role === 'admin';
    }

    /**
     * 현재 사용자의 기관
     */
    getCurrentOrganization() {
        const user = this.getCurrentUser();
        return user ? user.organization : null;
    }

    /**
     * 로컬 세션 저장 (기존 SessionManager 호환)
     */
    saveLocalSession(userInfo) {
        const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24시간

        const session = {
            userId: userInfo.sub,
            username: userInfo.email,
            name: userInfo.name,
            organization: userInfo.organization,
            role: userInfo.role,
            loginAt: Date.now(),
            expiresAt: Date.now() + SESSION_DURATION
        };

        localStorage.setItem('gradeapp_session', JSON.stringify(session));
    }

    /**
     * 세션 갱신
     */
    async refreshSession() {
        try {
            const session = await this.getSession();
            const userInfo = await this.getUserAttributes();
            this.saveLocalSession(userInfo);
            return true;
        } catch (error) {
            console.error('Session refresh failed:', error);
            return false;
        }
    }
}

// 싱글톤 인스턴스
const cognitoAuth = new CognitoAuth();
