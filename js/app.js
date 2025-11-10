/**
 * 메인 애플리케이션 컨트롤러
 */

class App {
    constructor() {
        this.currentTab = 'exam-management';
        this.init();
    }

    init() {
        // 중복 답안 데이터 정리 (앱 시작 시 자동 실행)
        this.cleanupData();
        this.setupTabNavigation();
        this.setupBackupRestore();
        this.initializeModules();
    }

    /**
     * 데이터 정리 (중복 답안 제거)
     */
    cleanupData() {
        try {
            const removedCount = storage.removeDuplicateAnswers();
            if (removedCount > 0) {
                console.log(`✅ 중복 답안 ${removedCount}개가 자동으로 정리되었습니다.`);
            }
        } catch (error) {
            console.error('데이터 정리 중 오류:', error);
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
