/**
 * 중복 학생 자동 병합 스크립트
 * 브라우저 콘솔에서 실행하거나 자동 실행
 */

async function autoMergeAllDuplicates() {
    console.log('🔍 중복 학생 검색 중...');

    const duplicateGroups = storage.findDuplicateStudents();

    if (duplicateGroups.length === 0) {
        console.log('✅ 중복된 학생이 없습니다.');
        alert('중복된 학생이 없습니다.');
        return;
    }

    console.log(`⚠️ ${duplicateGroups.length}개 그룹에서 중복 학생 발견`);

    // 병합 계획 출력
    const plan = duplicateGroups.map((group, index) => {
        const answerCounts = group.map(student => {
            const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
            const examCount = new Set(answers.map(a => a.examId)).size;
            return {
                student,
                answerCount: answers.length,
                examCount
            };
        });

        // 가장 많은 답안을 가진 학생을 타겟으로 선택
        answerCounts.sort((a, b) => b.answerCount - a.answerCount);
        const target = answerCounts[0];
        const sources = answerCounts.slice(1);

        return {
            groupIndex: index + 1,
            target,
            sources,
            totalStudents: group.length
        };
    });

    // 병합 계획 출력
    console.log('\n📋 병합 계획:');
    plan.forEach(p => {
        console.log(`\n그룹 ${p.groupIndex}: ${p.target.student.name} (${p.target.student.school} ${p.target.student.grade})`);
        console.log(`  ✓ 유지: ${p.target.student.name} (ID: ${p.target.student.id}) - 답안 ${p.target.answerCount}개, 시험 ${p.target.examCount}개`);
        p.sources.forEach(s => {
            console.log(`  ✗ 병합: ${s.student.name} (ID: ${s.student.id}) - 답안 ${s.answerCount}개, 시험 ${s.examCount}개`);
        });
    });

    const totalMerges = plan.reduce((sum, p) => sum + p.sources.length, 0);

    const confirmed = confirm(
        `⚠️ 중복 학생 자동 병합\n\n` +
        `총 ${duplicateGroups.length}개 그룹에서 ${totalMerges}명의 학생을 병합합니다.\n` +
        `각 그룹에서 가장 많은 답안을 가진 학생으로 통합됩니다.\n\n` +
        `이 작업은 되돌릴 수 없습니다!\n` +
        `계속하시겠습니까?`
    );

    if (!confirmed) {
        console.log('❌ 사용자가 취소했습니다.');
        return;
    }

    // 병합 실행
    console.log('\n🔄 병합 시작...');
    let successCount = 0;
    let failCount = 0;

    for (const p of plan) {
        try {
            console.log(`\n그룹 ${p.groupIndex} 병합 중...`);

            for (const source of p.sources) {
                try {
                    await storage.mergeStudents(p.target.student.id, source.student.id);
                    console.log(`  ✓ ${source.student.name} (${source.student.id}) → ${p.target.student.name} (${p.target.student.id})`);
                    successCount++;
                } catch (error) {
                    console.error(`  ✗ 병합 실패: ${source.student.id}`, error);
                    failCount++;
                }
            }
        } catch (error) {
            console.error(`그룹 ${p.groupIndex} 병합 실패:`, error);
            failCount += p.sources.length;
        }
    }

    console.log('\n✅ 병합 완료!');
    console.log(`성공: ${successCount}명`);
    if (failCount > 0) {
        console.log(`실패: ${failCount}명`);
    }

    // 답안이 없는 학생 삭제
    console.log('\n🧹 답안이 없는 학생 정리 중...');
    const deletedCount = await storage.removeStudentsWithNoAnswers();

    alert(
        `✅ 중복 학생 병합 완료!\n\n` +
        `병합 성공: ${successCount}명\n` +
        (failCount > 0 ? `병합 실패: ${failCount}명\n` : '') +
        (deletedCount > 0 ? `답안 없는 학생 삭제: ${deletedCount}명\n` : '') +
        `\n페이지를 새로고침하여 결과를 확인하세요.`
    );

    // 학생 목록 새로고침
    if (window.studentManager) {
        studentManager.loadStudentList();
        studentManager.detectDuplicates();
    }

    return {
        success: successCount,
        failed: failCount,
        total: successCount + failCount
    };
}

// 자동 실행 여부 (false로 설정하면 수동 실행만 가능)
const AUTO_RUN_ON_LOAD = false;

if (AUTO_RUN_ON_LOAD && typeof storage !== 'undefined') {
    // 페이지 로드 후 자동 실행
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            autoMergeAllDuplicates();
        }, 2000);
    });
}

// 전역 함수로 노출 (콘솔에서 실행 가능)
window.autoMergeAllDuplicates = autoMergeAllDuplicates;

console.log('💡 중복 학생 자동 병합 스크립트 로드됨');
console.log('💡 실행하려면: autoMergeAllDuplicates()');
