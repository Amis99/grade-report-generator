/**
 * 학생 관리 모듈
 */

class StudentManager {
    constructor() {
        this.duplicateGroups = [];
        this.selectedClassId = '';
        this.classes = [];
        this.studentClassMap = new Map(); // studentId -> [classIds]
        this.selectedStudents = new Set(); // 선택된 학생 ID 목록
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadClasses();
        this.loadStudentList();
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
}
