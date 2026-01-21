/**
 * Get Student's Classes Handler
 * GET /api/v1/students/{studentId}/classes
 */
const { getItem, queryByPK, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const studentId = event.pathParameters?.studentId;
        if (!studentId) {
            return validationError('Student ID is required');
        }

        // Check if student exists
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return error('Student not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && student.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Get student's class enrollments
        const enrollments = await queryByPK(Tables.STUDENT_CLASSES, `STUDENT#${studentId}`);

        // Get class details
        const classes = [];
        for (const enrollment of enrollments) {
            if (enrollment.SK.startsWith('CLASS#')) {
                const classItem = await getItem(Tables.CLASSES, `CLASS#${enrollment.classId}`, 'METADATA');
                if (classItem) {
                    classes.push({
                        id: classItem.classId,
                        name: classItem.name,
                        organization: classItem.organization,
                        description: classItem.description || '',
                        teacherName: classItem.teacherName,
                        enrolledAt: enrollment.enrolledAt
                    });
                }
            }
        }

        // Sort by name
        classes.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success({
            studentId,
            studentName: student.name,
            classes,
            totalCount: classes.length
        });
    } catch (err) {
        console.error('Get student classes error:', err);
        return error('Failed to get student classes', 500);
    }
};
