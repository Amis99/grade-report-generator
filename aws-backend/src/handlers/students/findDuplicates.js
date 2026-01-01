/**
 * Find Duplicate Students Handler
 * GET /api/v1/students/duplicates
 */
const { scanTable, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

function normalizeStudentName(name) {
    return name.trim().replace(/\s+/g, '');
}

function normalizeSchoolName(school) {
    return school.trim().replace(/\s+/g, '').replace(/고등학교|고교/g, '고');
}

function normalizeGrade(grade) {
    return grade.trim().replace(/\s+|학년|반/g, '');
}

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Get all students (filtered by organization if not admin)
        let students;

        if (user.role === 'admin') {
            students = await scanTable(Tables.STUDENTS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            // Get students from organization's exams
            const orgExams = await queryByIndex(
                Tables.EXAMS,
                'organization-updatedAt-index',
                'organization = :org',
                { ':org': user.organization }
            );

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

        // Group by normalized key
        const groups = new Map();

        for (const student of students) {
            const key = `${normalizeStudentName(student.name)}_${normalizeSchoolName(student.school || '')}_${normalizeGrade(student.grade || '')}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push({
                id: student.studentId,
                name: student.name,
                school: student.school,
                grade: student.grade,
                organization: student.organization,
                createdAt: student.createdAt
            });
        }

        // Filter groups with more than 1 student
        const duplicateGroups = [];
        for (const [key, group] of groups) {
            if (group.length > 1) {
                duplicateGroups.push({
                    normalizedKey: key,
                    students: group.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                });
            }
        }

        return success({
            duplicateGroups,
            totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.students.length, 0)
        });
    } catch (err) {
        console.error('Find duplicates error:', err);
        return error('Failed to find duplicates', 500);
    }
};
