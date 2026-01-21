/**
 * Remove Student from Class Handler
 * DELETE /api/v1/classes/{classId}/students/{studentId}
 */
const { getItem, deleteItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can remove students from classes
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can manage class enrollment.', 403);
        }

        const { classId, studentId } = event.pathParameters || {};
        if (!classId || !studentId) {
            return validationError('Class ID and Student ID are required');
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

        // Check if enrollment exists
        const enrollment = await getItem(Tables.STUDENT_CLASSES, `STUDENT#${studentId}`, `CLASS#${classId}`);
        if (!enrollment) {
            return error('Student is not enrolled in this class', 404);
        }

        // Delete enrollment
        await deleteItem(Tables.STUDENT_CLASSES, `STUDENT#${studentId}`, `CLASS#${classId}`);

        // Update student count in class
        const newCount = Math.max(0, (classItem.studentCount || 0) - 1);
        await updateItem(
            Tables.CLASSES,
            `CLASS#${classId}`,
            'METADATA',
            'SET studentCount = :count, updatedAt = :now',
            { ':count': newCount, ':now': new Date().toISOString() }
        );

        return success({
            message: 'Student removed from class successfully',
            classId,
            studentId,
            newStudentCount: newCount
        });
    } catch (err) {
        console.error('Remove student from class error:', err);
        return error('Failed to remove student from class', 500);
    }
};
