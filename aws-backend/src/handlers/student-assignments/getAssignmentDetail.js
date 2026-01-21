/**
 * Get Assignment Detail Handler (Student)
 * GET /api/v1/student/assignments/{assignmentId}
 *
 * Returns assignment details with page thumbnails and submission status
 */
const { getItem, queryByPK, Tables } = require('../../utils/dynamoClient');
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

        // Only students can access this
        if (user.role !== 'student') {
            return error('This API is for students only', 403);
        }

        const studentId = user.studentId;
        if (!studentId) {
            return error('Student ID not found in user profile', 400);
        }

        const { assignmentId } = event.pathParameters;

        // Get assignment
        const assignment = await getItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA'
        );

        if (!assignment) {
            return error('Assignment not found', 404);
        }

        // Check organization
        if (assignment.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Check if student is in one of the assigned classes using PK pattern
        const studentClasses = await queryByPK(
            Tables.STUDENT_CLASSES,
            `STUDENT#${studentId}`
        );

        const classIds = studentClasses.map(sc => sc.classId);

        const hasAccess = assignment.classIds && assignment.classIds.some(cid => classIds.includes(cid));
        if (!hasAccess) {
            return error('You are not enrolled in a class for this assignment', 403);
        }

        // Check if assignment is active
        if (assignment.status !== 'active') {
            return error('This assignment is not active', 400);
        }

        // Get pages
        const pages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);

        // Get student's submission
        const submission = await getItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`
        );

        // Create submission map for quick lookup
        const submittedPageMap = {};
        if (submission && submission.submittedPages) {
            for (const sp of submission.submittedPages) {
                submittedPageMap[sp.pageNumber] = sp;
            }
        }

        // Format pages with thumbnails and submission status
        const formattedPages = await Promise.all(
            pages
                .filter(p => p.SK.startsWith('PAGE#'))
                .sort((a, b) => a.pageNumber - b.pageNumber)
                .map(async (p) => {
                    let thumbnailUrl = null;

                    if (p.thumbnailS3Key) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: process.env.PDF_BUCKET,
                                Key: p.thumbnailS3Key
                            });
                            thumbnailUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                        } catch (err) {
                            console.warn(`Failed to generate URL for page ${p.pageNumber}:`, err);
                        }
                    }

                    // Get submission info for this page
                    const submittedPage = submittedPageMap[p.pageNumber];
                    let submittedImageUrl = null;

                    if (submittedPage?.imageS3Key) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: process.env.PDF_BUCKET,
                                Key: submittedPage.imageS3Key
                            });
                            submittedImageUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                        } catch (err) {
                            console.warn(`Failed to generate submitted URL for page ${p.pageNumber}:`, err);
                        }
                    }

                    return {
                        pageNumber: p.pageNumber,
                        thumbnailUrl,
                        pHash: p.pHash,
                        submitted: !!submittedPage,
                        passed: submittedPage?.passed || false,
                        rejected: submittedPage && !submittedPage.passed,
                        manuallyReviewed: submittedPage?.manuallyReviewed || false,
                        similarity: submittedPage?.similarity || null,
                        submittedAt: submittedPage?.submittedAt || null,
                        submittedImageUrl
                    };
                })
        );

        return success({
            id: assignment.assignmentId,
            name: assignment.name,
            description: assignment.description || '',
            dueDate: assignment.dueDate,
            totalPages: assignment.totalPages || 0,
            passedCount: submission?.passedCount || 0,
            teacherComment: submission?.teacherComment || null,
            commentedAt: submission?.commentedAt || null,
            lastSubmittedAt: submission?.lastSubmittedAt || null,
            pages: formattedPages
        });
    } catch (err) {
        console.error('Get assignment detail error:', err);
        return error('Failed to get assignment details', 500);
    }
};
