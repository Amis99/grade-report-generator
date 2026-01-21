/**
 * Add Submission Comment Handler
 * PUT /api/v1/assignments/{assignmentId}/submissions/{studentId}/comment
 */
const { getItem, putItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can add comments
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId, studentId } = event.pathParameters;
        const body = parseBody(event);
        const { comment } = body;

        if (comment === undefined) {
            return validationError('Comment is required');
        }

        // Get assignment
        const assignment = await getItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA'
        );

        if (!assignment) {
            return error('Assignment not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && assignment.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Get or create submission record
        const existingSubmission = await getItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`
        );

        const now = new Date().toISOString();

        if (existingSubmission) {
            // Update existing submission with comment
            const updateExpression = 'SET teacherComment = :comment, commentedAt = :commentedAt, commentedBy = :commentedBy';
            await updateItem(
                Tables.ASSIGNMENT_SUBMISSIONS,
                `ASSIGNMENT#${assignmentId}`,
                `STUDENT#${studentId}`,
                updateExpression,
                {
                    ':comment': comment || null,
                    ':commentedAt': comment ? now : null,
                    ':commentedBy': comment ? user.email : null
                }
            );
        } else {
            // Create new submission record with just the comment
            const newSubmission = {
                PK: `ASSIGNMENT#${assignmentId}`,
                SK: `STUDENT#${studentId}`,
                assignmentId,
                studentId,
                submittedPages: [],
                passedCount: 0,
                totalPages: assignment.totalPages || 0,
                teacherComment: comment || null,
                commentedAt: comment ? now : null,
                commentedBy: comment ? user.email : null,
                lastSubmittedAt: null
            };
            await putItem(Tables.ASSIGNMENT_SUBMISSIONS, newSubmission);
        }

        return success({
            message: comment ? 'Comment added successfully' : 'Comment removed',
            comment: comment || null,
            commentedAt: comment ? now : null
        });
    } catch (err) {
        console.error('Add comment error:', err);
        return error('Failed to add comment', 500);
    }
};
