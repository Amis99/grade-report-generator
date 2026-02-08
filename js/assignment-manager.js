/**
 * Assignment Manager
 * 선생님용 과제 관리 모듈
 */

class AssignmentManager {
    constructor() {
        this.assignments = [];
        this.classes = [];
        this.selectedAssignment = null;
        this.selectedPages = [];  // 페이지 데이터 저장
        this.filterClassId = '';
        this.filterStatus = '';
        this.searchQuery = '';
        this.initialized = false;
    }

    /**
     * 모듈 초기화
     */
    async init() {
        if (this.initialized) {
            await this.refresh();
            return;
        }

        this.setupEventListeners();
        await this.loadClasses();
        await this.loadAssignments();
        this.initialized = true;
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // PDF 파일 입력
        const pdfInput = document.getElementById('assignmentPdfInput');
        if (pdfInput) {
            pdfInput.addEventListener('change', (e) => this.handlePdfUpload(e));
        }
    }

    /**
     * 새로고침
     */
    async refresh() {
        await this.loadAssignments();
        this.renderAssignmentList();
    }

    /**
     * 수강반 목록 로드
     */
    async loadClasses() {
        try {
            const result = await storage.getClasses();
            this.classes = result.classes || result || [];
            this.populateClassFilters();
        } catch (error) {
            console.error('Failed to load classes:', error);
        }
    }

    /**
     * 수강반 필터 채우기
     */
    populateClassFilters() {
        const classFilter = document.getElementById('assignmentClassFilter');
        const submissionClassFilter = document.getElementById('submissionClassFilter');

        [classFilter, submissionClassFilter].forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">전체 수강반</option>';
            this.classes.forEach(cls => {
                select.innerHTML += `<option value="${cls.id}">${cls.name}</option>`;
            });
            select.value = currentValue;
        });
    }

    /**
     * 과제 목록 로드
     */
    async loadAssignments() {
        try {
            const params = {};
            if (this.filterClassId) params.classId = this.filterClassId;
            if (this.filterStatus) params.status = this.filterStatus;

            this.assignments = await storage.getAssignments(params);
            this.renderAssignmentList();
        } catch (error) {
            console.error('Failed to load assignments:', error);
            alert('과제 목록을 불러오는데 실패했습니다.');
        }
    }

    /**
     * 과제 목록 렌더링
     */
    renderAssignmentList() {
        const container = document.getElementById('assignmentList');
        const countBadge = document.getElementById('assignmentListCount');
        if (!container) return;

        let filtered = this.assignments;

        // 검색 필터
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(a => a.name.toLowerCase().includes(query));
        }

        // 정렬: 진행 중 → 초안 → 마감, 같은 상태 내에서는 최신순
        // 마감일 기반 실제 상태로 정렬
        const statusOrder = { active: 0, draft: 1, closed: 2 };
        filtered.sort((a, b) => {
            const aStatus = this.getEffectiveStatus(a);
            const bStatus = this.getEffectiveStatus(b);
            const orderDiff = (statusOrder[aStatus] ?? 9) - (statusOrder[bStatus] ?? 9);
            if (orderDiff !== 0) return orderDiff;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        if (countBadge) countBadge.textContent = `${filtered.length}`;

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">과제가 없습니다.</div>';
            return;
        }

        container.innerHTML = filtered.map(a => {
            const effectiveStatus = this.getEffectiveStatus(a);
            return `
            <div class="assignment-list-item ${this.selectedAssignment?.id === a.id ? 'selected' : ''}"
                 onclick="assignmentManager.selectAssignment('${a.id}')">
                <div class="assignment-item-header">
                    <span class="assignment-name">${this.escapeHtml(a.name)}</span>
                    <span class="status-badge status-${effectiveStatus}">${this.getStatusText(effectiveStatus)}</span>
                </div>
                <div class="assignment-item-info">
                    <span>${a.totalPages || 0}페이지</span>
                    ${a.dueDate ? `<span>마감: ${new Date(a.dueDate).toLocaleDateString('ko-KR')}</span>` : ''}
                </div>
            </div>
        `;}).join('');
    }

    /**
     * 마감일 기반 실제 상태 계산
     * - 마감일이 지나면 자동으로 'closed' 반환
     */
    getEffectiveStatus(assignment) {
        // 종료된 상태는 그대로 유지
        if (assignment.status === 'closed') return 'closed';

        // 초안 상태는 마감일 상관없이 그대로 유지
        if (assignment.status === 'draft') return 'draft';

        // 진행 중 상태인 경우, 마감일 확인
        if (assignment.status === 'active' && assignment.dueDate) {
            const dueDate = new Date(assignment.dueDate);
            const today = new Date();

            // 오늘 날짜만 비교 (시간 제외)
            today.setHours(0, 0, 0, 0);
            dueDate.setHours(0, 0, 0, 0);

            // 마감일 다음 날부터 종료로 표시
            if (today > dueDate) {
                return 'closed';
            }
        }

        return assignment.status;
    }

    /**
     * 상태 텍스트 반환
     */
    getStatusText(status) {
        const statusMap = {
            'draft': '초안',
            'active': '진행 중',
            'closed': '마감'
        };
        return statusMap[status] || status;
    }

    /**
     * 과제 선택
     */
    async selectAssignment(assignmentId) {
        try {
            const detail = await storage.getAssignment(assignmentId);
            this.selectedAssignment = detail;
            this.renderAssignmentDetail();
            this.renderAssignmentList();
        } catch (error) {
            console.error('Failed to load assignment:', error);
            alert('과제 정보를 불러오는데 실패했습니다.');
        }
    }

    /**
     * 과제 상세 렌더링
     */
    async renderAssignmentDetail() {
        const placeholder = document.getElementById('assignmentDetailPlaceholder');
        const content = document.getElementById('assignmentDetailContent');

        if (!placeholder || !content) return;

        if (!this.selectedAssignment) {
            placeholder.style.display = 'flex';
            content.style.display = 'none';
            return;
        }

        placeholder.style.display = 'none';
        content.style.display = 'block';

        const a = this.selectedAssignment;
        const effectiveStatus = this.getEffectiveStatus(a);

        // 기본 정보
        document.getElementById('assignmentDetailTitle').textContent = a.name;
        document.getElementById('assignmentStatusBadge').textContent = this.getStatusText(effectiveStatus);
        document.getElementById('assignmentStatusBadge').className = `status-badge status-${effectiveStatus}`;

        const classNames = (a.classIds || []).map(cid => {
            const cls = this.classes.find(c => c.id === cid);
            return cls ? cls.name : cid;
        }).join(', ');

        let infoHtml = `<strong>수강반:</strong> ${classNames || '미지정'}`;
        if (a.dueDate) {
            infoHtml += ` | <strong>마감:</strong> ${new Date(a.dueDate).toLocaleDateString('ko-KR')}`;
        }
        if (a.description) {
            infoHtml += `<br><strong>설명:</strong> ${this.escapeHtml(a.description)}`;
        }
        document.getElementById('assignmentDetailInfo').innerHTML = infoHtml;

        // PDF 정보
        const pdfInfo = document.getElementById('assignmentPdfInfo');
        if (a.totalPages > 0) {
            pdfInfo.innerHTML = `<p>총 ${a.totalPages}페이지 업로드됨</p>`;
        } else {
            pdfInfo.innerHTML = `<p>PDF가 업로드되지 않았습니다.</p>`;
        }

        // 페이지 썸네일 로드
        await this.loadPages();

        // 제출 현황 필터 업데이트
        const submissionClassFilter = document.getElementById('submissionClassFilter');
        submissionClassFilter.innerHTML = '<option value="">전체 수강반</option>';
        (a.classIds || []).forEach(cid => {
            const cls = this.classes.find(c => c.id === cid);
            if (cls) {
                submissionClassFilter.innerHTML += `<option value="${cls.id}">${cls.name}</option>`;
            }
        });

        // 상태 버튼 업데이트
        this.updateStatusButtons();

        // 제출 현황 자동 로드 (전체 수강반)
        await this.loadSubmissions();
    }

    /**
     * 페이지 로드
     */
    async loadPages() {
        if (!this.selectedAssignment) return;

        const pagesSection = document.getElementById('assignmentPagesSection');
        const pageCount = document.getElementById('assignmentPageCount');

        try {
            const result = await storage.getAssignmentPages(this.selectedAssignment.id);
            this.selectedPages = result.pages || [];

            if (pageCount) pageCount.textContent = this.selectedPages.length;

            if (this.selectedPages.length === 0) {
                if (pagesSection) pagesSection.style.display = 'none';
                return;
            }

            if (pagesSection) pagesSection.style.display = 'block';
        } catch (error) {
            console.error('Failed to load pages:', error);
            this.selectedPages = [];
            if (pagesSection) pagesSection.style.display = 'none';
        }
    }

    /**
     * 페이지 미리보기 모달 표시
     */
    showPagesPreviewModal() {
        if (this.selectedPages.length === 0) {
            alert('표시할 페이지가 없습니다.');
            return;
        }

        const modalHtml = `
            <div id="pagesPreviewModal" class="modal active">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3>페이지 미리보기 (${this.selectedPages.length}페이지)</h3>
                        <button class="modal-close" onclick="assignmentManager.closePagesPreviewModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="pages-preview-grid">
                            ${this.selectedPages.map(p => `
                                <div class="page-preview-item">
                                    <img src="${p.thumbnailUrl || ''}" alt="Page ${p.pageNumber}"
                                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22212%22><rect fill=%22%23f0f0f0%22 width=%22150%22 height=%22212%22/><text x=%2275%22 y=%22106%22 text-anchor=%22middle%22 fill=%22%23999%22>${p.pageNumber}</text></svg>'">
                                    <span class="page-label">${p.pageNumber}페이지</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="assignmentManager.closePagesPreviewModal()">닫기</button>
                    </div>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('pagesPreviewModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * 페이지 미리보기 모달 닫기
     */
    closePagesPreviewModal() {
        const modal = document.getElementById('pagesPreviewModal');
        if (modal) modal.remove();
    }

    /**
     * 제출 현황 로드
     */
    async loadSubmissions() {
        const classId = document.getElementById('submissionClassFilter').value;
        const container = document.getElementById('submissionsTable');

        if (!this.selectedAssignment) {
            container.innerHTML = '<p class="empty-state">과제를 선택하세요.</p>';
            return;
        }

        try {
            // classId가 없으면 과제에 할당된 모든 수강반의 학생 표시
            const params = { includeImages: true };
            if (classId) {
                params.classId = classId;
            }

            const result = await storage.getAssignmentSubmissions(this.selectedAssignment.id, params);
            this.currentSubmissions = result.submissions || [];

            if (this.currentSubmissions.length === 0) {
                container.innerHTML = '<p class="empty-state">해당 수강반에 학생이 없습니다.</p>';
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>학생</th>
                            <th>진행률</th>
                            <th>마지막 제출</th>
                            <th>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.currentSubmissions.map(s => {
                            const hasSubmissions = s.submittedPages && s.submittedPages.length > 0;
                            // 이미지 확인 아이콘 상태: 거부된 페이지 있으면 빨강, 모두 인정이면 초록
                            const hasRejected = hasSubmissions && s.submittedPages.some(p => !p.passed);
                            const allPassed = hasSubmissions && s.submittedPages.every(p => p.passed);
                            const imageIconStatus = !hasSubmissions ? '' : hasRejected ? 'status-rejected' : allPassed ? 'status-approved' : '';
                            // 유사도 아이콘 상태: 검사 안 했으면 노랑, 거부 있으면 빨강, 모두 인정이면 초록
                            const hasSimilarityChecked = hasSubmissions && s.submittedPages.some(p => p.similarity !== undefined && p.similarity !== null);
                            const similarityIconStatus = !hasSubmissions ? '' : !hasSimilarityChecked ? 'status-pending' : hasRejected ? 'status-rejected' : allPassed ? 'status-approved' : 'status-pending';
                            return `
                            <tr>
                                <td>
                                    <strong>${this.escapeHtml(s.student.name)}</strong>
                                    <br><small>${s.student.school || ''} ${s.student.grade || ''}</small>
                                </td>
                                <td>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: ${(s.passedCount / s.totalPages * 100) || 0}%"></div>
                                    </div>
                                    <span>${s.passedCount}/${s.totalPages}</span>
                                </td>
                                <td>${s.lastSubmittedAt ? new Date(s.lastSubmittedAt).toLocaleDateString('ko-KR') : '-'}</td>
                                <td>
                                    <div class="btn-group">
                                        <button class="btn-icon ${hasSubmissions ? imageIconStatus : 'disabled'}"
                                                onclick="${hasSubmissions ? `assignmentManager.showStudentSubmissionModal('${s.student.id}')` : ''}"
                                                title="${hasSubmissions ? '이미지 확인 (더블클릭으로 상태 변경)' : '제출된 이미지 없음'}"
                                                ${hasSubmissions ? '' : 'disabled'}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21 15 16 10 5 21"></polyline>
                                            </svg>
                                        </button>
                                        <button class="btn-icon ${hasSubmissions ? similarityIconStatus : 'disabled'}"
                                                onclick="${hasSubmissions ? `assignmentManager.checkSimilarity('${s.student.id}')` : ''}"
                                                title="${hasSubmissions ? '이미지 유사도 검사' : '제출된 이미지 없음'}"
                                                ${hasSubmissions ? '' : 'disabled'}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <circle cx="11" cy="11" r="8"></circle>
                                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            </svg>
                                        </button>
                                        <button class="btn-icon ${s.teacherComment ? 'has-comment' : ''}"
                                                onclick="assignmentManager.showCommentModal('${s.student.id}', '${this.escapeHtml(s.student.name)}', '${this.escapeHtml(s.teacherComment || '')}')"
                                                title="${s.teacherComment ? '코멘트 수정' : '코멘트 작성'}">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                                ${s.teacherComment ? '<line x1="9" y1="10" x2="15" y2="10"></line><line x1="12" y1="7" x2="12" y2="13"></line>' : ''}
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>
            `;
        } catch (error) {
            console.error('Failed to load submissions:', error);
            container.innerHTML = '<p class="empty-state error">제출 현황을 불러오는데 실패했습니다.</p>';
        }
    }

    /**
     * 과제 생성 모달 표시
     */
    showCreateModal() {
        this.showAssignmentModal(null);
    }

    /**
     * 과제 수정 모달 표시
     */
    showEditModal() {
        if (!this.selectedAssignment) return;
        this.showAssignmentModal(this.selectedAssignment);
    }

    /**
     * 과제 모달 표시
     */
    showAssignmentModal(assignment) {
        const isEdit = !!assignment;

        // 기본 마감일: 일주일 뒤
        const defaultDueDate = new Date();
        defaultDueDate.setDate(defaultDueDate.getDate() + 7);
        const defaultDueDateStr = defaultDueDate.toISOString().split('T')[0];

        // 모달 HTML 생성
        const modalHtml = `
            <div id="assignmentModal" class="modal active">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${isEdit ? '과제 수정' : '새 과제 만들기'}</h3>
                        <button class="modal-close" onclick="assignmentManager.closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>과제명 <span class="required">*</span></label>
                            <input type="text" id="assignmentName" class="form-control"
                                   value="${isEdit ? this.escapeHtml(assignment.name) : ''}" placeholder="과제명을 입력하세요">
                        </div>
                        <div class="form-group">
                            <label>설명</label>
                            <textarea id="assignmentDescription" class="form-control" rows="3"
                                      placeholder="과제 설명을 입력하세요">${isEdit ? this.escapeHtml(assignment.description || '') : ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>마감일</label>
                            <input type="date" id="assignmentDueDate" class="form-control"
                                   value="${isEdit && assignment.dueDate ? assignment.dueDate.split('T')[0] : defaultDueDateStr}">
                        </div>
                        <div class="form-group">
                            <label>수강반 선택 <span class="required">*</span></label>
                            <div class="checkbox-group" id="assignmentClassCheckboxes">
                                ${this.classes.map(cls => `
                                    <label class="checkbox-label">
                                        <input type="checkbox" value="${cls.id}"
                                               ${isEdit && assignment.classIds?.includes(cls.id) ? 'checked' : ''}>
                                        ${this.escapeHtml(cls.name)}
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        ${isEdit ? `
                        <div class="form-group">
                            <label>상태</label>
                            <select id="assignmentStatus" class="form-control">
                                <option value="draft" ${assignment.status === 'draft' ? 'selected' : ''}>초안</option>
                                <option value="active" ${assignment.status === 'active' ? 'selected' : ''}>진행 중</option>
                                <option value="closed" ${assignment.status === 'closed' ? 'selected' : ''}>종료</option>
                            </select>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="assignmentManager.closeModal()">취소</button>
                        <button class="btn btn-primary" onclick="assignmentManager.saveAssignment(${isEdit ? `'${assignment.id}'` : 'null'})">${isEdit ? '저장' : '만들기'}</button>
                    </div>
                </div>
            </div>
        `;

        // 기존 모달 제거 후 추가
        const existingModal = document.getElementById('assignmentModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * 과제 저장
     */
    async saveAssignment(assignmentId) {
        const name = document.getElementById('assignmentName').value.trim();
        const description = document.getElementById('assignmentDescription').value.trim();
        const dueDate = document.getElementById('assignmentDueDate').value;
        const classCheckboxes = document.querySelectorAll('#assignmentClassCheckboxes input[type="checkbox"]:checked');
        const classIds = Array.from(classCheckboxes).map(cb => cb.value);
        const statusEl = document.getElementById('assignmentStatus');
        const status = statusEl ? statusEl.value : 'draft';

        // 유효성 검사
        if (!name) {
            alert('과제명을 입력하세요.');
            return;
        }
        if (classIds.length === 0) {
            alert('최소 하나의 수강반을 선택하세요.');
            return;
        }

        try {
            const data = { name, description, classIds };
            if (dueDate) data.dueDate = new Date(dueDate).toISOString();

            if (assignmentId) {
                data.status = status;
                await storage.updateAssignment(assignmentId, data);
                alert('과제가 수정되었습니다.');
            } else {
                await storage.createAssignment(data);
                alert('과제가 생성되었습니다.');
            }

            this.closeModal();
            await this.refresh();

            if (assignmentId) {
                await this.selectAssignment(assignmentId);
            }
        } catch (error) {
            console.error('Failed to save assignment:', error);
            alert('과제 저장에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 과제 상태 변경
     */
    async changeStatus(newStatus) {
        if (!this.selectedAssignment) return;

        if (this.selectedAssignment.status === newStatus) return;

        try {
            await storage.updateAssignment(this.selectedAssignment.id, { status: newStatus });
            this.selectedAssignment.status = newStatus;

            // 목록 업데이트
            const idx = this.assignments.findIndex(a => a.id === this.selectedAssignment.id);
            if (idx !== -1) {
                this.assignments[idx].status = newStatus;
            }

            this.renderAssignmentList();
            this.updateStatusButtons();

            // 상태 배지 업데이트 (마감일 기반 실제 상태 사용)
            const effectiveStatus = this.getEffectiveStatus(this.selectedAssignment);
            const badge = document.getElementById('assignmentStatusBadge');
            if (badge) {
                badge.textContent = this.getStatusText(effectiveStatus);
                badge.className = `status-badge status-${effectiveStatus}`;
            }
        } catch (error) {
            console.error('Failed to change status:', error);
            alert('상태 변경에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 상태 버튼 업데이트
     */
    updateStatusButtons() {
        if (!this.selectedAssignment) return;

        const effectiveStatus = this.getEffectiveStatus(this.selectedAssignment);
        const buttons = document.querySelectorAll('.status-btn');
        buttons.forEach(btn => {
            btn.classList.remove('current');
            if (btn.classList.contains(effectiveStatus)) {
                btn.classList.add('current');
            }
        });
    }

    /**
     * 과제 삭제
     */
    async deleteSelectedAssignment() {
        if (!this.selectedAssignment) return;

        if (!confirm(`"${this.selectedAssignment.name}" 과제를 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.`)) {
            return;
        }

        try {
            await storage.deleteAssignment(this.selectedAssignment.id);
            alert('과제가 삭제되었습니다.');
            this.selectedAssignment = null;
            await this.refresh();
            this.renderAssignmentDetail();
        } catch (error) {
            console.error('Failed to delete assignment:', error);
            alert('과제 삭제에 실패했습니다: ' + error.message);
        }
    }

    /**
     * PDF 업로드 처리
     */
    async handlePdfUpload(event) {
        const file = event.target.files[0];
        if (!file || !this.selectedAssignment) return;

        if (file.type !== 'application/pdf') {
            alert('PDF 파일만 업로드할 수 있습니다.');
            return;
        }

        try {
            // PDF.js 설정
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;

            // 진행 상황 표시
            const pdfInfo = document.getElementById('assignmentPdfInfo');
            pdfInfo.innerHTML = `<p>페이지 처리 중... 0/${numPages}</p>`;

            const pages = [];

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const scale = 1.5;
                const viewport = page.getViewport({ scale });

                // Canvas 생성
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // 렌더링
                await page.render({ canvasContext: context, viewport }).promise;

                // 썸네일 생성 (최대 800px 너비)
                const maxWidth = 800;
                let thumbnailCanvas = canvas;
                if (canvas.width > maxWidth) {
                    const ratio = maxWidth / canvas.width;
                    thumbnailCanvas = document.createElement('canvas');
                    thumbnailCanvas.width = maxWidth;
                    thumbnailCanvas.height = canvas.height * ratio;
                    const thumbCtx = thumbnailCanvas.getContext('2d');
                    thumbCtx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                }

                // Base64로 변환
                const thumbnailBase64 = thumbnailCanvas.toDataURL('image/png').split(',')[1];

                // pHash 계산 (간단한 구현)
                const pHash = await this.calculatePHash(thumbnailCanvas);

                pages.push({
                    pageNumber: i,
                    thumbnailBase64,
                    pHash
                });

                pdfInfo.innerHTML = `<p>페이지 처리 중... ${i}/${numPages}</p>`;
            }

            // 서버에 업로드 (presigned URL 사용)
            pdfInfo.innerHTML = `<p>서버에 업로드 중... 0/${numPages}</p>`;

            await storage.uploadAssignmentPdf(this.selectedAssignment.id, pages, (current, total) => {
                pdfInfo.innerHTML = `<p>서버에 업로드 중... ${current}/${total}</p>`;
            });

            // 새로고침
            await this.selectAssignment(this.selectedAssignment.id);
            alert(`${numPages}페이지가 업로드되었습니다.`);

        } catch (error) {
            console.error('PDF upload failed:', error);
            alert('PDF 업로드에 실패했습니다: ' + error.message);
        }

        event.target.value = '';
    }

    /**
     * pHash 계산 (간단한 구현)
     */
    async calculatePHash(canvas) {
        // 8x8로 리사이즈
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = 8;
        smallCanvas.height = 8;
        const ctx = smallCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 8, 8);

        const imageData = ctx.getImageData(0, 0, 8, 8);
        const pixels = imageData.data;

        // 그레이스케일 변환 및 평균 계산
        const grayPixels = [];
        let sum = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const gray = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
            grayPixels.push(gray);
            sum += gray;
        }

        const avg = sum / 64;

        // 해시 생성
        let hash = '';
        for (const gray of grayPixels) {
            hash += gray > avg ? '1' : '0';
        }

        // 16진수로 변환
        let hexHash = '';
        for (let i = 0; i < hash.length; i += 4) {
            hexHash += parseInt(hash.substr(i, 4), 2).toString(16);
        }

        return hexHash;
    }

    /**
     * 학생 제출 이미지 모달 표시
     */
    showStudentSubmissionModal(studentId) {
        const submission = this.currentSubmissions?.find(s => s.student.id === studentId);
        if (!submission || !submission.submittedPages || submission.submittedPages.length === 0) {
            alert('제출된 이미지가 없습니다.');
            return;
        }

        this.currentStudentSubmission = submission;
        this.currentPageIndex = 0;

        this.renderStudentSubmissionModal();
    }

    /**
     * 학생 제출 이미지 모달 렌더링
     */
    renderStudentSubmissionModal() {
        const submission = this.currentStudentSubmission;
        const pages = submission.submittedPages;
        const currentPage = pages[this.currentPageIndex];
        const totalPages = pages.length;

        const modalHtml = `
            <div id="studentSubmissionModal" class="modal active">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3>${this.escapeHtml(submission.student.name)} - 제출 이미지</h3>
                        <button class="btn btn-sm btn-secondary" style="margin-right: 0.5rem;" onclick="assignmentManager.checkSimilarity('${submission.student.id}')">유사도 검사</button>
                        <button class="modal-close" onclick="assignmentManager.closeStudentSubmissionModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="submission-viewer">
                            <div class="submission-nav">
                                <button class="btn btn-secondary" onclick="assignmentManager.prevSubmissionPage()" ${this.currentPageIndex === 0 ? 'disabled' : ''}>
                                    &larr; 이전
                                </button>
                                <span class="page-indicator">${this.currentPageIndex + 1} / ${totalPages}</span>
                                <button class="btn btn-secondary" onclick="assignmentManager.nextSubmissionPage()" ${this.currentPageIndex === totalPages - 1 ? 'disabled' : ''}>
                                    다음 &rarr;
                                </button>
                            </div>

                            <div class="submission-image-container">
                                <img src="${currentPage.imageUrl || ''}" alt="Page ${currentPage.pageNumber}"
                                     onclick="assignmentManager.showImageZoom('${currentPage.imageUrl || ''}')"
                                     style="cursor: zoom-in;"
                                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22566%22><rect fill=%22%23f0f0f0%22 width=%22400%22 height=%22566%22/><text x=%22200%22 y=%22283%22 text-anchor=%22middle%22 fill=%22%23999%22>이미지 로드 실패</text></svg>'">
                                <div class="zoom-hint">클릭하여 확대</div>
                            </div>

                            <div class="submission-info">
                                <div class="info-row">
                                    <span><strong>페이지:</strong> ${currentPage.pageNumber}페이지</span>
                                    <span><strong>유사도:</strong> ${currentPage.similarity ? (currentPage.similarity * 100).toFixed(1) + '%' : '-'}</span>
                                    <span><strong>제출일:</strong> ${currentPage.submittedAt ? new Date(currentPage.submittedAt).toLocaleString('ko-KR') : '-'}</span>
                                </div>
                                <div class="status-row">
                                    <span class="status-badge ${currentPage.passed ? 'status-active' : 'status-draft'}">
                                        ${currentPage.passed ? '인정됨' : '거부됨'}
                                    </span>
                                    ${currentPage.manuallyReviewed ? '<span class="manual-badge">수동 검토됨</span>' : ''}
                                </div>
                            </div>

                            <div class="submission-actions">
                                ${currentPage.passed ? `
                                    <button class="btn btn-danger" onclick="assignmentManager.updatePageStatus(${currentPage.pageNumber}, false)">
                                        제출 거부
                                    </button>
                                ` : `
                                    <button class="btn btn-success" onclick="assignmentManager.updatePageStatus(${currentPage.pageNumber}, true)">
                                        제출 인정
                                    </button>
                                `}
                            </div>
                        </div>

                        <div class="submission-thumbnails">
                            <h4>전체 제출 목록</h4>
                            <div class="thumbnails-grid">
                                ${pages.map((p, idx) => `
                                    <div class="thumb-item ${idx === this.currentPageIndex ? 'active' : ''} ${p.passed ? 'passed' : 'rejected'}"
                                         onclick="assignmentManager.goToSubmissionPage(${idx})">
                                        <img src="${p.imageUrl || ''}" alt="Page ${p.pageNumber}"
                                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%22113%22><rect fill=%22%23f0f0f0%22 width=%2280%22 height=%22113%22/><text x=%2240%22 y=%2256%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22>${p.pageNumber}</text></svg>'">
                                        <span class="thumb-label">${p.pageNumber}p</span>
                                        <span class="thumb-status ${p.passed ? 'passed' : 'rejected'}"
                                              onclick="event.stopPropagation(); assignmentManager.togglePageStatus(${p.pageNumber}, ${p.passed})">${p.passed ? 'O' : 'X'}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('studentSubmissionModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * 이전 제출 페이지로 이동
     */
    prevSubmissionPage() {
        if (this.currentPageIndex > 0) {
            this.currentPageIndex--;
            this.renderStudentSubmissionModal();
        }
    }

    /**
     * 다음 제출 페이지로 이동
     */
    nextSubmissionPage() {
        if (this.currentPageIndex < this.currentStudentSubmission.submittedPages.length - 1) {
            this.currentPageIndex++;
            this.renderStudentSubmissionModal();
        }
    }

    /**
     * 특정 제출 페이지로 이동
     */
    goToSubmissionPage(index) {
        this.currentPageIndex = index;
        this.renderStudentSubmissionModal();
    }

    /**
     * 페이지 상태 업데이트 (인정/거부)
     */
    async updatePageStatus(pageNumber, passed) {
        if (!this.selectedAssignment || !this.currentStudentSubmission) return;

        const action = passed ? '인정' : '거부';
        if (!confirm(`${pageNumber}페이지를 ${action}하시겠습니까?`)) return;

        try {
            await storage.updateSubmissionStatus(
                this.selectedAssignment.id,
                this.currentStudentSubmission.student.id,
                pageNumber,
                passed
            );

            // 로컬 데이터 업데이트
            const page = this.currentStudentSubmission.submittedPages.find(p => p.pageNumber === pageNumber);
            if (page) {
                page.passed = passed;
                page.manuallyReviewed = true;
            }

            // passedCount 재계산
            this.currentStudentSubmission.passedCount = this.currentStudentSubmission.submittedPages.filter(p => p.passed).length;

            // 모달 다시 렌더링
            this.renderStudentSubmissionModal();

            // 제출 현황 테이블도 업데이트
            await this.loadSubmissions();

        } catch (error) {
            console.error('Failed to update page status:', error);
            alert('상태 업데이트에 실패했습니다: ' + error.message);
        }
    }


    /**
     * 더블클릭/더블터치로 페이지 상태 토글 (인정 ↔ 거부)
     */
    async togglePageStatus(pageNumber, currentPassed) {
        if (!this.selectedAssignment || !this.currentStudentSubmission) return;

        const newPassed = !currentPassed;
        const action = newPassed ? '인정' : '거부';

        try {
            await storage.updateSubmissionStatus(
                this.selectedAssignment.id,
                this.currentStudentSubmission.student.id,
                pageNumber,
                newPassed
            );

            // 로컬 데이터 업데이트
            const page = this.currentStudentSubmission.submittedPages.find(p => p.pageNumber === pageNumber);
            if (page) {
                page.passed = newPassed;
                page.manuallyReviewed = true;
            }

            // passedCount 재계산
            this.currentStudentSubmission.passedCount = this.currentStudentSubmission.submittedPages.filter(p => p.passed).length;

            // 토스트 알림 표시
            this.showToggleToast(`${pageNumber}페이지 → ${action}`);

            // 모달 내 해당 요소만 직접 업데이트 (전체 재렌더링 안 함)
            this.updateModalStatusInPlace(pageNumber, newPassed);

            // 제출 현황 테이블도 업데이트
            await this.loadSubmissions();

        } catch (error) {
            console.error('Failed to toggle page status:', error);
            alert('상태 변경 실패: ' + error.message);
        }
    }

    /**
     * 모달 내 상태만 직접 업데이트 (스크롤 유지)
     */
    updateModalStatusInPlace(pageNumber, newPassed) {
        const modal = document.getElementById('studentSubmissionModal');
        if (!modal) return;

        // 썸네일 O/X 뱃지 업데이트
        const thumbItems = modal.querySelectorAll('.thumb-item');
        const pages = this.currentStudentSubmission.submittedPages;
        thumbItems.forEach((item, idx) => {
            const p = pages[idx];
            if (!p) return;
            // 클래스 업데이트
            item.classList.toggle('passed', p.passed);
            item.classList.toggle('rejected', !p.passed);
            // O/X 뱃지
            const badge = item.querySelector('.thumb-status');
            if (badge) {
                badge.textContent = p.passed ? 'O' : 'X';
                badge.className = `thumb-status ${p.passed ? 'passed' : 'rejected'}`;
                badge.setAttribute('onclick', `event.stopPropagation(); assignmentManager.togglePageStatus(${p.pageNumber}, ${p.passed})`);
            }
        });

        // 현재 보고 있는 페이지의 메인 영역 상태 업데이트
        const currentPage = pages[this.currentPageIndex];
        if (currentPage && currentPage.pageNumber === pageNumber) {
            // 상태 뱃지
            const statusBadge = modal.querySelector('.status-row .status-badge');
            if (statusBadge) {
                statusBadge.className = `status-badge ${newPassed ? 'status-active' : 'status-draft'}`;
                statusBadge.textContent = newPassed ? '인정됨' : '거부됨';
            }
            // 인정/거부 버튼
            const actionsDiv = modal.querySelector('.submission-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = newPassed
                    ? `<button class="btn btn-danger" onclick="assignmentManager.updatePageStatus(${pageNumber}, false)">제출 거부</button>`
                    : `<button class="btn btn-success" onclick="assignmentManager.updatePageStatus(${pageNumber}, true)">제출 인정</button>`;
            }
        }
    }

    /**
     * 상태 토글 토스트 알림
     */
    showToggleToast(message) {
        const existing = document.getElementById('toggleToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'toggleToast';
        toast.className = 'toggle-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    }

    /**
     * 이미지 유사도 검사 실행
     */
    async checkSimilarity(studentId) {
        if (!this.selectedAssignment) return;

        try {
            const result = await storage.checkSubmissionSimilarity(
                this.selectedAssignment.id,
                studentId
            );

            // 결과 모달 표시
            const resultsHtml = result.results.map(r => {
                const simText = r.similarity !== null ? `${r.similarity.toFixed(1)}%` : '-';
                const statusText = r.passed ? '통과' : '미통과';
                const statusClass = r.passed ? 'status-active' : 'status-draft';
                const manualBadge = r.manuallyReviewed ? ' <span class="manual-badge">수동</span>' : '';
                return `
                    <tr>
                        <td>${r.pageNumber}페이지</td>
                        <td>${simText}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span>${manualBadge}</td>
                    </tr>
                `;
            }).join('');

            const modalHtml = `
                <div id="similarityResultModal" class="modal active">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>유사도 검사 결과</h3>
                            <button class="modal-close" onclick="assignmentManager.closeSimilarityResultModal()">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p><strong>통과:</strong> ${result.passedCount} / ${result.totalSubmitted}페이지 (전체 ${result.totalPages}페이지)</p>
                            <table class="data-table" style="width: 100%; margin-top: 1rem;">
                                <thead>
                                    <tr>
                                        <th>페이지</th>
                                        <th>유사도</th>
                                        <th>결과</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${resultsHtml}
                                </tbody>
                            </table>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onclick="assignmentManager.closeSimilarityResultModal()">닫기</button>
                        </div>
                    </div>
                </div>
            `;

            const existingModal = document.getElementById('similarityResultModal');
            if (existingModal) existingModal.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // 제출 현황 테이블 새로고침
            await this.loadSubmissions();

        } catch (error) {
            console.error('Failed to check similarity:', error);
            alert('유사도 검사에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 유사도 결과 모달 닫기
     */
    closeSimilarityResultModal() {
        const modal = document.getElementById('similarityResultModal');
        if (modal) modal.remove();
    }

    /**
     * 학생 제출 이미지 모달 닫기
     */
    closeStudentSubmissionModal() {
        const modal = document.getElementById('studentSubmissionModal');
        if (modal) modal.remove();
        this.currentStudentSubmission = null;
        this.currentPageIndex = 0;
    }

    /**
     * 이미지 확대 표시
     */
    showImageZoom(imageUrl) {
        if (!imageUrl) return;

        const zoomHtml = `
            <div id="imageZoomModal" class="image-zoom-overlay" onclick="assignmentManager.closeImageZoom(event)">
                <div class="zoom-controls">
                    <button class="zoom-btn" onclick="assignmentManager.zoomIn(event)">+</button>
                    <span id="zoomLevel">100%</span>
                    <button class="zoom-btn" onclick="assignmentManager.zoomOut(event)">-</button>
                    <button class="zoom-btn" onclick="assignmentManager.resetZoom(event)">원본</button>
                    <button class="zoom-close-btn" onclick="assignmentManager.closeImageZoom(event)">&times;</button>
                </div>
                <div class="zoom-image-wrapper" id="zoomImageWrapper">
                    <img id="zoomImage" src="${imageUrl}" alt="확대 이미지"
                         style="transform: scale(1); cursor: grab;"
                         ondragstart="return false;">
                </div>
            </div>
        `;

        const existingModal = document.getElementById('imageZoomModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', zoomHtml);

        this.currentZoom = 1;
        this.setupZoomDrag();
    }

    /**
     * 드래그로 이미지 이동 설정
     */
    setupZoomDrag() {
        const wrapper = document.getElementById('zoomImageWrapper');
        const img = document.getElementById('zoomImage');
        if (!wrapper || !img) return;

        let isDragging = false;
        let startX, startY, scrollLeft, scrollTop;

        img.addEventListener('mousedown', (e) => {
            isDragging = true;
            img.style.cursor = 'grabbing';
            startX = e.pageX - wrapper.offsetLeft;
            startY = e.pageY - wrapper.offsetTop;
            scrollLeft = wrapper.scrollLeft;
            scrollTop = wrapper.scrollTop;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (img) img.style.cursor = 'grab';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - wrapper.offsetLeft;
            const y = e.pageY - wrapper.offsetTop;
            const walkX = (x - startX) * 1.5;
            const walkY = (y - startY) * 1.5;
            wrapper.scrollLeft = scrollLeft - walkX;
            wrapper.scrollTop = scrollTop - walkY;
        });

        // 마우스 휠로 확대/축소
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn(e);
            } else {
                this.zoomOut(e);
            }
        });
    }

    /**
     * 확대
     */
    zoomIn(event) {
        if (event) event.stopPropagation();
        if (this.currentZoom < 5) {
            this.currentZoom += 0.25;
            this.applyZoom();
        }
    }

    /**
     * 축소
     */
    zoomOut(event) {
        if (event) event.stopPropagation();
        if (this.currentZoom > 0.25) {
            this.currentZoom -= 0.25;
            this.applyZoom();
        }
    }

    /**
     * 원본 크기로 리셋
     */
    resetZoom(event) {
        if (event) event.stopPropagation();
        this.currentZoom = 1;
        this.applyZoom();
    }

    /**
     * 줌 적용
     */
    applyZoom() {
        const img = document.getElementById('zoomImage');
        const zoomLevel = document.getElementById('zoomLevel');
        if (img) {
            img.style.transform = `scale(${this.currentZoom})`;
        }
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
        }
    }

    /**
     * 이미지 확대 모달 닫기
     */
    closeImageZoom(event) {
        if (event && event.target.id !== 'imageZoomModal' && event.target.className !== 'zoom-close-btn') {
            return;
        }
        const modal = document.getElementById('imageZoomModal');
        if (modal) modal.remove();
    }

    /**
     * 코멘트 모달 표시
     */
    showCommentModal(studentId, studentName, currentComment) {
        const modalHtml = `
            <div id="commentModal" class="modal active">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${studentName} 학생 코멘트</h3>
                        <button class="modal-close" onclick="assignmentManager.closeCommentModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>코멘트</label>
                            <textarea id="studentComment" class="form-control" rows="5"
                                      placeholder="학생에게 전달할 코멘트를 작성하세요">${currentComment}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="assignmentManager.closeCommentModal()">취소</button>
                        <button class="btn btn-primary" onclick="assignmentManager.saveComment('${studentId}')">저장</button>
                    </div>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('commentModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * 코멘트 저장
     */
    async saveComment(studentId) {
        const comment = document.getElementById('studentComment').value.trim();

        try {
            await storage.addSubmissionComment(this.selectedAssignment.id, studentId, comment);
            this.closeCommentModal();
            await this.loadSubmissions();
        } catch (error) {
            console.error('Failed to save comment:', error);
            alert('코멘트 저장에 실패했습니다.');
        }
    }

    /**
     * 코멘트 모달 닫기
     */
    closeCommentModal() {
        const modal = document.getElementById('commentModal');
        if (modal) modal.remove();
    }

    /**
     * 모달 닫기
     */
    closeModal() {
        const modal = document.getElementById('assignmentModal');
        if (modal) modal.remove();
    }

    /**
     * 필터 변경 핸들러
     */
    onClassFilterChange() {
        this.filterClassId = document.getElementById('assignmentClassFilter').value;
        this.loadAssignments();
    }

    onStatusFilterChange() {
        this.filterStatus = document.getElementById('assignmentStatusFilter').value;
        this.loadAssignments();
    }

    onSearchChange(value) {
        this.searchQuery = value;
        this.renderAssignmentList();
    }

    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 전역 인스턴스
window.assignmentManager = new AssignmentManager();
