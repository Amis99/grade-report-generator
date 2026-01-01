/**
 * Get Exam Handler
 * GET /api/v1/exams/{examId}
 */
const { getItem, Tables } = require('../../utils/dynamoClient');
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

        // Get exam from DynamoDB
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && exam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        return success({
            id: exam.examId,
            name: exam.name,
            organization: exam.organization,
            school: exam.school,
            grade: exam.grade,
            date: exam.date,
            series: exam.series,
            pdfFileName: exam.pdfFileName,
            pdfS3Key: exam.pdfS3Key,
            createdAt: exam.createdAt,
            updatedAt: exam.updatedAt
        });
    } catch (err) {
        console.error('Get exam error:', err);
        return error('Failed to get exam', 500);
    }
};
