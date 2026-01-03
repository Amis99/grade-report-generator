/**
 * Get My Wrong Notes Handler
 * GET /api/v1/student/wrong-notes?examIds=id1,id2,id3
 *
 * Returns wrong answers analysis for the current student.
 * Can filter by exam IDs (comma-separated).
 * Only accessible by users with student role.
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, forbidden, getUserFromEvent, getQueryParam } = require('../../utils/response');

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

        // Get exam IDs filter (optional)
        const examIdsParam = getQueryParam(event, 'examIds', '');
        let filterExamIds = examIdsParam ? examIdsParam.split(',').filter(id => id.trim()) : null;

        // Get student info
        const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
        if (!student) {
            return error('Student not found', 404);
        }

        // Get all answers for this student
        const allStudentAnswers = await queryByIndex(
            Tables.ANSWERS,
            'studentId-index',
            'studentId = :studentId',
            { ':studentId': studentId }
        );

        // Get unique exam IDs
        let examIds = [...new Set(allStudentAnswers.map(a => a.examId))];

        // Apply filter if provided
        if (filterExamIds && filterExamIds.length > 0) {
            examIds = examIds.filter(id => filterExamIds.includes(id));
        }

        // Collect wrong questions from all exams
        const wrongQuestions = [];
        const examInfoMap = {};
        let totalQuestions = 0;
        let totalWrong = 0;
        const domainStats = {};

        for (const examId of examIds) {
            // Get exam info
            const exam = await getItem(Tables.EXAMS, `EXAM#${examId}`, 'METADATA');
            if (!exam) continue;

            examInfoMap[examId] = {
                id: exam.examId,
                name: exam.name,
                date: exam.date
            };

            // Get questions for this exam
            const questions = await queryByPK(Tables.QUESTIONS, `EXAM#${examId}`);

            // Get student's answers for this exam
            const answers = await queryByPK(Tables.ANSWERS, `EXAM#${examId}#STUDENT#${studentId}`);
            const answerMap = new Map(answers.map(a => [a.questionId, a]));

            for (const question of questions) {
                totalQuestions++;

                // Initialize domain stats
                if (!domainStats[question.domain]) {
                    domainStats[question.domain] = { correct: 0, total: 0 };
                }
                domainStats[question.domain].total++;

                const answer = answerMap.get(question.questionId);
                if (!answer) continue;

                let isCorrect = false;
                if (question.type === '객관식') {
                    isCorrect = answer.answerText === question.correctAnswer;
                } else if (question.type === '서술형') {
                    isCorrect = answer.scoreReceived === question.points;
                }

                if (isCorrect) {
                    domainStats[question.domain].correct++;
                } else {
                    totalWrong++;

                    let feedback = '';
                    if (question.type === '객관식') {
                        feedback = `정답: ${question.correctAnswer}번 / 학생 답: ${answer.answerText}번`;
                        if (question.choiceExplanations && question.choiceExplanations[answer.answerText]) {
                            feedback += `\n\n해설:\n${question.choiceExplanations[answer.answerText]}`;
                        }
                    } else {
                        feedback = `배점: ${question.points}점 / 획득 점수: ${answer.scoreReceived}점`;
                        if (question.correctAnswer && question.correctAnswer !== '서술형') {
                            feedback += `\n\n모범 답안:\n${question.correctAnswer}`;
                        }
                    }

                    wrongQuestions.push({
                        examId,
                        examName: exam.name,
                        examDate: exam.date,
                        questionNumber: question.number,
                        questionType: question.type,
                        domain: question.domain,
                        subDomain: question.subDomain,
                        passage: question.passage,
                        points: question.points,
                        correctAnswer: question.correctAnswer,
                        studentAnswer: answer.answerText,
                        scoreReceived: answer.scoreReceived,
                        feedback,
                        questionIntent: question.questionIntent
                    });
                }
            }
        }

        // Sort wrong questions by exam date (newest first), then by question number
        wrongQuestions.sort((a, b) => {
            const dateCompare = new Date(b.examDate) - new Date(a.examDate);
            if (dateCompare !== 0) return dateCompare;
            return a.questionNumber - b.questionNumber;
        });

        // Calculate domain accuracy rates
        const domainAccuracy = {};
        for (const [domain, stats] of Object.entries(domainStats)) {
            domainAccuracy[domain] = {
                correct: stats.correct,
                total: stats.total,
                rate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
            };
        }

        return success({
            student: {
                id: student.studentId,
                name: student.name,
                school: student.school,
                grade: student.grade
            },
            summary: {
                totalExams: examIds.length,
                totalQuestions,
                totalWrong,
                accuracyRate: totalQuestions > 0 ? Math.round(((totalQuestions - totalWrong) / totalQuestions) * 100) : 0
            },
            domainAccuracy,
            exams: Object.values(examInfoMap),
            wrongQuestions
        });
    } catch (err) {
        console.error('Get my wrong notes error:', err);
        return error('Failed to get wrong notes', 500);
    }
};
