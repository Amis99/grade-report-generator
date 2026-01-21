/**
 * Get Assignment Pages Handler
 * GET /api/v1/assignments/{assignmentId}/pages
 *
 * Returns page thumbnails with presigned URLs
 */
const { getItem, queryByPK, Tables } = require('../../utils/dynamoClient');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { success, error, getUserFromEvent } = require('../../utils/response');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const { assignmentId } = event.pathParameters;

        // Get assignment metadata
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

        // Get pages
        const pages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);

        // Generate presigned URLs for thumbnails
        const formattedPages = await Promise.all(
            pages
                .filter(p => p.SK.startsWith('PAGE#'))
                .sort((a, b) => a.pageNumber - b.pageNumber)
                .map(async (p) => {
                    let thumbnailUrl = null;

                    if (p.thumbnailS3Key) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: process.env.PDF_BUCKET,
                                Key: p.thumbnailS3Key
                            });
                            thumbnailUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                        } catch (err) {
                            console.warn(`Failed to generate URL for page ${p.pageNumber}:`, err);
                        }
                    }

                    return {
                        pageNumber: p.pageNumber,
                        thumbnailUrl,
                        pHash: p.pHash,
                        dHash: p.dHash
                    };
                })
        );

        // Generate PDF presigned URL if exists
        let pdfUrl = null;
        if (assignment.pdfS3Key) {
            try {
                const command = new GetObjectCommand({
                    Bucket: process.env.PDF_BUCKET,
                    Key: assignment.pdfS3Key
                });
                pdfUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            } catch (err) {
                console.warn('Failed to generate PDF URL:', err);
            }
        }

        return success({
            assignmentId,
            totalPages: assignment.totalPages || 0,
            pdfUrl,
            pages: formattedPages
        });
    } catch (err) {
        console.error('Get pages error:', err);
        return error('Failed to get assignment pages', 500);
    }
};
