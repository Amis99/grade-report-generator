/**
 * Get Registrations Handler
 * GET /api/v1/admin/registrations
 */
const { queryByIndex, scanTable, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, getUserFromEvent, getQueryParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin can access registrations
        if (user.role !== 'admin') {
            return forbidden('Admin access required');
        }

        const status = getQueryParam(event, 'status', 'pending');

        let registrations;
        if (status === 'all') {
            registrations = await scanTable(Tables.REGISTRATIONS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            registrations = await queryByIndex(
                Tables.REGISTRATIONS,
                'status-createdAt-index',
                '#status = :status',
                { ':status': status },
                {
                    ExpressionAttributeNames: { '#status': 'status' },
                    ScanIndexForward: false // Most recent first
                }
            );
        }

        const registrationList = registrations.map(item => ({
            id: item.registrationId,
            username: item.username,
            email: item.email,
            name: item.name,
            organization: item.organization,
            status: item.status,
            createdAt: item.createdAt,
            processedAt: item.processedAt,
            processedBy: item.processedBy
        }));

        return success(registrationList);
    } catch (err) {
        console.error('Get registrations error:', err);
        return error('Failed to get registrations', 500);
    }
};
