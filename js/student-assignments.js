/**
 * Student Assignments
 * 학생용 과제 제출 모듈 - 페이지별 개별 촬영/제출 방식
 */

class StudentAssignments {
    constructor() {
        this.assignments = [];
        this.selectedAssignment = null;
        this.cameraStream = null;
        this.currentPageNumber = null; // 현재 촬영 중인 페이지 번호
    }

    /**
     * 모듈 초기화
     */
    async init() {
        await this.loadAssignments();
    }

    /**
     * 과제 목록 로드
     */
    async loadAssignments() {
        try {
            this.assignments = await apiClient.getMyAssignments();
            this.renderAssignmentList();
        } catch (error) {
            console.error('Failed to load assignments:', error);
            this.showError('과제 목록을 불러오는데 실패했습니다.');
        }
    }

    /**
     * 과제 목록 렌더링
     */
    renderAssignmentList() {
        const container = document.getElementById('assignmentCardsContainer');
        const detailContainer = document.getElementById('assignmentDetailContainer');
        if (!container) return;

        // 상세 화면 숨기기
        if (detailContainer) {
            detailContainer.style.display = 'none';
        }
        container.style.display = 'grid';

        if (this.assignments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>진행 중인 과제가 없습니다.</p>
                </div>
            `;
            return;
        }

        // 완료되지 않은 과제 먼저, 완료된 과제 나중에
        const sortedAssignments = [...this.assignments].sort((a, b) => {
            if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
            return 0;
        });

        container.innerHTML = sortedAssignments.map(a => {
            const progress = a.totalPages > 0 ? Math.round(a.passedCount / a.totalPages * 100) : 0;
            const dueDate = a.dueDate ? new Date(a.dueDate) : null;
            const isOverdue = dueDate && dueDate < new Date() && !a.isComplete;

            return `
                <div class="assignment-card ${a.isComplete ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}"
                     onclick="studentAssignments.selectAssignment('${a.id}')">
                    <div class="assignment-card-header">
                        <h3>${this.escapeHtml(a.name)}</h3>
                        ${a.isComplete ? '<span class="badge badge-success">완료</span>' : ''}
                        ${isOverdue ? '<span class="badge badge-danger">마감 지남</span>' : ''}
                    </div>
                    <div class="assignment-card-body">
                        ${a.description ? `<p class="description">${this.escapeHtml(a.description)}</p>` : ''}
                        <div class="progress-info">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <span>${a.passedCount}/${a.totalPages} 페이지 완료</span>
                        </div>
                        ${dueDate ? `<p class="due-date">마감: ${dueDate.toLocaleDateString('ko-KR')}</p>` : ''}
                        ${a.teacherComment ? `<div class="teacher-comment"><strong>선생님 코멘트:</strong> ${this.escapeHtml(a.teacherComment)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 과제 선택
     */
    async selectAssignment(assignmentId) {
        try {
            const detail = await apiClient.getMyAssignmentDetail(assignmentId);
            this.selectedAssignment = detail;
            this.renderAssignmentDetail();
        } catch (error) {
            console.error('Failed to load assignment detail:', error);
            // 백엔드 오류 메시지가 있으면 그대로 표시
            const message = error.message || '과제 정보를 불러오는데 실패했습니다.';
            this.showError(message);
        }
    }

    /**
     * 과제 상세 렌더링 - 페이지별 클릭 제출 방식
     */
    renderAssignmentDetail() {
        const listContainer = document.getElementById('assignmentCardsContainer');
        const detailContainer = document.getElementById('assignmentDetailContainer');
        if (!detailContainer) return;

        listContainer.style.display = 'none';
        detailContainer.style.display = 'block';

        const a = this.selectedAssignment;
        const dueDate = a.dueDate ? new Date(a.dueDate) : null;

        detailContainer.innerHTML = `
            <div class="assignment-detail-header">
                <button class="btn btn-secondary" onclick="studentAssignments.backToList()">
                    &larr; 목록으로
                </button>
                <h2>${this.escapeHtml(a.name)}</h2>
            </div>

            <div class="assignment-detail-info">
                ${a.description ? `<p>${this.escapeHtml(a.description)}</p>` : ''}
                ${dueDate ? `<p><strong>마감:</strong> ${dueDate.toLocaleDateString('ko-KR')}</p>` : ''}
                <p><strong>진행 상태:</strong> ${a.passedCount}/${a.totalPages} 페이지 완료</p>
                ${a.teacherComment ? `<div class="teacher-comment-box"><strong>선생님 코멘트:</strong><br>${this.escapeHtml(a.teacherComment)}</div>` : ''}
            </div>

            <div class="assignment-pages-grid">
                <h3>페이지 목록</h3>
                <p class="pages-instruction">촬영할 페이지를 클릭하세요</p>
                <div class="pages-grid">
                    ${(a.pages || []).map(p => {
                        let statusClass = '';
                        let overlayHtml = '';
                        let statusText = '';

                        if (p.passed) {
                            statusClass = 'completed';
                            overlayHtml = '<div class="check-overlay passed">O</div>';
                            statusText = '<span class="status-text completed">완료</span>';
                        } else if (p.rejected) {
                            statusClass = 'rejected';
                            overlayHtml = '<div class="check-overlay rejected">X</div>';
                            statusText = '<span class="status-text rejected">거부됨</span>';
                        } else if (p.pendingReview) {
                            statusClass = 'submitted';
                            overlayHtml = '<div class="check-overlay submitted">!</div>';
                            statusText = '<span class="status-text submitted">제출됨</span>';
                        }

                        return `
                        <div class="page-item clickable ${statusClass}"
                             data-page="${p.pageNumber}"
                             onclick="studentAssignments.openCameraForPage(${p.pageNumber})">
                            <div class="page-thumbnail">
                                <img src="${p.thumbnailUrl || ''}" alt="Page ${p.pageNumber}"
                                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22140%22><rect fill=%22%23f0f0f0%22 width=%22100%22 height=%22140%22/><text x=%2250%22 y=%2270%22 text-anchor=%22middle%22 fill=%22%23999%22>${p.pageNumber}</text></svg>'">
                                ${overlayHtml}
                            </div>
                            <span class="page-label">${p.pageNumber}페이지</span>
                            ${statusText}
                        </div>
                    `;}).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 목록으로 돌아가기
     */
    backToList() {
        this.selectedAssignment = null;
        this.stopCamera();
        this.loadAssignments();
    }

    /**
     * 특정 페이지용 카메라 모달 열기
     */
    async openCameraForPage(pageNumber) {
        this.currentPageNumber = pageNumber;

        const modalHtml = `
            <div id="cameraModal" class="modal active">
                <div class="modal-content camera-modal-content">
                    <div class="modal-header">
                        <h3>${pageNumber}페이지 촬영</h3>
                        <button class="modal-close" onclick="studentAssignments.closeCameraModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="camera-container">
                            <video id="cameraVideo" autoplay playsinline></video>
                            <div class="a4-guideline">
                                <div class="guideline-border"></div>
                            </div>
                        </div>
                        <div class="camera-controls">
                            <input type="file" id="pageFileInput" accept="image/*" style="display: none;"
                                   onchange="studentAssignments.handlePageFileSelect(event)">
                            <button class="btn btn-secondary" onclick="document.getElementById('pageFileInput').click()">
                                파일 선택
                            </button>
                            <button class="btn btn-primary capture-btn" onclick="studentAssignments.captureAndSubmitPage()">
                                촬영
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 기존 모달 제거
        const existingModal = document.getElementById('cameraModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            const video = document.getElementById('cameraVideo');
            video.srcObject = this.cameraStream;
        } catch (error) {
            console.error('Camera access failed:', error);
            // 카메라 실패 시 파일 선택만 가능하도록 유지
            const videoEl = document.getElementById('cameraVideo');
            if (videoEl) {
                videoEl.style.display = 'none';
            }
            const guideEl = document.querySelector('.a4-guideline');
            if (guideEl) {
                guideEl.style.display = 'none';
            }
            const cameraContainer = document.querySelector('.camera-container');
            if (cameraContainer) {
                cameraContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">카메라를 사용할 수 없습니다.<br>파일 선택 버튼을 이용해주세요.</div>';
            }
        }
    }

    /**
     * 촬영 후 즉시 단일 페이지 제출
     */
    async captureAndSubmitPage() {
        const video = document.getElementById('cameraVideo');
        if (!video || !this.currentPageNumber) return;

        // A4 가이드라인 영역 크롭
        const guidelineWidthRatio = 0.7;
        const a4AspectRatio = 1.414;

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        let cropWidth = videoWidth * guidelineWidthRatio;
        let cropHeight = cropWidth * a4AspectRatio;

        if (cropHeight > videoHeight * 0.95) {
            cropHeight = videoHeight * 0.95;
            cropWidth = cropHeight / a4AspectRatio;
        }

        const cropX = (videoWidth - cropWidth) / 2;
        const cropY = (videoHeight - cropHeight) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        const pHash = await this.calculatePHash(canvas);

        this.closeCameraModal();
        await this.submitSinglePage(this.currentPageNumber, imageBase64, pHash);
    }

    /**
     * 파일 선택으로 단일 페이지 제출
     */
    async handlePageFileSelect(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/') || !this.currentPageNumber) return;

        const pageNumber = this.currentPageNumber;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                const pHash = await this.calculatePHash(canvas);

                this.closeCameraModal();
                await this.submitSinglePage(pageNumber, imageBase64, pHash);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        event.target.value = '';
    }

    /**
     * 단일 페이지 제출 API 호출 및 UI 갱신
     */
    async submitSinglePage(pageNumber, imageBase64, pHash) {
        if (!this.selectedAssignment) return;

        try {
            this.showUploadOverlay(`${pageNumber}페이지 업로드 중...`, 50);

            await apiClient.submitSingleAssignmentPage(
                this.selectedAssignment.id,
                pageNumber,
                imageBase64,
                pHash
            );

            this.updateUploadOverlay('업로드 완료!', 100);
            await new Promise(resolve => setTimeout(resolve, 500));
            this.hideUploadOverlay();

            // 상세 화면 새로고침
            await this.selectAssignment(this.selectedAssignment.id);

        } catch (error) {
            console.error('Single page submit failed:', error);
            this.hideUploadOverlay();
            this.showError('제출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 업로드 진행 오버레이 표시
     */
    showUploadOverlay(message = '업로드 중...', progress = null) {
        this.hideUploadOverlay();

        const progressBar = progress !== null
            ? `<div class="upload-progress-bar">
                   <div class="upload-progress-fill" style="width: ${progress}%"></div>
               </div>
               <div class="upload-progress-text">${progress}%</div>`
            : '<div class="upload-spinner"></div>';

        const overlayHtml = `
            <div id="uploadOverlay" class="upload-overlay">
                <div class="upload-overlay-content">
                    ${progressBar}
                    <div class="upload-message">${message}</div>
                    <div class="upload-warning">화면을 닫지 마세요!</div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHtml);
    }

    /**
     * 업로드 진행 오버레이 업데이트
     */
    updateUploadOverlay(message, progress) {
        const overlay = document.getElementById('uploadOverlay');
        if (!overlay) {
            this.showUploadOverlay(message, progress);
            return;
        }

        const messageEl = overlay.querySelector('.upload-message');
        const progressFill = overlay.querySelector('.upload-progress-fill');
        const progressText = overlay.querySelector('.upload-progress-text');

        if (messageEl) messageEl.textContent = message;
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${progress}%`;
    }

    /**
     * 업로드 진행 오버레이 숨기기
     */
    hideUploadOverlay() {
        const overlay = document.getElementById('uploadOverlay');
        if (overlay) overlay.remove();
    }

    /**
     * pHash 계산
     */
    async calculatePHash(canvas) {
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = 8;
        smallCanvas.height = 8;
        const ctx = smallCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 8, 8);

        const imageData = ctx.getImageData(0, 0, 8, 8);
        const pixels = imageData.data;

        const grayPixels = [];
        let sum = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const gray = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
            grayPixels.push(gray);
            sum += gray;
        }

        const avg = sum / 64;

        let hash = '';
        for (const gray of grayPixels) {
            hash += gray > avg ? '1' : '0';
        }

        let hexHash = '';
        for (let i = 0; i < hash.length; i += 4) {
            hexHash += parseInt(hash.substr(i, 4), 2).toString(16);
        }

        return hexHash;
    }

    /**
     * 카메라 모달 닫기
     */
    closeCameraModal() {
        this.stopCamera();
        const modal = document.getElementById('cameraModal');
        if (modal) modal.remove();
    }

    /**
     * 카메라 스트림 중지
     */
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
    }

    /**
     * 에러 표시
     */
    showError(message) {
        alert(message);
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
window.studentAssignments = new StudentAssignments();

// 탭 전환 시 과제 로드
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId === 'my-assignments') {
                studentAssignments.init();
            }
        });
    });
});
