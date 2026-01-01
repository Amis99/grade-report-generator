/**
 * Delete Student Handler
 * DELETE /api/v1/students/{studentId}
 */
const { getItem, deleteItem, queryByIndex, batchWrite, Tables } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const studentId = getPathParam(event, 'studentId');
        if (!studentId) {
            return error('Student ID is required', 400);
        }

        // Get existing student
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');

        if (!student) {
            return notFound('Student not found');
        }

        // Check authorization for org_admin
        if (user.role !== 'admin') {
            // Check if student has taken any exams from user's organization
            const orgExams = await queryByIndex(
                Tables.EXAMS,
                'organization-updatedAt-index',
                'organization = :org',
                { ':org': user.organization }
            );

            const studentAnswers = await queryByIndex(
                Tables.ANSWERS,
                'studentId-index',
                'studentId = :studentId',
                { ':studentId': studentId }
            );

            const orgExamIds = new Set(orgExams.map(e => e.examId));
            const hasOrgExam = studentAnswers.some(a => orgExamIds.has(a.examId));

            if (!hasOrgExam) {
                return forbidden('You do not have access to this student');
            }
        }

        // Delete all answers for this student
        const answers = await queryByIndex(
            Tables.ANSWERS,
            'studentId-index',
            'studentId = :studentId',
            { ':studentId': studentId }
        );

        if (answers.length > 0) {
            await batchWrite(Tables.ANSWERS, answers, 'delete');
        }

        // Delete the student
        await deleteItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');

        return success({
            message: 'Student deleted successfully',
            deletedId: studentId,
            deletedAnswers: answers.length
        });
    } catch (err) {
        console.error('Delete student error:', err);
        return error('Failed to delete student', 500);
    }
};
