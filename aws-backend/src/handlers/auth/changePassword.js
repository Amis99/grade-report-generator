/**
 * Change Password Handler
 * POST /api/v1/auth/change-password
 */
const { setUserPassword, authenticateUser } = require('../../utils/cognitoClient');
const { success, error, validationError, parseBody, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const body = parseBody(event);
        const { currentPassword, newPassword } = body;

        // Validation
        if (!currentPassword || !newPassword) {
            return validationError('Current password and new password are required');
        }

        // New password validation
        if (newPassword.length < 8) {
            return validationError('New password must be at least 8 characters');
        }
        if (!/\d/.test(newPassword)) {
            return validationError('New password must contain at least one number');
        }

        // Verify current password
        try {
            await authenticateUser(user.email, currentPassword);
        } catch (authError) {
            if (authError.name === 'NotAuthorizedException') {
                return error('Current password is incorrect', 401);
            }
            throw authError;
        }

        // Set new password
        await setUserPassword(user.email, newPassword);

        return success({
            message: 'Password changed successfully'
        });
    } catch (err) {
        console.error('Change password error:', err);
        return error('Failed to change password', 500);
    }
};
