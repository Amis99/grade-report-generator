/**
 * Get My Result Handler
 * GET /api/v1/student/exams/{examId}/result
 *
 * Returns the current student's result for a specific exam.
 * Includes score, rank, and wrong questions.
 * Only accessible by users with student role.
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, notFound, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only student role can access this endpoint
        if (user.role !== 'student') {
            return forbidden('This endpoint is only for students');
        }

        const studentId = user.studentId;
        if (!studentId) {
            return error('Student ID not found in your account', 400);
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

        // Get student
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return notFound('Student not found');
        }

        // Get questions
        const questions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);

        // Get student's answers
        const answers = await queryByPK(Tables.ANSWERS, `EXAM#${examId}#STUDENT#${studentId}`);

        if (answers.length === 0) {
            return notFound('No answers found for this exam');
        }

        // Calculate result
        const result = calculateStudentResult(exam, student, questions, answers);

        // Get all results to calculate rank
        const allAnswers = await queryByIndex(
            Tables.ANSWERS,
            'examId-index',
            'examId = :examId',
            { ':examId': examId }
        );

        const studentIds = [...new Set(allAnswers.map(a => a.studentId))];
        const allScores = [];

        for (const sid of studentIds) {
            const studentAnswers = allAnswers.filter(a => a.studentId === sid);
            let totalScore = 0;

            for (const question of questions) {
                const answer = studentAnswers.find(a => a.questionId === question.questionId);
                if (!answer) continue;

                if (question.type === '객관식') {
                    if (answer.answerText === question.correctAnswer) {
                        totalScore += question.points;
                    }
                } else if (question.type === '서술형') {
                    totalScore += answer.scoreReceived || 0;
                }
            }

            allScores.push({ studentId: sid, score: totalScore });
        }

        // Sort and find rank
        allScores.sort((a, b) => b.score - a.score);
        let rank = 1;
        for (let i = 0; i < allScores.length; i++) {
            if (i > 0 && allScores[i].score !== allScores[i - 1].score) {
                rank = i + 1;
            }
            if (allScores[i].studentId === studentId) {
                result.rank = rank;
                result.totalStudents = allScores.length;
                break;
            }
        }

        // Add exam info to result
        result.exam = {
            id: exam.examId,
            name: exam.name,
            date: exam.date,
            school: exam.school,
            grade: exam.grade
        };

        return success(result);
    } catch (err) {
        console.error('Get my result error:', err);
        return error('Failed to get result', 500);
    }
};

function calculateStudentResult(exam, student, questions, answers) {
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
            let feedback = '';
            if (question.type === '객관식') {
                feedback = `정답: ${question.correctAnswer}번 / 학생 답: ${answer.answerText}번`;
                if (question.choiceExplanations && question.choiceExplanations[answer.answerText]) {
                    feedback += `\n\n해설:\n${question.choiceExplanations[answer.answerText]}`;
                }
            } else {
                feedback = `배점: ${question.points}점 / 획득 점수: ${answer.scoreReceived}점`;
                if (question.correctAnswer && question.correctAnswer !== '서술형') {
                    feedback += `\n\n모범 답안:\n${question.correctAnswer}`;
                }
            }

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
                feedback
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
