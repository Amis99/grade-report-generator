/**
 * Approve Registration Handler
 * POST /api/v1/admin/registrations/{registrationId}/approve
 */
const { getItem, putItem, Tables, generateId } = require('../../utils/dynamoClient');
const { createUser } = require('../../utils/cognitoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin can approve registrations
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

        // Create Cognito user
        let cognitoUser;
        try {
            cognitoUser = await createUser({
                email: registration.email,
                password: registration.password,
                name: registration.name,
                organization: registration.organization,
                role: 'org_admin'
            });
        } catch (cognitoError) {
            console.error('Cognito user creation error:', cognitoError);

            if (cognitoError.name === 'UsernameExistsException') {
                return error('User already exists in Cognito', 409);
            }

            throw cognitoError;
        }

        // Create user in DynamoDB
        const userId = generateId();
        const newUser = {
            PK: `USER#${userId}`,
            SK: 'METADATA',
            userId,
            username: registration.email,
            email: registration.email,
            cognitoSub: cognitoUser.sub,
            name: registration.name,
            organization: registration.organization,
            role: 'org_admin',
            isActive: true,
            createdAt: now,
            lastLoginAt: null
        };

        await putItem(Tables.USERS, newUser);

        // Update registration status
        registration.status = 'approved';
        registration.processedAt = now;
        registration.processedBy = user.sub;
        // Remove password from stored registration
        delete registration.password;

        await putItem(Tables.REGISTRATIONS, registration);

        return success({
            message: 'Registration approved successfully',
            user: {
                id: userId,
                username: newUser.username,
                name: newUser.name,
                organization: newUser.organization,
                role: newUser.role
            }
        });
    } catch (err) {
        console.error('Approve registration error:', err);
        return error('Failed to approve registration', 500);
    }
};
