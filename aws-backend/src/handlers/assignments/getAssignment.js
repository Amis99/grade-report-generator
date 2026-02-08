/**
 * Get Assignment Handler
 * GET /api/v1/assignments/{assignmentId}
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const { assignmentId } = event.pathParameters;

        // Get assignment metadata
        const assignment = await getItem(
            Tables.ASSIGNMENTS,
            `ASSIGNMENT#${assignmentId}`,
            'METADATA'
        );

        if (!assignment) {
            return error('Assignment not found', 404);
        }

        // Check organization access
        if (user.role !== 'admin') {
            let hasAccess = assignment.organization === user.organization;

            // 자기 조직 수강반에 배정된 과제인지 확인
            if (!hasAccess && assignment.classIds && assignment.classIds.length > 0) {
                const orgClasses = await queryByIndex(
                    Tables.CLASSES,
                    'organization-name-index',
                    'organization = :org',
                    { ':org': user.organization }
                );
                const orgClassIds = orgClasses
                    .filter(c => c.SK === 'METADATA')
                    .map(c => c.classId);

                hasAccess = assignment.classIds.some(cid => orgClassIds.includes(cid));
            }

            if (!hasAccess) {
                return error('Access denied', 403);
            }
        }

        // Get pages
        const pages = await queryByPK(
            Tables.ASSIGNMENT_PAGES,
            `ASSIGNMENT#${assignmentId}`
        );

        const formattedPages = pages
            .filter(p => p.SK.startsWith('PAGE#'))
            .map(p => ({
                pageNumber: p.pageNumber,
                thumbnailS3Key: p.thumbnailS3Key,
                pHash: p.pHash,
                dHash: p.dHash
            }))
            .sort((a, b) => a.pageNumber - b.pageNumber);

        return success({
            id: assignment.assignmentId,
            name: assignment.name,
            description: assignment.description || '',
            organization: assignment.organization,
            classIds: assignment.classIds || [],
            status: assignment.status,
            dueDate: assignment.dueDate,
            pdfS3Key: assignment.pdfS3Key,
            totalPages: assignment.totalPages || 0,
            pages: formattedPages,
            createdAt: assignment.createdAt,
            updatedAt: assignment.updatedAt,
            createdBy: assignment.createdBy
        });
    } catch (err) {
        console.error('Get assignment error:', err);
        return error('Failed to get assignment', 500);
    }
};
