/**
 * 학생 계정 관리 모듈
 * 기관 관리자가 학생 계정을 생성/삭제할 수 있음
 * admin은 전체 학생 및 기관별 필터링 가능
 */

class StudentAccountManager {
    constructor() {
        this.isOpen = false;
        this.students = [];
        this.searchQuery = '';
        this.filterHasAccount = null; // null: 모두, true: 계정 있음, false: 계정 없음
        this.filterOrganization = null; // null: 전체, string: 특정 기관
        this.accountCounter = 1; // 계정 번호 카운터
        this.selectedStudents = new Set(); // 병합을 위해 선택된 학생 ID
        this.selectionMode = false; // 선택 모드 활성화 여부
    }

    /**
     * 현재 사용자가 admin인지 확인
     */
    isAdmin() {
        const user = SessionManager.getCurrentUser();
        return user?.role === 'admin';
    }

    /**
     * 기관 목록 가져오기
     */
    getOrganizationList() {
        const orgs = new Set();
        this.students.forEach(s => {
            if (s.organization) {
                orgs.add(s.organization);
            }
        });
        return Array.from(orgs).sort();
    }

    /**
     * 학생 계정 관리 패널 열기
     */
    async open() {
        if (AuthService.isStudent()) {
            alert('접근 권한이 없습니다.');
            return;
        }

        this.isOpen = true;
        // 모든 학생 표시 (백엔드에서 기관 검증)
        this.students = storage.getAllStudents();
        this.calculateNextAccountNumber();
        this.render();
    }

    /**
     * 다음 계정 번호 계산
     */
    calculateNextAccountNumber() {
        const orgPrefix = this.getOrganizationPrefix();
        let maxNum = 0;

        // 기존 계정에서 가장 큰 번호 찾기
        this.students.forEach(s => {
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
     * 기관명 영문 접두어 가져오기
     */
    getOrganizationPrefix(orgOverride = null) {
        const user = SessionManager.getCurrentUser();
        const org = orgOverride || user?.organization || '국어농장';

        // 기관명 -> 영문 약자 매핑 (고정된 기관들)
        const orgMap = {
            '국어농장': 'gf',
            '언어의창': 'lw',
            '언어의 창': 'lw',
            '테스트': 'te'
        };

        // 고정 매핑에 있으면 사용
        if (orgMap[org]) {
            return orgMap[org];
        }

        // 새 기관: 기관명에서 2글자 접두어 생성
        const basePrefix = this.generateOrgPrefix(org);

        // 기존 사용 중인 접두어 수집
        const usedPrefixes = this.getUsedPrefixes();

        // 충돌이 없으면 그대로 사용
        if (!usedPrefixes.has(basePrefix)) {
            return basePrefix;
        }

        // 충돌 시 사용 가능한 접두어 찾기
        return this.findAvailablePrefix(basePrefix, usedPrefixes);
    }

    /**
     * 기관명에서 2글자 영문 접두어 생성
     */
    generateOrgPrefix(orgName) {
        // 영문이면 첫 두 글자 사용
        const englishMatch = orgName.match(/[a-zA-Z]/g);
        if (englishMatch && englishMatch.length >= 2) {
            return (englishMatch[0] + englishMatch[1]).toLowerCase();
        }

        // 한글이면 로마자 변환 후 첫 두 글자
        const roman = this.koreanToRoman(orgName);
        if (roman.length >= 2) {
            return roman.substring(0, 2).toLowerCase();
        }

        // 기본값
        return 'st';
    }

    /**
     * 현재 사용 중인 접두어 목록 수집
     */
    getUsedPrefixes() {
        const prefixes = new Set();

        // 고정 접두어 추가
        prefixes.add('gf'); // 국어농장
        prefixes.add('lw'); // 언어의창
        prefixes.add('te'); // 테스트

        // 기존 학생들의 username에서 접두어 추출
        this.students.forEach(s => {
            if (s.username) {
                const match = s.username.match(/^([a-z]{2})\d/);
                if (match) {
                    prefixes.add(match[1]);
                }
            }
        });

        return prefixes;
    }

    /**
     * 사용 가능한 접두어 찾기
     */
    findAvailablePrefix(basePrefix, usedPrefixes) {
        // 첫 글자 고정, 두 번째 글자 변경 시도
        const firstChar = basePrefix[0];
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';

        for (const secondChar of alphabet) {
            const candidate = firstChar + secondChar;
            if (!usedPrefixes.has(candidate)) {
                return candidate;
            }
        }

        // 첫 글자도 변경 시도
        for (const first of alphabet) {
            for (const second of alphabet) {
                const candidate = first + second;
                if (!usedPrefixes.has(candidate)) {
                    return candidate;
                }
            }
        }

        // 모든 조합이 사용 중이면 (거의 불가능) 랜덤 생성
        return 'xx';
    }

    /**
     * 간단한 한글 -> 로마자 변환
     */
    koreanToRoman(str) {
        const map = {
            '가': 'ga', '나': 'na', '다': 'da', '라': 'ra', '마': 'ma',
            '바': 'ba', '사': 'sa', '아': 'a', '자': 'ja', '차': 'cha',
            '카': 'ka', '타': 'ta', '파': 'pa', '하': 'ha',
            '국': 'guk', '어': 'eo', '농': 'nong', '장': 'jang',
            '언': 'eon', '의': 'ui', '창': 'chang',
            '테': 'te', '스': 'seu', '트': 'teu',
            '명': 'myeong', '륜': 'ryun', '초': 'cho', '등': 'deung', '학': 'hak', '교': 'gyo',
            '해': 'hae', '운': 'un', '대': 'dae', '고': 'go', '중': 'jung'
        };

        let result = '';
        for (const char of str) {
            if (map[char]) {
                result += map[char];
            } else if (/[a-zA-Z]/.test(char)) {
                result += char.toLowerCase();
            }
            // 매핑되지 않은 한글은 건너뜀
        }
        return result;
    }

    /**
     * 검색 입력 핸들러
     */
    onSearchInput(value) {
        this.searchQuery = value;
        this.updateStudentList();
    }

    /**
     * 패널 닫기
     */
    close() {
        this.isOpen = false;
        const overlay = document.getElementById('studentAccountOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * 패널 렌더링
     */
    render() {
        const existingOverlay = document.getElementById('studentAccountOverlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const filteredStudents = this.getFilteredStudents();
        const isAdmin = this.isAdmin();
        const orgList = this.getOrganizationList();

        const overlay = document.createElement('div');
        overlay.id = 'studentAccountOverlay';
        overlay.className = 'admin-panel-overlay';
        overlay.innerHTML = `
            <div class="admin-panel student-account-panel">
                <div class="admin-panel-header">
                    <h2>학생 계정 관리</h2>
                    <button class="admin-panel-close" id="closeStudentAccountPanel">&times;</button>
                </div>
                <div class="admin-panel-body">
                    <!-- 신규 학생 추가 및 병합 버튼 -->
                    <div class="add-student-section" style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-success" id="addNewStudentBtn">
                            + 신규 학생 추가
                        </button>
                        <button class="btn ${this.selectionMode ? 'btn-secondary' : 'btn-outline'}" id="toggleSelectionBtn">
                            ${this.selectionMode ? '선택 취소' : '학생 선택'}
                        </button>
                        ${this.selectionMode && this.selectedStudents.size >= 2 ? `
                        <button class="btn btn-warning" id="mergeStudentsBtn">
                            선택한 ${this.selectedStudents.size}명 병합
                        </button>
                        ` : ''}
                    </div>

                    <!-- 검색 및 필터 -->
                    <div class="student-account-controls">
                        <div class="search-box">
                            <input type="text"
                                   id="studentSearchInput"
                                   placeholder="이름, 학교로 검색..."
                                   value="${this.searchQuery}"
                                   autocomplete="off"
                                   oninput="studentAccountManager.onSearchInput(this.value)">
                        </div>
                        <div class="filter-buttons">
                            <button class="btn btn-sm ${this.filterHasAccount === null ? 'btn-primary' : 'btn-secondary'}"
                                    data-filter="all">전체</button>
                            <button class="btn btn-sm ${this.filterHasAccount === false ? 'btn-primary' : 'btn-secondary'}"
                                    data-filter="no-account">계정 없음</button>
                            <button class="btn btn-sm ${this.filterHasAccount === true ? 'btn-primary' : 'btn-secondary'}"
                                    data-filter="has-account">계정 있음</button>
                        </div>
                    </div>

                    ${isAdmin ? `
                    <!-- 기관 필터 (admin 전용) -->
                    <div class="org-filter-section">
                        <label>기관 필터:</label>
                        <select id="orgFilterSelect" class="form-select-sm">
                            <option value="">전체 기관</option>
                            ${orgList.map(org => `
                                <option value="${org}" ${this.filterOrganization === org ? 'selected' : ''}>${org}</option>
                            `).join('')}
                        </select>
                    </div>
                    ` : ''}

                    <!-- 통계 -->
                    <div class="student-account-stats">
                        <span>전체: <strong>${this.students.length}</strong>명</span>
                        <span>계정 있음: <strong>${this.students.filter(s => s.hasAccount).length}</strong>명</span>
                        <span>검색 결과: <strong>${filteredStudents.length}</strong>명</span>
                    </div>

                    <!-- 학생 목록 -->
                    <div class="student-account-list" id="studentAccountList">
                        ${this.renderStudentList(filteredStudents)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 이벤트 리스너
        document.getElementById('closeStudentAccountPanel').addEventListener('click', () => {
            this.close();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        // 검색 입력
        const searchInput = document.getElementById('studentSearchInput');
        if (searchInput) {
            console.log('🔍 검색 입력 이벤트 리스너 등록');
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                console.log('🔍 검색어:', this.searchQuery, '학생 수:', this.students.length);
                this.updateStudentList();
            });
        } else {
            console.error('❌ studentSearchInput 요소를 찾을 수 없음');
        }

        // 필터 버튼
        document.querySelectorAll('.filter-buttons button').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                if (filter === 'all') this.filterHasAccount = null;
                else if (filter === 'no-account') this.filterHasAccount = false;
                else if (filter === 'has-account') this.filterHasAccount = true;
                this.render();
            });
        });

        // 기관 필터 (admin 전용)
        const orgFilterSelect = document.getElementById('orgFilterSelect');
        if (orgFilterSelect) {
            orgFilterSelect.addEventListener('change', (e) => {
                this.filterOrganization = e.target.value || null;
                this.updateStudentList();
            });
        }

        // 신규 학생 추가 버튼
        document.getElementById('addNewStudentBtn').addEventListener('click', () => {
            this.showAddStudentModal();
        });

        // 선택 모드 토글 버튼
        document.getElementById('toggleSelectionBtn').addEventListener('click', () => {
            this.toggleSelectionMode();
        });

        // 병합 버튼
        const mergeBtn = document.getElementById('mergeStudentsBtn');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', () => {
                this.showMergeModal();
            });
        }

        this.attachStudentListeners();
    }

    /**
     * 신규 학생 추가 모달 표시
     */
    showAddStudentModal() {
        const existingModal = document.getElementById('addStudentModal');
        if (existingModal) existingModal.remove();

        const user = SessionManager.getCurrentUser();
        const defaultOrg = user?.organization || '국어농장';
        const isAdmin = this.isAdmin();
        const orgList = this.getOrganizationList();

        const modal = document.createElement('div');
        modal.id = 'addStudentModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>신규 학생 추가</h3>
                    <button class="modal-close" id="closeAddStudentModal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="addStudentForm">
                        <div class="form-group">
                            <label>이름 <span class="required">*</span></label>
                            <input type="text" id="newStudentName" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label>학교 <span class="required">*</span></label>
                            <input type="text" id="newStudentSchool" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label>학년 <span class="required">*</span></label>
                            <input type="text" id="newStudentGrade" placeholder="숫자만 입력 (예: 1, 2, 3)" required autocomplete="off">
                        </div>
                        ${isAdmin ? `
                        <div class="form-group">
                            <label>소속 기관 <span class="required">*</span></label>
                            <select id="newStudentOrg" required>
                                ${orgList.map(org => `
                                    <option value="${org}" ${org === defaultOrg ? 'selected' : ''}>${org}</option>
                                `).join('')}
                                <option value="_new">+ 새 기관 추가</option>
                            </select>
                            <input type="text" id="newStudentOrgCustom" placeholder="새 기관명 입력" style="display:none; margin-top:8px;" autocomplete="off">
                        </div>
                        ` : ''}
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="createAccountCheckbox" checked>
                                계정도 함께 생성
                            </label>
                        </div>
                        <div id="accountFieldsSection">
                            <div class="form-group">
                                <label>아이디</label>
                                <input type="text" id="newStudentUsername" value="${this.generateDefaultUsername()}"
                                       pattern="[a-zA-Z0-9]+" autocomplete="off">
                                <small>자동 생성됨 (수정 가능)</small>
                            </div>
                            <div class="form-group">
                                <label>비밀번호</label>
                                <input type="text" id="newStudentPassword" value="student1" autocomplete="off">
                                <small>기본값: student1 (로그인 후 변경 권장)</small>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" id="cancelAddStudent">취소</button>
                            <button type="submit" class="btn btn-primary">학생 추가</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 계정 생성 체크박스
        document.getElementById('createAccountCheckbox').addEventListener('change', (e) => {
            document.getElementById('accountFieldsSection').style.display = e.target.checked ? 'block' : 'none';
        });

        // 기관 선택 (admin 전용)
        const orgSelect = document.getElementById('newStudentOrg');
        const orgCustom = document.getElementById('newStudentOrgCustom');
        if (orgSelect && orgCustom) {
            orgSelect.addEventListener('change', (e) => {
                if (e.target.value === '_new') {
                    orgCustom.style.display = 'block';
                    orgCustom.required = true;
                } else {
                    orgCustom.style.display = 'none';
                    orgCustom.required = false;
                }
            });
        }

        // 이벤트 리스너
        document.getElementById('closeAddStudentModal').addEventListener('click', () => modal.remove());
        document.getElementById('cancelAddStudent').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addNewStudent();
            modal.remove();
        });
    }

    /**
     * 신규 학생 추가 처리
     */
    async addNewStudent() {
        const name = document.getElementById('newStudentName').value.trim();
        const school = document.getElementById('newStudentSchool').value.trim();
        let grade = document.getElementById('newStudentGrade').value.trim();
        const createAccount = document.getElementById('createAccountCheckbox').checked;

        // 학년에서 숫자만 추출
        const gradeMatch = grade.match(/\d+/);
        grade = gradeMatch ? gradeMatch[0] : grade;

        if (!name || !school || !grade) {
            alert('이름, 학교, 학년을 모두 입력해주세요.');
            return;
        }

        // 기관 결정
        let organization;
        if (this.isAdmin()) {
            const orgSelect = document.getElementById('newStudentOrg');
            const orgCustom = document.getElementById('newStudentOrgCustom');
            if (orgSelect.value === '_new') {
                organization = orgCustom.value.trim();
                if (!organization) {
                    alert('새 기관명을 입력해주세요.');
                    return;
                }
            } else {
                organization = orgSelect.value;
            }
        } else {
            organization = AuthService.getCurrentOrganization() || '국어농장';
        }

        try {
            // 학생 생성
            const student = new Student({ name, school, grade, organization });
            await storage.saveStudent(student);

            // 기존 학생이 반환된 경우 안내
            if (student.isExisting) {
                if (student.hasAccount) {
                    alert(`이미 등록된 학생입니다.\n\n이름: ${name}\n학교: ${school}\n학년: ${grade}\n\n이 학생은 이미 계정을 가지고 있습니다.\n아이디: ${student.username}`);
                    this.students = storage.getAllStudents();
                    this.render();
                    return;
                } else {
                    // 기존 학생이지만 계정이 없는 경우
                    if (createAccount) {
                        const username = document.getElementById('newStudentUsername').value.trim();
                        const password = document.getElementById('newStudentPassword').value;

                        if (username && password) {
                            try {
                                await storage.createStudentAccount(student.id, {
                                    username,
                                    password,
                                    email: undefined
                                });
                                student.hasAccount = true;
                                student.username = username;
                                this.accountCounter++;

                                alert(`기존 학생에 계정이 생성되었습니다.\n\n이름: ${name}\n아이디: ${username}\n비밀번호: ${password}`);
                            } catch (accountError) {
                                console.error('계정 생성 오류:', accountError);
                                alert(`기존 학생을 찾았으나 계정 생성에 실패했습니다.\n${accountError.message || ''}`);
                            }
                        }
                    } else {
                        alert(`이미 등록된 학생입니다: ${name} (${school} ${grade}학년)`);
                    }
                    this.students = storage.getAllStudents();
                    this.render();
                    return;
                }
            }

            // 계정도 함께 생성 (신규 학생인 경우)
            if (createAccount) {
                const username = document.getElementById('newStudentUsername').value.trim();
                const password = document.getElementById('newStudentPassword').value;

                if (username && password) {
                    try {
                        await storage.createStudentAccount(student.id, {
                            username,
                            password,
                            email: undefined
                        });
                        student.hasAccount = true;
                        student.username = username;
                        this.accountCounter++; // 카운터 증가

                        alert(`학생이 추가되고 계정이 생성되었습니다.\n\n이름: ${name}\n기관: ${organization}\n아이디: ${username}\n비밀번호: ${password}`);
                    } catch (accountError) {
                        console.error('계정 생성 오류:', accountError);
                        alert(`학생은 추가되었으나 계정 생성에 실패했습니다.\n${accountError.message || ''}`);
                    }
                }
            } else {
                alert(`학생이 추가되었습니다: ${name} (${organization})`);
            }

            // 목록 새로고침
            this.students = storage.getAllStudents();
            this.render();

        } catch (error) {
            console.error('학생 추가 오류:', error);
            alert('학생 추가 중 오류가 발생했습니다.\n' + (error.message || ''));
        }
    }

    /**
     * 필터링된 학생 목록
     */
    getFilteredStudents() {
        let filtered = [...this.students];
        console.log('🔍 getFilteredStudents - 전체:', filtered.length, '검색어:', this.searchQuery);

        // 검색 필터
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(s =>
                (s.name && s.name.toLowerCase().includes(query)) ||
                (s.school && s.school.toLowerCase().includes(query)) ||
                (s.grade && String(s.grade).toLowerCase().includes(query)) ||
                (s.username && s.username.toLowerCase().includes(query))
            );
            console.log('🔍 검색 후:', filtered.length);
        }

        // 계정 유무 필터
        if (this.filterHasAccount !== null) {
            filtered = filtered.filter(s => !!s.hasAccount === this.filterHasAccount);
        }

        // 기관 필터 (admin 전용)
        if (this.filterOrganization) {
            filtered = filtered.filter(s => s.organization === this.filterOrganization);
        }

        // 정렬: 이름 순
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return filtered;
    }

    /**
     * 학생 목록 렌더링
     */
    renderStudentList(students) {
        if (students.length === 0) {
            return '<div class="empty-state-small">조건에 맞는 학생이 없습니다.</div>';
        }

        const isAdmin = this.isAdmin();

        return `
            <table class="user-table student-account-table">
                <thead>
                    <tr>
                        ${this.selectionMode ? '<th style="width:40px;">선택</th>' : ''}
                        <th>이름</th>
                        <th>학교</th>
                        <th>학년</th>
                        ${isAdmin ? '<th>기관</th>' : ''}
                        <th>계정</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(student => `
                        <tr data-student-id="${student.id}" class="${this.selectedStudents.has(student.id) ? 'selected-row' : ''}">
                            ${this.selectionMode ? `
                            <td>
                                <input type="checkbox" class="student-checkbox"
                                       data-id="${student.id}"
                                       ${this.selectedStudents.has(student.id) ? 'checked' : ''}
                                       onchange="studentAccountManager.toggleStudentSelection('${student.id}')">
                            </td>
                            ` : ''}
                            <td>${student.name}</td>
                            <td>${student.school}</td>
                            <td>${student.grade}</td>
                            ${isAdmin ? `<td><span class="org-badge">${student.organization || '-'}</span></td>` : ''}
                            <td>
                                ${student.hasAccount
                                    ? `<span class="account-id">${student.username || '있음'}</span>`
                                    : '<span class="status-badge inactive">없음</span>'}
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-sm btn-outline edit-student-btn"
                                        data-id="${student.id}"
                                        data-name="${student.name}"
                                        data-school="${student.school}"
                                        data-grade="${student.grade}"
                                        data-org="${student.organization || ''}"
                                        title="정보 수정">✏️</button>
                                ${student.hasAccount
                                    ? `<button class="btn btn-sm btn-danger delete-account-btn"
                                              data-id="${student.id}"
                                              data-name="${student.name}">계정 삭제</button>`
                                    : `<button class="btn btn-sm btn-primary create-account-btn"
                                              data-id="${student.id}"
                                              data-name="${student.name}"
                                              data-school="${student.school}"
                                              data-grade="${student.grade}"
                                              data-org="${student.organization || ''}">계정 생성</button>`}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * 학생 목록 업데이트 (재렌더링 없이)
     */
    updateStudentList() {
        const listContainer = document.getElementById('studentAccountList');
        if (listContainer) {
            listContainer.innerHTML = this.renderStudentList(this.getFilteredStudents());
            this.attachStudentListeners();
        }

        // 통계 업데이트
        const stats = document.querySelector('.student-account-stats');
        if (stats) {
            const filteredStudents = this.getFilteredStudents();
            stats.innerHTML = `
                <span>전체: <strong>${this.students.length}</strong>명</span>
                <span>계정 있음: <strong>${this.students.filter(s => s.hasAccount).length}</strong>명</span>
                <span>검색 결과: <strong>${filteredStudents.length}</strong>명</span>
            `;
        }
    }

    /**
     * 학생 계정 관련 이벤트 리스너
     */
    attachStudentListeners() {
        // 계정 생성 버튼
        document.querySelectorAll('.create-account-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.getAttribute('data-id');
                const studentName = btn.getAttribute('data-name');
                const studentSchool = btn.getAttribute('data-school');
                const studentGrade = btn.getAttribute('data-grade');
                const studentOrg = btn.getAttribute('data-org');
                this.showCreateAccountModal(studentId, studentName, studentSchool, studentGrade, studentOrg);
            });
        });

        // 계정 삭제 버튼
        document.querySelectorAll('.delete-account-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const studentId = btn.getAttribute('data-id');
                const studentName = btn.getAttribute('data-name');
                await this.deleteAccount(studentId, studentName);
            });
        });

        // 학생 정보 수정 버튼
        document.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.getAttribute('data-id');
                const studentName = btn.getAttribute('data-name');
                const studentSchool = btn.getAttribute('data-school');
                const studentGrade = btn.getAttribute('data-grade');
                const studentOrg = btn.getAttribute('data-org');
                this.showEditStudentModal(studentId, studentName, studentSchool, studentGrade, studentOrg);
            });
        });
    }

    /**
     * 학생 정보 수정 모달 표시
     */
    showEditStudentModal(studentId, studentName, studentSchool, studentGrade, studentOrg) {
        const existingModal = document.getElementById('editStudentModal');
        if (existingModal) existingModal.remove();

        const isAdmin = this.isAdmin();
        const orgList = this.getOrganizationList();

        const modal = document.createElement('div');
        modal.id = 'editStudentModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>학생 정보 수정</h3>
                    <button class="modal-close" id="closeEditStudentModal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editStudentForm">
                        <input type="hidden" id="editStudentId" value="${studentId}">
                        <div class="form-group">
                            <label>이름 <span class="required">*</span></label>
                            <input type="text" id="editStudentName" value="${studentName}" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label>학교 <span class="required">*</span></label>
                            <input type="text" id="editStudentSchool" value="${studentSchool}" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label>학년 <span class="required">*</span></label>
                            <input type="text" id="editStudentGrade" value="${studentGrade}" placeholder="숫자만 입력" required autocomplete="off">
                        </div>
                        ${isAdmin ? `
                        <div class="form-group">
                            <label>소속 기관 <span class="required">*</span></label>
                            <select id="editStudentOrg" required>
                                ${orgList.map(org => `
                                    <option value="${org}" ${org === studentOrg ? 'selected' : ''}>${org}</option>
                                `).join('')}
                                <option value="_new">+ 새 기관 추가</option>
                            </select>
                            <input type="text" id="editStudentOrgCustom" placeholder="새 기관명 입력" style="display:none; margin-top:8px;" autocomplete="off">
                        </div>
                        ` : `
                        <div class="form-group">
                            <label>소속 기관</label>
                            <input type="text" value="${studentOrg}" disabled>
                        </div>
                        `}
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" id="cancelEditStudent">취소</button>
                            <button type="submit" class="btn btn-primary">저장</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 기관 선택 (admin 전용)
        const orgSelect = document.getElementById('editStudentOrg');
        const orgCustom = document.getElementById('editStudentOrgCustom');
        if (orgSelect && orgCustom) {
            orgSelect.addEventListener('change', (e) => {
                if (e.target.value === '_new') {
                    orgCustom.style.display = 'block';
                    orgCustom.required = true;
                } else {
                    orgCustom.style.display = 'none';
                    orgCustom.required = false;
                }
            });
        }

        // 이벤트 리스너
        document.getElementById('closeEditStudentModal').addEventListener('click', () => modal.remove());
        document.getElementById('cancelEditStudent').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateStudent();
            modal.remove();
        });
    }

    /**
     * 학생 정보 수정 처리
     */
    async updateStudent() {
        const studentId = document.getElementById('editStudentId').value;
        const name = document.getElementById('editStudentName').value.trim();
        const school = document.getElementById('editStudentSchool').value.trim();
        let grade = document.getElementById('editStudentGrade').value.trim();

        // 학년에서 숫자만 추출
        const gradeMatch = grade.match(/\d+/);
        grade = gradeMatch ? gradeMatch[0] : grade;

        if (!name || !school || !grade) {
            alert('이름, 학교, 학년을 모두 입력해주세요.');
            return;
        }

        // 기관 결정
        let organization;
        if (this.isAdmin()) {
            const orgSelect = document.getElementById('editStudentOrg');
            const orgCustom = document.getElementById('editStudentOrgCustom');
            if (orgSelect.value === '_new') {
                organization = orgCustom.value.trim();
                if (!organization) {
                    alert('새 기관명을 입력해주세요.');
                    return;
                }
            } else {
                organization = orgSelect.value;
            }
        } else {
            // org_admin은 기관 변경 불가
            const student = this.students.find(s => s.id === studentId);
            organization = student?.organization || AuthService.getCurrentOrganization();
        }

        try {
            // 학생 정보 업데이트
            const student = this.students.find(s => s.id === studentId);
            if (student) {
                student.name = name;
                student.school = school;
                student.grade = grade;
                student.organization = organization;
                await storage.saveStudent(student);

                alert('학생 정보가 수정되었습니다.');
                this.render();
            }
        } catch (error) {
            console.error('학생 정보 수정 오류:', error);
            alert('학생 정보 수정 중 오류가 발생했습니다.\n' + (error.message || ''));
        }
    }

    /**
     * 계정 생성 모달 표시
     */
    showCreateAccountModal(studentId, studentName, studentSchool, studentGrade, studentOrg) {
        // 기존 모달 제거
        const existingModal = document.getElementById('createAccountModal');
        if (existingModal) existingModal.remove();

        // 기본 아이디 생성 (기관명 + 번호)
        const defaultUsername = this.generateDefaultUsername();

        const modal = document.createElement('div');
        modal.id = 'createAccountModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>학생 계정 생성</h3>
                    <button class="modal-close" id="closeCreateAccountModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="student-info-summary">
                        <strong>${studentName}</strong> (${studentSchool} ${studentGrade}학년)
                        ${studentOrg ? `<br><small>${studentOrg}</small>` : ''}
                    </div>
                    <form id="createAccountForm">
                        <div class="form-group">
                            <label>아이디 <span class="required">*</span></label>
                            <input type="text" id="accountUsername" value="${defaultUsername}" required
                                   pattern="[a-zA-Z0-9]+" title="영문과 숫자만 사용 가능" autocomplete="off">
                            <small>자동 생성됨 (수정 가능)</small>
                        </div>
                        <div class="form-group">
                            <label>비밀번호 <span class="required">*</span></label>
                            <input type="text" id="accountPassword" value="student1" required autocomplete="off">
                            <small>기본값: student1 (로그인 후 변경 권장)</small>
                        </div>
                        <div class="form-group">
                            <label>이메일 (선택)</label>
                            <input type="email" id="accountEmail" placeholder="example@email.com" autocomplete="off">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" id="cancelCreateAccount">취소</button>
                            <button type="submit" class="btn btn-primary">계정 생성</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 리스너
        document.getElementById('closeCreateAccountModal').addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('cancelCreateAccount').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.getElementById('createAccountForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createAccount(studentId, studentName);
            modal.remove();
        });
    }

    /**
     * 기본 아이디 생성 (기관명 + 4자리 번호)
     */
    generateDefaultUsername() {
        const prefix = this.getOrganizationPrefix();
        const num = String(this.accountCounter).padStart(4, '0');
        return `${prefix}${num}`;
    }

    /**
     * 계정 생성 처리
     */
    async createAccount(studentId, studentName) {
        const username = document.getElementById('accountUsername').value.trim();
        const password = document.getElementById('accountPassword').value;
        const email = document.getElementById('accountEmail').value.trim();

        if (!username || !password) {
            alert('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        if (!/^[a-zA-Z0-9]+$/.test(username)) {
            alert('아이디는 영문과 숫자만 사용 가능합니다.');
            return;
        }

        try {
            await storage.createStudentAccount(studentId, {
                username,
                password,
                email: email || undefined
            });

            // 로컬 캐시 업데이트
            const student = this.students.find(s => s.id === studentId);
            if (student) {
                student.hasAccount = true;
                student.username = username;
            }

            // 카운터 증가
            this.accountCounter++;

            alert(`${studentName} 학생의 계정이 생성되었습니다.\n\n아이디: ${username}\n비밀번호: ${password}`);
            this.render();
        } catch (error) {
            console.error('계정 생성 오류:', error);
            alert('계정 생성 중 오류가 발생했습니다.\n' + (error.message || ''));
        }
    }

    /**
     * 계정 삭제 처리
     */
    async deleteAccount(studentId, studentName) {
        if (!confirm(`${studentName} 학생의 계정을 삭제하시겠습니까?\n\n(학생 데이터와 답안은 보존됩니다)`)) {
            return;
        }

        try {
            await storage.deleteStudentAccount(studentId);

            // 로컬 캐시 업데이트
            const student = this.students.find(s => s.id === studentId);
            if (student) {
                student.hasAccount = false;
                student.username = null;
            }

            alert(`${studentName} 학생의 계정이 삭제되었습니다.`);
            this.render();
        } catch (error) {
            console.error('계정 삭제 오류:', error);
            alert('계정 삭제 중 오류가 발생했습니다.\n' + (error.message || ''));
        }
    }

    /**
     * 선택 모드 토글
     */
    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        if (!this.selectionMode) {
            this.selectedStudents.clear();
        }
        this.render();
    }

    /**
     * 학생 선택/해제
     */
    toggleStudentSelection(studentId) {
        if (this.selectedStudents.has(studentId)) {
            this.selectedStudents.delete(studentId);
        } else {
            this.selectedStudents.add(studentId);
        }
        this.render();
    }

    /**
     * 병합 모달 표시
     */
    showMergeModal() {
        if (this.selectedStudents.size < 2) {
            alert('병합할 학생을 2명 이상 선택해주세요.');
            return;
        }

        const existingModal = document.getElementById('mergeStudentModal');
        if (existingModal) existingModal.remove();

        // 선택된 학생 정보 가져오기
        const selectedStudentList = Array.from(this.selectedStudents)
            .map(id => this.students.find(s => s.id === id))
            .filter(s => s);

        const modal = document.createElement('div');
        modal.id = 'mergeStudentModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>학생 병합</h3>
                    <button class="modal-close" onclick="document.getElementById('mergeStudentModal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 15px; color: #666;">
                        선택한 ${selectedStudentList.length}명의 학생을 하나로 병합합니다.<br>
                        어떤 학생 정보를 기준으로 통합할지 선택해주세요.
                    </p>
                    <div class="merge-student-list">
                        ${selectedStudentList.map(s => `
                            <div class="merge-student-option" data-id="${s.id}">
                                <label style="display: flex; align-items: center; padding: 12px; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; margin-bottom: 10px;">
                                    <input type="radio" name="targetStudent" value="${s.id}" style="margin-right: 12px;">
                                    <div style="flex: 1;">
                                        <strong style="font-size: 16px;">${s.name}</strong>
                                        <div style="color: #666; font-size: 13px; margin-top: 4px;">
                                            ${s.school} ${s.grade}학년
                                            ${s.organization ? `| ${s.organization}` : ''}
                                        </div>
                                        <div style="font-size: 12px; margin-top: 4px;">
                                            ${s.hasAccount
                                                ? `<span style="color: #28a745;">계정: ${s.username}</span>`
                                                : '<span style="color: #999;">계정 없음</span>'}
                                            | 답안 ${this.getAnswerCount(s.id)}개
                                        </div>
                                    </div>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 15px;">
                        <strong>⚠️ 주의사항</strong>
                        <ul style="margin: 8px 0 0 20px; padding: 0; font-size: 13px;">
                            <li>선택한 학생의 정보(이름, 학교, 학년, 계정)가 유지됩니다.</li>
                            <li>다른 학생들의 모든 답안 기록이 선택한 학생에게 이전됩니다.</li>
                            <li>병합 후 나머지 학생 데이터는 삭제됩니다.</li>
                            <li>이 작업은 되돌릴 수 없습니다.</li>
                        </ul>
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('mergeStudentModal').remove()">취소</button>
                        <button type="button" class="btn btn-warning" id="confirmMergeBtn">병합 실행</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 라디오 버튼 스타일링
        modal.querySelectorAll('input[name="targetStudent"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('.merge-student-option label').forEach(label => {
                    label.style.borderColor = '#ddd';
                    label.style.background = '#fff';
                });
                const selectedLabel = radio.closest('label');
                selectedLabel.style.borderColor = '#f0ad4e';
                selectedLabel.style.background = '#fffbf0';
            });
        });

        // 병합 실행 버튼
        document.getElementById('confirmMergeBtn').addEventListener('click', async () => {
            const selected = modal.querySelector('input[name="targetStudent"]:checked');
            if (!selected) {
                alert('기준이 될 학생을 선택해주세요.');
                return;
            }

            const targetId = selected.value;
            const targetStudent = selectedStudentList.find(s => s.id === targetId);
            const otherStudents = selectedStudentList.filter(s => s.id !== targetId);

            if (!confirm(`"${targetStudent.name}" 학생 정보를 기준으로 ${otherStudents.length}명의 학생을 병합하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                return;
            }

            await this.mergeStudents(targetId, otherStudents.map(s => s.id));
            modal.remove();
        });
    }

    /**
     * 학생의 답안 개수 가져오기
     */
    getAnswerCount(studentId) {
        const answers = storage.getAllAnswers();
        return answers.filter(a => a.studentId === studentId).length;
    }

    /**
     * 학생 병합 실행
     */
    async mergeStudents(targetId, sourceIds) {
        try {
            const targetStudent = this.students.find(s => s.id === targetId);

            // 1. 답안 이전
            const allAnswers = storage.getAllAnswers();
            let movedCount = 0;

            for (const sourceId of sourceIds) {
                const sourceAnswers = allAnswers.filter(a => a.studentId === sourceId);

                for (const answer of sourceAnswers) {
                    // 동일 시험/문제에 대한 답안이 이미 있는지 확인
                    const existingAnswer = allAnswers.find(a =>
                        a.studentId === targetId &&
                        a.examId === answer.examId &&
                        a.questionId === answer.questionId
                    );

                    if (!existingAnswer) {
                        // 답안을 대상 학생으로 이전
                        answer.studentId = targetId;
                        await storage.saveAnswer(answer);
                        movedCount++;
                    }
                }

                // 2. 소스 학생 삭제
                const sourceStudent = this.students.find(s => s.id === sourceId);

                // 계정이 있으면 계정도 삭제 (hasAccount가 true이고 username이 있는 경우만)
                if (sourceStudent && sourceStudent.hasAccount === true && sourceStudent.username) {
                    try {
                        await storage.deleteStudentAccount(sourceId);
                    } catch (e) {
                        // 계정 삭제 실패해도 계속 진행
                        console.warn('계정 삭제 스킵:', sourceStudent.name, e.message);
                    }
                }

                // 학생 삭제
                await storage.deleteStudent(sourceId);
            }

            // 3. 캐시 및 UI 업데이트
            this.students = storage.getAllStudents();
            this.selectedStudents.clear();
            this.selectionMode = false;

            alert(`병합이 완료되었습니다.\n\n` +
                  `- 기준 학생: ${targetStudent.name}\n` +
                  `- 병합된 학생 수: ${sourceIds.length}명\n` +
                  `- 이전된 답안 수: ${movedCount}개`);

            this.render();

        } catch (error) {
            console.error('학생 병합 오류:', error);
            alert('학생 병합 중 오류가 발생했습니다.\n' + (error.message || ''));
        }
    }
}

// 전역 인스턴스
const studentAccountManager = new StudentAccountManager();
