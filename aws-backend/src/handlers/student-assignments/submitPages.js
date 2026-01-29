/**
 * Submit Assignment Pages Handler (Student)
 * POST /api/v1/student/assignments/{assignmentId}/submit
 *
 * Two modes:
 * 1. Single page mode: { pageNumber, imageBase64, pHash }
 *    - Saves directly to the specified page (no similarity check)
 * 2. Batch mode (legacy): { images: [{ imageBase64, pHash }, ...] }
 *    - Uses sequential matching (backward compatible)
 */
const { getItem, queryByPK, putItem, Tables } = require('../../utils/dynamoClient');
const { matchImagesToPages, SIMILARITY_THRESHOLD } = require('../../utils/imageHasher');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { success, error, validationError, getUserFromEvent, parseBody } = require('../../utils/response');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only students can submit
        if (user.role !== 'student') {
            return error('This API is for students only', 403);
        }

        const studentId = user.studentId;
        if (!studentId) {
            return error('Student ID not found in user profile', 400);
        }

        const { assignmentId } = event.pathParameters;
        const body = parseBody(event);

        // Detect mode: single page vs batch
        const isSinglePageMode = body.pageNumber !== undefined && body.imageBase64;

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

        // Get existing submission
        const existingSubmission = await getItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`
        );

        const now = new Date().toISOString();

        if (isSinglePageMode) {
            // === Single page mode ===
            const { pageNumber, imageBase64, pHash } = body;

            if (!pageNumber || pageNumber < 1) {
                return validationError('Valid page number is required');
            }

            // Upload image to S3
            const paddedPageNumber = String(pageNumber).padStart(3, '0');
            const imageS3Key = `assignments/${assignmentId}/submissions/${studentId}/page-${paddedPageNumber}.jpg`;

            const imageBuffer = Buffer.from(imageBase64, 'base64');
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.PDF_BUCKET,
                Key: imageS3Key,
                Body: imageBuffer,
                ContentType: 'image/jpeg'
            }));

            const newPage = {
                pageNumber,
                imageS3Key,
                pHash: pHash || null,
                similarity: null,
                passed: false,
                manuallyReviewed: false,
                submittedAt: now
            };

            // Merge with existing submissions
            let mergedSubmittedPages = [];
            if (existingSubmission?.submittedPages) {
                const existingMap = {};
                for (const sp of existingSubmission.submittedPages) {
                    existingMap[sp.pageNumber] = sp;
                }
                existingMap[pageNumber] = newPage;
                mergedSubmittedPages = Object.values(existingMap);
            } else {
                mergedSubmittedPages = [newPage];
            }

            mergedSubmittedPages.sort((a, b) => a.pageNumber - b.pageNumber);

            const passedCount = mergedSubmittedPages.filter(p => p.passed).length;

            const submissionItem = {
                PK: `ASSIGNMENT#${assignmentId}`,
                SK: `STUDENT#${studentId}`,
                assignmentId,
                studentId,
                submittedPages: mergedSubmittedPages,
                passedCount,
                totalPages: assignment.totalPages || 0,
                teacherComment: existingSubmission?.teacherComment || null,
                commentedAt: existingSubmission?.commentedAt || null,
                commentedBy: existingSubmission?.commentedBy || null,
                lastSubmittedAt: now
            };

            await putItem(Tables.ASSIGNMENT_SUBMISSIONS, submissionItem);

            return success({
                message: 'Page submitted successfully',
                pageNumber,
                totalSubmitted: mergedSubmittedPages.length,
                passedCount,
                totalPages: assignment.totalPages || 0
            });

        } else {
            // === Batch mode (legacy) ===
            const { images } = body;

            if (!images || !Array.isArray(images) || images.length === 0) {
                return validationError('At least one image is required');
            }

            // Get pages with hashes
            const pages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);
            const pageData = pages
                .filter(p => p.SK.startsWith('PAGE#'))
                .map(p => ({
                    pageNumber: p.pageNumber,
                    pHash: p.pHash
                }));

            // Prepare image hashes for matching
            const imageHashes = images.map((img, idx) => ({
                hash: img.pHash,
                originalIndex: idx
            }));

            // Determine start page for sequential matching (first unsubmitted page)
            let startPage = 1;
            if (existingSubmission?.submittedPages) {
                const submittedPageNumbers = existingSubmission.submittedPages
                    .filter(p => p.passed)
                    .map(p => p.pageNumber);

                for (let i = 1; i <= (assignment.totalPages || 100); i++) {
                    if (!submittedPageNumbers.includes(i)) {
                        startPage = i;
                        break;
                    }
                }
            }

            // Match images to pages using sequential matching
            const matchResults = matchImagesToPages(imageHashes, pageData, SIMILARITY_THRESHOLD, {
                useSequential: true,
                startPage: startPage
            });

            const newSubmittedPages = [];

            for (let i = 0; i < matchResults.length; i++) {
                const match = matchResults[i];
                const image = images[match.originalIndex];

                if (match.passed && match.pageNumber) {
                    const paddedPageNumber = String(match.pageNumber).padStart(3, '0');
                    const imageS3Key = `assignments/${assignmentId}/submissions/${studentId}/page-${paddedPageNumber}.jpg`;

                    if (image.imageBase64) {
                        const imageBuffer = Buffer.from(image.imageBase64, 'base64');
                        await s3Client.send(new PutObjectCommand({
                            Bucket: process.env.PDF_BUCKET,
                            Key: imageS3Key,
                            Body: imageBuffer,
                            ContentType: 'image/jpeg'
                        }));
                    }

                    newSubmittedPages.push({
                        pageNumber: match.pageNumber,
                        imageS3Key,
                        similarity: match.similarity,
                        passed: true,
                        submittedAt: now
                    });
                }
            }

            // Merge with existing submissions
            let mergedSubmittedPages = [];
            if (existingSubmission?.submittedPages) {
                const existingMap = {};
                for (const sp of existingSubmission.submittedPages) {
                    existingMap[sp.pageNumber] = sp;
                }
                for (const newSp of newSubmittedPages) {
                    existingMap[newSp.pageNumber] = newSp;
                }
                mergedSubmittedPages = Object.values(existingMap);
            } else {
                mergedSubmittedPages = newSubmittedPages;
            }

            mergedSubmittedPages.sort((a, b) => a.pageNumber - b.pageNumber);

            const passedCount = mergedSubmittedPages.filter(p => p.passed).length;

            const submissionItem = {
                PK: `ASSIGNMENT#${assignmentId}`,
                SK: `STUDENT#${studentId}`,
                assignmentId,
                studentId,
                submittedPages: mergedSubmittedPages,
                passedCount,
                totalPages: assignment.totalPages || 0,
                teacherComment: existingSubmission?.teacherComment || null,
                commentedAt: existingSubmission?.commentedAt || null,
                commentedBy: existingSubmission?.commentedBy || null,
                lastSubmittedAt: now
            };

            await putItem(Tables.ASSIGNMENT_SUBMISSIONS, submissionItem);

            const response = {
                message: 'Submission processed successfully',
                results: matchResults.map(r => ({
                    originalIndex: r.originalIndex,
                    pageNumber: r.pageNumber,
                    similarity: Math.round(r.similarity * 100) / 100,
                    passed: r.passed
                })),
                summary: {
                    submitted: newSubmittedPages.length,
                    matched: newSubmittedPages.length,
                    notMatched: images.length - newSubmittedPages.length,
                    totalPassedCount: passedCount,
                    totalPages: assignment.totalPages || 0,
                    isComplete: passedCount >= (assignment.totalPages || 0)
                }
            };

            return success(response);
        }
    } catch (err) {
        console.error('Submit pages error:', err);
        return error('Failed to submit pages', 500);
    }
};
