/**
 * Get My Exams Handler
 * GET /api/v1/student/exams
 *
 * Returns list of exams that the current student has taken.
 * Only accessible by users with student role.
 */
const { getItem, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only student role can access this endpoint
        if (user.role !== 'student') {
            return forbidden('This endpoint is only for students');
        }

        const studentId = user.studentId;
        if (!studentId) {
            return error('Student ID not found in your account', 400);
        }

        // Get all answers for this student
        const answers = await queryByIndex(
            Tables.ANSWERS,
            'studentId-index',
            'studentId = :studentId',
            { ':studentId': studentId }
        );

        // Get unique exam IDs
        const examIds = [...new Set(answers.map(a => a.examId))];

        // Get exam details for each exam
        const exams = [];
        for (const examId of examIds) {
            const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');
            if (exam) {
                // Count answers for this exam
                const examAnswers = answers.filter(a => a.examId === examId);

                exams.push({
                    id: exam.examId,
                    name: exam.name,
                    organization: exam.organization,
                    school: exam.school,
                    grade: exam.grade,
                    date: exam.date,
                    series: exam.series,
                    answerCount: examAnswers.length,
                    takenAt: exam.date || exam.createdAt
                });
            }
        }

        // Sort by date descending
        exams.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));

        return success(exams);
    } catch (err) {
        console.error('Get my exams error:', err);
        return error('Failed to get exams', 500);
    }
};
