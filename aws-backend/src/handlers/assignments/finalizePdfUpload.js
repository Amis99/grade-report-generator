/**
 * Finalize PDF Upload Handler
 * POST /api/v1/assignments/{assignmentId}/finalize-upload
 *
 * Called after all page thumbnails have been uploaded to S3
 * Request: { pages: [{ pageNumber, thumbnailKey, pHash }] }
 */
const { getItem, updateItem, batchWrite, queryByPK, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can upload PDFs
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId } = event.pathParameters;
        const body = parseBody(event);
        const { pages } = body;

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            return validationError('Pages data is required');
        }

        // Get existing assignment
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

        // Delete existing pages if any
        const existingPages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);
        if (existingPages.length > 0) {
            await batchWrite(Tables.ASSIGNMENT_PAGES, existingPages, 'delete');
        }

        // Create page items
        const pageItems = pages.map(page => {
            const paddedPageNumber = String(page.pageNumber).padStart(3, '0');
            return {
                PK: `ASSIGNMENT#${assignmentId}`,
                SK: `PAGE#${paddedPageNumber}`,
                pageNumber: page.pageNumber,
                thumbnailS3Key: page.thumbnailKey,
                pHash: page.pHash || null,
                dHash: page.dHash || null,
                createdAt: new Date().toISOString()
            };
        });

        // Batch write pages
        await batchWrite(Tables.ASSIGNMENT_PAGES, pageItems, 'put');

        // Update assignment with total pages
        const updateExpression = 'SET totalPages = :totalPages, updatedAt = :updatedAt';
        await updateItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA',
            updateExpression,
            {
                ':totalPages': pages.length,
                ':updatedAt': new Date().toISOString()
            }
        );

        return success({
            message: 'PDF upload finalized',
            totalPages: pages.length
        });
    } catch (err) {
        console.error('Finalize PDF upload error:', err);
        return error('Failed to finalize PDF upload', 500);
    }
};
