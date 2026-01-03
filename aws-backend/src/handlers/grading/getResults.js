/**
 * Get Results Handler
 * GET /api/v1/exams/{examId}/results
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const examId = getPathParam(event, 'examId');
        if (!examId) {
            return error('Exam ID is required', 400);
        }

        // Get exam
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');
        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization (국어농장 exams are accessible to all)
        if (user.role !== 'admin' && exam.organization !== user.organization && exam.organization !== '국어농장') {
            return forbidden('You do not have access to this exam');
        }

        // Get questions for this exam
        const questions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);
        const questionMap = new Map(questions.map(q => [q.questionId, q]));

        // Get all answers for this exam
        const answers = await queryByIndex(
            Tables.ANSWERS,
            'examId-index',
            'examId = :examId',
            { ':examId': examId }
        );

        // Group answers by student
        const studentAnswersMap = new Map();
        for (const answer of answers) {
            if (!studentAnswersMap.has(answer.studentId)) {
                studentAnswersMap.set(answer.studentId, []);
            }
            studentAnswersMap.get(answer.studentId).push(answer);
        }

        // Calculate results for each student
        const results = [];
        for (const [studentId, studentAnswers] of studentAnswersMap) {
            // Get student info
            const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
            if (!student) continue;

            const result = calculateResult(exam, student, questions, studentAnswers);
            results.push(result);
        }

        // Sort by total score descending and assign ranks
        results.sort((a, b) => b.totalScore - a.totalScore);

        let currentRank = 1;
        for (let i = 0; i < results.length; i++) {
            if (i > 0 && results[i].totalScore !== results[i - 1].totalScore) {
                currentRank = i + 1;
            }
            results[i].rank = currentRank;
            results[i].totalStudents = results.length;
        }

        return success(results);
    } catch (err) {
        console.error('Get results error:', err);
        return error('Failed to get results', 500);
    }
};

function calculateResult(exam, student, questions, answers) {
    let totalScore = 0;
    let maxScore = 0;
    let multipleChoiceScore = 0;
    let essayScore = 0;
    const domainScores = {};
    const wrongQuestions = [];

    // Initialize domain scores
    for (const q of questions) {
        if (!domainScores[q.domain]) {
            domainScores[q.domain] = {
                score: 0,
                maxScore: 0,
                correct: 0,
                total: 0
            };
        }
        domainScores[q.domain].maxScore += q.points;
        domainScores[q.domain].total += 1;
        maxScore += q.points;
    }

    // Calculate scores
    const answerMap = new Map(answers.map(a => [a.questionId, a]));

    for (const question of questions) {
        const answer = answerMap.get(question.questionId);
        if (!answer) continue;

        let earnedScore = 0;
        let isCorrect = false;

        if (question.type === '객관식') {
            isCorrect = answer.answerText === question.correctAnswer;
            earnedScore = isCorrect ? question.points : 0;
            multipleChoiceScore += earnedScore;
        } else if (question.type === '서술형') {
            earnedScore = answer.scoreReceived !== null ? answer.scoreReceived : 0;
            isCorrect = earnedScore === question.points;
            essayScore += earnedScore;
        }

        totalScore += earnedScore;

        if (domainScores[question.domain]) {
            domainScores[question.domain].score += earnedScore;
            if (isCorrect) {
                domainScores[question.domain].correct += 1;
            }
        }

        // Record wrong answers
        if (!isCorrect) {
            wrongQuestions.push({
                questionNumber: question.number,
                questionType: question.type,
                domain: question.domain,
                subDomain: question.subDomain,
                passage: question.passage,
                points: question.points,
                correctAnswer: question.correctAnswer,
                studentAnswer: answer.answerText,
                scoreReceived: answer.scoreReceived,
                choiceExplanations: question.choiceExplanations
            });
        }
    }

    return {
        student: {
            id: student.studentId,
            name: student.name,
            school: student.school,
            grade: student.grade
        },
        totalScore,
        maxScore,
        percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
        multipleChoiceScore,
        essayScore,
        domainScores,
        wrongQuestions,
        rank: 0,
        totalStudents: 0
    };
}
