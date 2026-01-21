/**
 * REST API 클라이언트
 * Firebase storage.js를 대체하는 AWS API Gateway 클라이언트
 * 기존 storage 인터페이스와 호환성 유지
 */
console.log('📦 api-client.js 버전 2025-01-03 로드됨 (답안 저장 수정)');

class ApiClient {
    constructor() {
        this.baseUrl = APP_CONFIG.API_BASE_URL;
        this.cache = {
            exams: [],
            questions: [],
            students: [],
            answers: [],
            users: [],
            registrations: [],
            classes: []
        };
        this.cacheLoaded = false;
        this.useFirebase = false; // 호환성용 플래그
    }

    // === HTTP 요청 헬퍼 ===

    async getAuthHeader() {
        const token = await cognitoAuth.getIdToken();

        // 토큰 유효성 검증
        if (!token || typeof token !== 'string' || token.trim() === '') {
            throw new Error('인증이 필요합니다.');
        }

        // JWT 기본 형식 검증 (header.payload.signature)
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.warn('토큰 형식이 올바르지 않습니다. 재로그인이 필요할 수 있습니다.');
            throw new Error('인증 토큰이 유효하지 않습니다.');
        }

        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async request(method, endpoint, data = null, maxRetries = 3) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
                    const errorMsg = result.error?.message || result.error || `HTTP ${response.status}`;

                    // 인증 오류는 재시도하지 않음
                    if (response.status === 401 || response.status === 403) {
                        throw new Error(errorMsg);
                    }

                    // 서버 오류(5xx)는 재시도
                    if (response.status >= 500 && attempt < maxRetries) {
                        throw { retryable: true, message: errorMsg };
                    }

                    throw new Error(errorMsg);
                }

                // API 응답에서 data 필드 추출 (success: true, data: [...] 형식)
                return result.data !== undefined ? result.data : result;
            } catch (error) {
                lastError = error;

                // 재시도 가능한 오류인 경우
                if (error.retryable && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 지수 백오프 (최대 5초)
                    console.warn(`API 요청 실패 (${attempt}/${maxRetries}), ${delay}ms 후 재시도:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // 네트워크 오류도 재시도
                if (error.name === 'TypeError' && error.message.includes('fetch') && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.warn(`네트워크 오류 (${attempt}/${maxRetries}), ${delay}ms 후 재시도`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                console.error(`API Error [${method} ${endpoint}]:`, error.message || error);
                throw error instanceof Error ? error : new Error(error.message || '알 수 없는 오류');
            }
        }

        throw lastError;
    }

    // === 초기 데이터 로드 ===

    async loadAllDataToCache() {
        try {
            console.log('Loading data from API...');

            // 병렬로 시험과 학생 로드
            const [exams, students] = await Promise.all([
                this.request('GET', '/exams'),
                this.request('GET', '/students')
            ]);

            this.cache.exams = exams.map(e => new Exam(e));
            this.cache.students = students.map(s => new Student(s));

            // 모든 시험의 문제와 답안 로드
            this.cache.questions = [];
            this.cache.answers = [];

            // 시험별로 문제와 답안 로드 (병렬)
            const loadPromises = this.cache.exams.map(async (exam) => {
                try {
                    const [questions, answers] = await Promise.all([
                        this.request('GET', `/exams/${exam.id}/questions`),
                        this.request('GET', `/exams/${exam.id}/answers`)
                    ]);

                    const questionArray = Array.isArray(questions) ? questions : [];
                    const answerArray = Array.isArray(answers) ? answers : [];

                    return {
                        questions: questionArray.map(q => new Question(q)),
                        answers: answerArray.map(a => new Answer(a))
                    };
                } catch (err) {
                    console.error(`Failed to load data for exam ${exam.id}:`, err);
                    return { questions: [], answers: [] };
                }
            });

            const results = await Promise.all(loadPromises);
            results.forEach(result => {
                this.cache.questions.push(...result.questions);
                this.cache.answers.push(...result.answers);
            });

            this.cacheLoaded = true;
            console.log('Data loaded:', {
                exams: this.cache.exams.length,
                students: this.cache.students.length,
                questions: this.cache.questions.length,
                answers: this.cache.answers.length
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
            const result = await this.request('GET', `/exams/${examId}/questions`);
            const questions = Array.isArray(result) ? result : (result || []);
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
        // 단일 문제 저장: 기존 문제들을 유지하면서 새 문제 추가/수정
        const examId = question.examId;
        const existingQuestions = this.cache.questions.filter(q => q.examId === examId);

        // 동일 ID 문제가 있으면 수정, 없으면 추가
        const questionIndex = existingQuestions.findIndex(q => q.id === question.id);
        if (questionIndex >= 0) {
            existingQuestions[questionIndex] = question;
        } else {
            existingQuestions.push(question);
        }

        // 모든 문제를 함께 저장
        await this.saveQuestions(existingQuestions, true);
        return question;
    }

    async saveQuestions(questionsArray, isFullReplace = false) {
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

            // 답안 캐시 업데이트 (충돌 처리 포함)
            const targetAnswers = this.cache.answers.filter(a => a.studentId === targetId);
            const targetAnswerKeys = new Set(
                targetAnswers.map(a => `${a.examId}_${a.questionId}`)
            );

            // 충돌이 없는 답안만 이전, 충돌 시 target 유지
            const updatedAnswers = [];
            for (const a of this.cache.answers) {
                if (a.studentId === sourceId) {
                    const key = `${a.examId}_${a.questionId}`;
                    if (!targetAnswerKeys.has(key)) {
                        // 충돌 없음: targetId로 이전
                        updatedAnswers.push({ ...a, studentId: targetId });
                    }
                    // 충돌 시: source 답안 삭제 (target 유지)
                } else {
                    updatedAnswers.push(a);
                }
            }
            this.cache.answers = updatedAnswers;

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

                // 기존 학생이 반환된 경우, 해당 학생 정보로 업데이트
                if (result.isExisting) {
                    student.isExisting = true;
                    // 서버 응답에서 hasAccount 정보 사용
                    student.hasAccount = result.hasAccount || false;
                    student.username = result.username || null;
                }
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

    /**
     * API에서 시험의 모든 답안 가져오기 (기관 필터링 없이)
     */
    async fetchAnswersByExamId(examId) {
        try {
            const result = await this.request('GET', `/exams/${examId}/answers`);
            const answers = Array.isArray(result) ? result : (result.answers || result || []);
            return answers.map(a => new Answer(a));
        } catch (error) {
            console.error('Failed to fetch answers:', error);
            throw error;
        }
    }

    async loadAnswersByExamId(examId) {
        try {
            const result = await this.request('GET', `/exams/${examId}/answers`);
            // API가 배열을 직접 반환하거나 {answers: [...]} 형태로 반환할 수 있음
            const answers = Array.isArray(result) ? result : (result.answers || result || []);
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
        console.log('💾 saveAnswer 호출됨:', { examId: answer.examId, studentId: answer.studentId, questionId: answer.questionId });
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

        // API 호출하여 백엔드에 저장
        try {
            console.log('📡 API 호출 시작...');
            await this.request('PUT', `/exams/${answer.examId}/students/${answer.studentId}/answers`, {
                answers: [answer]
            });
            console.log('✅ 답안 저장 성공');
        } catch (error) {
            console.error('❌ Failed to save answer to backend:', error);
            throw error;
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

            // 캐시만 업데이트 (API 중복 호출 방지)
            for (const answer of answersArray) {
                if (!answer.id) {
                    answer.id = `answer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                const index = this.cache.answers.findIndex(a => a.id === answer.id);
                if (index >= 0) {
                    this.cache.answers[index] = new Answer(answer);
                } else {
                    this.cache.answers.push(new Answer(answer));
                }
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

    /**
     * API에서 시험 결과 가져오기 (모든 응시 학생 포함)
     * 채점 및 분석에서 사용 - 캐시된 학생에 의존하지 않음
     */
    async fetchExamResults(examId) {
        try {
            console.log(`📊 fetchExamResults 호출: examId=${examId}`);
            const results = await this.request('GET', `/exams/${examId}/results`);
            console.log(`📊 API 결과: ${results.length}명의 학생 데이터 수신`);
            return results.map(r => ({
                student: r.student,
                totalScore: r.totalScore,
                maxScore: r.maxScore,
                percentage: r.percentage,
                multipleChoiceScore: r.multipleChoiceScore,
                essayScore: r.essayScore,
                domainScores: r.domainScores,
                wrongQuestions: r.wrongQuestions,
                rank: r.rank,
                totalStudents: r.totalStudents
            }));
        } catch (error) {
            console.error('Failed to fetch exam results:', error);
            return [];
        }
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
                registrations: [],
                classes: []
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

    // === 학생 전용 API ===

    /**
     * 학생 본인 프로필 조회
     */
    async getMyProfile() {
        return await this.request('GET', '/student/me');
    }

    /**
     * 학생 본인 시험 목록 조회
     */
    async getMyExams() {
        return await this.request('GET', '/student/exams');
    }

    /**
     * 학생 본인 시험 결과 조회
     */
    async getMyResult(examId) {
        return await this.request('GET', `/student/exams/${examId}/result`);
    }

    /**
     * 학생 본인 오답 노트 조회
     */
    async getMyWrongNotes(examIds = []) {
        const params = examIds.length > 0 ? `?examIds=${examIds.join(',')}` : '';
        return await this.request('GET', `/student/wrong-notes${params}`);
    }

    // === 학생 계정 관리 API (기관 관리자용) ===

    /**
     * 학생 검색
     */
    async searchStudents(query, hasAccountOnly = null) {
        let params = `?q=${encodeURIComponent(query)}`;
        if (hasAccountOnly !== null) {
            params += `&hasAccount=${hasAccountOnly}`;
        }
        return await this.request('GET', `/students/search${params}`);
    }

    /**
     * 계정이 있는 학생 목록 조회
     */
    async getRegisteredStudents() {
        return await this.request('GET', '/students/registered');
    }

    /**
     * 학생 계정 생성
     */
    async createStudentAccount(studentId, accountData) {
        return await this.request('POST', `/students/${studentId}/account`, accountData);
    }

    /**
     * 학생 계정 삭제
     */
    async deleteStudentAccount(studentId) {
        return await this.request('DELETE', `/students/${studentId}/account`);
    }

    // === 수강반(Class) 관리 API ===

    /**
     * 수강반 목록 조회
     * @param {Object} params - 필터 파라미터 (organization 등)
     */
    async getClasses(params = {}) {
        let endpoint = '/classes';
        const queryParams = [];

        if (params.organization) {
            queryParams.push(`organization=${encodeURIComponent(params.organization)}`);
        }

        if (queryParams.length > 0) {
            endpoint += '?' + queryParams.join('&');
        }

        return await this.request('GET', endpoint);
    }

    /**
     * 수강반 상세 조회
     */
    async getClass(classId) {
        return await this.request('GET', `/classes/${classId}`);
    }

    /**
     * 수강반 생성
     */
    async createClass(classData) {
        return await this.request('POST', '/classes', classData);
    }

    /**
     * 수강반 수정
     */
    async updateClass(classId, classData) {
        return await this.request('PUT', `/classes/${classId}`, classData);
    }

    /**
     * 수강반 삭제
     */
    async deleteClass(classId) {
        return await this.request('DELETE', `/classes/${classId}`);
    }

    /**
     * 수강반 학생 목록 조회
     */
    async getClassStudents(classId) {
        return await this.request('GET', `/classes/${classId}/students`);
    }

    /**
     * 수강반에 학생 추가
     */
    async addStudentsToClass(classId, studentIds) {
        return await this.request('POST', `/classes/${classId}/students`, { studentIds });
    }

    /**
     * 수강반에서 학생 제거
     */
    async removeStudentFromClass(classId, studentId) {
        return await this.request('DELETE', `/classes/${classId}/students/${studentId}`);
    }

    /**
     * 학생의 수강반 목록 조회
     */
    async getStudentClasses(studentId) {
        return await this.request('GET', `/students/${studentId}/classes`);
    }
}

// 싱글톤 인스턴스 (기존 storage 변수명 유지)
const storage = new ApiClient();
// 학생 페이지에서 사용하는 별칭
const apiClient = storage;
