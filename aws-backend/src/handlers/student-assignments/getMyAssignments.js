/**
 * Get My Assignments Handler (Student)
 * GET /api/v1/student/assignments
 *
 * Returns assignments for the logged-in student based on their classes
 */
const { getItem, queryByPK, queryByIndex, Tables } = require('../../utils/dynamoClient');
const { success, error, getUserFromEvent } = require('../../utils/response');

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

        // Get student's classes using PK pattern: STUDENT#{studentId}
        const studentClasses = await queryByPK(
            Tables.STUDENT_CLASSES,
            `STUDENT#${studentId}`
        );

        // Extract class IDs from enrollments
        const classIds = studentClasses.map(sc => sc.classId);

        if (classIds.length === 0) {
            return success({ assignments: [] });
        }

        // Get all active assignments for student's organization
        const allAssignments = await queryByIndex(
            Tables.ASSIGNMENTS,
            'organization-dueDate-index',
            'organization = :org',
            { ':org': user.organization }
        );

        // Filter assignments by:
        // 1. Status is 'active'
        // 2. Student is in one of the assigned classes
        const activeAssignments = allAssignments
            .filter(a => a.SK === 'METADATA')
            .filter(a => a.status === 'active')
            .filter(a => a.classIds && a.classIds.some(cid => classIds.includes(cid)));

        // Get submission status for each assignment
        const assignmentsWithStatus = await Promise.all(
            activeAssignments.map(async (a) => {
                const submission = await getItem(
                    Tables.ASSIGNMENT_SUBMISSIONS,
                    `ASSIGNMENT#${a.assignmentId}`,
                    `STUDENT#${studentId}`
                );

                const totalPages = a.totalPages || 0;
                const passedCount = submission?.passedCount || 0;
                // isComplete: totalPages가 0이면 항상 false (제출할 페이지가 설정되지 않은 과제는 미완료)
                // totalPages > 0이면 passedCount >= totalPages일 때만 완료
                const isComplete = totalPages > 0 && passedCount >= totalPages;

                return {
                    id: a.assignmentId,
                    name: a.name,
                    description: a.description || '',
                    dueDate: a.dueDate,
                    totalPages: totalPages,
                    passedCount: passedCount,
                    teacherComment: submission?.teacherComment || null,
                    commentedAt: submission?.commentedAt || null,
                    lastSubmittedAt: submission?.lastSubmittedAt || null,
                    isComplete: isComplete
                };
            })
        );

        // Sort by due date (upcoming first), then by completion status
        assignmentsWithStatus.sort((a, b) => {
            // Incomplete first
            if (a.isComplete !== b.isComplete) {
                return a.isComplete ? 1 : -1;
            }
            // Then by due date
            if (a.dueDate && b.dueDate) {
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
        });

        return success({ assignments: assignmentsWithStatus });
    } catch (err) {
        console.error('Get my assignments error:', err);
        return error('Failed to get assignments', 500);
    }
};
