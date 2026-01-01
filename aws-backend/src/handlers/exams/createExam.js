/**
 * Create Exam Handler
 * POST /api/v1/exams
 */
const { putItem, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const body = parseBody(event);
        const { name, school, grade, date, series } = body;

        // Validation
        if (!name) {
            return validationError('Exam name is required');
        }

        const now = new Date().toISOString();
        const examId = generateId();

        // Set organization based on user role
        const organization = user.role === 'admin'
            ? (body.organization || user.organization || '국어농장')
            : user.organization;

        const exam = {
            PK: `EXAM#${examId}`,
            SK: 'METADATA',
            examId,
            name,
            organization,
            school: school || '',
            grade: grade || '',
            date: date || now.split('T')[0],
            series: series || '',
            pdfFileName: '',
            pdfS3Key: '',
            createdAt: now,
            updatedAt: now
        };

        await putItem(Tables.EXAMS, exam);

        return success({
            id: examId,
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
        }, 201);
    } catch (err) {
        console.error('Create exam error:', err);
        return error('Failed to create exam', 500);
    }
};
