/**
 * 메인 애플리케이션 컨트롤러
 */

class App {
    constructor() {
        this.currentTab = 'exam-management';
        this.init();
    }

    async init() {
        // Firebase 캐시 로드 대기
        if (storage.useFirebase && !storage.cacheLoaded) {
            console.log('⏳ Firebase 데이터 로딩 중...');
            await this.waitForCache();
        }

        // 중복 답안 데이터 정리 (앱 시작 시 자동 실행)
        await this.cleanupData();
        this.setupTabNavigation();
        this.setupBackupRestore();
        this.initializeModules();
    }

    /**
     * Firebase 캐시 로드 대기
     */
    async waitForCache() {
        const maxWait = 10000; // 최대 10초 대기
        const startTime = Date.now();

        while (!storage.cacheLoaded) {
            if (Date.now() - startTime > maxWait) {
                console.error('❌ Firebase 캐시 로드 시간 초과');
                alert('데이터 로드에 시간이 걸리고 있습니다. 인터넷 연결을 확인해주세요.');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const loadTime = Date.now() - startTime;
        console.log(`✅ Firebase 데이터 로드 완료 (${loadTime}ms), UI 초기화 시작`);

        // 로딩 시간이 500ms 이상이면 사용자에게 안내
        if (loadTime > 500 && storage.cacheLoaded) {
            const stats = storage.cache;
            const totalItems = stats.exams.length + stats.questions.length +
                             stats.students.length + stats.answers.length;

            if (totalItems > 0) {
                this.showLoadingCompleteModal(stats, loadTime);
            }
        }
    }

    /**
     * 데이터 로딩 완료 모달 표시
     */
    showLoadingCompleteModal(stats, loadTime) {
        const modal = document.createElement('div');
        modal.className = 'loading-complete-modal';
        modal.innerHTML = `
            <div class="loading-complete-content">
                <div class="loading-complete-header">
                    <span class="loading-complete-icon">✅</span>
                    <h3>데이터 로딩 완료</h3>
                </div>
                <div class="loading-complete-body">
                    <p>클라우드에서 데이터를 성공적으로 가져왔습니다.</p>
                    <div class="loading-stats">
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">시험</span>
                            <span class="loading-stat-value">${stats.exams.length}개</span>
                        </div>
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">문제</span>
                            <span class="loading-stat-value">${stats.questions.length}개</span>
                        </div>
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">학생</span>
                            <span class="loading-stat-value">${stats.students.length}명</span>
                        </div>
                        <div class="loading-stat-item">
                            <span class="loading-stat-label">답안</span>
                            <span class="loading-stat-value">${stats.answers.length}개</span>
                        </div>
                    </div>
                    <p class="loading-time">로딩 시간: ${(loadTime / 1000).toFixed(2)}초</p>
                </div>
                <div class="loading-complete-footer">
                    <button class="btn btn-primary" onclick="this.closest('.loading-complete-modal').remove()">
                        확인
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 3초 후 자동 닫기
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 3000);
    }

    /**
     * 데이터 정리 (중복 답안 제거)
     */
    async cleanupData() {
        try {
            const removedCount = storage.removeDuplicateAnswers();
            if (removedCount > 0) {
                console.log(`✅ 중복 답안 ${removedCount}개가 자동으로 정리되었습니다.`);
            }

            // Firebase 사용 중이고 로컬 스토리지에 데이터가 있으면 마이그레이션 제안
            if (storage.useFirebase) {
                await this.checkLocalDataMigration();
            }
        } catch (error) {
            console.error('데이터 정리 중 오류:', error);
        }
    }

    /**
     * 로컬 스토리지 데이터를 Firebase로 마이그레이션
     */
    async checkLocalDataMigration() {
        const localKeys = ['gradeapp_exams', 'gradeapp_questions', 'gradeapp_students', 'gradeapp_answers'];
        const hasLocalData = localKeys.some(key => localStorage.getItem(key));

        if (hasLocalData && storage.cacheLoaded) {
            const hasFirebaseData = storage.cache.exams.length > 0 ||
                                   storage.cache.questions.length > 0 ||
                                   storage.cache.students.length > 0 ||
                                   storage.cache.answers.length > 0;

            if (!hasFirebaseData) {
                const migrate = confirm(
                    '🔥 로컬 브라우저에 저장된 데이터를 발견했습니다.\n\n' +
                    '클라우드(Firebase)로 데이터를 이동하시겠습니까?\n' +
                    '이동하면 모든 브라우저와 기기에서 동일한 데이터를 사용할 수 있습니다.\n\n' +
                    '※ 로컬 데이터는 백업 후 삭제됩니다.'
                );

                if (migrate) {
                    await this.migrateLocalToFirebase();
                }
            }
        }
    }

    /**
     * 로컬 데이터를 Firebase로 마이그레이션
     */
    async migrateLocalToFirebase() {
        try {
            console.log('🔄 로컬 데이터를 Firebase로 마이그레이션 중...');

            // 로컬 스토리지에서 데이터 읽기
            const localExams = JSON.parse(localStorage.getItem('gradeapp_exams') || '[]');
            const localQuestions = JSON.parse(localStorage.getItem('gradeapp_questions') || '[]');
            const localStudents = JSON.parse(localStorage.getItem('gradeapp_students') || '[]');
            const localAnswers = JSON.parse(localStorage.getItem('gradeapp_answers') || '[]');

            const totalItems = localExams.length + localQuestions.length +
                             localStudents.length + localAnswers.length;

            if (totalItems === 0) {
                alert('마이그레이션할 데이터가 없습니다.');
                return;
            }

            // Firebase에 업로드
            const updates = {};

            localExams.forEach(e => updates[`exams/${e.id}`] = e);
            localQuestions.forEach(q => updates[`questions/${q.id}`] = q);
            localStudents.forEach(s => updates[`students/${s.id}`] = s);
            localAnswers.forEach(a => updates[`answers/${a.id}`] = a);

            await firebaseDatabase.ref('/').update(updates);

            // 캐시 업데이트
            await storage.loadAllDataToCache();

            console.log(`✅ 마이그레이션 완료: ${totalItems}개 항목`);

            alert(
                `✅ 데이터 마이그레이션 완료!\n\n` +
                `시험: ${localExams.length}개\n` +
                `문제: ${localQuestions.length}개\n` +
                `학생: ${localStudents.length}명\n` +
                `답안: ${localAnswers.length}개\n\n` +
                `이제 모든 브라우저에서 동일한 데이터를 사용할 수 있습니다.`
            );

            // 로컬 스토리지 데이터 삭제 (백업은 유지)
            const backup = confirm('로컬 브라우저 데이터를 삭제하시겠습니까?\n(클라우드에 이미 저장되었습니다)');
            if (backup) {
                localStorage.removeItem('gradeapp_exams');
                localStorage.removeItem('gradeapp_questions');
                localStorage.removeItem('gradeapp_students');
                localStorage.removeItem('gradeapp_answers');
                console.log('✅ 로컬 데이터 삭제 완료');
            }

        } catch (error) {
            console.error('❌ 마이그레이션 실패:', error);
            alert('데이터 마이그레이션에 실패했습니다. 인터넷 연결을 확인해주세요.');
        }
    }

    /**
     * 탭 네비게이션 설정
     */
    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');

                // 모든 탭 비활성화
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // 선택된 탭 활성화
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');

                this.currentTab = tabId;

                // 탭 전환 시 데이터 새로고침
                this.refreshCurrentTab();
            });
        });
    }

    /**
     * 현재 탭 새로고침
     */
    refreshCurrentTab() {
        switch (this.currentTab) {
            case 'exam-management':
                if (window.examManager) {
                    examManager.loadExamList();
                }
                break;
            case 'answer-input':
                if (window.answerInput) {
                    answerInput.loadExamSelect();
                }
                break;
            case 'grading':
                if (window.grading) {
                    grading.loadExamSelect();
                }
                break;
            case 'report':
                if (window.reportGenerator) {
                    reportGenerator.loadExamSelect();
                }
                break;
            case 'wrong-note':
                if (window.wrongNote) {
                    wrongNote.loadStudentSelect();
                }
                break;
        }
    }

    /**
     * 백업 및 복원 기능
     */
    setupBackupRestore() {
        // 데이터 백업
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            const data = storage.exportAllData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `성적표_백업_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);

            alert('데이터가 백업되었습니다.');
        });

        // 데이터 복원
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('backupInput').click();
        });

        document.getElementById('backupInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await CSVUtils.readFile(file);
                const data = JSON.parse(text);

                if (confirm('기존 데이터를 모두 삭제하고 백업 데이터를 복원하시겠습니까?')) {
                    storage.importAllData(data);
                    alert('데이터가 복원되었습니다. 페이지를 새로고침합니다.');
                    location.reload();
                }
            } catch (error) {
                alert('데이터 복원에 실패했습니다: ' + error.message);
            }

            e.target.value = '';
        });
    }

    /**
     * 모듈 초기화
     */
    initializeModules() {
        // 각 모듈이 로드되면 자동으로 초기화됨
        window.examManager = new ExamManager();
        window.answerInput = new AnswerInput();
        window.grading = new Grading();
        window.reportGenerator = new ReportGenerator();
        window.wrongNote = new WrongNote();

        // SearchableSelect 초기화
        setTimeout(() => {
            initSearchableSelects();
        }, 100);
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
