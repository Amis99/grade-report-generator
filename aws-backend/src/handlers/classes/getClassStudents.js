/**
 * Get Class Students Handler
 * GET /api/v1/classes/{classId}/students
 */
const { getItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const classId = event.pathParameters?.classId;
        if (!classId) {
            return validationError('Class ID is required');
        }

        // Check if class exists
        const classItem = await getItem(Tables.CLASSES, `CLASS#${classId}`, 'METADATA');
        if (!classItem) {
            return error('Class not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && classItem.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Get student-class associations
        const studentClasses = await queryByIndex(
            Tables.STUDENT_CLASSES,
            'classId-index',
            'classId = :classId',
            { ':classId': classId }
        );

        // Get student details
        const students = [];
        for (const sc of studentClasses) {
            const student = await getItem(Tables.STUDENTS, `STUDENT#${sc.studentId}`, 'METADATA');
            if (student) {
                students.push({
                    id: student.studentId,
                    name: student.name,
                    school: student.school,
                    grade: student.grade,
                    organization: student.organization,
                    hasAccount: student.hasAccount || false,
                    enrolledAt: sc.enrolledAt
                });
            }
        }

        // Sort by name
        students.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success({
            classId,
            className: classItem.name,
            students,
            totalCount: students.length
        });
    } catch (err) {
        console.error('Get class students error:', err);
        return error('Failed to get class students', 500);
    }
};
