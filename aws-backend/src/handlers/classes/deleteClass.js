/**
 * Delete Class Handler
 * DELETE /api/v1/classes/{classId}
 */
const { getItem, deleteItem, queryByIndex, batchWrite, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can delete classes
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can delete classes.', 403);
        }

        const classId = event.pathParameters?.classId;
        if (!classId) {
            return validationError('Class ID is required');
        }

        // Check if class exists
        const existing = await getItem(Tables.CLASSES, `CLASS#${classId}`, 'METADATA');
        if (!existing) {
            return error('Class not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && existing.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Delete all student-class associations
        const studentClasses = await queryByIndex(
            Tables.STUDENT_CLASSES,
            'classId-index',
            'classId = :classId',
            { ':classId': classId }
        );

        if (studentClasses.length > 0) {
            await batchWrite(Tables.STUDENT_CLASSES, studentClasses, 'delete');
        }

        // Delete the class
        await deleteItem(Tables.CLASSES, `CLASS#${classId}`, 'METADATA');

        return success({ message: 'Class deleted successfully', deletedStudentAssociations: studentClasses.length });
    } catch (err) {
        console.error('Delete class error:', err);
        return error('Failed to delete class', 500);
    }
};
