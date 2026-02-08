/**
 * Get Organizations Handler
 * GET /api/v1/admin/organizations
 *
 * Returns unique organization list from Cognito user pool
 */
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { success, error, getUserFromEvent } = require('../../utils/response');

const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'ap-northeast-2'
});

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can get organizations
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const userPoolId = process.env.USER_POOL_ID;
        if (!userPoolId) {
            return error('User pool not configured', 500);
        }

        const organizations = new Set();
        let paginationToken = null;

        // Paginate through all users to collect unique organizations
        do {
            const command = new ListUsersCommand({
                UserPoolId: userPoolId,
                Limit: 60,
                PaginationToken: paginationToken
            });

            const response = await cognitoClient.send(command);

            for (const cognitoUser of response.Users || []) {
                const orgAttr = cognitoUser.Attributes?.find(a => a.Name === 'custom:organization');
                if (orgAttr?.Value) {
                    organizations.add(orgAttr.Value);
                }
            }

            paginationToken = response.PaginationToken;
        } while (paginationToken);

        const sortedOrgs = Array.from(organizations).sort((a, b) => a.localeCompare(b, 'ko'));

        return success({
            organizations: sortedOrgs,
            count: sortedOrgs.length
        });
    } catch (err) {
        console.error('Get organizations error:', err);
        return error('Failed to get organizations', 500);
    }
};
