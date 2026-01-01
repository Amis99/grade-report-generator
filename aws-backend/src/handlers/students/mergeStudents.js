/**
 * Merge Students Handler
 * POST /api/v1/students/merge
 */
const { getItem, deleteItem, putItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const body = parseBody(event);
        const { targetId, sourceId } = body;

        // Validation
        if (!targetId || !sourceId) {
            return validationError('targetId and sourceId are required');
        }

        if (targetId === sourceId) {
            return validationError('Cannot merge a student with itself');
        }

        // Get both students
        const target = await getItem(Tables.STUDENTS, `STUDENT#${targetId}`, 'METADATA');
        const source = await getItem(Tables.STUDENTS, `STUDENT#${sourceId}`, 'METADATA');

        if (!target) {
            return notFound('Target student not found');
        }
        if (!source) {
            return notFound('Source student not found');
        }

        // Get all answers for source student
        const sourceAnswers = await queryByIndex(
            Tables.ANSWERS,
            'studentId-index',
            'studentId = :studentId',
            { ':studentId': sourceId }
        );

        // Move answers to target student
        let movedCount = 0;
        for (const answer of sourceAnswers) {
            // Check if target already has answer for this exam+question
            const targetAnswers = await queryByIndex(
                Tables.ANSWERS,
                'studentId-index',
                'studentId = :studentId',
                { ':studentId': targetId }
            );

            const existingAnswer = targetAnswers.find(
                a => a.examId === answer.examId && a.questionId === answer.questionId
            );

            if (!existingAnswer) {
                // Move the answer to target
                const newAnswer = {
                    ...answer,
                    PK: `EXAM#${answer.examId}#STUDENT#${targetId}`,
                    studentId: targetId,
                    updatedAt: new Date().toISOString()
                };

                await putItem(Tables.ANSWERS, newAnswer);
                movedCount++;
            }

            // Delete old answer
            await deleteItem(Tables.ANSWERS, answer.PK, answer.SK);
        }

        // Delete source student
        await deleteItem(Tables.STUDENTS, `STUDENT#${sourceId}`, 'METADATA');

        return success({
            message: 'Students merged successfully',
            targetId,
            sourceId,
            movedAnswers: movedCount,
            deletedStudent: sourceId
        });
    } catch (err) {
        console.error('Merge students error:', err);
        return error('Failed to merge students', 500);
    }
};
