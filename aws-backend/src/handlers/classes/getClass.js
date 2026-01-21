/**
 * Get Single Class Handler
 * GET /api/v1/classes/{classId}
 */
const { getItem, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const classId = event.pathParameters?.classId;
        if (!classId) {
            return error('Class ID is required', 400);
        }

        const classItem = await getItem(Tables.CLASSES, `CLASS#${classId}`, 'METADATA');

        if (!classItem) {
            return error('Class not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && classItem.organization !== user.organization) {
            return error('Access denied', 403);
        }

        return success({
            id: classItem.classId,
            name: classItem.name,
            organization: classItem.organization,
            description: classItem.description || '',
            teacherId: classItem.teacherId,
            teacherName: classItem.teacherName,
            studentCount: classItem.studentCount || 0,
            createdAt: classItem.createdAt,
            updatedAt: classItem.updatedAt
        });
    } catch (err) {
        console.error('Get class error:', err);
        return error('Failed to get class', 500);
    }
};
