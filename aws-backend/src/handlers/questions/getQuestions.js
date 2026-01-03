/**
 * Get Questions Handler
 * GET /api/v1/exams/{examId}/questions
 */
const { getItem, queryByPK, Tables } = require('../../utils/dynamoClient');
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

        // Get exam to check authorization
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization (국어농장 exams are accessible to all)
        if (user.role !== 'admin' && exam.organization !== user.organization && exam.organization !== '국어농장') {
            return forbidden('You do not have access to this exam');
        }

        // Get all questions for this exam
        const questions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);

        // Transform and sort by question number
        const questionList = questions
            .map(item => ({
                id: item.questionId,
                examId: examId,
                number: item.number,
                type: item.type,
                domain: item.domain,
                subDomain: item.subDomain,
                passage: item.passage,
                points: item.points,
                correctAnswer: item.correctAnswer,
                choiceExplanations: item.choiceExplanations || {},
                intent: item.intent,
                createdAt: item.createdAt
            }))
            .sort((a, b) => a.number - b.number);

        return success(questionList);
    } catch (err) {
        console.error('Get questions error:', err);
        return error('Failed to get questions', 500);
    }
};
