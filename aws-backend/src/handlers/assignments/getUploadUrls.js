/**
 * Get Presigned URLs for PDF Upload
 * POST /api/v1/assignments/{assignmentId}/upload-urls
 *
 * Request: { totalPages: number }
 * Response: { urls: [{ pageNumber, uploadUrl, thumbnailKey }] }
 */
const { getItem, Tables } = require('../../utils/dynamoClient');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });

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
        const { totalPages } = body;

        if (!totalPages || totalPages < 1 || totalPages > 500) {
            return validationError('Total pages must be between 1 and 500');
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

        // Generate presigned URLs for each page
        const urls = [];
        for (let i = 1; i <= totalPages; i++) {
            const paddedPageNumber = String(i).padStart(3, '0');
            const thumbnailKey = `assignments/${assignmentId}/pages/page-${paddedPageNumber}.png`;

            const command = new PutObjectCommand({
                Bucket: process.env.PDF_BUCKET,
                Key: thumbnailKey,
                ContentType: 'image/png'
            });

            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

            urls.push({
                pageNumber: i,
                uploadUrl,
                thumbnailKey
            });
        }

        return success({ urls });
    } catch (err) {
        console.error('Get upload URLs error:', err);
        return error('Failed to get upload URLs', 500);
    }
};
