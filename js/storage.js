/**
 * Firebase Realtime Database 기반 데이터 저장소
 * 단일 진실 공급원(Single Source of Truth)
 */

class DataStorage {
    constructor() {
        this.useFirebase = typeof firebase !== 'undefined' && typeof firebaseDatabase !== 'undefined';
        this.cache = {
            exams: [],
            questions: [],
            students: [],
            answers: []
        };
        this.cacheLoaded = false;

        if (this.useFirebase) {
            console.log('🔥 Firebase 모드로 실행');
            this.loadAllDataToCache();
        } else {
            console.log('💾 로컬 스토리지 모드로 실행 (Firebase 연결 실패)');
            this.STORAGE_KEYS = {
                EXAMS: 'gradeapp_exams',
                QUESTIONS: 'gradeapp_questions',
                STUDENTS: 'gradeapp_students',
                ANSWERS: 'gradeapp_answers'
            };
        }
    }

    // === Firebase 초기 데이터 로드 ===
    async loadAllDataToCache() {
        if (!this.useFirebase) return;

        try {
            const snapshot = await firebaseDatabase.ref('/').once('value');
            const data = snapshot.val() || {};

            this.cache.exams = Object.values(data.exams || {}).map(e => new Exam(e));
            this.cache.questions = Object.values(data.questions || {}).map(q => new Question(q));
            this.cache.students = Object.values(data.students || {}).map(s => new Student(s));
            this.cache.answers = Object.values(data.answers || {}).map(a => new Answer(a));

            this.cacheLoaded = true;
            console.log('✅ Firebase 데이터 로드 완료:', {
                exams: this.cache.exams.length,
                questions: this.cache.questions.length,
                students: this.cache.students.length,
                answers: this.cache.answers.length
            });
        } catch (error) {
            console.error('❌ Firebase 데이터 로드 실패:', error);
            this.useFirebase = false;
        }
    }

    // === 시험(Exam) 관리 ===

    getAllExams() {
        if (this.useFirebase) {
            return this.cache.exams;
        } else {
            const data = localStorage.getItem(this.STORAGE_KEYS.EXAMS);
            return data ? JSON.parse(data).map(e => new Exam(e)) : [];
        }
    }

    getExam(id) {
        const exams = this.getAllExams();
        const exam = exams.find(e => e.id === id);
        return exam ? new Exam(exam) : null;
    }

    async saveExam(exam) {
        exam.updatedAt = new Date().toISOString();

        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`exams/${exam.id}`).set(exam);

                // 캐시 업데이트
                const index = this.cache.exams.findIndex(e => e.id === exam.id);
                if (index >= 0) {
                    this.cache.exams[index] = exam;
                } else {
                    this.cache.exams.push(exam);
                }
            } catch (error) {
                console.error('Firebase 저장 실패:', error);
                alert('데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요.');
            }
        } else {
            const exams = this.getAllExams();
            const index = exams.findIndex(e => e.id === exam.id);

            if (index >= 0) {
                exams[index] = exam;
            } else {
                exams.push(exam);
            }

            localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(exams));
        }

        return exam;
    }

    async deleteExam(id) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`exams/${id}`).remove();
                this.cache.exams = this.cache.exams.filter(e => e.id !== id);

                // 관련 문제와 답안도 삭제
                await this.deleteQuestionsByExamId(id);
                await this.deleteAnswersByExamId(id);
            } catch (error) {
                console.error('Firebase 삭제 실패:', error);
            }
        } else {
            const exams = this.getAllExams().filter(e => e.id !== id);
            localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(exams));

            this.deleteQuestionsByExamId(id);
            this.deleteAnswersByExamId(id);
        }
    }

    // === 문제(Question) 관리 ===

    getAllQuestions() {
        if (this.useFirebase) {
            return this.cache.questions;
        } else {
            const data = localStorage.getItem(this.STORAGE_KEYS.QUESTIONS);
            return data ? JSON.parse(data).map(q => new Question(q)) : [];
        }
    }

    getQuestion(id) {
        const questions = this.getAllQuestions();
        const question = questions.find(q => q.id === id);
        return question ? new Question(question) : null;
    }

    getQuestionsByExamId(examId) {
        return this.getAllQuestions()
            .filter(q => q.examId === examId)
            .sort((a, b) => a.number - b.number);
    }

    async saveQuestion(question) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`questions/${question.id}`).set(question);

                const index = this.cache.questions.findIndex(q => q.id === question.id);
                if (index >= 0) {
                    this.cache.questions[index] = question;
                } else {
                    this.cache.questions.push(question);
                }
            } catch (error) {
                console.error('Firebase 저장 실패:', error);
            }
        } else {
            const questions = this.getAllQuestions();
            const index = questions.findIndex(q => q.id === question.id);

            if (index >= 0) {
                questions[index] = question;
            } else {
                questions.push(question);
            }

            localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
        }

        return question;
    }

    async saveQuestions(questionsArray) {
        for (const q of questionsArray) {
            await this.saveQuestion(q);
        }
    }

    async deleteQuestion(id) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`questions/${id}`).remove();
                this.cache.questions = this.cache.questions.filter(q => q.id !== id);
                await this.deleteAnswersByQuestionId(id);
            } catch (error) {
                console.error('Firebase 삭제 실패:', error);
            }
        } else {
            const questions = this.getAllQuestions().filter(q => q.id !== id);
            localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
            this.deleteAnswersByQuestionId(id);
        }
    }

    async deleteQuestionsByExamId(examId) {
        if (this.useFirebase) {
            const questionsToDelete = this.cache.questions.filter(q => q.examId === examId);
            for (const q of questionsToDelete) {
                await firebaseDatabase.ref(`questions/${q.id}`).remove();
            }
            this.cache.questions = this.cache.questions.filter(q => q.examId !== examId);
        } else {
            const questions = this.getAllQuestions().filter(q => q.examId !== examId);
            localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
        }
    }

    // === 학생(Student) 관리 ===

    /**
     * 학생 정보 정규화 함수들
     */
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
        if (this.useFirebase) {
            return this.cache.students;
        } else {
            const data = localStorage.getItem(this.STORAGE_KEYS.STUDENTS);
            return data ? JSON.parse(data).map(s => new Student(s)) : [];
        }
    }

    getStudent(id) {
        const students = this.getAllStudents();
        const student = students.find(s => s.id === id);
        return student ? new Student(student) : null;
    }

    getStudentByName(name, school, grade) {
        const students = this.getAllStudents();

        // 먼저 정확히 일치하는 학생 찾기
        let student = students.find(s =>
            s.name === name &&
            s.school === school &&
            s.grade === grade
        );

        // 정확히 일치하는 학생이 없으면 정규화하여 찾기
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

    /**
     * 중복 가능성이 있는 학생 찾기
     */
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

        // 2명 이상인 그룹만 반환
        return Array.from(groups.values()).filter(group => group.length > 1);
    }

    /**
     * 학생 병합 (sourceId의 모든 답안을 targetId로 이전)
     */
    async mergeStudents(targetId, sourceId) {
        if (targetId === sourceId) {
            throw new Error('같은 학생은 병합할 수 없습니다.');
        }

        const target = this.getStudent(targetId);
        const source = this.getStudent(sourceId);

        if (!target || !source) {
            throw new Error('학생을 찾을 수 없습니다.');
        }

        // source 학생의 모든 답안을 target 학생으로 변경
        const sourceAnswers = this.getAllAnswers().filter(a => a.studentId === sourceId);

        for (const answer of sourceAnswers) {
            answer.studentId = targetId;
            await this.saveAnswer(answer);
        }

        // source 학생 삭제
        await this.deleteStudent(sourceId);

        return target;
    }

    async saveStudent(student) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`students/${student.id}`).set(student);

                const index = this.cache.students.findIndex(s => s.id === student.id);
                if (index >= 0) {
                    this.cache.students[index] = student;
                } else {
                    this.cache.students.push(student);
                }
            } catch (error) {
                console.error('Firebase 저장 실패:', error);
            }
        } else {
            const students = this.getAllStudents();
            const index = students.findIndex(s => s.id === student.id);

            if (index >= 0) {
                students[index] = student;
            } else {
                students.push(student);
            }

            localStorage.setItem(this.STORAGE_KEYS.STUDENTS, JSON.stringify(students));
        }

        return student;
    }

    async deleteStudent(id) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`students/${id}`).remove();
                this.cache.students = this.cache.students.filter(s => s.id !== id);
                await this.deleteAnswersByStudentId(id);
            } catch (error) {
                console.error('Firebase 삭제 실패:', error);
            }
        } else {
            const students = this.getAllStudents().filter(s => s.id !== id);
            localStorage.setItem(this.STORAGE_KEYS.STUDENTS, JSON.stringify(students));
            this.deleteAnswersByStudentId(id);
        }
    }

    // === 답안(Answer) 관리 ===

    getAllAnswers() {
        if (this.useFirebase) {
            return this.cache.answers;
        } else {
            const data = localStorage.getItem(this.STORAGE_KEYS.ANSWERS);
            return data ? JSON.parse(data).map(a => new Answer(a)) : [];
        }
    }

    getAnswer(id) {
        const answers = this.getAllAnswers();
        const answer = answers.find(a => a.id === id);
        return answer ? new Answer(answer) : null;
    }

    getAnswersByExamAndStudent(examId, studentId) {
        return this.getAllAnswers()
            .filter(a => a.examId === examId && a.studentId === studentId);
    }

    getAnswersByExamId(examId) {
        return this.getAllAnswers()
            .filter(a => a.examId === examId);
    }

    async saveAnswer(answer) {
        answer.updatedAt = new Date().toISOString();

        if (this.useFirebase) {
            try {
                // 중복 방지: examId + studentId + questionId 조합으로 ID 생성
                if (!answer.id) {
                    const existingIndex = this.cache.answers.findIndex(a =>
                        a.examId === answer.examId &&
                        a.studentId === answer.studentId &&
                        a.questionId === answer.questionId
                    );
                    if (existingIndex >= 0) {
                        answer.id = this.cache.answers[existingIndex].id;
                    }
                }

                await firebaseDatabase.ref(`answers/${answer.id}`).set(answer);

                const index = this.cache.answers.findIndex(a => a.id === answer.id);
                if (index >= 0) {
                    this.cache.answers[index] = answer;
                } else {
                    this.cache.answers.push(answer);
                }
            } catch (error) {
                console.error('Firebase 저장 실패:', error);
            }
        } else {
            const answers = this.getAllAnswers();
            let index = answers.findIndex(a => a.id === answer.id);

            if (index < 0) {
                index = answers.findIndex(a =>
                    a.examId === answer.examId &&
                    a.studentId === answer.studentId &&
                    a.questionId === answer.questionId
                );

                if (index >= 0) {
                    answer.id = answers[index].id;
                }
            }

            if (index >= 0) {
                answers[index] = answer;
            } else {
                answers.push(answer);
            }

            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        }

        return answer;
    }

    async saveAnswers(answersArray) {
        for (const a of answersArray) {
            await this.saveAnswer(a);
        }
    }

    async deleteAnswer(id) {
        if (this.useFirebase) {
            try {
                await firebaseDatabase.ref(`answers/${id}`).remove();
                this.cache.answers = this.cache.answers.filter(a => a.id !== id);
            } catch (error) {
                console.error('Firebase 삭제 실패:', error);
            }
        } else {
            const answers = this.getAllAnswers().filter(a => a.id !== id);
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        }
    }

    async deleteAnswersByExamId(examId) {
        if (this.useFirebase) {
            const answersToDelete = this.cache.answers.filter(a => a.examId === examId);
            for (const a of answersToDelete) {
                await firebaseDatabase.ref(`answers/${a.id}`).remove();
            }
            this.cache.answers = this.cache.answers.filter(a => a.examId !== examId);
        } else {
            const answers = this.getAllAnswers().filter(a => a.examId !== examId);
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        }
    }

    async deleteAnswersByStudentId(studentId) {
        if (this.useFirebase) {
            const answersToDelete = this.cache.answers.filter(a => a.studentId === studentId);
            for (const a of answersToDelete) {
                await firebaseDatabase.ref(`answers/${a.id}`).remove();
            }
            this.cache.answers = this.cache.answers.filter(a => a.studentId !== studentId);
        } else {
            const answers = this.getAllAnswers().filter(a => a.studentId !== studentId);
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        }
    }

    async deleteAnswersByQuestionId(questionId) {
        if (this.useFirebase) {
            const answersToDelete = this.cache.answers.filter(a => a.questionId === questionId);
            for (const a of answersToDelete) {
                await firebaseDatabase.ref(`answers/${a.id}`).remove();
            }
            this.cache.answers = this.cache.answers.filter(a => a.questionId !== questionId);
        } else {
            const answers = this.getAllAnswers().filter(a => a.questionId !== questionId);
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        }
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
            if (this.useFirebase) {
                this.cache.answers = uniqueAnswers;
            } else {
                localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(uniqueAnswers));
            }
            console.log(`중복 답안 ${removedCount}개가 제거되었습니다.`);
        }

        return removedCount;
    }

    /**
     * 존재하지 않는 학생/시험/문제의 답안 제거 (고아 답안 정리)
     */
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
            if (this.useFirebase) {
                this.cache.answers = validAnswers;
                // Firebase에서도 삭제
                const deletePromises = answers
                    .filter(a => !validAnswers.find(v => v.id === a.id))
                    .map(a => firebaseDatabase.ref(`answers/${a.id}`).remove());
                Promise.all(deletePromises).catch(error => {
                    console.error('고아 답안 삭제 실패:', error);
                });
            } else {
                localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(validAnswers));
            }
            console.log(`고아 답안 ${removedCount}개가 제거되었습니다.`);
        }

        return removedCount;
    }

    /**
     * 답안이 없는 학생 삭제
     */
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
        }).filter(data => data.student !== null) // 존재하지 않는 학생 필터링
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

    clearAllData() {
        if (this.useFirebase) {
            if (confirm('⚠️ Firebase의 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다!')) {
                firebaseDatabase.ref('/').remove();
                this.cache = { exams: [], questions: [], students: [], answers: [] };
            }
        } else {
            Object.values(this.STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
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
        if (this.useFirebase) {
            try {
                const updates = {};

                if (data.exams) {
                    data.exams.forEach(e => updates[`exams/${e.id}`] = e);
                }
                if (data.questions) {
                    data.questions.forEach(q => updates[`questions/${q.id}`] = q);
                }
                if (data.students) {
                    data.students.forEach(s => updates[`students/${s.id}`] = s);
                }
                if (data.answers) {
                    data.answers.forEach(a => updates[`answers/${a.id}`] = a);
                }

                await firebaseDatabase.ref('/').update(updates);
                await this.loadAllDataToCache();
            } catch (error) {
                console.error('Firebase 가져오기 실패:', error);
            }
        } else {
            if (data.exams) {
                localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(data.exams));
            }
            if (data.questions) {
                localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(data.questions));
            }
            if (data.students) {
                localStorage.setItem(this.STORAGE_KEYS.STUDENTS, JSON.stringify(data.students));
            }
            if (data.answers) {
                localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(data.answers));
            }
        }
    }
}

// 싱글톤 인스턴스
const storage = new DataStorage();
