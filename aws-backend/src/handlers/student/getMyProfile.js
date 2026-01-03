/**
 * Get My Profile Handler
 * GET /api/v1/student/me
 *
 * Returns the current student's profile information.
 * Only accessible by users with student role.
 */
const { getItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, notFound, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only student role can access this endpoint
        if (user.role !== 'student') {
            return forbidden('This endpoint is only for students');
        }

        // Get studentId from Cognito claims
        const studentId = user.studentId;
        if (!studentId) {
            return error('Student ID not found in your account', 400);
        }

        // Get student data
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return notFound('Student profile not found');
        }

        // Get exam count (number of exams this student has taken)
        const answers = await queryByIndex(
            Tables.ANSWERS,
            'studentId-index',
            'studentId = :studentId',
            { ':studentId': studentId }
        );

        // Count unique exams
        const examIds = [...new Set(answers.map(a => a.examId))];

        return success({
            id: student.studentId,
            name: student.name,
            school: student.school,
            grade: student.grade,
            organization: student.organization,
            examCount: examIds.length,
            createdAt: student.createdAt
        });
    } catch (err) {
        console.error('Get my profile error:', err);
        return error('Failed to get profile', 500);
    }
};
