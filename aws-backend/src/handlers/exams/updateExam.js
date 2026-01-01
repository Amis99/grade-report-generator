/**
 * Update Exam Handler
 * PUT /api/v1/exams/{examId}
 */
const { getItem, putItem, Tables } = require('../../utils/dynamoClient');
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
        const { name, school, grade, date, series, organization } = body;

        // Validation
        if (name !== undefined && !name) {
            return validationError('Exam name cannot be empty');
        }

        const now = new Date().toISOString();

        // Update exam
        const updatedExam = {
            ...existingExam,
            name: name !== undefined ? name : existingExam.name,
            school: school !== undefined ? school : existingExam.school,
            grade: grade !== undefined ? grade : existingExam.grade,
            date: date !== undefined ? date : existingExam.date,
            series: series !== undefined ? series : existingExam.series,
            organization: user.role === 'admin' && organization !== undefined
                ? organization
                : existingExam.organization,
            updatedAt: now
        };

        await putItem(Tables.EXAMS, updatedExam);

        return success({
            id: updatedExam.examId,
            name: updatedExam.name,
            organization: updatedExam.organization,
            school: updatedExam.school,
            grade: updatedExam.grade,
            date: updatedExam.date,
            series: updatedExam.series,
            pdfFileName: updatedExam.pdfFileName,
            pdfS3Key: updatedExam.pdfS3Key,
            createdAt: updatedExam.createdAt,
            updatedAt: updatedExam.updatedAt
        });
    } catch (err) {
        console.error('Update exam error:', err);
        return error('Failed to update exam', 500);
    }
};
