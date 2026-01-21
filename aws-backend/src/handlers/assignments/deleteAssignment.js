/**
 * Delete Assignment Handler
 * DELETE /api/v1/assignments/{assignmentId}
 */
const { getItem, deleteItem, queryByPK, batchWrite, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { S3Client, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { success, error, getUserFromEvent } = require('../../utils/response');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can delete assignments
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId } = event.pathParameters;

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

        // Delete pages from DynamoDB
        const pages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);
        if (pages.length > 0) {
            await batchWrite(Tables.ASSIGNMENT_PAGES, pages, 'delete');
        }

        // Delete submissions from DynamoDB
        const submissions = await queryByPK(Tables.ASSIGNMENT_SUBMISSIONS, `ASSIGNMENT#${assignmentId}`);
        if (submissions.length > 0) {
            await batchWrite(Tables.ASSIGNMENT_SUBMISSIONS, submissions, 'delete');
        }

        // Delete files from S3
        try {
            const listParams = {
                Bucket: process.env.PDF_BUCKET,
                Prefix: `assignments/${assignmentId}/`
            };

            const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

            if (listedObjects.Contents && listedObjects.Contents.length > 0) {
                const deleteParams = {
                    Bucket: process.env.PDF_BUCKET,
                    Delete: {
                        Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
                    }
                };
                await s3Client.send(new DeleteObjectsCommand(deleteParams));
            }
        } catch (s3Error) {
            console.warn('Error deleting S3 files:', s3Error);
            // Continue even if S3 deletion fails
        }

        // Delete assignment metadata
        await deleteItem(Tables.ASSIGNMENTS, `ASSIGNMENT#${assignmentId}`, 'METADATA');

        return success({ message: 'Assignment deleted successfully' });
    } catch (err) {
        console.error('Delete assignment error:', err);
        return error('Failed to delete assignment', 500);
    }
};
