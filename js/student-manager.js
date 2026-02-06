/**
 * 학생 관리 모듈 (통합: 기본 정보 + 계정 관리)
 */

class StudentManager {
    constructor() {
        this.duplicateGroups = [];
        this.selectedClassId = '';
        this.classes = [];
        this.studentClassMap = new Map(); // studentId -> [classIds]
        this.selectedStudents = new Set(); // 선택된 학생 ID 목록 (기본 탭)

        // 계정 관리 탭 상태
        this.currentTab = 'student-basic';
        this.accountFilterHasAccount = null; // null: 전체, true: 계정 있음, false: 계정 없음
        this.accountSelectionMode = false;
        this.accountSelectedStudents = new Set(); // 계정 탭에서 선택된 학생
        this.accountCounter = 1;
        this.currentCreateAccountStudent = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadClasses();
        this.loadStudentList();
        this.setupOrgFilter();
    }

    /**
     * 본사 관리자인지 확인
     */
    isAdmin() {
        const user = SessionManager.getCurrentUser();
        return user?.role === 'admin';
    }

    /**
     * 기관 필터 설정 (admin만 표시)
     */
    setupOrgFilter() {
        const isAdmin = this.isAdmin();

        // 기본 탭 기관 필터
        const studentOrgFilter = document.getElementById('studentOrgFilter');
        if (studentOrgFilter) {
            studentOrgFilter.style.display = isAdmin ? 'block' : 'none';
            if (isAdmin) {
                this.populateOrgFilter(studentOrgFilter);
                studentOrgFilter.addEventListener('change', () => this.loadStudentList());
            }
        }

        // 계정 탭 기관 필터
        const accountOrgFilter = document.getElementById('accountOrgFilter');
        if (accountOrgFilter) {
            accountOrgFilter.style.display = isAdmin ? 'block' : 'none';
            if (isAdmin) {
                this.populateOrgFilter(accountOrgFilter);
            }
        }

        // 헤더 액션 버튼 (탭에 따라 토글)
        this.updateHeaderActions();
    }

    /**
     * 기관 드롭다운 채우기
     */
    populateOrgFilter(selectElement) {
        const students = storage.getAllStudents();
        const orgs = new Set();
        students.forEach(s => {
            if (s.organization) orgs.add(s.organization);
        });

        selectElement.innerHTML = '<option value="">모든 기관</option>' +
            Array.from(orgs).sort().map(org =>
                `<option value="${org}">${org}</option>`
            ).join('');
    }

    /**
     * 수강반 목록 로드
     */
    async loadClasses() {
        try {
            const result = await storage.getClasses();
            this.classes = result.classes || [];
            this.populateClassFilter();
        } catch (error) {
            console.error('수강반 로드 오류:', error);
            this.classes = [];
        }
    }

    /**
     * 수강반 필터 드롭다운 채우기
     */
    populateClassFilter() {
        const select = document.getElementById('studentClassFilter');
        if (!select) return;

        select.innerHTML = '<option value="">모든 수강반</option>' +
            this.classes.map(cls =>
                `<option value="${cls.id}">${cls.name} (${cls.studentCount || 0}명)</option>`
            ).join('');
    }

    setupEventListeners() {
        // 중복 학생 찾기 버튼
        document.getElementById('detectDuplicatesBtn').addEventListener('click', () => {
            this.detectDuplicates();
        });

        // 모두 자동 병합 버튼
        document.getElementById('autoMergeBtn').addEventListener('click', async () => {
            if (typeof autoMergeAllDuplicates === 'function') {
                await autoMergeAllDuplicates();
            } else {
                alert('자동 병합 스크립트가 로드되지 않았습니다.');
            }
        });

        // 학생 검색
        document.getElementById('studentSearchInput').addEventListener('input', (e) => {
            this.filterStudentList(e.target.value, this.selectedClassId);
        });

        // 수강반 필터
        const classFilter = document.getElementById('studentClassFilter');
        if (classFilter) {
            classFilter.addEventListener('change', async (e) => {
                this.selectedClassId = e.target.value;
                await this.loadStudentListByClass();
            });
        }

        // 학생 수정 모달 이벤트
        document.getElementById('closeEditStudentModal').addEventListener('click', () => {
            this.closeEditModal();
        });

        document.getElementById('cancelEditStudentBtn').addEventListener('click', () => {
            this.closeEditModal();
        });

        document.getElementById('saveEditStudentBtn').addEventListener('click', async () => {
            await this.saveStudentEdit();
        });

        // 모달 외부 클릭 시 닫기
        document.getElementById('editStudentModal').addEventListener('click', (e) => {
            if (e.target.id === 'editStudentModal') {
                this.closeEditModal();
            }
        });
    }

    /**
     * 전체 학생 목록 로드
     */
    loadStudentList() {
        let students = storage.getAllStudents();

        // 권한에 따른 학생 필터링
        students = AuthService.filterStudents(students);
        const studentListDiv = document.getElementById('studentList');

        if (students.length === 0) {
            studentListDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <div class="empty-state-text">등록된 학생이 없습니다.</div>
                </div>
            `;
            return;
        }

        // 학생을 이름순으로 정렬
        const sortedStudents = [...students].sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        studentListDiv.innerHTML = sortedStudents.map(student => {
            const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
            const examCount = new Set(answers.map(a => a.examId)).size;
            const isSelected = this.selectedStudents.has(student.id);

            return `
                <div class="student-item ${isSelected ? 'selected' : ''}" data-student-id="${student.id}"
                     data-name="${student.name}"
                     data-school="${student.school}"
                     data-grade="${student.grade}">
                    <label class="student-checkbox">
                        <input type="checkbox" class="student-select-checkbox"
                               data-student-id="${student.id}"
                               ${isSelected ? 'checked' : ''}
                               onchange="studentManager.toggleStudentSelection('${student.id}', this.checked)">
                    </label>
                    <div class="student-item-info">
                        <h4>${student.name}</h4>
                        <div class="student-item-meta">
                            ${student.school} ${student.grade} | 응시 시험 ${examCount}개 | 답안 ${answers.length}개
                        </div>
                    </div>
                    <div class="student-item-actions">
                        <button class="btn btn-sm btn-secondary edit-student-btn" data-student-id="${student.id}">수정</button>
                        <button class="btn btn-sm btn-danger delete-student-btn" data-student-id="${student.id}">삭제</button>
                    </div>
                </div>
            `;
        }).join('');

        // 수정 버튼 이벤트
        studentListDiv.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const studentId = btn.getAttribute('data-student-id');
                this.openEditModal(studentId);
            });
        });

        // 삭제 버튼 이벤트
        studentListDiv.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const studentId = btn.getAttribute('data-student-id');
                await this.deleteStudent(studentId);
            });
        });
    }

    /**
     * 수강반 기준으로 학생 목록 로드
     */
    async loadStudentListByClass() {
        const studentListDiv = document.getElementById('studentList');

        if (!this.selectedClassId) {
            // 모든 수강반 선택 시 전체 학생 목록 로드
            this.loadStudentList();
            return;
        }

        try {
            // 선택한 수강반의 학생 목록 가져오기
            const result = await storage.getClassStudents(this.selectedClassId);
            const classStudents = result.students || [];

            if (classStudents.length === 0) {
                studentListDiv.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <div class="empty-state-text">이 수강반에 등록된 학생이 없습니다.</div>
                    </div>
                `;
                return;
            }

            // 학생을 이름순으로 정렬
            const sortedStudents = [...classStudents].sort((a, b) => {
                return a.name.localeCompare(b.name);
            });

            studentListDiv.innerHTML = sortedStudents.map(student => {
                const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
                const examCount = new Set(answers.map(a => a.examId)).size;
                const isSelected = this.selectedStudents.has(student.id);

                return `
                    <div class="student-item ${isSelected ? 'selected' : ''}" data-student-id="${student.id}"
                         data-name="${student.name}"
                         data-school="${student.school || ''}"
                         data-grade="${student.grade || ''}">
                        <label class="student-checkbox">
                            <input type="checkbox" class="student-select-checkbox"
                                   data-student-id="${student.id}"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="studentManager.toggleStudentSelection('${student.id}', this.checked)">
                        </label>
                        <div class="student-item-info">
                            <h4>${student.name}</h4>
                            <div class="student-item-meta">
                                ${student.school || ''} ${student.grade || ''} | 응시 시험 ${examCount}개 | 답안 ${answers.length}개
                            </div>
                        </div>
                        <div class="student-item-actions">
                            <button class="btn btn-sm btn-secondary edit-student-btn" data-student-id="${student.id}">수정</button>
                            <button class="btn btn-sm btn-danger delete-student-btn" data-student-id="${student.id}">삭제</button>
                        </div>
                    </div>
                `;
            }).join('');

            // 수정 버튼 이벤트
            studentListDiv.querySelectorAll('.edit-student-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const studentId = btn.getAttribute('data-student-id');
                    this.openEditModal(studentId);
                });
            });

            // 삭제 버튼 이벤트
            studentListDiv.querySelectorAll('.delete-student-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const studentId = btn.getAttribute('data-student-id');
                    await this.deleteStudent(studentId);
                });
            });

            // 검색어가 있으면 필터 적용
            const searchInput = document.getElementById('studentSearchInput');
            if (searchInput && searchInput.value.trim()) {
                this.filterStudentList(searchInput.value);
            }
        } catch (error) {
            console.error('수강반 학생 로드 오류:', error);
            studentListDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text">학생 목록을 불러오는데 실패했습니다.</div>
                </div>
            `;
        }
    }

    /**
     * 학생 목록 필터링
     */
    filterStudentList(searchText) {
        const studentItems = document.querySelectorAll('.student-item');
        const lowerSearch = searchText.trim().toLowerCase();

        studentItems.forEach(item => {
            const name = item.getAttribute('data-name').toLowerCase();
            const school = (item.getAttribute('data-school') || '').toLowerCase();
            const grade = (item.getAttribute('data-grade') || '').toLowerCase();

            const matches = name.includes(lowerSearch) ||
                          school.includes(lowerSearch) ||
                          grade.includes(lowerSearch);

            item.style.display = matches ? 'flex' : 'none';
        });
    }

    /**
     * 중복 학생 찾기
     */
    detectDuplicates() {
        this.duplicateGroups = storage.findDuplicateStudents();

        const duplicateAlert = document.getElementById('duplicateAlert');
        const duplicateSection = document.getElementById('duplicateStudentsSection');
        const duplicateList = document.getElementById('duplicateStudentsList');

        if (this.duplicateGroups.length === 0) {
            alert('중복된 학생이 발견되지 않았습니다.');
            duplicateAlert.style.display = 'none';
            duplicateSection.style.display = 'none';
            return;
        }

        duplicateAlert.style.display = 'block';
        duplicateSection.style.display = 'block';

        duplicateList.innerHTML = this.duplicateGroups.map((group, groupIndex) => {
            return `
                <div class="duplicate-group">
                    <div class="duplicate-group-header">
                        <strong>그룹 ${groupIndex + 1}:</strong> ${group[0].name} (${group[0].school} ${group[0].grade})
                        <span class="badge">${group.length}명</span>
                    </div>
                    <div class="duplicate-group-students">
                        ${group.map(student => {
                            const answers = storage.getAllAnswers().filter(a => a.studentId === student.id);
                            const examCount = new Set(answers.map(a => a.examId)).size;

                            return `
                                <div class="duplicate-student-card">
                                    <input type="radio" name="target_group_${groupIndex}" value="${student.id}" id="student_${student.id}">
                                    <label for="student_${student.id}">
                                        <div class="student-name">${student.name}</div>
                                        <div class="student-info">학교: ${student.school}</div>
                                        <div class="student-info">학년: ${student.grade}</div>
                                        <div class="student-stats">응시: ${examCount}개 시험, 답안: ${answers.length}개</div>
                                        <div class="student-id">ID: ${student.id}</div>
                                    </label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="duplicate-group-actions">
                        <button class="btn btn-primary merge-students-btn" data-group-index="${groupIndex}">
                            선택한 학생으로 병합
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 병합 버튼 이벤트
        duplicateList.querySelectorAll('.merge-students-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const groupIndex = parseInt(btn.getAttribute('data-group-index'));
                await this.mergeStudentsInGroup(groupIndex);
            });
        });
    }

    /**
     * 그룹 내 학생 병합
     */
    async mergeStudentsInGroup(groupIndex) {
        const selectedRadio = document.querySelector(`input[name="target_group_${groupIndex}"]:checked`);

        if (!selectedRadio) {
            alert('병합할 대상 학생을 선택해주세요.');
            return;
        }

        const targetId = selectedRadio.value;
        const group = this.duplicateGroups[groupIndex];
        const sourceIds = group.filter(s => s.id !== targetId).map(s => s.id);

        if (!confirm(`${sourceIds.length}명의 학생을 하나로 병합하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            for (const sourceId of sourceIds) {
                await storage.mergeStudents(targetId, sourceId);
            }

            // 답안이 없는 학생 삭제
            const deletedCount = await storage.removeStudentsWithNoAnswers();

            let message = '학생 병합이 완료되었습니다.';
            if (deletedCount > 0) {
                message += `\n답안이 없는 학생 ${deletedCount}명이 삭제되었습니다.`;
            }

            alert(message);
            this.detectDuplicates();
            this.loadStudentList();
        } catch (error) {
            alert('병합 중 오류가 발생했습니다: ' + error.message);
            console.error(error);
        }
    }

    /**
     * 학생 삭제
     */
    async deleteStudent(studentId) {
        const student = storage.getStudent(studentId);
        if (!student) return;

        const answers = storage.getAllAnswers().filter(a => a.studentId === studentId);

        if (answers.length > 0) {
            if (!confirm(`${student.name} 학생의 모든 답안(${answers.length}개)이 함께 삭제됩니다.\n정말 삭제하시겠습니까?`)) {
                return;
            }
        } else {
            if (!confirm(`${student.name} 학생을 삭제하시겠습니까?`)) {
                return;
            }
        }

        try {
            await storage.deleteStudent(studentId);
            alert('학생이 삭제되었습니다.');
            this.loadStudentList();
            this.detectDuplicates();
        } catch (error) {
            alert('삭제 중 오류가 발생했습니다: ' + error.message);
            console.error(error);
        }
    }

    /**
     * 학생 수정 모달 열기
     */
    openEditModal(studentId) {
        const student = storage.getStudent(studentId);
        if (!student) {
            alert('학생 정보를 찾을 수 없습니다.');
            return;
        }

        document.getElementById('editStudentId').value = student.id;
        document.getElementById('editStudentName').value = student.name || '';
        document.getElementById('editStudentSchool').value = student.school || '';
        document.getElementById('editStudentGrade').value = student.grade || '';

        document.getElementById('editStudentModal').classList.add('active');
    }

    /**
     * 학생 수정 모달 닫기
     */
    closeEditModal() {
        document.getElementById('editStudentModal').classList.remove('active');
        document.getElementById('editStudentId').value = '';
        document.getElementById('editStudentName').value = '';
        document.getElementById('editStudentSchool').value = '';
        document.getElementById('editStudentGrade').value = '';
    }

    /**
     * 학생 정보 저장
     */
    async saveStudentEdit() {
        const studentId = document.getElementById('editStudentId').value;
        const name = document.getElementById('editStudentName').value.trim();
        const school = document.getElementById('editStudentSchool').value.trim();
        const grade = document.getElementById('editStudentGrade').value.trim();

        if (!name) {
            alert('학생 이름을 입력해주세요.');
            return;
        }

        const student = storage.getStudent(studentId);
        if (!student) {
            alert('학생 정보를 찾을 수 없습니다.');
            return;
        }

        try {
            student.name = name;
            student.school = school;
            student.grade = grade;

            await storage.saveStudent(student);

            alert('학생 정보가 수정되었습니다.');
            this.closeEditModal();
            this.loadStudentList();
        } catch (error) {
            alert('저장 중 오류가 발생했습니다: ' + error.message);
            console.error(error);
        }
    }

    // === 학생 선택 및 수강반 등록 기능 ===

    /**
     * 개별 학생 선택/해제
     */
    toggleStudentSelection(studentId, isSelected) {
        if (isSelected) {
            this.selectedStudents.add(studentId);
        } else {
            this.selectedStudents.delete(studentId);
        }
        this.updateSelectionUI();
    }

    /**
     * 전체 선택/해제
     */
    toggleSelectAll(selectAll) {
        const checkboxes = document.querySelectorAll('.student-select-checkbox');

        checkboxes.forEach(cb => {
            const studentId = cb.getAttribute('data-student-id');
            const item = cb.closest('.student-item');

            // 보이는 학생만 선택 (필터링된 경우)
            if (item && item.style.display !== 'none') {
                cb.checked = selectAll;
                if (selectAll) {
                    this.selectedStudents.add(studentId);
                    item.classList.add('selected');
                } else {
                    this.selectedStudents.delete(studentId);
                    item.classList.remove('selected');
                }
            }
        });

        this.updateSelectionUI();
    }

    /**
     * 선택 해제
     */
    clearSelection() {
        this.selectedStudents.clear();

        // 모든 체크박스 해제
        document.querySelectorAll('.student-select-checkbox').forEach(cb => {
            cb.checked = false;
            const item = cb.closest('.student-item');
            if (item) item.classList.remove('selected');
        });

        // 전체 선택 체크박스도 해제
        const selectAllCb = document.getElementById('selectAllStudents');
        if (selectAllCb) selectAllCb.checked = false;

        this.updateSelectionUI();
    }

    /**
     * 선택 UI 업데이트
     */
    updateSelectionUI() {
        const selectionBar = document.getElementById('studentSelectionBar');
        const countSpan = document.getElementById('selectedStudentCount');
        const selectAllCb = document.getElementById('selectAllStudents');

        if (this.selectedStudents.size > 0) {
            selectionBar.style.display = 'flex';
            countSpan.textContent = `${this.selectedStudents.size}명 선택됨`;
        } else {
            selectionBar.style.display = 'none';
        }

        // 전체 선택 체크박스 상태 업데이트
        const visibleCheckboxes = document.querySelectorAll('.student-item:not([style*="display: none"]) .student-select-checkbox');
        const allSelected = visibleCheckboxes.length > 0 &&
            Array.from(visibleCheckboxes).every(cb => cb.checked);

        if (selectAllCb) {
            selectAllCb.checked = allSelected;
        }

        // 선택된 항목 스타일 업데이트
        document.querySelectorAll('.student-item').forEach(item => {
            const studentId = item.getAttribute('data-student-id');
            if (this.selectedStudents.has(studentId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * 수강반 등록 모달 열기
     */
    showAddToClassModal() {
        if (this.selectedStudents.size === 0) {
            alert('먼저 학생을 선택해주세요.');
            return;
        }

        // 수강반 목록 채우기
        const select = document.getElementById('targetClassSelect');
        select.innerHTML = '<option value="">수강반을 선택하세요</option>' +
            this.classes.map(cls =>
                `<option value="${cls.id}">${cls.name} (${cls.studentCount || 0}명)</option>`
            ).join('');

        // 선택된 학생 수 표시
        document.getElementById('addToClassInfo').textContent =
            `선택된 학생 ${this.selectedStudents.size}명을 등록할 수강반을 선택하세요.`;

        document.getElementById('addToClassModal').classList.add('active');
    }

    /**
     * 수강반 등록 모달 닫기
     */
    closeAddToClassModal() {
        document.getElementById('addToClassModal').classList.remove('active');
        document.getElementById('targetClassSelect').value = '';
    }

    /**
     * 선택된 학생들을 수강반에 등록
     */
    async addSelectedToClass() {
        const classId = document.getElementById('targetClassSelect').value;

        if (!classId) {
            alert('수강반을 선택해주세요.');
            return;
        }

        const studentIds = Array.from(this.selectedStudents);
        const selectedClass = this.classes.find(c => c.id === classId);

        try {
            await storage.addStudentsToClass(classId, studentIds);

            alert(`${studentIds.length}명의 학생이 "${selectedClass.name}" 수강반에 등록되었습니다.`);

            this.closeAddToClassModal();
            this.clearSelection();

            // 수강반 목록 새로고침
            await this.loadClasses();
        } catch (error) {
            console.error('수강반 등록 오류:', error);
            alert('수강반 등록에 실패했습니다: ' + error.message);
        }
    }

    // ========================================
    // 탭 전환 기능
    // ========================================

    /**
     * 탭 전환
     */
    switchTab(tabId) {
        this.currentTab = tabId;

        // 탭 버튼 활성화 상태 변경
        document.querySelectorAll('.student-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        // 탭 콘텐츠 표시/숨김
        document.querySelectorAll('.student-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        // 헤더 액션 버튼 업데이트
        this.updateHeaderActions();

        // 탭별 데이터 로드
        if (tabId === 'student-accounts') {
            this.loadAccountList();
        }
    }

    /**
     * 헤더 액션 버튼 업데이트
     */
    updateHeaderActions() {
        const headerActions = document.getElementById('studentHeaderActions');
        if (!headerActions) return;

        if (this.currentTab === 'student-basic') {
            headerActions.style.display = 'flex';
        } else {
            headerActions.style.display = 'none';
        }
    }

    // ========================================
    // 계정 관리 기능
    // ========================================

    /**
     * 계정 목록 로드
     */
    loadAccountList() {
        let students = storage.getAllStudents();

        // 권한에 따른 필터링
        students = AuthService.filterStudents(students);

        // 계정 번호 카운터 계산
        this.calculateNextAccountNumber(students);

        // 필터 적용
        students = this.getFilteredAccountStudents(students);

        // 통계 업데이트
        this.updateAccountStats(students);

        // 테이블 렌더링
        this.renderAccountTable(students);
    }

    /**
     * 다음 계정 번호 계산
     */
    calculateNextAccountNumber(students) {
        const orgPrefix = this.getOrganizationPrefix();
        let maxNum = 0;

        students.forEach(s => {
            if (s.username && s.username.startsWith(orgPrefix)) {
                const numPart = s.username.substring(orgPrefix.length);
                const num = parseInt(numPart, 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        });

        this.accountCounter = maxNum + 1;
    }

    /**
     * 기관 접두어 가져오기
     */
    getOrganizationPrefix(orgOverride = null) {
        const user = SessionManager.getCurrentUser();
        const org = orgOverride || user?.organization || '국어농장';

        const orgMap = {
            '국어농장': 'gf',
            '언어의창': 'lw',
            '언어의 창': 'lw',
            '테스트': 'te'
        };

        if (orgMap[org]) {
            return orgMap[org];
        }

        // 한글 기관명에서 접두어 생성
        const englishMatch = org.match(/[a-zA-Z]/g);
        if (englishMatch && englishMatch.length >= 2) {
            return (englishMatch[0] + englishMatch[1]).toLowerCase();
        }

        return 'st';
    }

    /**
     * 필터링된 계정 학생 목록
     */
    getFilteredAccountStudents(students) {
        let filtered = [...students];

        // 검색어 필터
        const searchInput = document.getElementById('accountSearchInput');
        const searchQuery = searchInput?.value.trim().toLowerCase() || '';
        if (searchQuery) {
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(searchQuery) ||
                (s.school || '').toLowerCase().includes(searchQuery)
            );
        }

        // 계정 유무 필터
        if (this.accountFilterHasAccount === true) {
            filtered = filtered.filter(s => s.hasAccount);
        } else if (this.accountFilterHasAccount === false) {
            filtered = filtered.filter(s => !s.hasAccount);
        }

        // 기관 필터 (admin만)
        if (this.isAdmin()) {
            const orgFilter = document.getElementById('accountOrgFilter');
            const selectedOrg = orgFilter?.value || '';
            if (selectedOrg) {
                filtered = filtered.filter(s => s.organization === selectedOrg);
            }
        }

        // 이름순 정렬
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        return filtered;
    }

    /**
     * 계정 통계 업데이트
     */
    updateAccountStats(filteredStudents) {
        const allStudents = AuthService.filterStudents(storage.getAllStudents());
        const statsDiv = document.getElementById('accountStats');
        if (!statsDiv) return;

        const totalCount = allStudents.length;
        const hasAccountCount = allStudents.filter(s => s.hasAccount).length;
        const filteredCount = filteredStudents.length;

        statsDiv.innerHTML = `
            <span>전체: <strong>${totalCount}</strong>명</span>
            <span>계정 있음: <strong>${hasAccountCount}</strong>명</span>
            <span>검색 결과: <strong>${filteredCount}</strong>명</span>
        `;
    }

    /**
     * 계정 테이블 렌더링
     */
    renderAccountTable(students) {
        const tbody = document.getElementById('accountTableBody');
        if (!tbody) return;

        const isAdmin = this.isAdmin();

        // 기관 컬럼 표시 여부
        document.querySelectorAll('.account-table .col-org').forEach(el => {
            el.style.display = isAdmin ? 'table-cell' : 'none';
        });

        // 선택 컬럼 표시 여부
        document.querySelectorAll('.account-table .col-select').forEach(el => {
            el.style.display = this.accountSelectionMode ? 'table-cell' : 'none';
        });

        if (students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${isAdmin ? 7 : 6}" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        학생이 없습니다.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = students.map(student => {
            const isSelected = this.accountSelectedStudents.has(student.id);
            return `
                <tr data-student-id="${student.id}">
                    <td class="col-select" style="display: ${this.accountSelectionMode ? 'table-cell' : 'none'};">
                        <input type="checkbox"
                               ${isSelected ? 'checked' : ''}
                               onchange="studentManager.toggleAccountStudentSelection('${student.id}', this.checked)">
                    </td>
                    <td><strong>${student.name}</strong></td>
                    <td>${student.school || '-'}</td>
                    <td>${student.grade || '-'}</td>
                    ${isAdmin ? `<td class="col-org">${student.organization || '-'}</td>` : ''}
                    <td>
                        ${student.hasAccount ?
                            `<span class="account-badge has-account">${student.username}</span>` :
                            `<span class="account-badge no-account">없음</span>`
                        }
                    </td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-secondary btn-icon" onclick="studentManager.openEditModal('${student.id}')">✏️</button>
                        ${student.hasAccount ?
                            `<button class="btn btn-sm btn-danger btn-icon" onclick="studentManager.deleteAccount('${student.id}')" title="계정 삭제">🗑️</button>` :
                            `<button class="btn btn-sm btn-success btn-icon" onclick="studentManager.showCreateAccountModal('${student.id}')" title="계정 생성">➕</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * 계정 필터 검색
     */
    filterAccounts() {
        this.loadAccountList();
    }

    /**
     * 계정 유무 필터 설정
     */
    setAccountFilter(hasAccount) {
        this.accountFilterHasAccount = hasAccount;

        // 버튼 스타일 업데이트
        document.querySelectorAll('.account-filter-buttons button').forEach(btn => {
            const filter = btn.getAttribute('data-filter');
            let isActive = false;
            if (filter === 'all' && hasAccount === null) isActive = true;
            else if (filter === 'no-account' && hasAccount === false) isActive = true;
            else if (filter === 'has-account' && hasAccount === true) isActive = true;

            btn.classList.toggle('btn-primary', isActive);
            btn.classList.toggle('btn-secondary', !isActive);
        });

        this.loadAccountList();
    }

    /**
     * 계정 선택 모드 토글
     */
    toggleAccountSelection() {
        this.accountSelectionMode = !this.accountSelectionMode;
        this.accountSelectedStudents.clear();

        const toggleBtn = document.getElementById('toggleAccountSelectionBtn');
        if (toggleBtn) {
            toggleBtn.textContent = this.accountSelectionMode ? '선택 취소' : '학생 선택';
            toggleBtn.classList.toggle('btn-secondary', this.accountSelectionMode);
            toggleBtn.classList.toggle('btn-outline', !this.accountSelectionMode);
        }

        this.updateMergeButton();
        this.loadAccountList();
    }

    /**
     * 계정 탭에서 학생 선택
     */
    toggleAccountStudentSelection(studentId, isSelected) {
        if (isSelected) {
            this.accountSelectedStudents.add(studentId);
        } else {
            this.accountSelectedStudents.delete(studentId);
        }
        this.updateMergeButton();
    }

    /**
     * 병합 버튼 표시/숨김
     */
    updateMergeButton() {
        const mergeBtn = document.getElementById('mergeAccountsBtn');
        if (mergeBtn) {
            if (this.accountSelectionMode && this.accountSelectedStudents.size >= 2) {
                mergeBtn.style.display = 'inline-block';
                mergeBtn.textContent = `선택한 ${this.accountSelectedStudents.size}명 병합`;
            } else {
                mergeBtn.style.display = 'none';
            }
        }
    }

    // ========================================
    // 신규 학생 추가
    // ========================================

    /**
     * 신규 학생 추가 모달 열기
     */
    showAddStudentModal() {
        document.getElementById('newStudentName').value = '';
        document.getElementById('newStudentSchool').value = '';
        document.getElementById('newStudentGrade').value = '';
        document.getElementById('createAccountCheckbox').checked = true;

        // 자동 아이디 생성
        const username = this.getOrganizationPrefix() + String(this.accountCounter).padStart(3, '0');
        document.getElementById('newStudentUsername').value = username;
        document.getElementById('newStudentPassword').value = 'Student1!';

        document.getElementById('addStudentModal').classList.add('active');
    }

    closeAddStudentModal() {
        document.getElementById('addStudentModal').classList.remove('active');
    }

    /**
     * 신규 학생 추가
     */
    async addNewStudent() {
        const name = document.getElementById('newStudentName').value.trim();
        const school = document.getElementById('newStudentSchool').value.trim();
        const grade = document.getElementById('newStudentGrade').value.trim();
        const createAccount = document.getElementById('createAccountCheckbox').checked;
        const username = document.getElementById('newStudentUsername').value.trim();
        const password = document.getElementById('newStudentPassword').value.trim();

        if (!name) {
            alert('학생 이름을 입력해주세요.');
            return;
        }
        if (!school) {
            alert('학교를 입력해주세요.');
            return;
        }
        if (!grade) {
            alert('학년을 입력해주세요.');
            return;
        }

        // 계정 생성 시 유효성 검사
        if (createAccount) {
            if (!username || !/^[a-zA-Z0-9_]{3,}$/.test(username)) {
                alert('아이디는 영문, 숫자, 밑줄만 사용 가능하며 3자 이상이어야 합니다.');
                return;
            }
            if (!password || password.length < 8) {
                alert('비밀번호는 8자 이상, 대문자/소문자/숫자/특수문자를 포함해야 합니다.');
                return;
            }
        }

        try {
            const user = SessionManager.getCurrentUser();
            const newStudent = {
                id: 'student_' + Date.now(),
                name,
                school,
                grade,
                organization: user?.organization || '국어농장'
            };

            // 먼저 학생 저장
            await storage.saveStudent(newStudent);

            // 계정 생성이 체크된 경우 Cognito 계정 생성
            if (createAccount) {
                try {
                    await storage.createStudentAccount(newStudent.id, {
                        username,
                        password
                    });
                    newStudent.hasAccount = true;
                    newStudent.username = username;
                    alert(`학생이 추가되고 계정이 생성되었습니다.\n\n아이디: ${username}\n비밀번호: ${password}`);
                } catch (accountError) {
                    console.error('계정 생성 오류:', accountError);
                    alert(`학생은 추가되었으나 계정 생성에 실패했습니다.\n${accountError.message || ''}`);
                }
            } else {
                alert('학생이 추가되었습니다.');
            }

            this.closeAddStudentModal();
            this.accountCounter++;
            this.loadAccountList();
            this.loadStudentList();
        } catch (error) {
            alert('학생 추가 실패: ' + error.message);
            console.error(error);
        }
    }

    // ========================================
    // 계정 생성/삭제
    // ========================================

    /**
     * 계정 생성 모달 열기
     */
    showCreateAccountModal(studentId) {
        const student = storage.getStudent(studentId);
        if (!student) {
            alert('학생 정보를 찾을 수 없습니다.');
            return;
        }

        this.currentCreateAccountStudent = student;

        document.getElementById('createAccountStudentInfo').textContent =
            `${student.name} (${student.school} ${student.grade})`;

        const username = this.getOrganizationPrefix(student.organization) +
            String(this.accountCounter).padStart(3, '0');
        document.getElementById('createAccountUsername').value = username;
        document.getElementById('createAccountPassword').value = 'Student1!';

        document.getElementById('createAccountModal').classList.add('active');
    }

    closeCreateAccountModal() {
        document.getElementById('createAccountModal').classList.remove('active');
        this.currentCreateAccountStudent = null;
    }

    /**
     * 계정 생성
     */
    async createAccount() {
        if (!this.currentCreateAccountStudent) return;

        const username = document.getElementById('createAccountUsername').value.trim();
        const password = document.getElementById('createAccountPassword').value.trim();

        if (!username || !password) {
            alert('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) {
            alert('아이디는 영문, 숫자, 밑줄만 사용 가능하며 3자 이상이어야 합니다.');
            return;
        }

        if (password.length < 8) {
            alert('비밀번호는 8자 이상, 대문자/소문자/숫자/특수문자를 포함해야 합니다.');
            return;
        }

        try {
            const student = this.currentCreateAccountStudent;

            // Cognito 계정 생성 API 호출
            await storage.createStudentAccount(student.id, {
                username,
                password
            });

            // 로컬 캐시 업데이트
            student.hasAccount = true;
            student.username = username;

            alert('계정이 생성되었습니다.');
            this.closeCreateAccountModal();
            this.accountCounter++;
            this.loadAccountList();
        } catch (error) {
            alert('계정 생성 실패: ' + error.message);
            console.error(error);
        }
    }

    /**
     * 계정 삭제
     */
    async deleteAccount(studentId) {
        const student = storage.getStudent(studentId);
        if (!student) return;

        if (!confirm(`${student.name} 학생의 계정을 삭제하시겠습니까?\n(학생 정보는 유지됩니다)`)) {
            return;
        }

        try {
            student.hasAccount = false;
            delete student.username;
            delete student.password;

            await storage.saveStudent(student);

            alert('계정이 삭제되었습니다.');
            this.loadAccountList();
        } catch (error) {
            alert('계정 삭제 실패: ' + error.message);
            console.error(error);
        }
    }

    // ========================================
    // 학생 병합
    // ========================================

    /**
     * 병합 모달 열기
     */
    showMergeModal() {
        if (this.accountSelectedStudents.size < 2) {
            alert('2명 이상의 학생을 선택해주세요.');
            return;
        }

        const selectedIds = Array.from(this.accountSelectedStudents);
        const students = selectedIds.map(id => storage.getStudent(id)).filter(s => s);

        const listDiv = document.getElementById('mergeStudentsList');
        listDiv.innerHTML = students.map((student, idx) => `
            <div class="merge-student-item ${idx === 0 ? 'selected' : ''}"
                 onclick="studentManager.selectMergeTarget('${student.id}')">
                <input type="radio" name="mergeTarget" value="${student.id}" ${idx === 0 ? 'checked' : ''}>
                <div>
                    <strong>${student.name}</strong>
                    <span style="color: var(--text-secondary); margin-left: 0.5rem;">
                        ${student.school} ${student.grade}
                        ${student.hasAccount ? `| 계정: ${student.username}` : '| 계정 없음'}
                    </span>
                </div>
            </div>
        `).join('');

        document.getElementById('mergeStudentsModal').classList.add('active');
    }

    closeMergeModal() {
        document.getElementById('mergeStudentsModal').classList.remove('active');
    }

    selectMergeTarget(studentId) {
        document.querySelectorAll('.merge-student-item').forEach(item => {
            item.classList.remove('selected');
        });

        const radio = document.querySelector(`input[name="mergeTarget"][value="${studentId}"]`);
        if (radio) {
            radio.checked = true;
            radio.closest('.merge-student-item').classList.add('selected');
        }
    }

    /**
     * 선택된 학생 병합
     */
    async mergeSelectedStudents() {
        const targetRadio = document.querySelector('input[name="mergeTarget"]:checked');
        if (!targetRadio) {
            alert('기준 학생을 선택해주세요.');
            return;
        }

        const targetId = targetRadio.value;
        const sourceIds = Array.from(this.accountSelectedStudents).filter(id => id !== targetId);

        if (!confirm(`${sourceIds.length}명의 학생을 병합하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            for (const sourceId of sourceIds) {
                await storage.mergeStudents(targetId, sourceId);
            }

            // 답안이 없는 학생 삭제
            await storage.removeStudentsWithNoAnswers();

            alert('학생 병합이 완료되었습니다.');
            this.closeMergeModal();
            this.accountSelectedStudents.clear();
            this.accountSelectionMode = false;
            this.updateMergeButton();
            this.loadAccountList();
            this.loadStudentList();
        } catch (error) {
            alert('병합 중 오류가 발생했습니다: ' + error.message);
            console.error(error);
        }
    }
}
