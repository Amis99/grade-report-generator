/**
 * Delete Student Account Handler
 * DELETE /api/v1/students/{studentId}/account
 *
 * Deletes the Cognito account for a student but keeps the student data.
 * Only org_admin and admin can delete student accounts.
 */
const { getItem, deleteItem, updateItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { disableUser } = require('../../utils/cognitoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can delete student accounts
        if (user.role !== 'admin' && user.role !== 'org_admin') {
            return forbidden('Only administrators can delete student accounts');
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

        // Check if org_admin can access this student
        if (user.role === 'org_admin' && student.organization !== user.organization) {
            return forbidden('You can only manage students in your organization');
        }

        // Check if student has an account
        if (!student.hasAccount || !student.userId) {
            return error('Student does not have an account', 400);
        }

        // Get user record to get Cognito username
        const userRecord = await getItem(Tables.USERS, `USER#${student.userId}`, 'METADATA');
        if (userRecord) {
            // Disable Cognito user (instead of deleting to preserve audit trail)
            try {
                await disableUser(userRecord.username);
            } catch (cognitoError) {
                console.error('Failed to disable Cognito user:', cognitoError);
                // Continue anyway - we'll still clean up the database
            }

            // Delete user record from Users table
            await deleteItem(Tables.USERS, `USER#${userRecord.userId}`, 'METADATA');
        }

        // Update student record to remove account info
        const now = new Date().toISOString();
        await updateItem(
            Tables.STUDENTS,
            `STUDENT#${studentId}`,
            'METADATA',
            'SET hasAccount = :hasAccount, updatedAt = :updatedAt REMOVE userId',
            {
                ':hasAccount': false,
                ':updatedAt': now
            }
        );

        return success({
            message: 'Student account deleted successfully',
            student: {
                id: studentId,
                name: student.name,
                hasAccount: false
            }
        });
    } catch (err) {
        console.error('Delete student account error:', err);
        return error('Failed to delete student account', 500);
    }
};
