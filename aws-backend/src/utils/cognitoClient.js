/**
 * Cognito Client for user authentication
 */
const {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminInitiateAuthCommand,
    AdminGetUserCommand,
    AdminUpdateUserAttributesCommand,
    AdminDisableUserCommand,
    AdminEnableUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'ap-northeast-2'
});

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

/**
 * Authenticate user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} Authentication result with tokens
 */
async function authenticateUser(email, password) {
    const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };

    const result = await cognitoClient.send(new AdminInitiateAuthCommand(params));

    return {
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        refreshToken: result.AuthenticationResult.RefreshToken,
        expiresIn: result.AuthenticationResult.ExpiresIn
    };
}

/**
 * Create new user in Cognito
 * @param {Object} userData - User data
 * @returns {Object} Created user info
 */
async function createUser(userData) {
    const { email, password, name, organization, role } = userData;

    // Create user
    const createParams = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: name },
            { Name: 'custom:organization', Value: organization || '' },
            { Name: 'custom:role', Value: role || 'org_admin' }
        ],
        MessageAction: 'SUPPRESS' // Don't send welcome email
    };

    const createResult = await cognitoClient.send(new AdminCreateUserCommand(createParams));

    // Set permanent password
    const passwordParams = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
    };

    await cognitoClient.send(new AdminSetUserPasswordCommand(passwordParams));

    return {
        sub: createResult.User.Username,
        email,
        name,
        organization,
        role
    };
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Object|null} User info or null
 */
async function getUser(email) {
    try {
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: email
        };

        const result = await cognitoClient.send(new AdminGetUserCommand(params));

        const attributes = {};
        result.UserAttributes.forEach(attr => {
            attributes[attr.Name] = attr.Value;
        });

        return {
            sub: result.Username,
            email: attributes.email,
            name: attributes.name,
            organization: attributes['custom:organization'],
            role: attributes['custom:role'],
            enabled: result.Enabled,
            status: result.UserStatus
        };
    } catch (error) {
        if (error.name === 'UserNotFoundException') {
            return null;
        }
        throw error;
    }
}

/**
 * Update user attributes
 * @param {string} email - User email
 * @param {Object} attributes - Attributes to update
 */
async function updateUserAttributes(email, attributes) {
    const userAttributes = Object.entries(attributes)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => ({
            Name: key.startsWith('custom:') ? key : `custom:${key}`,
            Value: String(value)
        }));

    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: userAttributes
    };

    await cognitoClient.send(new AdminUpdateUserAttributesCommand(params));
}

/**
 * Disable user
 * @param {string} email - User email
 */
async function disableUser(email) {
    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email
    };

    await cognitoClient.send(new AdminDisableUserCommand(params));
}

/**
 * Enable user
 * @param {string} email - User email
 */
async function enableUser(email) {
    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email
    };

    await cognitoClient.send(new AdminEnableUserCommand(params));
}

/**
 * Set user password
 * @param {string} email - User email
 * @param {string} password - New password
 */
async function setUserPassword(email, password) {
    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
    };

    await cognitoClient.send(new AdminSetUserPasswordCommand(params));
}

module.exports = {
    cognitoClient,
    authenticateUser,
    createUser,
    getUser,
    updateUserAttributes,
    disableUser,
    enableUser,
    setUserPassword
};
