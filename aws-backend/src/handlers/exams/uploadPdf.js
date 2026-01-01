/**
 * Upload PDF Handler
 * POST /api/v1/exams/{examId}/pdf
 */
const { getItem, putItem, Tables } = require('../../utils/dynamoClient');
const { getUploadUrl, uploadPdf, deletePdf } = require('../../utils/s3Client');
const { success, error, notFound, forbidden, validationError, getUserFromEvent, getPathParam, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const examId = getPathParam(event, 'examId');
        if (!examId) {
            return error('Exam ID is required', 400);
        }

        // Get existing exam
        const existingExam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!existingExam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && existingExam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        const body = parseBody(event);
        const { fileName, fileData, getSignedUrl } = body;

        // Option 1: Return presigned URL for client-side upload
        if (getSignedUrl && fileName) {
            const { uploadUrl, key } = await getUploadUrl(examId, fileName);

            return success({
                uploadUrl,
                key,
                method: 'PUT',
                contentType: 'application/pdf'
            });
        }

        // Option 2: Direct upload with base64 data
        if (!fileName || !fileData) {
            return validationError('fileName and fileData are required');
        }

        // Validate file size (10MB limit)
        const fileBuffer = Buffer.from(fileData, 'base64');
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (fileBuffer.length > maxSize) {
            return validationError('File size exceeds 10MB limit');
        }

        // Delete old PDF if exists
        if (existingExam.pdfS3Key) {
            await deletePdf(existingExam.pdfS3Key);
        }

        // Upload new PDF
        const key = await uploadPdf(examId, fileName, fileBuffer);

        // Update exam with PDF info
        const now = new Date().toISOString();
        const updatedExam = {
            ...existingExam,
            pdfFileName: fileName,
            pdfS3Key: key,
            updatedAt: now
        };

        await putItem(Tables.EXAMS, updatedExam);

        return success({
            message: 'PDF uploaded successfully',
            pdfFileName: fileName,
            pdfS3Key: key
        });
    } catch (err) {
        console.error('Upload PDF error:', err);
        return error('Failed to upload PDF', 500);
    }
};
