/**
 * Delete Answer Handler
 * DELETE /api/v1/answers/{answerId}
 */
const { deleteItem, scanTable, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const answerId = getPathParam(event, 'answerId');
        if (!answerId) {
            return error('Answer ID is required', 400);
        }

        // Find the answer by answerId (scan since answerId is not a key)
        const answers = await scanTable(
            Tables.ANSWERS,
            'answerId = :aid',
            { ':aid': answerId }
        );

        if (!answers || answers.length === 0) {
            return notFound('Answer not found');
        }

        const answer = answers[0];

        // Delete using the actual PK/SK
        await deleteItem(Tables.ANSWERS, answer.PK, answer.SK);

        console.log(`Answer ${answerId} deleted by user ${user.email}`);

        return success({ message: 'Answer deleted successfully', id: answerId });
    } catch (err) {
        console.error('Delete answer error:', err);
        return error('Failed to delete answer', 500);
    }
};
