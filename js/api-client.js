/**
 * REST API 클라이언트
 * Firebase storage.js를 대체하는 AWS API Gateway 클라이언트
 * 기존 storage 인터페이스와 호환성 유지
 */

class ApiClient {
    constructor() {
        this.baseUrl = APP_CONFIG.API_BASE_URL;
        this.cache = {
            exams: [],
            questions: [],
            students: [],
            answers: [],
            users: [],
            registrations: []
        };
        this.cacheLoaded = false;
        this.useFirebase = false; // 호환성용 플래그
    }

    // === HTTP 요청 헬퍼 ===

    async getAuthHeader() {
        const token = await cognitoAuth.getIdToken();
        if (!token) {
            throw new Error('인증이 필요합니다.');
        }
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async request(method, endpoint, data = null) {
        try {
            const headers = await this.getAuthHeader();
            const options = {
                method,
                headers
            };

            if (data && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP ${response.status}`);
            }

            return result;
        } catch (error) {
            console.error(`API Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    }

    // === 초기 데이터 로드 ===

    async loadAllDataToCache() {
        try {
            console.log('Loading data from API...');

            // 병렬로 모든 데이터 로드
            const [exams, students] = await Promise.all([
                this.request('GET', '/exams'),
                this.request('GET', '/students')
            ]);

            this.cache.exams = exams.map(e => new Exam(e));
            this.cache.students = students.map(s => new Student(s));

            // 문제와 답안은 시험별로 지연 로드
            this.cache.questions = [];
            this.cache.answers = [];

            this.cacheLoaded = true;
            console.log('Data loaded:', {
                exams: this.cache.exams.length,
                students: this.cache.students.length
            });
        } catch (error) {
            console.error('Failed to load data:', error);
            throw error;
        }
    }

    // === 시험(Exam) 관리 ===

    getAllExams() {
        return this.cache.exams;
    }

    getExam(id) {
        const exam = this.cache.exams.find(e => e.id === id);
        return exam ? new Exam(exam) : null;
    }

    async saveExam(exam) {
        exam.updatedAt = new Date().toISOString();

        try {
            let result;
            if (this.cache.exams.find(e => e.id === exam.id)) {
                // 업데이트
                result = await this.request('PUT', `/exams/${exam.id}`, exam);
            } else {
                // 새로 생성
                result = await this.request('POST', '/exams', exam);
                exam.id = result.id;
            }

            // 캐시 업데이트
            const index = this.cache.exams.findIndex(e => e.id === exam.id);
            if (index >= 0) {
                this.cache.exams[index] = new Exam(exam);
            } else {
                this.cache.exams.push(new Exam(exam));
            }

            return exam;
        } catch (error) {
            console.error('Failed to save exam:', error);
            throw error;
        }
    }

    async deleteExam(id) {
        try {
            await this.request('DELETE', `/exams/${id}`);
            this.cache.exams = this.cache.exams.filter(e => e.id !== id);

            // 관련 데이터 캐시에서 제거
            this.cache.questions = this.cache.questions.filter(q => q.examId !== id);
            this.cache.answers = this.cache.answers.filter(a => a.examId !== id);
        } catch (error) {
            console.error('Failed to delete exam:', error);
            throw error;
        }
    }

    // === 문제(Question) 관리 ===

    getAllQuestions() {
        return this.cache.questions;
    }

    getQuestion(id) {
        const question = this.cache.questions.find(q => q.id === id);
        return question ? new Question(question) : null;
    }

    getQuestionsByExamId(examId) {
        // 캐시에 없으면 API에서 가져오기
        const cached = this.cache.questions.filter(q => q.examId === examId);
        if (cached.length > 0) {
            return cached.sort((a, b) => a.number - b.number);
        }
        return [];
    }

    async loadQuestionsByExamId(examId) {
        try {
            const questions = await this.request('GET', `/exams/${examId}/questions`);
            const questionObjs = questions.map(q => new Question(q));

            // 캐시 업데이트 (기존 문제 제거 후 추가)
            this.cache.questions = this.cache.questions.filter(q => q.examId !== examId);
            this.cache.questions.push(...questionObjs);

            return questionObjs.sort((a, b) => a.number - b.number);
        } catch (error) {
            console.error('Failed to load questions:', error);
            return [];
        }
    }

    async saveQuestion(question) {
        // 단일 문제 저장은 saveQuestions를 통해 처리
        await this.saveQuestions([question]);
        return question;
    }

    async saveQuestions(questionsArray) {
        if (questionsArray.length === 0) return;

        const examId = questionsArray[0].examId;

        try {
            await this.request('PUT', `/exams/${examId}/questions`, { questions: questionsArray });

            // 캐시 업데이트
            this.cache.questions = this.cache.questions.filter(q => q.examId !== examId);
            this.cache.questions.push(...questionsArray.map(q => new Question(q)));
        } catch (error) {
            console.error('Failed to save questions:', error);
            throw error;
        }
    }

    async deleteQuestion(id) {
        // 문제는 시험과 함께 삭제되므로 캐시에서만 제거
        this.cache.questions = this.cache.questions.filter(q => q.id !== id);
    }

    async deleteQuestionsByExamId(examId) {
        this.cache.questions = this.cache.questions.filter(q => q.examId !== examId);
    }

    // === 학생(Student) 관리 ===

    normalizeStudentName(name) {
        return name.trim().replace(/\s+/g, '');
    }

    normalizeSchoolName(school) {
        return school.trim().replace(/\s+/g, '').replace(/고등학교|고교/g, '고');
    }

    normalizeGrade(grade) {
        return grade.trim().replace(/\s+|학년|반/g, '');
    }

    getAllStudents() {
        return this.cache.students;
    }

    getStudent(id) {
        const student = this.cache.students.find(s => s.id === id);
        return student ? new Student(student) : null;
    }

    getStudentByName(name, school, grade) {
        const students = this.getAllStudents();

        // 정확히 일치하는 학생 찾기
        let student = students.find(s =>
            s.name === name &&
            s.school === school &&
            s.grade === grade
        );

        // 정규화하여 찾기
        if (!student) {
            const normalizedName = this.normalizeStudentName(name);
            const normalizedSchool = this.normalizeSchoolName(school);
            const normalizedGrade = this.normalizeGrade(grade);

            student = students.find(s =>
                this.normalizeStudentName(s.name) === normalizedName &&
                this.normalizeSchoolName(s.school) === normalizedSchool &&
                this.normalizeGrade(s.grade) === normalizedGrade
            );
        }

        return student;
    }

    findDuplicateStudents() {
        const students = this.getAllStudents();
        const groups = new Map();

        students.forEach(student => {
            const key = `${this.normalizeStudentName(student.name)}_${this.normalizeSchoolName(student.school)}_${this.normalizeGrade(student.grade)}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(student);
        });

        return Array.from(groups.values()).filter(group => group.length > 1);
    }

    async mergeStudents(targetId, sourceId) {
        if (targetId === sourceId) {
            throw new Error('같은 학생은 병합할 수 없습니다.');
        }

        try {
            const result = await this.request('POST', '/students/merge', {
                targetId,
                sourceId
            });

            // 캐시 업데이트
            this.cache.students = this.cache.students.filter(s => s.id !== sourceId);

            // 답안 캐시 업데이트
            this.cache.answers = this.cache.answers.map(a => {
                if (a.studentId === sourceId) {
                    return { ...a, studentId: targetId };
                }
                return a;
            });

            return this.getStudent(targetId);
        } catch (error) {
            console.error('Failed to merge students:', error);
            throw error;
        }
    }

    async saveStudent(student) {
        try {
            let result;
            if (this.cache.students.find(s => s.id === student.id)) {
                result = await this.request('PUT', `/students/${student.id}`, student);
            } else {
                result = await this.request('POST', '/students', student);
                student.id = result.id;
            }

            const index = this.cache.students.findIndex(s => s.id === student.id);
            if (index >= 0) {
                this.cache.students[index] = new Student(student);
            } else {
                this.cache.students.push(new Student(student));
            }

            return student;
        } catch (error) {
            console.error('Failed to save student:', error);
            throw error;
        }
    }

    async deleteStudent(id) {
        try {
            await this.request('DELETE', `/students/${id}`);
            this.cache.students = this.cache.students.filter(s => s.id !== id);
            this.cache.answers = this.cache.answers.filter(a => a.studentId !== id);
        } catch (error) {
            console.error('Failed to delete student:', error);
            throw error;
        }
    }

    // === 답안(Answer) 관리 ===

    getAllAnswers() {
        return this.cache.answers;
    }

    getAnswer(id) {
        const answer = this.cache.answers.find(a => a.id === id);
        return answer ? new Answer(answer) : null;
    }

    getAnswersByExamAndStudent(examId, studentId) {
        return this.cache.answers.filter(a => a.examId === examId && a.studentId === studentId);
    }

    getAnswersByExamId(examId) {
        return this.cache.answers.filter(a => a.examId === examId);
    }

    async loadAnswersByExamId(examId) {
        try {
            const result = await this.request('GET', `/exams/${examId}/answers`);
            const answers = result.answers || [];
            const answerObjs = answers.map(a => new Answer(a));

            // 캐시 업데이트
            this.cache.answers = this.cache.answers.filter(a => a.examId !== examId);
            this.cache.answers.push(...answerObjs);

            return answerObjs;
        } catch (error) {
            console.error('Failed to load answers:', error);
            return [];
        }
    }

    async saveAnswer(answer) {
        answer.updatedAt = new Date().toISOString();

        // 중복 방지
        if (!answer.id) {
            const existing = this.cache.answers.find(a =>
                a.examId === answer.examId &&
                a.studentId === answer.studentId &&
                a.questionId === answer.questionId
            );
            if (existing) {
                answer.id = existing.id;
            }
        }

        // 캐시 업데이트
        const index = this.cache.answers.findIndex(a => a.id === answer.id);
        if (index >= 0) {
            this.cache.answers[index] = new Answer(answer);
        } else {
            this.cache.answers.push(new Answer(answer));
        }

        return answer;
    }

    async saveAnswers(answersArray) {
        if (answersArray.length === 0) return;

        const examId = answersArray[0].examId;
        const studentId = answersArray[0].studentId;

        try {
            await this.request('PUT', `/exams/${examId}/students/${studentId}/answers`, {
                answers: answersArray
            });

            // 캐시 업데이트
            for (const answer of answersArray) {
                await this.saveAnswer(answer);
            }
        } catch (error) {
            console.error('Failed to save answers:', error);
            throw error;
        }
    }

    async deleteAnswer(id) {
        this.cache.answers = this.cache.answers.filter(a => a.id !== id);
    }

    async deleteAnswersByExamId(examId) {
        this.cache.answers = this.cache.answers.filter(a => a.examId !== examId);
    }

    async deleteAnswersByStudentId(studentId) {
        this.cache.answers = this.cache.answers.filter(a => a.studentId !== studentId);
    }

    async deleteAnswersByQuestionId(questionId) {
        this.cache.answers = this.cache.answers.filter(a => a.questionId !== questionId);
    }

    removeDuplicateAnswers() {
        const answers = this.getAllAnswers();
        const uniqueAnswers = [];
        const seenKeys = new Set();

        answers.sort((a, b) => {
            const dateA = new Date(a.updatedAt || 0);
            const dateB = new Date(b.updatedAt || 0);
            return dateB - dateA;
        });

        answers.forEach(answer => {
            const key = `${answer.examId}_${answer.studentId}_${answer.questionId}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueAnswers.push(answer);
            }
        });

        const removedCount = answers.length - uniqueAnswers.length;
        if (removedCount > 0) {
            this.cache.answers = uniqueAnswers;
            console.log(`중복 답안 ${removedCount}개가 제거되었습니다.`);
        }

        return removedCount;
    }

    removeOrphanedAnswers() {
        const answers = this.getAllAnswers();
        const students = this.getAllStudents();
        const exams = this.getAllExams();
        const questions = this.getAllQuestions();

        const studentIds = new Set(students.map(s => s.id));
        const examIds = new Set(exams.map(e => e.id));
        const questionIds = new Set(questions.map(q => q.id));

        const validAnswers = answers.filter(answer => {
            return studentIds.has(answer.studentId) &&
                   examIds.has(answer.examId) &&
                   questionIds.has(answer.questionId);
        });

        const removedCount = answers.length - validAnswers.length;
        if (removedCount > 0) {
            this.cache.answers = validAnswers;
            console.log(`고아 답안 ${removedCount}개가 제거되었습니다.`);
        }

        return removedCount;
    }

    async removeStudentsWithNoAnswers() {
        const students = this.getAllStudents();
        const answers = this.getAllAnswers();

        const studentsToDelete = students.filter(student => {
            const studentAnswers = answers.filter(a => a.studentId === student.id);
            return studentAnswers.length === 0;
        });

        if (studentsToDelete.length > 0) {
            for (const student of studentsToDelete) {
                await this.deleteStudent(student.id);
            }
            console.log(`답안이 없는 학생 ${studentsToDelete.length}명이 삭제되었습니다.`);
        }

        return studentsToDelete.length;
    }

    // === 결과 조회 ===

    debugQuestions(examId) {
        const questions = this.getQuestionsByExamId(examId);
        console.log('=== 문제 데이터 디버깅 ===');
        console.log(`시험 ID: ${examId}`);
        console.log(`총 문제 수: ${questions.length}`);

        questions.forEach(q => {
            console.log('\n----------------------------');
            console.log(`${q.number}번 (${q.type})`);
            console.log(`정답/모범답안: ${q.correctAnswer}`);
            if (q.type === '객관식') {
                console.log('선택지 해설:', q.choiceExplanations);
            }
        });

        return questions;
    }

    getExamResult(examId, studentId) {
        const exam = this.getExam(examId);
        const student = this.getStudent(studentId);
        const questions = this.getQuestionsByExamId(examId);
        const answers = this.getAnswersByExamAndStudent(examId, studentId);

        if (!exam || !student || questions.length === 0) {
            return null;
        }

        const result = new ExamResult(exam, student, questions, answers);

        const allResults = this.getAllExamResults(examId);
        const myResult = allResults.find(r => r.student.id === studentId);

        if (myResult) {
            result.rank = myResult.rank;
            result.totalStudents = myResult.totalStudents;
        }

        return result;
    }

    getAllExamResults(examId) {
        const exam = this.getExam(examId);
        if (!exam) return [];

        const questions = this.getQuestionsByExamId(examId);
        const allAnswers = this.getAnswersByExamId(examId);

        const studentIds = [...new Set(allAnswers.map(a => a.studentId))];

        const results = studentIds.map(studentId => {
            const student = this.getStudent(studentId);
            const answers = allAnswers.filter(a => a.studentId === studentId);
            return { student, exam, questions, answers };
        }).filter(data => data.student !== null)
        .map(data => new ExamResult(data.exam, data.student, data.questions, data.answers));

        results.sort((a, b) => b.totalScore - a.totalScore);

        let currentRank = 1;
        results.forEach((result, index) => {
            if (index > 0 && results[index - 1].totalScore !== result.totalScore) {
                currentRank = index + 1;
            }
            result.rank = currentRank;
            result.totalStudents = results.length;
        });

        return results;
    }

    // === 사용자(User) 관리 ===

    getAllUsers() {
        return this.cache.users;
    }

    getUser(id) {
        const user = this.cache.users.find(u => u.id === id);
        return user ? new User(user) : null;
    }

    getUserByUsername(username) {
        const user = this.cache.users.find(u => u.username === username);
        return user ? new User(user) : null;
    }

    async loadUsers() {
        try {
            const users = await this.request('GET', '/admin/users');
            this.cache.users = users.map(u => new User(u));
            return this.cache.users;
        } catch (error) {
            console.error('Failed to load users:', error);
            return [];
        }
    }

    async saveUser(user) {
        try {
            const result = await this.request('PUT', `/admin/users/${user.id}`, user);

            const index = this.cache.users.findIndex(u => u.id === user.id);
            if (index >= 0) {
                this.cache.users[index] = new User(user);
            }

            return user;
        } catch (error) {
            console.error('Failed to save user:', error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            await this.request('DELETE', `/admin/users/${id}`);
            this.cache.users = this.cache.users.filter(u => u.id !== id);
        } catch (error) {
            console.error('Failed to delete user:', error);
            throw error;
        }
    }

    // === 가입 신청(Registration) 관리 ===

    getAllRegistrations() {
        return this.cache.registrations;
    }

    getPendingRegistrations() {
        return this.getAllRegistrations().filter(r => r.status === 'pending');
    }

    getRegistration(id) {
        const reg = this.cache.registrations.find(r => r.id === id);
        return reg ? new RegistrationRequest(reg) : null;
    }

    getRegistrationByUsername(username) {
        const reg = this.cache.registrations.find(r => r.username === username);
        return reg ? new RegistrationRequest(reg) : null;
    }

    async loadRegistrations() {
        try {
            const registrations = await this.request('GET', '/admin/registrations');
            this.cache.registrations = registrations.map(r => new RegistrationRequest(r));
            return this.cache.registrations;
        } catch (error) {
            console.error('Failed to load registrations:', error);
            return [];
        }
    }

    async saveRegistration(registration) {
        // 새 가입 신청 (인증 없이 가능)
        try {
            const response = await fetch(`${this.baseUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: registration.email || registration.username,
                    password: registration.passwordHash ? undefined : registration.password,
                    name: registration.name,
                    organization: registration.organization
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Registration failed');
            }

            return registration;
        } catch (error) {
            console.error('Failed to save registration:', error);
            throw error;
        }
    }

    async deleteRegistration(id) {
        this.cache.registrations = this.cache.registrations.filter(r => r.id !== id);
    }

    async approveRegistration(registrationId, approvedBy) {
        try {
            const result = await this.request('POST', `/admin/registrations/${registrationId}/approve`);

            // 캐시 업데이트
            const reg = this.cache.registrations.find(r => r.id === registrationId);
            if (reg) {
                reg.status = 'approved';
                reg.processedAt = new Date().toISOString();
                reg.processedBy = approvedBy;
            }

            return result.user;
        } catch (error) {
            console.error('Failed to approve registration:', error);
            throw error;
        }
    }

    async rejectRegistration(registrationId, rejectedBy) {
        try {
            await this.request('POST', `/admin/registrations/${registrationId}/reject`);

            const reg = this.cache.registrations.find(r => r.id === registrationId);
            if (reg) {
                reg.status = 'rejected';
                reg.processedAt = new Date().toISOString();
                reg.processedBy = rejectedBy;
            }

            return reg;
        } catch (error) {
            console.error('Failed to reject registration:', error);
            throw error;
        }
    }

    // === 데이터 내보내기/가져오기 ===

    clearAllData() {
        if (confirm('모든 캐시 데이터를 초기화하시겠습니까?')) {
            this.cache = {
                exams: [],
                questions: [],
                students: [],
                answers: [],
                users: [],
                registrations: []
            };
        }
    }

    exportAllData() {
        return {
            exams: this.getAllExams(),
            questions: this.getAllQuestions(),
            students: this.getAllStudents(),
            answers: this.getAllAnswers(),
            exportedAt: new Date().toISOString()
        };
    }

    async importAllData(data) {
        console.log('Import not supported in API mode. Use migration script.');
    }
}

// 싱글톤 인스턴스 (기존 storage 변수명 유지)
const storage = new ApiClient();
