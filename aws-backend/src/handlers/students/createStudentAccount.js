/**
 * Create Student Account Handler
 * POST /api/v1/students/{studentId}/account
 *
 * Creates a Cognito account for an existing student.
 * Only org_admin and admin can create student accounts.
 */
const { getItem, putItem, updateItem, Tables, generateId } = require('../../utils/dynamoClient');
const { createUser } = require('../../utils/cognitoClient');
const { success, error, notFound, forbidden, validationError, getUserFromEvent, getPathParam, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can create student accounts
        if (user.role !== 'admin' && user.role !== 'org_admin') {
            return forbidden('Only administrators can create student accounts');
        }

        const studentId = getPathParam(event, 'studentId');
        if (!studentId) {
            return error('Student ID is required', 400);
        }

        // Get student data
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return notFound('Student not found');
        }

        // Check if org_admin can access this student (same organization)
        // organization이 없는 레거시 학생은 현재 사용자의 기관으로 설정
        if (user.role === 'org_admin') {
            if (!student.organization) {
                // 레거시 데이터: organization이 없으면 현재 사용자의 기관으로 설정
                await updateItem(
                    Tables.STUDENTS,
                    `STUDENT#${studentId}`,
                    'METADATA',
                    'SET organization = :org',
                    { ':org': user.organization }
                );
                student.organization = user.organization;
            } else if (student.organization !== user.organization) {
                return forbidden('You can only create accounts for students in your organization');
            }
        }

        // Check if student already has an account
        if (student.hasAccount && student.userId) {
            return error('Student already has an account', 400);
        }

        const body = parseBody(event);
        const { username, password, email } = body;

        // Validate required fields
        if (!username || !password) {
            return validationError('Username and password are required');
        }

        // Validate username format (alphanumeric, 3+ chars)
        if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) {
            return validationError('Username must be at least 3 characters and contain only letters, numbers, and underscores');
        }

        // Validate password (8+ chars)
        if (password.length < 8) {
            return validationError('Password must be at least 8 characters');
        }

        const now = new Date().toISOString();
        const userId = generateId();

        // Create Cognito user with student role
        const cognitoUser = await createUser({
            username,
            email: email || `${username}@student.local`,
            password,
            name: student.name,
            organization: student.organization,
            role: 'student',
            studentId: studentId
        });

        // Create user record in Users table
        const userRecord = {
            PK: `USER#${userId}`,
            SK: 'METADATA',
            userId,
            username,
            email: email || `${username}@student.local`,
            cognitoSub: cognitoUser.sub,
            name: student.name,
            organization: student.organization,
            role: 'student',
            studentId: studentId,
            isActive: true,
            createdAt: now,
            createdBy: user.sub,
            lastLoginAt: null
        };

        await putItem(Tables.USERS, userRecord);

        // Update student record with account info
        await updateItem(
            Tables.STUDENTS,
            `STUDENT#${studentId}`,
            'METADATA',
            'SET hasAccount = :hasAccount, userId = :userId, username = :username, updatedAt = :updatedAt',
            {
                ':hasAccount': true,
                ':userId': userId,
                ':username': username,
                ':updatedAt': now
            }
        );

        return success({
            message: 'Student account created successfully',
            student: {
                id: studentId,
                name: student.name,
                school: student.school,
                grade: student.grade,
                username,
                hasAccount: true
            }
        });
    } catch (err) {
        console.error('Create student account error:', err);

        // Handle Cognito specific errors
        if (err.name === 'UsernameExistsException') {
            return error('Username already exists', 400);
        }
        if (err.name === 'InvalidPasswordException') {
            return validationError('Password does not meet requirements');
        }

        return error('Failed to create student account', 500);
    }
};
