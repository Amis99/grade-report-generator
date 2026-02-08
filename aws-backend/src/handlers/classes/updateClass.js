/**
 * Update Class Handler
 * PUT /api/v1/classes/{classId}
 */
const { getItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can update classes
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can update classes.', 403);
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

        const body = parseBody(event);
        const { name, description, teacherId, teacherName, organization } = body;

        // Build update expression
        const updates = [];
        const expressionValues = {};
        const expressionNames = {};

        if (name !== undefined) {
            updates.push('#name = :name');
            expressionValues[':name'] = name.trim();
            expressionNames['#name'] = 'name';
        }

        if (description !== undefined) {
            updates.push('description = :description');
            expressionValues[':description'] = description;
        }

        if (teacherId !== undefined) {
            updates.push('teacherId = :teacherId');
            expressionValues[':teacherId'] = teacherId;
        }

        if (teacherName !== undefined) {
            updates.push('teacherName = :teacherName');
            expressionValues[':teacherName'] = teacherName;
        }

        // Only admin can update organization
        if (organization !== undefined && user.role === 'admin') {
            updates.push('organization = :organization');
            expressionValues[':organization'] = organization;
        }

        // Always update updatedAt
        updates.push('updatedAt = :updatedAt');
        expressionValues[':updatedAt'] = new Date().toISOString();

        if (updates.length === 1) {
            // Only updatedAt, nothing to update
            return validationError('No fields to update');
        }

        const updateExpression = 'SET ' + updates.join(', ');

        const updated = await updateItem(
            Tables.CLASSES,
            `CLASS#${classId}`,
            'METADATA',
            updateExpression,
            expressionValues,
            Object.keys(expressionNames).length > 0 ? expressionNames : null
        );

        return success({
            id: updated.classId,
            name: updated.name,
            organization: updated.organization,
            description: updated.description || '',
            teacherId: updated.teacherId,
            teacherName: updated.teacherName,
            studentCount: updated.studentCount || 0,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt
        });
    } catch (err) {
        console.error('Update class error:', err);
        return error('Failed to update class', 500);
    }
};
