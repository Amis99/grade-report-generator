/**
 * Save Questions Handler
 * PUT /api/v1/exams/{examId}/questions
 */
const { getItem, putItem, queryByPK, batchWrite, Tables, generateId } = require('../../utils/dynamoClient');
const { success, error, notFound, forbidden, validationError, getUserFromEvent, getPathParam, parseBody } = require('../../utils/response');

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

        // Get exam to check authorization
        const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');

        if (!exam) {
            return notFound('Exam not found');
        }

        // Check authorization
        if (user.role !== 'admin' && exam.organization !== user.organization) {
            return forbidden('You do not have access to this exam');
        }

        const body = parseBody(event);
        const { questions } = body;

        if (!Array.isArray(questions)) {
            return validationError('questions must be an array');
        }

        const now = new Date().toISOString();

        // Get existing questions
        const existingQuestions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);
        const existingMap = new Map(existingQuestions.map(q => [q.number, q]));

        // Process questions
        const questionsToSave = [];
        const questionsToDelete = [];

        // Mark all existing questions for deletion (will keep those that are updated)
        const updatedNumbers = new Set();

        for (const q of questions) {
            if (!q.number || !q.type) {
                continue; // Skip invalid questions
            }

            updatedNumbers.add(q.number);

            const existing = existingMap.get(q.number);
            const questionId = existing ? existing.questionId : generateId();

            const question = {
                PK: `EXAM#${examId}`,
                SK: `QUESTION#${String(q.number).padStart(3, '0')}`,
                questionId,
                examId,
                number: q.number,
                type: q.type || '객관식',
                domain: q.domain || '',
                subDomain: q.subDomain || '',
                passage: q.passage || '',
                points: q.points || 0,
                correctAnswer: q.correctAnswer || '',
                choiceExplanations: q.choiceExplanations || {},
                intent: q.intent || '',
                createdAt: existing ? existing.createdAt : now
            };

            questionsToSave.push(question);
        }

        // Find questions to delete (existing but not in updated list)
        for (const existing of existingQuestions) {
            if (!updatedNumbers.has(existing.number)) {
                questionsToDelete.push(existing);
            }
        }

        // Delete removed questions
        if (questionsToDelete.length > 0) {
            await batchWrite(Tables.QUESTIONS, questionsToDelete, 'delete');
        }

        // Save new/updated questions
        if (questionsToSave.length > 0) {
            await batchWrite(Tables.QUESTIONS, questionsToSave, 'put');
        }

        // Update exam's updatedAt
        exam.updatedAt = now;
        await putItem(Tables.EXAMS, exam);

        return success({
            message: 'Questions saved successfully',
            saved: questionsToSave.length,
            deleted: questionsToDelete.length
        });
    } catch (err) {
        console.error('Save questions error:', err);
        return error('Failed to save questions', 500);
    }
};
