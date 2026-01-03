/**
 * Get Students Handler
 * GET /api/v1/students
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

        // Admin can see all students
        if (user.role === 'admin') {
            students = await scanTable(Tables.STUDENTS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            // org_admin: Get only students belonging to their organization
            students = await queryByIndex(
                Tables.STUDENTS,
                'organization-name-index',
                'organization = :org',
                { ':org': user.organization }
            );
        }

        // Transform to student objects
        const studentList = students.map(item => ({
            id: item.studentId,
            name: item.name,
            school: item.school,
            grade: item.grade,
            organization: item.organization,
            hasAccount: item.hasAccount || false,
            username: item.username || null,
            userId: item.userId || null,
            createdAt: item.createdAt
        }));

        // Sort by name
        studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success(studentList);
    } catch (err) {
        console.error('Get students error:', err);
        return error('Failed to get students', 500);
    }
};
