/**
 * Get Registered Students Handler
 * GET /api/v1/students/registered
 *
 * Returns list of students who have accounts (hasAccount: true).
 * Filtered by user's organization for org_admin.
 */
const { scanTable, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        let students;

        if (user.role === 'admin') {
            // Admin can see all registered students
            students = await scanTable(
                Tables.STUDENTS,
                'SK = :sk AND hasAccount = :hasAccount',
                { ':sk': 'METADATA', ':hasAccount': true }
            );
        } else {
            // Org admin can only see students in their organization
            const orgStudents = await queryByIndex(
                Tables.STUDENTS,
                'organization-name-index',
                'organization = :org',
                { ':org': user.organization }
            );
            students = orgStudents.filter(s => s.hasAccount === true);
        }

        // Transform to response format
        const studentList = students.map(student => ({
            id: student.studentId,
            name: student.name,
            school: student.school,
            grade: student.grade,
            organization: student.organization,
            hasAccount: student.hasAccount,
            userId: student.userId,
            createdAt: student.createdAt
        }));

        // Sort by name
        studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success(studentList);
    } catch (err) {
        console.error('Get registered students error:', err);
        return error('Failed to get registered students', 500);
    }
};
