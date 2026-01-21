/**
 * Update Student Handler
 * PUT /api/v1/students/{studentId}
 */
const { getItem, updateItem, Tables } = require('../../utils/dynamoClient');
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

        const studentId = event.pathParameters?.studentId;
        if (!studentId) {
            return validationError('Student ID is required');
        }

        const body = parseBody(event);
        const { name, school, grade, organization } = body;

        // Get existing student
        const existing = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!existing) {
            return error('Student not found', 404);
        }

        // Build update expression
        const updates = [];
        const expressionValues = {};
        const expressionNames = {};

        if (name !== undefined) {
            updates.push('#name = :name');
            expressionValues[':name'] = name;
            expressionNames['#name'] = 'name';
        }

        if (school !== undefined) {
            updates.push('school = :school');
            expressionValues[':school'] = school;
        }

        if (grade !== undefined) {
            updates.push('grade = :grade');
            expressionValues[':grade'] = grade;
        }

        if (organization !== undefined && user.role === 'admin') {
            updates.push('organization = :organization');
            expressionValues[':organization'] = organization;
        }

        // Update normalizedKey if name, school, or grade changed
        const newName = name !== undefined ? name : existing.name;
        const newSchool = school !== undefined ? school : existing.school;
        const newGrade = grade !== undefined ? grade : existing.grade;
        const normalizedKey = getNormalizedKey(newName, newSchool || '', newGrade || '');

        updates.push('normalizedKey = :normalizedKey');
        expressionValues[':normalizedKey'] = normalizedKey;

        // Add updatedAt
        updates.push('updatedAt = :updatedAt');
        expressionValues[':updatedAt'] = new Date().toISOString();

        if (updates.length === 0) {
            return validationError('No fields to update');
        }

        const updateExpression = 'SET ' + updates.join(', ');

        const updated = await updateItem(
            Tables.STUDENTS,
            `STUDENT#${studentId}`,
            'METADATA',
            updateExpression,
            expressionValues,
            Object.keys(expressionNames).length > 0 ? expressionNames : null
        );

        return success({
            id: updated.studentId,
            name: updated.name,
            school: updated.school,
            grade: updated.grade,
            organization: updated.organization,
            hasAccount: updated.hasAccount || false,
            username: updated.username || null,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt
        });
    } catch (err) {
        console.error('Update student error:', err);
        return error('Failed to update student', 500);
    }
};
