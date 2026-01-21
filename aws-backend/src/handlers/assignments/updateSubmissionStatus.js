/**
 * Update Submission Status Handler
 * PUT /api/v1/assignments/{assignmentId}/submissions/{studentId}/pages/{pageNumber}
 * Body: { passed: true/false }
 *
 * Allows teacher to approve/reject a submitted page
 */
const { getItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can update submission status
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId, studentId, pageNumber } = event.pathParameters;
        const body = JSON.parse(event.body || '{}');
        const { passed } = body;

        if (typeof passed !== 'boolean') {
            return error('passed field is required and must be boolean', 400);
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

        // Get submission
        const submission = await getItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`
        );

        if (!submission) {
            return error('Submission not found', 404);
        }

        // Find and update the page
        const pageNum = parseInt(pageNumber);
        const submittedPages = submission.submittedPages || [];
        const pageIndex = submittedPages.findIndex(p => p.pageNumber === pageNum);

        if (pageIndex === -1) {
            return error('Page not found in submission', 404);
        }

        // Update the page status
        submittedPages[pageIndex].passed = passed;
        submittedPages[pageIndex].manuallyReviewed = true;
        submittedPages[pageIndex].reviewedAt = new Date().toISOString();
        submittedPages[pageIndex].reviewedBy = user.email;

        // Recalculate passed count
        const passedCount = submittedPages.filter(p => p.passed).length;

        // Update submission
        await updateItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`,
            'SET submittedPages = :pages, passedCount = :count, updatedAt = :updatedAt',
            {
                ':pages': submittedPages,
                ':count': passedCount,
                ':updatedAt': new Date().toISOString()
            }
        );

        console.log(`Submission status updated: assignment=${assignmentId}, student=${studentId}, page=${pageNumber}, passed=${passed} by ${user.email}`);

        return success({
            message: passed ? 'Page approved' : 'Page rejected',
            assignmentId,
            studentId,
            pageNumber: pageNum,
            passed,
            passedCount,
            totalPages: assignment.totalPages || 0
        });
    } catch (err) {
        console.error('Update submission status error:', err);
        return error('Failed to update submission status', 500);
    }
};
