/**
 * Save Answers Handler
 * PUT /api/v1/exams/{examId}/students/{studentId}/answers
 */
const { getItem, putItem, queryByPK, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, validationError, getUserFromEvent, getPathParam, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const examId = getPathParam(event, 'examId');
        const studentId = getPathParam(event, 'studentId');

        if (!examId) {
            return error('Exam ID is required', 400);
        }
        if (!studentId) {
            return error('Student ID is required', 400);
        }

        // Get exam to check authorization
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && exam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        // Check if student exists
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return notFound('Student not found');
        }

        const body = parseBody(event);
        const { answers } = body;

        if (!Array.isArray(answers)) {
            return validationError('answers must be an array');
        }

        const now = new Date().toISOString();
        const pk = `EXAM#${examId}#STUDENT#${studentId}`;

        // Get existing answers
        const existingAnswers = await queryByPK(Tables.ANSWERS, pk);
        const existingMap = new Map(existingAnswers.map(a => [a.questionId, a]));

        // Save answers
        let savedCount = 0;
        for (const ans of answers) {
            if (!ans.questionId) continue;

            const existing = existingMap.get(ans.questionId);
            const answerId = existing ? existing.answerId : generateId();

            const answer = {
                PK: pk,
                SK: `QUESTION#${ans.questionId}`,
                answerId,
                examId,
                studentId,
                questionId: ans.questionId,
                answerText: ans.answerText !== undefined ? ans.answerText : (existing?.answerText || ''),
                scoreReceived: ans.scoreReceived !== undefined ? ans.scoreReceived : (existing?.scoreReceived ?? null),
                createdAt: existing ? existing.createdAt : now,
                updatedAt: now
            };

            await putItem(Tables.ANSWERS, answer);
            savedCount++;
        }

        return success({
            message: 'Answers saved successfully',
            saved: savedCount
        });
    } catch (err) {
        console.error('Save answers error:', err);
        return error('Failed to save answers', 500);
    }
};
