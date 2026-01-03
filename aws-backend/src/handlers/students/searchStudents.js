/**
 * Search Students Handler
 * GET /api/v1/students/search?q=keyword&hasAccount=true|false
 *
 * Search students by name, school, or grade.
 * Optionally filter by account status.
 */
const { scanTable, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent, getQueryParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const query = getQueryParam(event, 'q', '').toLowerCase().trim();
        const hasAccountFilter = getQueryParam(event, 'hasAccount');

        let students;

        if (user.role === 'admin') {
            // Admin can see all students
            students = await scanTable(Tables.STUDENTS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            // Org admin can only see students in their organization
            students = await queryByIndex(
                Tables.STUDENTS,
                'organization-name-index',
                'organization = :org',
                { ':org': user.organization }
            );
        }

        // Apply filters
        let filteredStudents = students;

        // Filter by search query
        if (query) {
            filteredStudents = filteredStudents.filter(student => {
                const name = (student.name || '').toLowerCase();
                const school = (student.school || '').toLowerCase();
                const grade = (student.grade || '').toLowerCase();
                return name.includes(query) || school.includes(query) || grade.includes(query);
            });
        }

        // Filter by account status
        if (hasAccountFilter !== null) {
            const hasAccount = hasAccountFilter === 'true';
            filteredStudents = filteredStudents.filter(student =>
                (student.hasAccount === true) === hasAccount
            );
        }

        // Transform to response format
        const studentList = filteredStudents.map(student => ({
            id: student.studentId,
            name: student.name,
            school: student.school,
            grade: student.grade,
            organization: student.organization,
            hasAccount: student.hasAccount || false,
            userId: student.userId,
            createdAt: student.createdAt
        }));

        // Sort by name
        studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success(studentList);
    } catch (err) {
        console.error('Search students error:', err);
        return error('Failed to search students', 500);
    }
};
