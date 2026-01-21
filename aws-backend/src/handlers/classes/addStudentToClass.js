/**
 * Add Student to Class Handler
 * POST /api/v1/classes/{classId}/students
 */
const { getItem, putItem, updateItem, Tables } = require('../../utils/dynamoClient');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can add students to classes
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied. Only administrators can manage class enrollment.', 403);
        }

        const classId = event.pathParameters?.classId;
        if (!classId) {
            return validationError('Class ID is required');
        }

        const body = parseBody(event);
        const { studentId, studentIds } = body;

        // Support both single and batch enrollment
        const idsToAdd = studentIds || (studentId ? [studentId] : []);

        if (idsToAdd.length === 0) {
            return validationError('Student ID(s) required');
        }

        // Check if class exists
        const classItem = await getItem(Tables.CLASSES, `CLASS#${classId}`, 'METADATA');
        if (!classItem) {
            return error('Class not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && classItem.organization !== user.organization) {
            return error('Access denied', 403);
        }

        const now = new Date().toISOString();
        const added = [];
        const skipped = [];

        for (const sid of idsToAdd) {
            // Check if student exists
            const student = await getItem(Tables.STUDENTS, `STUDENT#${sid}`, 'METADATA');
            if (!student) {
                skipped.push({ studentId: sid, reason: 'Student not found' });
                continue;
            }

            // Check if already enrolled
            const existing = await getItem(Tables.STUDENT_CLASSES, `STUDENT#${sid}`, `CLASS#${classId}`);
            if (existing) {
                skipped.push({ studentId: sid, reason: 'Already enrolled' });
                continue;
            }

            // Create enrollment record
            const enrollment = {
                PK: `STUDENT#${sid}`,
                SK: `CLASS#${classId}`,
                studentId: sid,
                classId,
                enrolledAt: now,
                enrolledBy: user.userId
            };

            await putItem(Tables.STUDENT_CLASSES, enrollment);
            added.push({
                studentId: sid,
                studentName: student.name,
                enrolledAt: now
            });
        }

        // Update student count in class
        const newCount = (classItem.studentCount || 0) + added.length;
        await updateItem(
            Tables.CLASSES,
            `CLASS#${classId}`,
            'METADATA',
            'SET studentCount = :count, updatedAt = :now',
            { ':count': newCount, ':now': now }
        );

        return success({
            classId,
            added,
            skipped,
            totalAdded: added.length,
            totalSkipped: skipped.length,
            newStudentCount: newCount
        }, 201);
    } catch (err) {
        console.error('Add student to class error:', err);
        return error('Failed to add student to class', 500);
    }
};
