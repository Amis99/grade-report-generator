/**
 * Create Student Handler
 * POST /api/v1/students
 */
const { putItem, queryByIndex, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

// Normalize functions for duplicate detection
function normalizeStudentName(name) {
    return name.trim().replace(/\s+/g, '');
}

function normalizeSchoolName(school) {
    return school.trim().replace(/\s+/g, '').replace(/고등학교|고교/g, '고');
}

function normalizeGrade(grade) {
    return grade.trim().replace(/\s+|학년|반/g, '');
}

function getNormalizedKey(name, school, grade) {
    return `${normalizeStudentName(name)}_${normalizeSchoolName(school)}_${normalizeGrade(grade)}`;
}

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const body = parseBody(event);
        const { name, school, grade, organization } = body;

        // Validation
        if (!name) {
            return validationError('Student name is required');
        }

        const normalizedKey = getNormalizedKey(name, school || '', grade || '');

        // Check for existing student with same normalized key
        const existingStudents = await queryByIndex(
            Tables.STUDENTS,
            'normalizedKey-index',
            'normalizedKey = :key',
            { ':key': normalizedKey }
        );

        if (existingStudents.length > 0) {
            // Return existing student instead of creating duplicate
            const existing = existingStudents[0];
            return success({
                id: existing.studentId,
                name: existing.name,
                school: existing.school,
                grade: existing.grade,
                organization: existing.organization,
                hasAccount: existing.hasAccount || false,
                username: existing.username || null,
                createdAt: existing.createdAt,
                isExisting: true
            });
        }

        const now = new Date().toISOString();
        const studentId = generateId();

        // Set organization
        const studentOrg = user.role === 'admin'
            ? (organization || user.organization || '국어농장')
            : user.organization;

        const student = {
            PK: `STUDENT#${studentId}`,
            SK: 'METADATA',
            studentId,
            name,
            school: school || '',
            grade: grade || '',
            organization: studentOrg,
            normalizedKey,
            createdAt: now
        };

        await putItem(Tables.STUDENTS, student);

        return success({
            id: studentId,
            name: student.name,
            school: student.school,
            grade: student.grade,
            organization: student.organization,
            createdAt: student.createdAt
        }, 201);
    } catch (err) {
        console.error('Create student error:', err);
        return error('Failed to create student', 500);
    }
};
