/**
 * Update Assignment Handler
 * PUT /api/v1/assignments/{assignmentId}
 */
const { getItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can update assignments
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId } = event.pathParameters;
        const body = parseBody(event);

        // Get existing assignment
        const assignment = await getItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA'
        );

        if (!assignment) {
            return error('Assignment not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && assignment.organization !== user.organization) {
            return error('Access denied', 403);
        }

        const { name, description, dueDate, classIds, status } = body;

        // Build update expression
        const updateParts = [];
        const expressionValues = {};
        const expressionNames = {};

        if (name !== undefined) {
            if (!name.trim()) {
                return validationError('Assignment name cannot be empty');
            }
            updateParts.push('#name = :name');
            expressionValues[':name'] = name.trim();
            expressionNames['#name'] = 'name';
        }

        if (description !== undefined) {
            updateParts.push('description = :description');
            expressionValues[':description'] = description;
        }

        if (dueDate !== undefined) {
            updateParts.push('dueDate = :dueDate');
            expressionValues[':dueDate'] = dueDate;
        }

        if (classIds !== undefined) {
            if (!Array.isArray(classIds) || classIds.length === 0) {
                return validationError('At least one class must be selected');
            }
            updateParts.push('classIds = :classIds');
            expressionValues[':classIds'] = classIds;
        }

        if (status !== undefined) {
            if (!['draft', 'active', 'closed'].includes(status)) {
                return validationError('Invalid status. Must be draft, active, or closed');
            }
            updateParts.push('#status = :status');
            expressionValues[':status'] = status;
            expressionNames['#status'] = 'status';
        }

        // Always update updatedAt
        updateParts.push('updatedAt = :updatedAt');
        expressionValues[':updatedAt'] = new Date().toISOString();

        if (updateParts.length === 1) {
            return validationError('No fields to update');
        }

        const updateExpression = 'SET ' + updateParts.join(', ');

        const updated = await updateItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA',
            updateExpression,
            expressionValues,
            Object.keys(expressionNames).length > 0 ? expressionNames : null
        );

        return success({
            id: updated.assignmentId,
            name: updated.name,
            description: updated.description || '',
            organization: updated.organization,
            classIds: updated.classIds || [],
            status: updated.status,
            dueDate: updated.dueDate,
            totalPages: updated.totalPages || 0,
            updatedAt: updated.updatedAt
        });
    } catch (err) {
        console.error('Update assignment error:', err);
        return error('Failed to update assignment', 500);
    }
};
