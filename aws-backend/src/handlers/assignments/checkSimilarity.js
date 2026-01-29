/**
 * Check Submission Similarity Handler (Admin)
 * POST /api/v1/assignments/{assignmentId}/submissions/{studentId}/check-similarity
 *
 * Compares submitted page pHashes with original page pHashes.
 * Only updates pages that have not been manually reviewed.
 */
const { getItem, queryByPK, putItem, Tables } = require('../../utils/dynamoClient');
const { calculateSimilarity, SIMILARITY_THRESHOLD } = require('../../utils/imageHasher');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // Only admin/org_admin can check similarity
        if (user.role !== 'admin' && user.role !== 'org_admin') {
            return error('Admin access required', 403);
        }

        const { assignmentId, studentId } = event.pathParameters;

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
        if (user.role === 'org_admin' && assignment.organization !== user.organization) {
            return error('Access denied', 403);
        }

        // Get original pages with hashes
        const pages = await queryByPK(Tables.ASSIGNMENT_PAGES, `ASSIGNMENT#${assignmentId}`);
        const pageHashMap = {};
        for (const p of pages) {
            if (p.SK.startsWith('PAGE#') && p.pHash) {
                pageHashMap[p.pageNumber] = p.pHash;
            }
        }

        // Get student submission
        const submission = await getItem(
            Tables.ASSIGNMENT_SUBMISSIONS,
            `ASSIGNMENT#${assignmentId}`,
            `STUDENT#${studentId}`
        );

        if (!submission || !submission.submittedPages || submission.submittedPages.length === 0) {
            return error('No submission found for this student', 404);
        }

        // Compare each submitted page
        const results = [];
        let updated = false;

        for (const sp of submission.submittedPages) {
            const originalHash = pageHashMap[sp.pageNumber];
            const submittedHash = sp.pHash;

            let similarity = null;
            let passed = sp.passed;

            if (originalHash && submittedHash) {
                similarity = calculateSimilarity(submittedHash, originalHash);
                // Only auto-update if not manually reviewed
                if (!sp.manuallyReviewed) {
                    passed = similarity >= SIMILARITY_THRESHOLD;
                    sp.similarity = similarity;
                    sp.passed = passed;
                    updated = true;
                }
            } else {
                // No hash available for comparison
                similarity = sp.similarity || null;
            }

            results.push({
                pageNumber: sp.pageNumber,
                similarity: similarity !== null ? Math.round(similarity * 10000) / 100 : null,
                passed: sp.passed,
                manuallyReviewed: sp.manuallyReviewed || false
            });
        }

        // Save updated submission if changed
        if (updated) {
            const passedCount = submission.submittedPages.filter(p => p.passed).length;
            submission.passedCount = passedCount;
            await putItem(Tables.ASSIGNMENT_SUBMISSIONS, submission);
        }

        return success({
            studentId,
            assignmentId,
            results,
            passedCount: submission.submittedPages.filter(p => p.passed).length,
            totalSubmitted: submission.submittedPages.length,
            totalPages: assignment.totalPages || 0
        });

    } catch (err) {
        console.error('Check similarity error:', err);
        return error('Failed to check similarity', 500);
    }
};
