/**
 * 데이터 모델 정의
 * 정규화된 구조로 시험, 문제, 학생, 답안을 분리
 */

// 유틸리티: UUID 생성
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 시험 클래스
 */
class Exam {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.name = data.name || '';
        this.organization = data.organization || '국어농장'; // 시행 기관
        this.school = data.school || '';
        this.grade = data.grade || '';
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.series = data.series || ''; // 시리즈 (예: "1학기 중간", "2학기 기말")
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            organization: this.organization,
            school: this.school,
            grade: this.grade,
            date: this.date,
            series: this.series,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

/**
 * 문제 클래스
 */
class Question {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.examId = data.examId || '';
        this.number = data.number || 1;
        this.type = data.type || '객관식'; // '객관식' 또는 '서술형'
        this.domain = data.domain || ''; // 영역 (대분류, 예: "문학", "독서", "문법")
        this.subDomain = data.subDomain || ''; // 세부 영역 (소분류, 예: "고전 시가", "현대 소설")
        this.passage = data.passage || ''; // 작품/지문/단원
        this.points = data.points || 0;
        this.correctAnswer = data.correctAnswer || ''; // 객관식: "1", 서술형: 모범 답안
        this.choiceExplanations = data.choiceExplanations || {}; // 객관식 선택지 해설 {'1': '해설', '2': '해설', ...}
        this.intent = data.intent || ''; // 출제 의도
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            examId: this.examId,
            number: this.number,
            type: this.type,
            domain: this.domain,
            subDomain: this.subDomain,
            passage: this.passage,
            points: this.points,
            correctAnswer: this.correctAnswer,
            choiceExplanations: this.choiceExplanations,
            intent: this.intent,
            createdAt: this.createdAt
        };
    }
}

/**
 * 학생 클래스
 */
class Student {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.name = data.name || '';
        this.school = data.school || '';
        this.grade = data.grade || '';
        this.organization = data.organization || '국어농장'; // 소속 기관
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            school: this.school,
            grade: this.grade,
            organization: this.organization,
            createdAt: this.createdAt
        };
    }
}

/**
 * 답안 클래스
 */
class Answer {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.examId = data.examId || '';
        this.studentId = data.studentId || '';
        this.questionId = data.questionId || '';
        this.answerText = data.answerText || ''; // 객관식: "1", 서술형: 실제 답안 텍스트
        this.scoreReceived = data.scoreReceived !== undefined ? data.scoreReceived : null; // 서술형 수동 채점 점수
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            examId: this.examId,
            studentId: this.studentId,
            questionId: this.questionId,
            answerText: this.answerText,
            scoreReceived: this.scoreReceived,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

/**
 * 시험 결과 (계산되는 데이터, 저장하지 않음)
 */
class ExamResult {
    constructor(exam, student, questions, answers) {
        this.exam = exam;
        this.student = student;
        this.totalScore = 0;
        this.maxScore = 0;
        this.multipleChoiceScore = 0;
        this.essayScore = 0;
        this.domainScores = {}; // {domain: {score, maxScore, correct, total}}
        this.wrongQuestions = []; // [{question, answer, feedback}]
        this.rank = 0;
        this.totalStudents = 0;

        this.calculate(questions, answers);
    }

    calculate(questions, answers) {
        // 영역별 점수 초기화
        questions.forEach(q => {
            if (!this.domainScores[q.domain]) {
                this.domainScores[q.domain] = {
                    score: 0,
                    maxScore: 0,
                    correct: 0,
                    total: 0
                };
            }
            this.domainScores[q.domain].maxScore += q.points;
            this.domainScores[q.domain].total += 1;
            this.maxScore += q.points;
        });

        // 답안 채점
        answers.forEach(answer => {
            const question = questions.find(q => q.id === answer.questionId);
            if (!question) return;

            let earnedScore = 0;
            let isCorrect = false;

            if (question.type === '객관식') {
                // 객관식: 정답과 비교
                isCorrect = answer.answerText === question.correctAnswer;
                earnedScore = isCorrect ? question.points : 0;
                this.multipleChoiceScore += earnedScore;
            } else if (question.type === '서술형') {
                // 서술형: scoreReceived 사용 (수동 채점)
                earnedScore = answer.scoreReceived !== null ? answer.scoreReceived : 0;
                isCorrect = earnedScore === question.points;
                this.essayScore += earnedScore;
            }

            this.totalScore += earnedScore;
            this.domainScores[question.domain].score += earnedScore;
            if (isCorrect) {
                this.domainScores[question.domain].correct += 1;
            }

            // 오답 기록
            if (!isCorrect) {
                this.wrongQuestions.push({
                    question: question,
                    answer: answer,
                    feedback: this.generateFeedback(question, answer)
                });
            }
        });
    }

    generateFeedback(question, answer) {
        if (question.type === '객관식') {
            // 객관식: 정답, 학생 답, 해설
            const choiceExplanations = question.choiceExplanations || {};
            const selectedExplanation = choiceExplanations[answer.answerText] || '';

            let feedback = `정답: ${question.correctAnswer}번 / 학생 답: ${answer.answerText}번`;

            if (selectedExplanation) {
                feedback += `\n\n해설:\n${selectedExplanation}`;
            }

            return feedback;
        } else {
            // 서술형: 배점, 획득 점수, 모범 답안
            let feedback = `배점: ${question.points}점 / 획득 점수: ${answer.scoreReceived}점`;

            // correctAnswer가 있고, 의미있는 내용인 경우만 표시
            if (question.correctAnswer &&
                question.correctAnswer.trim() !== '' &&
                question.correctAnswer !== '서술형') {
                feedback += `\n\n모범 답안:\n${question.correctAnswer}`;
            }

            return feedback;
        }
    }

    toJSON() {
        return {
            exam: this.exam.toJSON(),
            student: this.student.toJSON(),
            totalScore: this.totalScore,
            maxScore: this.maxScore,
            multipleChoiceScore: this.multipleChoiceScore,
            essayScore: this.essayScore,
            domainScores: this.domainScores,
            wrongQuestions: this.wrongQuestions.map(wq => ({
                questionNumber: wq.question.number,
                questionText: wq.question.passage,
                studentAnswer: wq.answer.answerText,
                correctAnswer: wq.question.correctAnswer,
                feedback: wq.feedback
            })),
            rank: this.rank,
            totalStudents: this.totalStudents
        };
    }
}

/**
 * 사용자 클래스
 */
class User {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.username = data.username || '';
        this.passwordHash = data.passwordHash || '';
        this.salt = data.salt || '';
        this.name = data.name || '';
        this.email = data.email || '';
        this.organization = data.organization || '';
        this.role = data.role || 'pending'; // 'admin', 'org_admin', 'pending'
        this.isActive = data.isActive !== undefined ? data.isActive : false;
        this.createdAt = data.createdAt || new Date().toISOString();
        this.lastLoginAt = data.lastLoginAt || null;
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            passwordHash: this.passwordHash,
            salt: this.salt,
            name: this.name,
            email: this.email,
            organization: this.organization,
            role: this.role,
            isActive: this.isActive,
            createdAt: this.createdAt,
            lastLoginAt: this.lastLoginAt
        };
    }
}

/**
 * 가입 신청 클래스
 */
class RegistrationRequest {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.username = data.username || '';
        this.passwordHash = data.passwordHash || '';
        this.salt = data.salt || '';
        this.name = data.name || '';
        this.email = data.email || '';
        this.organization = data.organization || '';
        this.status = data.status || 'pending'; // 'pending', 'approved', 'rejected'
        this.createdAt = data.createdAt || new Date().toISOString();
        this.processedAt = data.processedAt || null;
        this.processedBy = data.processedBy || null;
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            passwordHash: this.passwordHash,
            salt: this.salt,
            name: this.name,
            email: this.email,
            organization: this.organization,
            status: this.status,
            createdAt: this.createdAt,
            processedAt: this.processedAt,
            processedBy: this.processedBy
        };
    }
}
