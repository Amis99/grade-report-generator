/**
 * Register Handler
 * POST /api/v1/auth/register
 */
const { putItem, queryByIndex, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, validationError, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const body = parseBody(event);
        const { email, password, name, organization } = body;

        // Validation
        if (!email || !password || !name || !organization) {
            return validationError('All fields are required: email, password, name, organization');
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return validationError('Invalid email format');
        }

        // Password validation (minimum 8 characters, at least 1 number)
        if (password.length < 8) {
            return validationError('Password must be at least 8 characters');
        }
        if (!/\d/.test(password)) {
            return validationError('Password must contain at least one number');
        }

        // Check if username already exists in users
        const existingUsers = await queryByIndex(
            Tables.USERS,
            'username-index',
            'username = :username',
            { ':username': email }
        );

        if (existingUsers.length > 0) {
            return error('Email already registered', 409);
        }

        // Check if registration request already exists
        const existingRegs = await queryByIndex(
            Tables.REGISTRATIONS,
            'status-createdAt-index',
            '#status = :status',
            { ':status': 'pending' },
            { ExpressionAttributeNames: { '#status': 'status' } }
        );

        const duplicateReg = existingRegs.find(r => r.username === email);
        if (duplicateReg) {
            return error('Registration request already pending', 409);
        }

        // Create registration request
        const registrationId = generateId();
        const now = new Date().toISOString();

        const registration = {
            PK: `REG#${registrationId}`,
            SK: 'METADATA',
            registrationId,
            username: email,
            email,
            name,
            organization,
            password, // Will be hashed when creating Cognito user on approval
            status: 'pending',
            createdAt: now,
            processedAt: null,
            processedBy: null
        };

        await putItem(Tables.REGISTRATIONS, registration);

        return success({
            message: 'Registration request submitted. Please wait for admin approval.',
            registrationId
        }, 201);
    } catch (err) {
        console.error('Registration error:', err);
        return error('Registration failed', 500);
    }
};
