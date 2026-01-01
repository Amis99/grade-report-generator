/**
 * 권한 검사 서비스
 * 시험 및 학생 접근 권한 관리
 */

class AuthService {
    /**
     * 현재 사용자가 시험에 접근할 수 있는지 확인
     */
    static canAccessExam(exam) {
        const user = SessionManager.getCurrentUser();
        if (!user) return false;

        // 전체 관리자는 모든 시험 접근 가능
        if (user.role === 'admin') return true;

        // 기관 관리자는 본인 기관 시험만 접근
        return exam.organization === user.organization;
    }

    /**
     * 시험 컨텍스트에서 학생 접근 권한 확인
     */
    static canAccessStudentInExam(exam, student) {
        const user = SessionManager.getCurrentUser();
        if (!user) return false;

        // 전체 관리자는 모든 학생 접근 가능
        if (user.role === 'admin') return true;

        // '국어농장' 기관 시험은 모든 기관 학생 표시
        if (exam.organization === '국어농장') return true;

        // 다른 기관 시험은 해당 기관 학생만 표시
        return student.organization === user.organization;
    }

    /**
     * 현재 사용자가 학생에 접근할 수 있는지 확인 (시험 컨텍스트 없이)
     */
    static canAccessStudent(student) {
        const user = SessionManager.getCurrentUser();
        if (!user) return false;

        // 전체 관리자는 모든 학생 접근 가능
        if (user.role === 'admin') return true;

        // 기관 관리자는 본인 기관 학생만 접근
        return student.organization === user.organization;
    }

    /**
     * 시험 목록 필터링
     */
    static filterExams(exams) {
        if (!exams) return [];
        return exams.filter(exam => this.canAccessExam(exam));
    }

    /**
     * 학생 목록 필터링 (시험 컨텍스트)
     */
    static filterStudentsForExam(exam, students) {
        if (!students) return [];
        return students.filter(student => this.canAccessStudentInExam(exam, student));
    }

    /**
     * 학생 목록 필터링 (시험 컨텍스트 없이)
     */
    static filterStudents(students) {
        if (!students) return [];
        return students.filter(student => this.canAccessStudent(student));
    }

    /**
     * 관리자 권한 확인
     */
    static isAdmin() {
        const user = SessionManager.getCurrentUser();
        return user && user.role === 'admin';
    }

    /**
     * 로그인 여부 확인
     */
    static isLoggedIn() {
        return SessionManager.isLoggedIn();
    }

    /**
     * 현재 사용자 정보
     */
    static getCurrentUser() {
        return SessionManager.getCurrentUser();
    }

    /**
     * 현재 사용자의 기관
     */
    static getCurrentOrganization() {
        return SessionManager.getCurrentOrganization();
    }

    /**
     * 로그아웃
     */
    static logout() {
        SessionManager.clearSession();
        window.location.href = 'login.html';
    }

    /**
     * 인증 체크 (로그인되어 있지 않으면 로그인 페이지로 이동)
     */
    static requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    /**
     * 관리자 권한 체크
     */
    static requireAdmin() {
        if (!this.isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        if (!this.isAdmin()) {
            alert('관리자 권한이 필요합니다.');
            return false;
        }
        return true;
    }
}
