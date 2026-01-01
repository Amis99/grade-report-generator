/**
 * 학생 관리 모듈
 */

class StudentManager {
    constructor() {
        this.duplicateGroups = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStudentList();
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
            this.filterStudentList(e.target.value);
        });

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

            return `
                <div class="student-item" data-student-id="${student.id}"
                     data-name="${student.name}"
                     data-school="${student.school}"
                     data-grade="${student.grade}">
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
     * 학생 목록 필터링
     */
    filterStudentList(searchText) {
        const studentItems = document.querySelectorAll('.student-item');
        const lowerSearch = searchText.trim().toLowerCase();

        studentItems.forEach(item => {
            const name = item.getAttribute('data-name').toLowerCase();
            const school = item.getAttribute('data-school').toLowerCase();
            const grade = item.getAttribute('data-grade').toLowerCase();

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
}
