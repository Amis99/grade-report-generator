/**
 * 검색 가능한 드롭다운 컴포넌트
 */

class SearchableSelect {
    constructor(wrapperId) {
        this.wrapper = document.getElementById(wrapperId);
        if (!this.wrapper) return;

        this.select = this.wrapper.querySelector('select');
        if (!this.select) return;

        this.init();
    }

    init() {
        // 원본 select 숨기기
        this.select.style.display = 'none';

        // 커스텀 UI 생성
        this.createCustomUI();
        this.setupEventListeners();
    }

    createCustomUI() {
        // 커스텀 드롭다운 HTML 생성
        const customDiv = document.createElement('div');
        customDiv.className = 'custom-select';
        customDiv.innerHTML = `
            <div class="custom-select-trigger">
                <span class="custom-select-value">선택하세요</span>
                <span class="custom-select-arrow">▼</span>
            </div>
            <div class="custom-select-dropdown">
                <input type="text" class="custom-select-search" placeholder="검색...">
                <div class="custom-select-options"></div>
            </div>
        `;

        this.wrapper.appendChild(customDiv);

        this.trigger = customDiv.querySelector('.custom-select-trigger');
        this.valueDisplay = customDiv.querySelector('.custom-select-value');
        this.dropdown = customDiv.querySelector('.custom-select-dropdown');
        this.searchInput = customDiv.querySelector('.custom-select-search');
        this.optionsContainer = customDiv.querySelector('.custom-select-options');

        // 초기 옵션 렌더링
        this.renderOptions();
    }

    setupEventListeners() {
        // 트리거 클릭
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // 검색 입력
        this.searchInput.addEventListener('input', (e) => {
            this.filterOptions(e.target.value);
        });

        // 검색 입력 클릭 시 이벤트 버블링 방지
        this.searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // 원본 select 변경 감지 (프로그래밍 방식 변경 대응)
        const observer = new MutationObserver(() => {
            this.renderOptions();
            this.updateValueDisplay();
        });

        observer.observe(this.select, {
            childList: true,
            subtree: true
        });
    }

    renderOptions() {
        const options = Array.from(this.select.options);
        this.optionsContainer.innerHTML = options.map(option => {
            const isSelected = option.value === this.select.value;
            return `
                <div class="custom-select-option ${isSelected ? 'selected' : ''}"
                     data-value="${option.value}"
                     data-searchtext="${option.textContent.toLowerCase()}">
                    ${option.textContent}
                </div>
            `;
        }).join('');

        // 옵션 클릭 이벤트
        this.optionsContainer.querySelectorAll('.custom-select-option').forEach(optionEl => {
            optionEl.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-value');
                this.selectOption(value);
            });
        });
    }

    selectOption(value) {
        // 원본 select 업데이트
        this.select.value = value;

        // change 이벤트 발생
        const event = new Event('change', { bubbles: true });
        this.select.dispatchEvent(event);

        // UI 업데이트
        this.updateValueDisplay();

        // 드롭다운 닫기
        this.closeDropdown();
    }

    updateValueDisplay() {
        const selectedOption = this.select.options[this.select.selectedIndex];
        this.valueDisplay.textContent = selectedOption ? selectedOption.textContent : '선택하세요';

        // 선택된 옵션 표시 업데이트
        this.optionsContainer.querySelectorAll('.custom-select-option').forEach(optionEl => {
            const isSelected = optionEl.getAttribute('data-value') === this.select.value;
            optionEl.classList.toggle('selected', isSelected);
        });
    }

    toggleDropdown() {
        const isOpen = this.dropdown.classList.contains('open');
        if (isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.dropdown.classList.add('open');
        this.searchInput.value = '';
        this.searchInput.focus();
        this.filterOptions('');
    }

    closeDropdown() {
        this.dropdown.classList.remove('open');
    }

    filterOptions(searchText) {
        const lowerSearch = searchText.toLowerCase();
        const options = this.optionsContainer.querySelectorAll('.custom-select-option');

        options.forEach(option => {
            const searchtext = option.getAttribute('data-searchtext');
            const matches = searchtext.includes(lowerSearch);
            option.style.display = matches ? 'block' : 'none';
        });
    }

    // 옵션 다시 로드 (외부에서 호출)
    refresh() {
        this.renderOptions();
        this.updateValueDisplay();
    }
}

// 전역 초기화 함수
function initSearchableSelects() {
    // 모든 searchable-select wrapper 찾기
    const wrappers = document.querySelectorAll('.searchable-select');
    wrappers.forEach(wrapper => {
        new SearchableSelect(wrapper.id);
    });
}
