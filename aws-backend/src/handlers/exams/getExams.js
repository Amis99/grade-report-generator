/**
 * Get Exams Handler
 * GET /api/v1/exams
 */
const { scanTable, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent, getQueryParam } = require('../../utils/response');

exports.handler = async (event) => {
    try {
        const user = getUserFromEvent(event);
        if (!user) {
            return error('Unauthorized', 401);
        }

        let exams;

        // Admin can see all exams, org_admin can only see their organization's exams
        if (user.role === 'admin') {
            exams = await scanTable(Tables.EXAMS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            // Get exams for user's organization
            exams = await queryByIndex(
                Tables.EXAMS,
                'organization-updatedAt-index',
                'organization = :org',
                { ':org': user.organization }
            );
        }

        // Transform DynamoDB items to exam objects
        const examList = exams.map(item => ({
            id: item.examId,
            name: item.name,
            organization: item.organization,
            school: item.school,
            grade: item.grade,
            date: item.date,
            series: item.series,
            pdfFileName: item.pdfFileName,
            pdfS3Key: item.pdfS3Key,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }));

        // Sort by updatedAt descending
        examList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        return success(examList);
    } catch (err) {
        console.error('Get exams error:', err);
        return error('Failed to get exams', 500);
    }
};
