/**
 * Get Classes Handler
 * GET /api/v1/classes
 * Query params: organization (admin only)
 */
const { queryByIndex, scanTable, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        // 쿼리 파라미터에서 organization 가져오기
        const queryOrg = event.queryStringParameters?.organization;

        let classes;

        if (user.role === 'admin') {
            // Admin can see all classes or filter by organization
            if (queryOrg) {
                // 특정 기관으로 필터링
                classes = await queryByIndex(
                    Tables.CLASSES,
                    'organization-name-index',
                    'organization = :org',
                    { ':org': queryOrg }
                );
            } else {
                // 전체 조회
                classes = await scanTable(Tables.CLASSES);
            }
        } else {
            // Others see only their organization's classes
            classes = await queryByIndex(
                Tables.CLASSES,
                'organization-name-index',
                'organization = :org',
                { ':org': user.organization }
            );
        }

        // Filter only METADATA items and format response
        const formattedClasses = classes
            .filter(item => item.SK === 'METADATA')
            .map(cls => ({
                id: cls.classId,
                name: cls.name,
                organization: cls.organization,
                description: cls.description || '',
                teacherId: cls.teacherId,
                teacherName: cls.teacherName,
                studentCount: cls.studentCount || 0,
                createdAt: cls.createdAt,
                updatedAt: cls.updatedAt
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return success({ classes: formattedClasses });
    } catch (err) {
        console.error('Get classes error:', err);
        return error('Failed to get classes', 500);
    }
};
