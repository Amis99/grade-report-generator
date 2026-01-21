/**
 * Upload Assignment PDF Handler
 * POST /api/v1/assignments/{assignmentId}/pdf
 *
 * Receives page data from client-side PDF processing:
 * {
 *   pages: [
 *     { pageNumber: 1, thumbnailBase64: "...", pHash: "..." },
 *     ...
 *   ]
 * }
 */
const { getItem, updateItem, putItem, batchWrite, queryByPK, Tables } = require('../../utils/dynamoClient');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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
        const { pages, pdfBase64 } = body;

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

        // Upload original PDF if provided
        let pdfS3Key = null;
        if (pdfBase64) {
            pdfS3Key = `assignments/${assignmentId}/original.pdf`;
            const pdfBuffer = Buffer.from(pdfBase64, 'base64');

            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.PDF_BUCKET,
                Key: pdfS3Key,
                Body: pdfBuffer,
                ContentType: 'application/pdf'
            }));
        }

        // Process and save each page
        const pageItems = [];
        for (const page of pages) {
            const pageNumber = page.pageNumber;
            const paddedPageNumber = String(pageNumber).padStart(3, '0');

            // Upload thumbnail to S3
            let thumbnailS3Key = null;
            if (page.thumbnailBase64) {
                thumbnailS3Key = `assignments/${assignmentId}/pages/page-${paddedPageNumber}.png`;
                const thumbnailBuffer = Buffer.from(page.thumbnailBase64, 'base64');

                await s3Client.send(new PutObjectCommand({
                    Bucket: process.env.PDF_BUCKET,
                    Key: thumbnailS3Key,
                    Body: thumbnailBuffer,
                    ContentType: 'image/png'
                }));
            }

            const pageItem = {
                PK: `ASSIGNMENT#${assignmentId}`,
                SK: `PAGE#${paddedPageNumber}`,
                pageNumber,
                thumbnailS3Key,
                pHash: page.pHash || null,
                dHash: page.dHash || null,
                createdAt: new Date().toISOString()
            };

            pageItems.push(pageItem);
        }

        // Batch write pages
        await batchWrite(Tables.ASSIGNMENT_PAGES, pageItems, 'put');

        // Update assignment with total pages and PDF key
        const updateExpression = 'SET totalPages = :totalPages, pdfS3Key = :pdfS3Key, updatedAt = :updatedAt';
        await updateItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA',
            updateExpression,
            {
                ':totalPages': pages.length,
                ':pdfS3Key': pdfS3Key,
                ':updatedAt': new Date().toISOString()
            }
        );

        return success({
            message: 'PDF uploaded successfully',
            totalPages: pages.length,
            pdfS3Key
        });
    } catch (err) {
        console.error('Upload PDF error:', err);
        return error('Failed to upload PDF', 500);
    }
};
