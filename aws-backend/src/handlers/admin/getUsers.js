/**
 * Get Users Handler
 * GET /api/v1/admin/users
 */
const { scanTable, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin can access user list
        if (user.role !== 'admin') {
            return forbidden('Admin access required');
        }

        const users = await scanTable(Tables.USERS, 'SK = :sk', { ':sk': 'METADATA' });

        const userList = users.map(item => ({
            id: item.userId,
            username: item.username,
            email: item.email,
            name: item.name,
            organization: item.organization,
            role: item.role,
            isActive: item.isActive,
            createdAt: item.createdAt,
            lastLoginAt: item.lastLoginAt
        }));

        // Sort by createdAt descending
        userList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return success(userList);
    } catch (err) {
        console.error('Get users error:', err);
        return error('Failed to get users', 500);
    }
};
