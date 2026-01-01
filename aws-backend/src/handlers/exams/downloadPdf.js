/**
 * Download PDF Handler
 * GET /api/v1/exams/{examId}/pdf
 */
const { getItem, Tables } = require('../../utils/dynamoClient');
const { getDownloadUrl } = require('../../utils/s3Client');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

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
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && exam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        // Check if PDF exists
        if (!exam.pdfS3Key) {
            return notFound('No PDF file associated with this exam');
        }

        // Get presigned download URL
        const downloadUrl = await getDownloadUrl(exam.pdfS3Key);

        return success({
            downloadUrl,
            fileName: exam.pdfFileName,
            expiresIn: 3600 // 1 hour
        });
    } catch (err) {
        console.error('Download PDF error:', err);
        return error('Failed to get PDF download URL', 500);
    }
};
