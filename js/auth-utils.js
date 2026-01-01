/**
 * 인증 유틸리티 모듈
 * 비밀번호 해시 및 검증 기능 제공
 */

class AuthUtils {
    /**
     * 랜덤 솔트 생성 (16바이트)
     */
    static generateSalt() {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 고유 ID 생성
     */
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * SHA-256 해시 생성 (비밀번호 + 솔트)
     */
    static async hashPassword(password, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 비밀번호 검증
     */
    static async verifyPassword(password, hash, salt) {
        const computedHash = await this.hashPassword(password, salt);
        return computedHash === hash;
    }

    /**
     * 비밀번호 유효성 검사
     * - 최소 4자 이상
     */
    static validatePassword(password) {
        if (!password || password.length < 4) {
            return { valid: false, message: '비밀번호는 최소 4자 이상이어야 합니다.' };
        }
        return { valid: true, message: '' };
    }

    /**
     * 사용자명 유효성 검사
     * - 영문, 숫자, 언더스코어만 허용
     * - 최소 3자 이상
     */
    static validateUsername(username) {
        if (!username || username.length < 3) {
            return { valid: false, message: '아이디는 최소 3자 이상이어야 합니다.' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { valid: false, message: '아이디는 영문, 숫자, 언더스코어(_)만 사용할 수 있습니다.' };
        }
        return { valid: true, message: '' };
    }

    /**
     * 이메일 유효성 검사
     */
    static validateEmail(email) {
        if (!email) {
            return { valid: false, message: '이메일을 입력해주세요.' };
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, message: '올바른 이메일 형식이 아닙니다.' };
        }
        return { valid: true, message: '' };
    }
}
