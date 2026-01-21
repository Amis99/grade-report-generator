/**
 * Create Class Handler
 * POST /api/v1/classes
 */
const { putItem, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can create classes
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can create classes.', 403);
        }

        const body = parseBody(event);
        const { name, description, teacherId, teacherName } = body;

        // Validation
        if (!name || !name.trim()) {
            return validationError('Class name is required');
        }

        const now = new Date().toISOString();
        const classId = generateId();

        // Set organization based on role
        const organization = user.role === 'admin'
            ? (body.organization || user.organization || '국어농장')
            : user.organization;

        const classItem = {
            PK: `CLASS#${classId}`,
            SK: 'METADATA',
            classId,
            name: name.trim(),
            organization,
            description: description || '',
            teacherId: teacherId || user.userId,
            teacherName: teacherName || user.name || '',
            studentCount: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: user.userId
        };

        await putItem(Tables.CLASSES, classItem);

        return success({
            id: classId,
            name: classItem.name,
            organization: classItem.organization,
            description: classItem.description,
            teacherId: classItem.teacherId,
            teacherName: classItem.teacherName,
            studentCount: 0,
            createdAt: classItem.createdAt
        }, 201);
    } catch (err) {
        console.error('Create class error:', err);
        return error('Failed to create class', 500);
    }
};
