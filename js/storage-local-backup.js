/**
 * 로컬 스토리지 기반 데이터 저장소
 * 단일 진실 공급원(Single Source of Truth)
 */

class DataStorage {
    constructor() {
        this.STORAGE_KEYS = {
            EXAMS: 'gradeapp_exams',
            QUESTIONS: 'gradeapp_questions',
            STUDENTS: 'gradeapp_students',
            ANSWERS: 'gradeapp_answers'
        };
    }

    // === 시험(Exam) 관리 ===

    getAllExams() {
        const data = localStorage.getItem(this.STORAGE_KEYS.EXAMS);
        return data ? JSON.parse(data).map(e => new Exam(e)) : [];
    }

    getExam(id) {
        const exams = this.getAllExams();
        const exam = exams.find(e => e.id === id);
        return exam ? new Exam(exam) : null;
    }

    saveExam(exam) {
        const exams = this.getAllExams();
        const index = exams.findIndex(e => e.id === exam.id);

        exam.updatedAt = new Date().toISOString();

        if (index >= 0) {
            exams[index] = exam;
        } else {
            exams.push(exam);
        }

        localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(exams));
        return exam;
    }

    deleteExam(id) {
        const exams = this.getAllExams().filter(e => e.id !== id);
        localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(exams));

        // 관련 문제와 답안도 삭제
        this.deleteQuestionsByExamId(id);
        this.deleteAnswersByExamId(id);
    }

    // === 문제(Question) 관리 ===

    getAllQuestions() {
        const data = localStorage.getItem(this.STORAGE_KEYS.QUESTIONS);
        return data ? JSON.parse(data).map(q => new Question(q)) : [];
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

    saveQuestion(question) {
        const questions = this.getAllQuestions();
        const index = questions.findIndex(q => q.id === question.id);

        if (index >= 0) {
            questions[index] = question;
        } else {
            questions.push(question);
        }

        localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
        return question;
    }

    saveQuestions(questionsArray) {
        questionsArray.forEach(q => this.saveQuestion(q));
    }

    deleteQuestion(id) {
        const questions = this.getAllQuestions().filter(q => q.id !== id);
        localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));

        // 관련 답안도 삭제
        this.deleteAnswersByQuestionId(id);
    }

    deleteQuestionsByExamId(examId) {
        const questions = this.getAllQuestions().filter(q => q.examId !== examId);
        localStorage.setItem(this.STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
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
        const data = localStorage.getItem(this.STORAGE_KEYS.STUDENTS);
        return data ? JSON.parse(data).map(s => new Student(s)) : [];
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
    mergeStudents(targetId, sourceId) {
        if (targetId === sourceId) {
            throw new Error('같은 학생은 병합할 수 없습니다.');
        }

        const target = this.getStudent(targetId);
        const source = this.getStudent(sourceId);

        if (!target || !source) {
            throw new Error('학생을 찾을 수 없습니다.');
        }

        // source 학생의 모든 답안을 target 학생으로 변경
        const allAnswers = this.getAllAnswers();
        const updatedAnswers = allAnswers.map(a => {
            if (a.studentId === sourceId) {
                a.studentId = targetId;
            }
            return a;
        });

        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(updatedAnswers));

        // source 학생 삭제
        this.deleteStudent(sourceId);

        return target;
    }

    saveStudent(student) {
        const students = this.getAllStudents();
        const index = students.findIndex(s => s.id === student.id);

        if (index >= 0) {
            students[index] = student;
        } else {
            students.push(student);
        }

        localStorage.setItem(this.STORAGE_KEYS.STUDENTS, JSON.stringify(students));
        return student;
    }

    deleteStudent(id) {
        const students = this.getAllStudents().filter(s => s.id !== id);
        localStorage.setItem(this.STORAGE_KEYS.STUDENTS, JSON.stringify(students));

        // 관련 답안도 삭제
        this.deleteAnswersByStudentId(id);
    }

    // === 답안(Answer) 관리 ===

    getAllAnswers() {
        const data = localStorage.getItem(this.STORAGE_KEYS.ANSWERS);
        return data ? JSON.parse(data).map(a => new Answer(a)) : [];
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

    saveAnswer(answer) {
        const answers = this.getAllAnswers();

        // ID가 있으면 ID로 찾고, 없으면 examId + studentId + questionId 조합으로 찾기
        let index = answers.findIndex(a => a.id === answer.id);

        if (index < 0) {
            // ID로 못 찾으면 같은 시험/학생/문제 조합의 기존 답안 찾기 (중복 방지)
            index = answers.findIndex(a =>
                a.examId === answer.examId &&
                a.studentId === answer.studentId &&
                a.questionId === answer.questionId
            );

            // 기존 답안이 있으면 그 ID를 사용
            if (index >= 0) {
                answer.id = answers[index].id;
            }
        }

        answer.updatedAt = new Date().toISOString();

        if (index >= 0) {
            answers[index] = answer;
        } else {
            answers.push(answer);
        }

        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
        return answer;
    }

    saveAnswers(answersArray) {
        answersArray.forEach(a => this.saveAnswer(a));
    }

    deleteAnswer(id) {
        const answers = this.getAllAnswers().filter(a => a.id !== id);
        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
    }

    deleteAnswersByExamId(examId) {
        const answers = this.getAllAnswers().filter(a => a.examId !== examId);
        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
    }

    deleteAnswersByStudentId(studentId) {
        const answers = this.getAllAnswers().filter(a => a.studentId !== studentId);
        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
    }

    deleteAnswersByQuestionId(questionId) {
        const answers = this.getAllAnswers().filter(a => a.questionId !== questionId);
        localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(answers));
    }

    /**
     * 중복 답안 제거 (같은 시험/학생/문제 조합)
     * 가장 최근에 업데이트된 답안만 남김
     */
    removeDuplicateAnswers() {
        const answers = this.getAllAnswers();
        const uniqueAnswers = [];
        const seenKeys = new Set();

        // updatedAt 기준으로 최신순 정렬
        answers.sort((a, b) => {
            const dateA = new Date(a.updatedAt || 0);
            const dateB = new Date(b.updatedAt || 0);
            return dateB - dateA; // 최신이 먼저
        });

        // 중복 제거 (최신 것만 유지)
        answers.forEach(answer => {
            const key = `${answer.examId}_${answer.studentId}_${answer.questionId}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueAnswers.push(answer);
            }
        });

        const removedCount = answers.length - uniqueAnswers.length;

        if (removedCount > 0) {
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(uniqueAnswers));
            console.log(`중복 답안 ${removedCount}개가 제거되었습니다.`);
        } else {
            console.log('중복 답안이 없습니다.');
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
            localStorage.setItem(this.STORAGE_KEYS.ANSWERS, JSON.stringify(validAnswers));
            console.log(`고아 답안 ${removedCount}개가 제거되었습니다.`);
        }

        return removedCount;
    }

    // === 데이터 디버깅 ===

    /**
     * 특정 시험의 모든 문제 데이터 출력 (디버깅용)
     */
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

    // === 시험 결과 계산 ===

    getExamResult(examId, studentId) {
        const exam = this.getExam(examId);
        const student = this.getStudent(studentId);
        const questions = this.getQuestionsByExamId(examId);
        const answers = this.getAnswersByExamAndStudent(examId, studentId);

        if (!exam || !student || questions.length === 0) {
            return null;
        }

        const result = new ExamResult(exam, student, questions, answers);

        // 등수 계산을 위해 모든 결과 가져오기
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

        // 시험을 본 학생 ID 추출
        const studentIds = [...new Set(allAnswers.map(a => a.studentId))];

        const results = studentIds.map(studentId => {
            const student = this.getStudent(studentId);
            const answers = allAnswers.filter(a => a.studentId === studentId);
            return { student, exam, questions, answers };
        }).filter(data => data.student !== null) // 존재하지 않는 학생 필터링
        .map(data => new ExamResult(data.exam, data.student, data.questions, data.answers));

        // 점수 순으로 정렬하고 등수 계산 (동점자 처리)
        results.sort((a, b) => b.totalScore - a.totalScore);

        let currentRank = 1;
        results.forEach((result, index) => {
            // 이전 학생과 점수가 다르면 등수 업데이트
            if (index > 0 && results[index - 1].totalScore !== result.totalScore) {
                currentRank = index + 1;
            }
            result.rank = currentRank;
            result.totalStudents = results.length;
        });

        return results;
    }

    // === 데이터 전체 삭제 (초기화) ===

    clearAllData() {
        Object.values(this.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }

    // === 데이터 내보내기/가져오기 (백업) ===

    exportAllData() {
        return {
            exams: this.getAllExams(),
            questions: this.getAllQuestions(),
            students: this.getAllStudents(),
            answers: this.getAllAnswers(),
            exportedAt: new Date().toISOString()
        };
    }

    importAllData(data) {
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

// 싱글톤 인스턴스
const storage = new DataStorage();
