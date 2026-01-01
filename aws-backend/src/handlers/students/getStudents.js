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
            // org_admin: Get students who have taken exams from their organization
            // First, get all exams for this organization
            const orgExams = await queryByIndex(
                Tables.EXAMS,
                'organization-updatedAt-index',
                'organization = :org',
                { ':org': user.organization }
            );

            if (orgExams.length === 0) {
                return success([]);
            }

            // Get all answers for these exams to find students
            const studentIds = new Set();
            for (const exam of orgExams) {
                const answers = await queryByIndex(
                    Tables.ANSWERS,
                    'examId-index',
                    'examId = :examId',
                    { ':examId': exam.examId }
                );
                answers.forEach(a => studentIds.add(a.studentId));
            }

            // Get student details
            students = [];
            for (const studentId of studentIds) {
                const student = await require('../../utils/dynamoClient').getItem(
                    Tables.STUDENTS,
                    `STUDENT#${studentId}`,
                    'METADATA'
                );
                if (student) {
                    students.push(student);
                }
            }
        }

        // Transform to student objects
        const studentList = students.map(item => ({
            id: item.studentId,
            name: item.name,
            school: item.school,
            grade: item.grade,
            organization: item.organization,
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
