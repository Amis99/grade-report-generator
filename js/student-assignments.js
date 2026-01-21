/**
 * Student Assignments
 * 학생용 과제 제출 모듈
 */

class StudentAssignments {
    constructor() {
        this.assignments = [];
        this.selectedAssignment = null;
        this.capturedImages = [];
        this.cameraStream = null;
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
            this.capturedImages = [];
            this.renderAssignmentDetail();
        } catch (error) {
            console.error('Failed to load assignment detail:', error);
            this.showError('과제 정보를 불러오는데 실패했습니다.');
        }
    }

    /**
     * 과제 상세 렌더링
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
                <div class="pages-grid">
                    ${(a.pages || []).map(p => {
                        let statusClass = '';
                        let overlayHtml = '';
                        let statusText = '';

                        if (p.passed) {
                            statusClass = 'completed';
                            overlayHtml = '<div class="check-overlay passed">O</div>';
                            statusText = '<span class="status-text completed">완료</span>';
                        } else if (p.rejected || (p.submitted && p.passed === false)) {
                            statusClass = 'rejected';
                            overlayHtml = '<div class="check-overlay rejected">X</div>';
                            statusText = '<span class="status-text rejected">거부됨</span>';
                        }

                        return `
                        <div class="page-item ${statusClass}" data-page="${p.pageNumber}">
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

            <div class="submission-section">
                <h3>과제 제출</h3>
                <div class="submission-actions">
                    <button class="btn btn-primary" onclick="studentAssignments.openCamera()">
                        카메라로 촬영
                    </button>
                    <input type="file" id="imageFileInput" accept="image/*" multiple style="display: none;"
                           onchange="studentAssignments.handleFileSelect(event)">
                    <button class="btn btn-secondary" onclick="document.getElementById('imageFileInput').click()">
                        파일에서 선택
                    </button>
                </div>

                <div id="capturedImagesPreview" class="captured-images-preview" style="display: none;">
                    <h4>선택된 이미지</h4>
                    <div id="capturedImagesList" class="captured-images-list"></div>
                    <div class="submit-actions">
                        <button class="btn btn-secondary" onclick="studentAssignments.clearCapturedImages()">
                            초기화
                        </button>
                        <button class="btn btn-primary" onclick="studentAssignments.submitImages()">
                            제출하기
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 목록으로 돌아가기
     */
    backToList() {
        this.selectedAssignment = null;
        this.capturedImages = [];
        this.stopCamera();
        this.loadAssignments();
    }

    /**
     * 카메라 열기
     */
    async openCamera() {
        const modalHtml = `
            <div id="cameraModal" class="modal active">
                <div class="modal-content camera-modal-content">
                    <div class="modal-header">
                        <h3>과제 촬영</h3>
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
                            <button class="btn btn-primary capture-btn" onclick="studentAssignments.capturePhoto()">
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
            this.closeCameraModal();
            this.showError('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
        }
    }

    /**
     * 사진 촬영 (A4 가이드라인 영역만 크롭)
     */
    async capturePhoto() {
        const video = document.getElementById('cameraVideo');
        if (!video) return;

        // A4 가이드라인 영역 계산 (CSS와 동일한 비율 적용)
        const guidelineWidthRatio = 0.7;  // CSS: width: 70%
        const a4AspectRatio = 1.414;      // CSS: aspect-ratio: 1/1.414

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // 가이드라인의 실제 크기 계산
        let cropWidth = videoWidth * guidelineWidthRatio;
        let cropHeight = cropWidth * a4AspectRatio;

        // 비디오 높이가 가이드라인 높이보다 작은 경우 조정
        if (cropHeight > videoHeight * 0.95) {
            cropHeight = videoHeight * 0.95;
            cropWidth = cropHeight / a4AspectRatio;
        }

        // 중앙 정렬된 가이드라인의 좌상단 좌표
        const cropX = (videoWidth - cropWidth) / 2;
        const cropY = (videoHeight - cropHeight) / 2;

        // 크롭된 영역을 캔버스에 그리기
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video,
            cropX, cropY, cropWidth, cropHeight,  // 소스 영역 (크롭)
            0, 0, cropWidth, cropHeight           // 대상 영역
        );

        // Base64로 변환
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        // pHash 계산
        const pHash = await this.calculatePHash(canvas);

        this.capturedImages.push({
            imageBase64,
            pHash,
            preview: canvas.toDataURL('image/jpeg', 0.3)
        });

        this.closeCameraModal();
        this.updateCapturedImagesPreview();
    }

    /**
     * 파일 선택 처리
     */
    async handleFileSelect(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

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

                    this.capturedImages.push({
                        imageBase64,
                        pHash,
                        preview: canvas.toDataURL('image/jpeg', 0.3)
                    });

                    this.updateCapturedImagesPreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        event.target.value = '';
    }

    /**
     * 촬영 이미지 미리보기 업데이트
     */
    updateCapturedImagesPreview() {
        const previewSection = document.getElementById('capturedImagesPreview');
        const listContainer = document.getElementById('capturedImagesList');
        if (!previewSection || !listContainer) return;

        if (this.capturedImages.length === 0) {
            previewSection.style.display = 'none';
            return;
        }

        previewSection.style.display = 'block';
        listContainer.innerHTML = this.capturedImages.map((img, idx) => `
            <div class="captured-image-item">
                <img src="${img.preview}" alt="Image ${idx + 1}">
                <button class="remove-btn" onclick="studentAssignments.removeCapturedImage(${idx})">&times;</button>
            </div>
        `).join('');
    }

    /**
     * 촬영 이미지 제거
     */
    removeCapturedImage(index) {
        this.capturedImages.splice(index, 1);
        this.updateCapturedImagesPreview();
    }

    /**
     * 촬영 이미지 초기화
     */
    clearCapturedImages() {
        this.capturedImages = [];
        this.updateCapturedImagesPreview();
    }

    /**
     * 이미지 제출
     */
    async submitImages() {
        if (this.capturedImages.length === 0) {
            this.showError('제출할 이미지를 선택해주세요.');
            return;
        }

        if (!this.selectedAssignment) return;

        try {
            const submitBtn = document.querySelector('.submit-actions .btn-primary');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '제출 중...';
            }

            const images = this.capturedImages.map(img => ({
                imageBase64: img.imageBase64,
                pHash: img.pHash
            }));

            const result = await apiClient.submitAssignmentPages(this.selectedAssignment.id, images);

            // 결과 표시
            const matchedCount = result.summary?.matched || 0;
            const notMatchedCount = result.summary?.notMatched || 0;

            let message = `제출 완료!\n\n`;
            message += `매칭된 페이지: ${matchedCount}개\n`;
            if (notMatchedCount > 0) {
                message += `매칭되지 않은 이미지: ${notMatchedCount}개\n`;
            }
            message += `\n총 진행률: ${result.summary?.totalPassedCount}/${result.summary?.totalPages} 페이지`;

            if (result.summary?.isComplete) {
                message += '\n\n과제를 모두 완료했습니다!';
            }

            alert(message);

            this.capturedImages = [];
            await this.selectAssignment(this.selectedAssignment.id);

        } catch (error) {
            console.error('Submit failed:', error);
            this.showError('제출에 실패했습니다: ' + error.message);
        } finally {
            const submitBtn = document.querySelector('.submit-actions .btn-primary');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '제출하기';
            }
        }
    }

    /**
     * pHash 계산
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
