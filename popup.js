document.addEventListener('DOMContentLoaded', () => {
  const toggleMemo = document.getElementById('toggle-memo');
  const themeBtn = document.getElementById('theme-btn');
  const listContainer = document.getElementById('list-container');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const selectModeBtn = document.getElementById('select-mode-btn');
  
  // Folders & Search
  const folderCreationBar = document.getElementById('folder-creation-bar');
  const newFolderInput = document.getElementById('new-folder-input');
  const addFolderBtn = document.getElementById('add-folder-btn');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  
  // Batch Actions
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const batchDeleteBtn = document.getElementById('batch-delete-btn');
  const batchOpenBtn = document.getElementById('batch-open-btn');
  const batchMoveBtn = document.getElementById('batch-move-btn');
  const batchCountSpan = document.querySelector('.batch-count');
  
  // Modal
  const moveModal = document.getElementById('move-modal');
  const modalFolderList = document.getElementById('modal-folder-list');
  const closeModalBtn = document.getElementById('close-modal-btn');

  // State
  let currentBookmarks = [];
  let userFolders = []; 
  let currentView = 'all'; 
  let isSelectionMode = false;
  let selectedIndices = new Set();
  let targetMoveIndices = [];

  // ==========================================
  // 1. 초기 데이터 로드 & 마이그레이션 (안전장치)
  // ==========================================
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  chrome.storage.local.get(['memoEnabled', 'isDarkTheme', 'bookmarks', 'userFolders'], (result) => {
    let isDark = result.isDarkTheme;
    if (isDark === undefined) isDark = prefersDark;
    
    applyTheme(isDark);
    toggleMemo.checked = result.memoEnabled !== false;
    
    // [4️⃣ Storage 마이그레이션] 구버전 데이터 호환성 체크
    let rawBookmarks = result.bookmarks || [];
    let needUpdate = false;

    // 데이터 구조 보정 (폴더가 없으면 Inbox로, URL이 없으면 빈 문자열로)
    currentBookmarks = rawBookmarks.map(item => {
      let newItem = { ...item };
      if (!newItem.hasOwnProperty('folder')) {
        newItem.folder = 'Inbox'; // 기본값 부여
        needUpdate = true;
      }
      return newItem;
    });
    
    userFolders = result.userFolders || [];
    
    // 보정된 데이터가 있다면 저장
    if (needUpdate) {
      chrome.storage.local.set({ bookmarks: currentBookmarks });
    }
    
    renderApp();
  });

  // ==========================================
  // 2. 이벤트 리스너
  // ==========================================
  themeBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark');
    applyTheme(!isDark);
    chrome.storage.local.set({ isDarkTheme: !isDark });
  });

  toggleMemo.addEventListener('change', function() {
    chrome.storage.local.set({ memoEnabled: this.checked });
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.getAttribute('data-view');
      folderCreationBar.style.display = currentView === 'custom' ? 'flex' : 'none';
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      exitSelectionMode();
      renderApp();
    });
  });

  selectModeBtn.addEventListener('click', toggleSelectionMode);

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length > 0) {
      searchClearBtn.style.display = 'flex';
      renderSearchResults(query);
    } else {
      searchClearBtn.style.display = 'none';
      renderApp();
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    renderApp();
  });

  addFolderBtn.addEventListener('click', createNewFolder);
  newFolderInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createNewFolder();
  });

  function createNewFolder() {
    const name = newFolderInput.value.trim();
    if (!name) return;
    if (userFolders.includes(name)) { alert('이미 존재하는 폴더입니다.'); return; }
    
    // [5️⃣ 에러 로깅] 저장 용량 초과 등 예외 처리
    try {
      userFolders.push(name);
      chrome.storage.local.set({ userFolders: userFolders }, () => {
        if (chrome.runtime.lastError) {
          alert('저장 실패: 용량이 부족할 수 있습니다.');
          userFolders.pop(); // 롤백
          return;
        }
        newFolderInput.value = '';
        if (currentView === 'custom') renderApp();
      });
    } catch (e) {
      console.error('Folder creation failed:', e);
    }
  }

  function deleteFolder(folderName) {
    if (!confirm(`'${folderName}' 폴더를 삭제하시겠습니까?\n항목은 'Inbox'로 이동됩니다.`)) return;
    userFolders = userFolders.filter(f => f !== folderName);
    currentBookmarks.forEach(item => { if (item.folder === folderName) delete item.folder; });
    chrome.storage.local.set({ userFolders: userFolders, bookmarks: currentBookmarks }, () => renderApp());
  }

  // ==========================================
  // 3. 렌더링 로직 (파비콘 적용)
  // ==========================================
  function renderApp() {
    if (searchInput.value.trim().length > 0) {
      renderSearchResults(searchInput.value.trim().toLowerCase());
      return;
    }
    if (currentBookmarks.length === 0) {
      listContainer.innerHTML = `<div class="empty-msg"><div class="empty-icon">❖</div><p style="font-size:13px;">No data.</p></div>`;
      return;
    }
    if (currentView === 'all') renderAllItems(currentBookmarks);
    else if (currentView === 'domains') renderDomainFolders(currentBookmarks);
    else if (currentView === 'custom') renderCustomFolders(currentBookmarks);
  }

  // [1️⃣ Favicon 표시] 헬퍼 함수
  function getFaviconUrl(url) {
    try {
      const domain = new URL(url).hostname;
      // 구글의 파비콘 추출 서비스 사용 (가장 안정적)
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch (e) {
      return ''; // URL 파싱 실패 시 빈 값
    }
  }

  function createCardElement(item, domain, title, index) {
    const div = document.createElement('div');
    div.className = 'bookmark';
    if (selectedIndices.has(index)) div.classList.add('selected');
    
    let displayTitle = title || 'No Title';
    if (displayTitle.length > 20) displayTitle = displayTitle.substring(0, 20) + '...';

    // 파비콘 URL 생성
    const faviconUrl = getFaviconUrl(item.url);
    const faviconImg = faviconUrl ? `<img src="${faviconUrl}" class="favicon-img" onerror="this.style.display='none'">` : '';

    div.innerHTML = `
      <div class="card-checkbox-wrapper">
        <input type="checkbox" class="custom-checkbox-input" data-index="${index}" ${selectedIndices.has(index) ? 'checked' : ''}>
      </div>
      <div class="bookmark-content-wrapper">
        <div class="card-meta">
          <div class="source-badge" title="${title}">
            ${faviconImg}
            <span class="domain-part">${domain}</span>
            <span class="title-part">${displayTitle}</span>
          </div>
          <span class="date">${item.date.split(' ')[0]}</span>
        </div>
        <div class="content-text">${escapeHTML(item.text)}</div>
        <div class="btn-group">
          <button class="btn btn-copy" data-text="${escapeHTML(item.text)}">복사</button>
          <button class="btn btn-move" data-index="${index}" title="이동">📂</button>
          <a href="${item.url}" target="_blank" class="btn btn-link">이동</a>
          <button class="btn btn-delete" data-index="${index}">삭제</button>
        </div>
      </div>
    `;
    return div;
  }

  // (나머지 렌더링 함수들 - 기존과 동일)
  function renderSearchResults(query) {
    listContainer.innerHTML = '';
    const matchedItems = currentBookmarks.map((item, index) => ({ ...item, originalIndex: index }))
      .filter(item => {
        const textMatch = item.text && item.text.toLowerCase().includes(query);
        const titleMatch = item.title && item.title.toLowerCase().includes(query);
        const urlMatch = item.url && item.url.toLowerCase().includes(query);
        return textMatch || titleMatch || urlMatch;
      });
    if (matchedItems.length === 0) { listContainer.innerHTML = `<div class="empty-msg"><p>검색 결과가 없습니다.</p></div>`; return; }
    matchedItems.reverse().forEach(item => {
      const domain = getDomain(item.url);
      const title = item.title || 'No Title';
      listContainer.appendChild(createCardElement(item, domain, title, item.originalIndex));
    });
    attachItemListeners();
  }

  function renderAllItems(bookmarks) {
    listContainer.innerHTML = '';
    bookmarks.slice().reverse().forEach((bookmark, reverseIndex) => {
      const realIndex = bookmarks.length - 1 - reverseIndex;
      const domain = getDomain(bookmark.url);
      const title = bookmark.title || 'No Title';
      listContainer.appendChild(createCardElement(bookmark, domain, title, realIndex));
    });
    attachItemListeners();
  }

  function renderDomainFolders(bookmarks) {
    listContainer.innerHTML = '';
    const groups = {};
    bookmarks.forEach((item, index) => {
      const domain = getDomain(item.url);
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push({ ...item, originalIndex: index });
    });
    Object.keys(groups).sort().forEach(domain => {
      const items = groups[domain].reverse();
      listContainer.appendChild(createFolderGroupUI('🌐', domain, items.length, items, false));
    });
    attachItemListeners();
  }

  function renderCustomFolders(bookmarks) {
    listContainer.innerHTML = '';
    const groups = { 'Inbox': [] };
    userFolders.forEach(folder => { groups[folder] = []; });
    bookmarks.forEach((item, index) => {
      const target = (item.folder && userFolders.includes(item.folder)) ? item.folder : 'Inbox';
      groups[target].push({ ...item, originalIndex: index });
    });
    const inboxItems = groups['Inbox'].reverse();
    if (inboxItems.length > 0) listContainer.appendChild(createFolderGroupUI('📥', 'Inbox', inboxItems.length, inboxItems, false));
    userFolders.forEach(folder => {
      const items = groups[folder].reverse();
      listContainer.appendChild(createFolderGroupUI('📁', folder, items.length, items, true));
    });
    attachItemListeners();
  }

  function createFolderGroupUI(icon, title, count, items, isDeletable) {
    const folderGroup = document.createElement('div');
    folderGroup.className = 'folder-group';
    let deleteBtnHtml = isDeletable ? `<button class="folder-delete-btn" data-folder="${title}" title="폴더 삭제">✖</button>` : '';

    folderGroup.innerHTML = `
      <div class="folder-header">
        <div class="folder-info">
          <span class="folder-icon">${icon}</span>
          <span class="folder-title">${title}</span>
          <span class="folder-count">${count}</span>
          ${deleteBtnHtml}
        </div>
        <span class="folder-arrow">▼</span>
      </div>
      <div class="folder-content"></div>
    `;

    const contentContainer = folderGroup.querySelector('.folder-content');
    items.forEach(item => {
      const domain = getDomain(item.url);
      const card = createCardElement(item, domain, item.title, item.originalIndex);
      card.style.boxShadow = 'none'; card.style.border = '1px solid var(--border-card)';
      contentContainer.appendChild(card);
    });

    folderGroup.querySelector('.folder-header').addEventListener('click', (e) => {
      if (e.target.classList.contains('folder-delete-btn')) return;
      folderGroup.classList.toggle('open');
    });

    if (isDeletable) {
      folderGroup.querySelector('.folder-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); deleteFolder(title);
      });
    }
    return folderGroup;
  }

  function openMoveModal(indices) {
    targetMoveIndices = indices;
    modalFolderList.innerHTML = '';
    const inboxBtn = document.createElement('button');
    inboxBtn.className = 'modal-folder-btn';
    inboxBtn.innerHTML = `<span>📥</span> Inbox`;
    inboxBtn.onclick = () => moveItems('Inbox');
    modalFolderList.appendChild(inboxBtn);
    userFolders.forEach(folder => {
      const btn = document.createElement('button');
      btn.className = 'modal-folder-btn';
      btn.innerHTML = `<span>📁</span> ${folder}`;
      btn.onclick = () => moveItems(folder);
      modalFolderList.appendChild(btn);
    });
    moveModal.classList.add('show');
  }

  function moveItems(targetFolder) {
    targetMoveIndices.forEach(idx => {
      if (targetFolder === 'Inbox') delete currentBookmarks[idx].folder;
      else currentBookmarks[idx].folder = targetFolder;
    });
    chrome.storage.local.set({ bookmarks: currentBookmarks }, () => {
      moveModal.classList.remove('show');
      exitSelectionMode();
      renderApp();
    });
  }

  closeModalBtn.addEventListener('click', () => moveModal.classList.remove('show'));

  function attachItemListeners() {
    document.querySelectorAll('.custom-checkbox-input').forEach(cb => {
      cb.addEventListener('change', function() {
        const index = parseInt(this.getAttribute('data-index'));
        if (this.checked) { selectedIndices.add(index); this.closest('.bookmark').classList.add('selected'); }
        else { selectedIndices.delete(index); this.closest('.bookmark').classList.remove('selected'); }
        updateBatchUI();
      });
    });
    document.querySelectorAll('.btn-move').forEach(btn => {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openMoveModal([parseInt(this.getAttribute('data-index'))]); });
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if(!confirm('삭제하시겠습니까?')) return;
        const index = parseInt(this.getAttribute('data-index'));
        currentBookmarks.splice(index, 1);
        chrome.storage.local.set({ bookmarks: currentBookmarks }, () => {
          selectedIndices.delete(index); renderApp(); updateBatchUI();
        });
      });
    });
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const textToCopy = this.parentElement.previousElementSibling.innerText;
        try {
          await navigator.clipboard.writeText(textToCopy);
          const originalText = this.innerText; this.innerText = '완료'; this.style.color = '#8b5cf6';
          setTimeout(() => { this.innerText = originalText; this.style.color = ''; }, 1000);
        } catch (err) {}
      });
    });
  }

  batchDeleteBtn.addEventListener('click', () => {
    if (selectedIndices.size === 0) return;
    if (!confirm(`${selectedIndices.size}개 삭제?`)) return;
    const indices = Array.from(selectedIndices).sort((a, b) => b - a);
    indices.forEach(idx => currentBookmarks.splice(idx, 1));
    chrome.storage.local.set({ bookmarks: currentBookmarks }, () => { exitSelectionMode(); renderApp(); });
  });

  batchMoveBtn.addEventListener('click', () => {
    if (selectedIndices.size > 0) openMoveModal(Array.from(selectedIndices));
  });

  batchOpenBtn.addEventListener('click', () => {
    selectedIndices.forEach(idx => { if (currentBookmarks[idx].url) chrome.tabs.create({ url: currentBookmarks[idx].url, active: false }); });
  });

  selectAllCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.querySelectorAll('.custom-checkbox-input').forEach(cb => {
        cb.checked = true; selectedIndices.add(parseInt(cb.getAttribute('data-index'))); cb.closest('.bookmark').classList.add('selected');
      });
    } else {
      selectedIndices.clear();
      document.querySelectorAll('.custom-checkbox-input').forEach(cb => {
        cb.checked = false; cb.closest('.bookmark').classList.remove('selected');
      });
    }
    updateBatchUI();
  });

  function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    if (isSelectionMode) { document.body.classList.add('selection-mode'); selectModeBtn.classList.add('active'); }
    else { exitSelectionMode(); }
  }

  function exitSelectionMode() {
    isSelectionMode = false; selectedIndices.clear();
    document.body.classList.remove('selection-mode'); selectModeBtn.classList.remove('active');
    selectAllCheckbox.checked = false; updateBatchUI();
    document.querySelectorAll('.bookmark').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.custom-checkbox-input').forEach(cb => cb.checked = false);
  }

  function updateBatchUI() {
    batchCountSpan.textContent = `${selectedIndices.size}개`;
    if (selectedIndices.size === 0) selectAllCheckbox.checked = false;
  }

  function applyTheme(isDark) {
    if (isDark) { document.body.classList.remove('light'); document.body.classList.add('dark'); themeBtn.textContent = '☀️'; }
    else { document.body.classList.remove('dark'); document.body.classList.add('light'); themeBtn.textContent = '🌙'; }
  }

  function getDomain(url) { try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'Unknown'; } }
  function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }
});