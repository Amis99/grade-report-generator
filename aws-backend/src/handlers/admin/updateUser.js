/**
 * Update User Handler
 * PUT /api/v1/admin/users/{userId}
 */
const { getItem, putItem, Tables } = require('../../utils/dynamoClient');
const { updateUserAttributes, disableUser, enableUser } = require('../../utils/cognitoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin can update users
        if (user.role !== 'admin') {
            return forbidden('Admin access required');
        }

        const userId = getPathParam(event, 'userId');
        if (!userId) {
            return error('User ID is required', 400);
        }

        // Get existing user
        const existingUser = await getItem(Tables.USERS, `USER#${userId}`, 'METADATA');

        if (!existingUser) {
            return notFound('User not found');
        }

        const body = parseBody(event);
        const { role, isActive, organization } = body;

        // Update Cognito attributes if role or organization changed
        if (role !== undefined || organization !== undefined) {
            const attributes = {};
            if (role !== undefined) attributes.role = role;
            if (organization !== undefined) attributes.organization = organization;

            try {
                await updateUserAttributes(existingUser.email, attributes);
            } catch (cognitoError) {
                console.error('Cognito update error:', cognitoError);
                // Continue even if Cognito update fails
            }
        }

        // Enable/disable user in Cognito
        if (isActive !== undefined && isActive !== existingUser.isActive) {
            try {
                if (isActive) {
                    await enableUser(existingUser.email);
                } else {
                    await disableUser(existingUser.email);
                }
            } catch (cognitoError) {
                console.error('Cognito enable/disable error:', cognitoError);
            }
        }

        // Update DynamoDB
        const updatedUser = {
            ...existingUser,
            role: role !== undefined ? role : existingUser.role,
            isActive: isActive !== undefined ? isActive : existingUser.isActive,
            organization: organization !== undefined ? organization : existingUser.organization
        };

        await putItem(Tables.USERS, updatedUser);

        return success({
            id: updatedUser.userId,
            username: updatedUser.username,
            email: updatedUser.email,
            name: updatedUser.name,
            organization: updatedUser.organization,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            createdAt: updatedUser.createdAt,
            lastLoginAt: updatedUser.lastLoginAt
        });
    } catch (err) {
        console.error('Update user error:', err);
        return error('Failed to update user', 500);
    }
};
