/**
 * 수강반(Class) 관리 모듈
 * 수강반 CRUD 및 학생 배정 기능
 */

class ClassManager {
    constructor() {
        this.classes = [];
        this.filteredClasses = [];
        this.selectedClassId = null;
        this.currentPage = 1;
        this.pageSize = 10;
        this.searchQuery = '';
        this.selectedOrg = '';
        this.organizations = [];
        this.isInitialized = false;
    }

    async init() {
        console.log('[ClassManager] init 호출, isInitialized:', this.isInitialized);

        // 이미 초기화된 경우 목록만 새로고침
        if (this.isInitialized) {
            await this.loadClasses();
            return;
        }

        // 로딩 표시
        const container = document.getElementById('classList');
        if (container) {
            container.innerHTML = '<div class="panel-placeholder"><p>로딩 중...</p></div>';
        }

        // 사용자 역할에 따라 기관 필터 표시
        const session = SessionManager.getSession();
        console.log('[ClassManager] session:', session);

        if (session && session.role === 'admin') {
            await this.loadOrganizations();
            document.getElementById('orgFilterGroup').style.display = 'flex';
        }

        await this.loadClasses();
        this.isInitialized = true;
    }

    async loadOrganizations() {
        try {
            // API에서 기관 목록 로드
            const response = await apiClient.request('GET', '/admin/organizations');
            this.organizations = response.organizations || [];

            const select = document.getElementById('classOrgFilter');
            if (select) {
                select.innerHTML = '<option value="">전체 기관</option>' +
                    this.organizations.map(org =>
                        `<option value="${this.escapeHtml(org)}">${this.escapeHtml(org)}</option>`
                    ).join('');
            }
        } catch (error) {
            console.error('기관 목록 로드 오류:', error);
            // Fallback: 기존 캐시에서 시도
            const users = storage.cache.users || [];
            const orgSet = new Set();
            users.forEach(u => {
                if (u.organization) orgSet.add(u.organization);
            });
            this.organizations = Array.from(orgSet).sort();
        }
    }

    async loadClasses() {
        console.log('[ClassManager] loadClasses 시작');
        try {
            const params = {};
            if (this.selectedOrg) {
                params.organization = this.selectedOrg;
            }

            console.log('[ClassManager] API 호출 중...', params);
            const result = await storage.getClasses(params);
            console.log('[ClassManager] API 응답:', result);

            this.classes = result.classes || result || [];
            console.log('[ClassManager] 수강반 수:', this.classes.length);

            this.applyFilters();
            this.renderClassList();
        } catch (error) {
            console.error('[ClassManager] 수강반 로드 오류:', error);
            this.showError('수강반 목록을 불러오는데 실패했습니다.');
        }
    }

    onOrgFilterChange() {
        this.selectedOrg = document.getElementById('classOrgFilter').value;
        this.currentPage = 1;
        this.loadClasses();
    }

    onSearchChange(query) {
        this.searchQuery = query.trim().toLowerCase();
        this.currentPage = 1;
        this.applyFilters();
        this.renderClassList();
    }

    applyFilters() {
        if (!this.searchQuery) {
            this.filteredClasses = [...this.classes];
        } else {
            this.filteredClasses = this.classes.filter(cls =>
                cls.name.toLowerCase().includes(this.searchQuery) ||
                (cls.description && cls.description.toLowerCase().includes(this.searchQuery)) ||
                (cls.organization && cls.organization.toLowerCase().includes(this.searchQuery))
            );
        }
    }

    renderClassList() {
        console.log('[ClassManager] renderClassList 호출, filteredClasses:', this.filteredClasses.length);

        const container = document.getElementById('classList');
        const countEl = document.getElementById('classListCount');
        const paginationEl = document.getElementById('classPagination');

        if (!container) {
            console.warn('[ClassManager] classList 컨테이너를 찾을 수 없음');
            return;
        }

        // 총 개수 표시
        if (countEl) {
            countEl.textContent = `${this.filteredClasses.length}개`;
        }

        if (this.filteredClasses.length === 0) {
            container.innerHTML = `
                <div class="panel-placeholder">
                    <p>등록된 수강반이 없습니다.</p>
                </div>
            `;
            if (paginationEl) paginationEl.innerHTML = '';
            return;
        }

        // 페이지네이션 계산
        const totalPages = Math.ceil(this.filteredClasses.length / this.pageSize);
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const pageClasses = this.filteredClasses.slice(startIdx, startIdx + this.pageSize);

        // 리스트 렌더링
        container.innerHTML = pageClasses.map(cls => `
            <div class="class-list-item ${this.selectedClassId === cls.id ? 'selected' : ''}"
                 data-class-id="${cls.id}"
                 onclick="classManager.selectClass('${cls.id}')">
                <div class="class-list-item-info">
                    <div class="class-list-item-name">${this.escapeHtml(cls.name)}</div>
                    <div class="class-list-item-meta">
                        ${cls.organization ? this.escapeHtml(cls.organization) : ''}
                        ${cls.teacherName ? ' · ' + this.escapeHtml(cls.teacherName) : ''}
                    </div>
                </div>
                <div class="class-list-item-count">${cls.studentCount || 0}명</div>
            </div>
        `).join('');

        // 페이지네이션 렌더링
        if (paginationEl) {
            if (totalPages <= 1) {
                paginationEl.innerHTML = '';
            } else {
                paginationEl.innerHTML = `
                    <button onclick="classManager.goToPage(${this.currentPage - 1})"
                            ${this.currentPage === 1 ? 'disabled' : ''}>이전</button>
                    <span class="page-info">${this.currentPage} / ${totalPages}</span>
                    <button onclick="classManager.goToPage(${this.currentPage + 1})"
                            ${this.currentPage === totalPages ? 'disabled' : ''}>다음</button>
                `;
            }
        }
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredClasses.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderClassList();
    }

    async selectClass(classId) {
        this.selectedClassId = classId;
        this.renderClassList(); // 선택 상태 업데이트

        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;

        // 상세 패널 표시
        document.getElementById('classDetailPlaceholder').style.display = 'none';
        document.getElementById('classDetailContent').style.display = 'block';

        // 정보 표시
        document.getElementById('classDetailTitle').textContent = cls.name;
        document.getElementById('classDetailInfo').textContent =
            `${cls.organization || ''} ${cls.description ? '· ' + cls.description : ''}`;

        // 학생 목록 로드
        await this.loadClassStudents(classId);
    }

    async loadClassStudents(classId) {
        const container = document.getElementById('classStudentList');
        const countSpan = document.getElementById('classStudentCount');
        if (!container) return;

        container.innerHTML = '<div class="loading">로딩 중...</div>';

        try {
            const result = await storage.getClassStudents(classId);
            const students = result.students || [];

            if (countSpan) countSpan.textContent = students.length;

            if (students.length === 0) {
                container.innerHTML = `
                    <div class="panel-placeholder" style="min-height: 100px;">
                        <p>등록된 학생이 없습니다.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>이름</th>
                            <th>학교</th>
                            <th>학년</th>
                            <th>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(s => `
                            <tr>
                                <td>${this.escapeHtml(s.name)}</td>
                                <td>${this.escapeHtml(s.school || '-')}</td>
                                <td>${this.escapeHtml(s.grade || '-')}</td>
                                <td>
                                    <button class="btn btn-sm btn-danger"
                                            onclick="classManager.removeStudent('${classId}', '${s.id}')">
                                        제외
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (error) {
            console.error('학생 목록 로드 오류:', error);
            container.innerHTML = `
                <div class="panel-placeholder" style="min-height: 100px;">
                    <p>학생 목록을 불러오는데 실패했습니다.</p>
                </div>
            `;
        }
    }

    showCreateClassModal() {
        // 모달이 이미 있으면 삭제 후 재생성 (기관 목록 업데이트 반영)
        const existingModal = document.getElementById('classModal');
        if (existingModal) {
            existingModal.remove();
        }
        this.createClassModal();

        document.getElementById('classModalTitle').textContent = '새 수강반 만들기';
        document.getElementById('classForm').reset();
        document.getElementById('classForm').dataset.classId = '';
        document.getElementById('classModal').classList.add('active');
    }

    showEditClassModal() {
        if (!this.selectedClassId) return;

        const cls = this.classes.find(c => c.id === this.selectedClassId);
        if (!cls) return;

        // 모달이 이미 있으면 삭제 후 재생성 (기관 목록 업데이트 반영)
        const existingModal = document.getElementById('classModal');
        if (existingModal) {
            existingModal.remove();
        }
        this.createClassModal();

        document.getElementById('classModalTitle').textContent = '수강반 수정';
        document.getElementById('className').value = cls.name;
        document.getElementById('classDescription').value = cls.description || '';

        // 기관 선택 (admin인 경우에만)
        const orgSelect = document.getElementById('classOrganization');
        if (orgSelect && cls.organization) {
            orgSelect.value = cls.organization;
        }

        document.getElementById('classForm').dataset.classId = this.selectedClassId;
        document.getElementById('classModal').classList.add('active');
    }

    createClassModal() {
        const session = SessionManager.getSession();
        const isAdmin = session && session.role === 'admin';

        // 기관 옵션 생성
        const orgOptions = this.organizations.map(org =>
            `<option value="${this.escapeHtml(org)}">${this.escapeHtml(org)}</option>`
        ).join('');

        const modalHtml = `
            <div id="classModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="classModalTitle">새 수강반 만들기</h3>
                        <button class="modal-close" onclick="classManager.closeClassModal()">&times;</button>
                    </div>
                    <form id="classForm" onsubmit="classManager.saveClass(event)">
                        <div class="modal-body">
                            ${isAdmin ? `
                            <div class="form-group" id="classOrgGroup">
                                <label for="classOrganization">소속 기관 *</label>
                                <select id="classOrganization" class="form-control" required>
                                    <option value="">기관을 선택하세요</option>
                                    ${orgOptions}
                                </select>
                            </div>
                            ` : ''}
                            <div class="form-group">
                                <label for="className">수강반 이름 *</label>
                                <input type="text" id="className" class="form-control" required
                                       placeholder="예: 중등 3기 A반">
                            </div>
                            <div class="form-group">
                                <label for="classDescription">설명</label>
                                <textarea id="classDescription" class="form-control" rows="3"
                                          placeholder="수강반에 대한 설명을 입력하세요"></textarea>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="classManager.closeClassModal()">
                                취소
                            </button>
                            <button type="submit" class="btn btn-primary">저장</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeClassModal() {
        const modal = document.getElementById('classModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async saveClass(event) {
        event.preventDefault();

        const form = document.getElementById('classForm');
        const classId = form.dataset.classId;
        const name = document.getElementById('className').value.trim();
        const description = document.getElementById('classDescription').value.trim();

        // admin인 경우 기관 선택값 가져오기
        const orgSelect = document.getElementById('classOrganization');
        const organization = orgSelect ? orgSelect.value : null;

        if (!name) {
            alert('수강반 이름을 입력해주세요.');
            return;
        }

        // admin인 경우 기관 필수
        const session = SessionManager.getSession();
        if (session && session.role === 'admin' && !organization) {
            alert('소속 기관을 선택해주세요.');
            return;
        }

        try {
            const data = { name, description };
            if (organization) {
                data.organization = organization;
            }

            if (classId) {
                await storage.updateClass(classId, data);
            } else {
                await storage.createClass(data);
            }

            this.closeClassModal();
            await this.loadClasses();

            // 수정한 경우 상세 정보 업데이트
            if (classId && this.selectedClassId === classId) {
                this.selectClass(classId);
            }
        } catch (error) {
            console.error('수강반 저장 오류:', error);
            alert('수강반 저장에 실패했습니다: ' + error.message);
        }
    }

    async deleteSelectedClass() {
        if (!this.selectedClassId) return;

        const cls = this.classes.find(c => c.id === this.selectedClassId);
        if (!cls) return;

        if (!confirm(`"${cls.name}" 수강반을 삭제하시겠습니까?\n\n소속된 학생들의 수강 기록도 함께 삭제됩니다.`)) {
            return;
        }

        try {
            await storage.deleteClass(this.selectedClassId);
            this.selectedClassId = null;

            // 상세 패널 숨기기
            document.getElementById('classDetailPlaceholder').style.display = 'flex';
            document.getElementById('classDetailContent').style.display = 'none';

            await this.loadClasses();
        } catch (error) {
            console.error('수강반 삭제 오류:', error);
            alert('수강반 삭제에 실패했습니다: ' + error.message);
        }
    }

    async removeStudent(classId, studentId) {
        if (!confirm('이 학생을 수강반에서 제외하시겠습니까?')) {
            return;
        }

        try {
            await storage.removeStudentFromClass(classId, studentId);
            await this.loadClassStudents(classId);
            await this.loadClasses(); // 학생 수 업데이트
        } catch (error) {
            console.error('학생 제외 오류:', error);
            alert('학생 제외에 실패했습니다: ' + error.message);
        }
    }

    showAddStudentModal() {
        if (!this.selectedClassId) {
            alert('먼저 수강반을 선택해주세요.');
            return;
        }

        const modal = document.getElementById('addStudentToClassModal');
        if (!modal) {
            this.createAddStudentModal();
        }

        document.getElementById('studentSearchForClass').value = '';
        document.getElementById('studentSearchResultsForClass').innerHTML = '';
        document.getElementById('addStudentToClassModal').classList.add('active');
    }

    createAddStudentModal() {
        const modalHtml = `
            <div id="addStudentToClassModal" class="modal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3>수강반에 학생 추가</h3>
                        <button class="modal-close" onclick="classManager.closeAddStudentModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>학생 검색</label>
                            <input type="text" id="studentSearchForClass" class="form-control"
                                   placeholder="학생 이름으로 검색..."
                                   oninput="classManager.searchStudentsForClass(this.value)">
                        </div>
                        <div id="studentSearchResultsForClass" class="student-search-results">
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeAddStudentModal() {
        const modal = document.getElementById('addStudentToClassModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    searchStudentsForClass(query) {
        const container = document.getElementById('studentSearchResultsForClass');
        if (!container) return;

        if (!query.trim()) {
            container.innerHTML = '';
            return;
        }

        // 기존 캐시된 학생 검색
        const allStudents = storage.getAllStudents();
        const filtered = allStudents.filter(s =>
            s.name.includes(query) ||
            (s.school && s.school.includes(query))
        ).slice(0, 20);

        if (filtered.length === 0) {
            container.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">검색 결과가 없습니다.</p>';
            return;
        }

        container.innerHTML = filtered.map(s => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                <div>
                    <span style="font-weight: 500;">${this.escapeHtml(s.name)}</span>
                    <span style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 0.5rem;">
                        ${this.escapeHtml(s.school || '')} ${this.escapeHtml(s.grade || '')}
                    </span>
                </div>
                <button class="btn btn-sm btn-primary"
                        onclick="classManager.addStudentToCurrentClass('${s.id}', this)">
                    추가
                </button>
            </div>
        `).join('');
    }

    async addStudentToCurrentClass(studentId, btnElement) {
        if (!this.selectedClassId) return;

        try {
            await storage.addStudentsToClass(this.selectedClassId, [studentId]);
            await this.loadClassStudents(this.selectedClassId);
            await this.loadClasses();

            // 버튼 비활성화
            if (btnElement) {
                btnElement.textContent = '추가됨';
                btnElement.disabled = true;
                btnElement.classList.remove('btn-primary');
                btnElement.classList.add('btn-secondary');
            }
        } catch (error) {
            console.error('학생 추가 오류:', error);
            alert('학생 추가에 실패했습니다: ' + error.message);
        }
    }

    showError(message) {
        const container = document.getElementById('classList');
        if (container) {
            container.innerHTML = `
                <div class="panel-placeholder">
                    <p style="color: var(--danger-color);">${message}</p>
                </div>
            `;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 전역 인스턴스 (window에 등록하여 app.js에서 접근 가능하도록)
window.classManager = new ClassManager();
