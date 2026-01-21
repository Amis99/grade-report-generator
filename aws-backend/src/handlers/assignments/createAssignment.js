/**
 * Create Assignment Handler
 * POST /api/v1/assignments
 */
const { putItem, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can create assignments
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can create assignments.', 403);
        }

        const body = parseBody(event);
        const { name, description, dueDate, classIds } = body;

        // Validation
        if (!name || !name.trim()) {
            return validationError('Assignment name is required');
        }

        if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
            return validationError('At least one class must be selected');
        }

        const now = new Date().toISOString();
        const assignmentId = generateId();

        // Set organization based on role
        const organization = user.role === 'admin'
            ? (body.organization || user.organization || '국어농장')
            : user.organization;

        const assignmentItem = {
            PK: `ASSIGNMENT#${assignmentId}`,
            SK: 'METADATA',
            assignmentId,
            name: name.trim(),
            description: description || '',
            organization,
            classIds,
            status: 'draft', // draft | active | closed
            dueDate: dueDate || null,
            pdfS3Key: null,
            totalPages: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: user.userId
        };

        await putItem(Tables.ASSIGNMENTS, assignmentItem);

        return success({
            id: assignmentId,
            name: assignmentItem.name,
            description: assignmentItem.description,
            organization: assignmentItem.organization,
            classIds: assignmentItem.classIds,
            status: assignmentItem.status,
            dueDate: assignmentItem.dueDate,
            totalPages: 0,
            createdAt: assignmentItem.createdAt
        }, 201);
    } catch (err) {
        console.error('Create assignment error:', err);
        return error('Failed to create assignment', 500);
    }
};
