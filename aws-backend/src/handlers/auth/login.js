/**
 * Login Handler
 * POST /api/v1/auth/login
 */
const { authenticateUser, getUser } = require('../../utils/cognitoClient');
const { getItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const body = parseBody(event);
        const { email, password } = body;

        // Validation
        if (!email || !password) {
            return validationError('Email and password are required');
        }

        // Authenticate with Cognito
        let authResult;
        try {
            authResult = await authenticateUser(email, password);
        } catch (authError) {
            console.error('Authentication error:', authError);

            if (authError.name === 'NotAuthorizedException') {
                return error('Invalid email or password', 401);
            }
            if (authError.name === 'UserNotFoundException') {
                return error('User not found', 404);
            }
            if (authError.name === 'UserNotConfirmedException') {
                return error('User not confirmed', 401);
            }

            throw authError;
        }

        // Get user info from Cognito
        const cognitoUser = await getUser(email);

        // Get user data from DynamoDB
        const users = await queryByIndex(
            Tables.USERS,
            'username-index',
            'username = :username',
            { ':username': email }
        );

        let userData = users[0];

        // If user not in DynamoDB, create entry
        if (!userData) {
            // Check if user is active and has a role
            if (!cognitoUser.role) {
                return error('Account not yet approved', 403);
            }

            userData = {
                PK: `USER#${cognitoUser.sub}`,
                SK: 'METADATA',
                userId: cognitoUser.sub,
                username: email,
                cognitoSub: cognitoUser.sub,
                name: cognitoUser.name,
                email: email,
                organization: cognitoUser.organization || '',
                role: cognitoUser.role || 'org_admin',
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
            };
        } else {
            // Update last login
            userData.lastLoginAt = new Date().toISOString();
        }

        // Check if user is active
        if (userData.isActive === false) {
            return error('Account is disabled', 403);
        }

        return success({
            user: {
                id: userData.userId || userData.cognitoSub,
                username: userData.username,
                name: userData.name,
                email: userData.email,
                organization: userData.organization,
                role: userData.role
            },
            tokens: {
                accessToken: authResult.accessToken,
                idToken: authResult.idToken,
                refreshToken: authResult.refreshToken,
                expiresIn: authResult.expiresIn
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return error('Login failed', 500);
    }
};
