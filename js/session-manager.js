/**
 * 세션 관리 모듈
 * 로그인 세션 저장, 조회, 삭제 기능 제공
 */

class SessionManager {
    static SESSION_KEY = 'gradeapp_session';
    static SESSION_DURATION = 24 * 60 * 60 * 1000; // 24시간

    /**
     * 세션 저장
     */
    static setSession(user) {
        const session = {
            userId: user.id,
            username: user.username,
            name: user.name,
            organization: user.organization,
            role: user.role,
            loginAt: Date.now(),
            expiresAt: Date.now() + this.SESSION_DURATION
        };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }

    /**
     * 세션 가져오기
     */
    static getSession() {
        const sessionStr = localStorage.getItem(this.SESSION_KEY);
        if (!sessionStr) return null;

        try {
            const session = JSON.parse(sessionStr);
            if (Date.now() > session.expiresAt) {
                this.clearSession();
                return null;
            }
            return session;
        } catch (e) {
            this.clearSession();
            return null;
        }
    }

    /**
     * 세션 삭제
     */
    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    }

    /**
     * 로그인 여부 확인
     */
    static isLoggedIn() {
        return this.getSession() !== null;
    }

    /**
     * 현재 사용자 정보
     */
    static getCurrentUser() {
        return this.getSession();
    }

    /**
     * 관리자 여부 확인
     */
    static isAdmin() {
        const session = this.getSession();
        return session && session.role === 'admin';
    }

    /**
     * 현재 사용자의 기관
     */
    static getCurrentOrganization() {
        const session = this.getSession();
        return session ? session.organization : null;
    }

    /**
     * 세션 갱신 (만료 시간 연장)
     */
    static refreshSession() {
        const session = this.getSession();
        if (session) {
            session.expiresAt = Date.now() + this.SESSION_DURATION;
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        }
    }
}
