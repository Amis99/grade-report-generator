/**
 * Get Assignment Submissions Handler
 * GET /api/v1/assignments/{assignmentId}/submissions
 * Query params: classId
 *
 * Returns submission status for all students in the assignment
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { success, error, getUserFromEvent } = require('../../utils/response');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin and org_admin can view submissions
        if (!['admin', 'org_admin'].includes(user.role)) {
            return error('Permission denied', 403);
        }

        const { assignmentId } = event.pathParameters;
        const queryClassId = event.queryStringParameters?.classId;
        const includeImages = event.queryStringParameters?.includeImages === 'true';

        // Get assignment
        const assignment = await getItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA'
        );

        if (!assignment) {
            return error('Assignment not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin' && assignment.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Get all submissions for this assignment
        const submissions = await queryByPK(Tables.ASSIGNMENT_SUBMISSIONS, `ASSIGNMENT#${assignmentId}`);

        // Get students in the selected class
        let studentIds = [];
        let studentMap = {};

        if (queryClassId) {
            // Get students in the class
            const classStudents = await queryByIndex(
                Tables.STUDENT_CLASSES,
                'classId-index',
                'classId = :classId',
                { ':classId': queryClassId }
            );

            studentIds = classStudents.map(cs => cs.studentId);

            // Get student details
            for (const studentId of studentIds) {
                const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
                if (student) {
                    studentMap[studentId] = {
                        id: student.studentId,
                        name: student.name,
                        school: student.school || '',
                        grade: student.grade || ''
                    };
                }
            }
        } else {
            // Get all submissions' student IDs
            const submissionStudentIds = [...new Set(submissions.map(s => s.studentId))];
            studentIds = submissionStudentIds;

            for (const studentId of studentIds) {
                const student = await getItem(Tables.STUDENTS, `STUDENT#${studentId}`, 'METADATA');
                if (student) {
                    studentMap[studentId] = {
                        id: student.studentId,
                        name: student.name,
                        school: student.school || '',
                        grade: student.grade || ''
                    };
                }
            }
        }

        // Create submission map
        const submissionMap = {};
        for (const sub of submissions) {
            if (sub.SK.startsWith('STUDENT#')) {
                submissionMap[sub.studentId] = sub;
            }
        }

        // Format results
        const results = await Promise.all(
            studentIds.map(async (studentId) => {
                const student = studentMap[studentId];
                const submission = submissionMap[studentId];

                let submittedPages = [];
                if (submission && submission.submittedPages) {
                    submittedPages = await Promise.all(
                        submission.submittedPages.map(async (page) => {
                            let imageUrl = null;
                            if (includeImages && page.imageS3Key) {
                                try {
                                    const command = new GetObjectCommand({
                                        Bucket: process.env.PDF_BUCKET,
                                        Key: page.imageS3Key
                                    });
                                    imageUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                                } catch (err) {
                                    console.warn(`Failed to generate URL for page ${page.pageNumber}:`, err);
                                }
                            }

                            return {
                                pageNumber: page.pageNumber,
                                similarity: page.similarity,
                                passed: page.passed,
                                submittedAt: page.submittedAt,
                                imageUrl
                            };
                        })
                    );
                }

                return {
                    student: student || { id: studentId, name: 'Unknown' },
                    passedCount: submission?.passedCount || 0,
                    totalPages: assignment.totalPages || 0,
                    submittedPages,
                    teacherComment: submission?.teacherComment || null,
                    commentedAt: submission?.commentedAt || null,
                    lastSubmittedAt: submission?.lastSubmittedAt || null
                };
            })
        );

        // Sort by student name
        results.sort((a, b) => a.student.name.localeCompare(b.student.name, 'ko'));

        return success({
            assignmentId,
            assignmentName: assignment.name,
            totalPages: assignment.totalPages || 0,
            classId: queryClassId || null,
            submissions: results
        });
    } catch (err) {
        console.error('Get submissions error:', err);
        return error('Failed to get submissions', 500);
    }
};
