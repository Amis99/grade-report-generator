/**
 * Get Answers Handler
 * GET /api/v1/exams/{examId}/answers
 */
const { getItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam, getQueryParam } = require('../../utils/response');

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

        // Optional: filter by student
        const studentId = getQueryParam(event, 'studentId');

        let answers;
        if (studentId) {
            // Get answers for specific student
            answers = await queryByIndex(
                Tables.ANSWERS,
                'examId-index',
                'examId = :examId AND studentId = :studentId',
                { ':examId': examId, ':studentId': studentId }
            );
        } else {
            // Get all answers for this exam
            answers = await queryByIndex(
                Tables.ANSWERS,
                'examId-index',
                'examId = :examId',
                { ':examId': examId }
            );
        }

        // Transform to answer objects
        const answerList = answers.map(item => ({
            id: item.answerId,
            examId: item.examId,
            studentId: item.studentId,
            questionId: item.questionId,
            answerText: item.answerText,
            scoreReceived: item.scoreReceived,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }));

        return success(answerList);
    } catch (err) {
        console.error('Get answers error:', err);
        return error('Failed to get answers', 500);
    }
};
