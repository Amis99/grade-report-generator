/**
 * Get Assignments Handler
 * GET /api/v1/assignments
 * Query params: classId, status
 */
const { queryByIndex, scanTable, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        const queryClassId = event.queryStringParameters?.classId;
        const queryStatus = event.queryStringParameters?.status;

        let assignments;

        if (user.role === 'admin') {
            // Admin can see all assignments
            const queryOrg = event.queryStringParameters?.organization;
            if (queryOrg) {
                assignments = await queryByIndex(
                    Tables.ASSIGNMENTS,
                    'organization-dueDate-index',
                    'organization = :org',
                    { ':org': queryOrg }
                );
            } else {
                assignments = await scanTable(Tables.ASSIGNMENTS);
            }
        } else {
            // 기관 관리자: 자기 조직 과제 + 자기 조직 수강반에 배정된 과제

            // 1. 기관의 수강반 목록 조회
            const orgClasses = await queryByIndex(
                Tables.CLASSES,
                'organization-name-index',
                'organization = :org',
                { ':org': user.organization }
            );
            const orgClassIds = orgClasses
                .filter(c => c.SK === 'METADATA')
                .map(c => c.classId);

            // 2. 전체 과제 스캔 후 필터링
            const allAssignments = await scanTable(Tables.ASSIGNMENTS);
            assignments = allAssignments.filter(a => {
                if (a.SK !== 'METADATA') return false;
                // 조건 1: 자기 조직의 과제
                if (a.organization === user.organization) return true;
                // 조건 2: 자기 조직 수강반에 배정된 과제
                if (a.classIds && a.classIds.some(cid => orgClassIds.includes(cid))) return true;
                return false;
            });
        }

        // Filter only METADATA items
        let filteredAssignments = assignments.filter(item => item.SK === 'METADATA');

        // Filter by classId if specified
        if (queryClassId) {
            filteredAssignments = filteredAssignments.filter(
                a => a.classIds && a.classIds.includes(queryClassId)
            );
        }

        // Filter by status if specified
        if (queryStatus) {
            filteredAssignments = filteredAssignments.filter(a => a.status === queryStatus);
        }

        // Format response
        const formattedAssignments = filteredAssignments
            .map(a => ({
                id: a.assignmentId,
                name: a.name,
                description: a.description || '',
                organization: a.organization,
                classIds: a.classIds || [],
                status: a.status,
                dueDate: a.dueDate,
                pdfS3Key: a.pdfS3Key,
                totalPages: a.totalPages || 0,
                createdAt: a.createdAt,
                updatedAt: a.updatedAt
            }))
            .sort((a, b) => {
                // Sort by dueDate (upcoming first), then by createdAt
                if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate) - new Date(b.dueDate);
                }
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });

        return success({ assignments: formattedAssignments });
    } catch (err) {
        console.error('Get assignments error:', err);
        return error('Failed to get assignments', 500);
    }
};
