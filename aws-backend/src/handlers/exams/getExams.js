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

        // Admin can see all exams, org_admin can see their organization's exams + 국어농장 exams
        if (user.role === 'admin') {
            exams = await scanTable(Tables.EXAMS, 'SK = :sk', { ':sk': 'METADATA' });
        } else {
            // Get exams for user's organization
            const orgExams = await queryByIndex(
                Tables.EXAMS,
                'organization-updatedAt-index',
                'organization = :org',
                { ':org': user.organization }
            );

            // Also get 국어농장 exams (visible to all org_admins)
            let gookeoExams = [];
            if (user.organization !== '국어농장') {
                gookeoExams = await queryByIndex(
                    Tables.EXAMS,
                    'organization-updatedAt-index',
                    'organization = :org',
                    { ':org': '국어농장' }
                );
            }

            // Combine and deduplicate
            const examMap = new Map();
            [...orgExams, ...gookeoExams].forEach(e => examMap.set(e.examId, e));
            exams = Array.from(examMap.values());
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
