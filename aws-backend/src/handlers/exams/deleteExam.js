/**
 * Delete Exam Handler
 * DELETE /api/v1/exams/{examId}
 */
const { getItem, deleteItem, queryByPK, batchWrite, Tables } = require('../../utils/dynamoClient');
const { deletePdf } = require('../../utils/s3Client');
const { success, error, notFound, forbidden, getUserFromEvent, getPathParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const examId = getPathParam(event, 'examId');
        if (!examId) {
            return error('Exam ID is required', 400);
        }

        // Get existing exam
        const existingExam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!existingExam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && existingExam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        // Delete PDF from S3 if exists
        if (existingExam.pdfS3Key) {
            await deletePdf(existingExam.pdfS3Key);
        }

        // Delete all questions for this exam
        const questions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);
        if (questions.length > 0) {
            await batchWrite(Tables.QUESTIONS, questions, 'delete');
        }

        // Delete all answers for this exam (need to scan by examId GSI)
        const { queryByIndex } = require('../../utils/dynamoClient');
        const answers = await queryByIndex(
            Tables.ANSWERS,
            'examId-index',
            'examId = :examId',
            { ':examId': examId }
        );
        if (answers.length > 0) {
            await batchWrite(Tables.ANSWERS, answers, 'delete');
        }

        // Delete the exam
        await deleteItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        return success({
            message: 'Exam deleted successfully',
            deletedId: examId,
            deletedQuestions: questions.length,
            deletedAnswers: answers.length
        });
    } catch (err) {
        console.error('Delete exam error:', err);
        return error('Failed to delete exam', 500);
    }
};
