/**
 * Reject Registration Handler
 * POST /api/v1/admin/registrations/{registrationId}/reject
 */
const { getItem, putItem, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin can reject registrations
        if (user.role !== 'admin') {
            return forbidden('Admin access required');
        }

        const registrationId = getPathParam(event, 'registrationId');
        if (!registrationId) {
            return error('Registration ID is required', 400);
        }

        // Get registration
        const registration = await getItem(Tables.REGISTRATIONS, `REG#${registrationId}`, 'METADATA');

        if (!registration) {
            return notFound('Registration not found');
        }

        if (registration.status !== 'pending') {
            return error('Registration already processed', 400);
        }

        const now = new Date().toISOString();

        // Update registration status
        registration.status = 'rejected';
        registration.processedAt = now;
        registration.processedBy = user.sub;
        // Remove password from stored registration
        delete registration.password;

        await putItem(Tables.REGISTRATIONS, registration);

        return success({
            message: 'Registration rejected',
            registrationId
        });
    } catch (err) {
        console.error('Reject registration error:', err);
        return error('Failed to reject registration', 500);
    }
};
