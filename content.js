// =================================================================
// PRISM ARCHIVE: Simple & Robust Engine (v3.3 - Draggable Update)
// =================================================================
const DROPZONE_ID = 'prism-archive-dropzone';
let memoBox = null;
let isEnabled = true;

// =================================================================
// 1. Dropzone UI (CSS 충돌 방지 적용 + 드래그 지원)
// =================================================================
function getThemeStyles() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    bg: isDark ? 'rgba(20, 20, 20, 0.65)' : 'rgba(255, 255, 255, 0.8)',
    text: isDark ? '#ffffff' : '#1f2937',
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    activeGradient: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
  };
}

function createDropzone() {
  const styles = getThemeStyles();
  const box = document.createElement('div');
  box.id = DROPZONE_ID;
  
  // [3️⃣ 충돌 테스트] all: initial로 사이트 CSS 영향 차단
  // bottom/right 대신 초기 위치를 잡고, 이후 드래그 시 left/top으로 제어하기 위해 
  // transition에서 transform은 제외하거나 드래그 시 제어해야 함.
  // 여기서는 기본 상태 스타일 정의.
  box.style.cssText = `
    all: initial; 
    position: fixed; bottom: 40px; right: 40px; width: 60px; height: 60px;
    border-radius: 18px; display: flex; justify-content: center; align-items: center;
    z-index: 2147483647; 
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.3s, border 0.3s;
    background: ${styles.bg}; border: 1px solid ${styles.border};
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    box-shadow: ${styles.shadow}; cursor: move; user-select: none;
    box-sizing: border-box; font-family: sans-serif;
  `;

  const icon = document.createElement('div');
  icon.textContent = '❖';
  icon.style.cssText = `
    all: unset;
    font-size: 26px; color: ${styles.text}; 
    transition: transform 0.3s ease; opacity: 0.8;
    display: block; line-height: 1; pointer-events: none; /* 아이콘이 드래그 방해하지 않도록 */
  `;
  box.appendChild(icon);

  // --- 드래그 기능 추가 ---
  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  box.addEventListener('mousedown', (e) => {
    // 우클릭 등은 무시
    if (e.button !== 0) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // 현재 위치 계산 (bottom/right 기준일 수 있으므로 getBoundingClientRect 사용)
    const rect = box.getBoundingClientRect();
    
    // 스타일을 fixed bottom/right에서 left/top으로 전환하여 이동 가능하게 변경
    box.style.bottom = 'auto';
    box.style.right = 'auto';
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    
    // 드래그 중에는 부드러운 애니메이션(transition)을 끄지 않으면 딜레이 발생함
    box.style.transition = 'none'; 
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault(); // 텍스트 선택 방지

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // 현재 위치 업데이트
    const currentLeft = parseFloat(box.style.left);
    const currentTop = parseFloat(box.style.top);

    box.style.left = `${currentLeft + dx}px`;
    box.style.top = `${currentTop + dy}px`;

    // 다음 계산을 위해 시작점 업데이트
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      // 드래그 종료 후 호버 효과 등을 위해 transition 복구
      box.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.3s, border 0.3s';
    }
  });

  // --- 기존 드래그 앤 드롭(텍스트 저장) 이벤트 ---
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (isDragging) return; // 박스 이동 중에는 드롭존 효과 방지

    box.style.transform = 'scale(1.15) rotate(45deg)';
    box.style.background = styles.activeGradient;
    box.style.border = 'none';
    icon.style.transform = 'rotate(-45deg) scale(1.2)';
    icon.style.color = '#ffffff'; icon.style.opacity = '1';
  });

  box.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (isDragging) return;
    resetStyle(box, icon, styles);
  });

  box.addEventListener('drop', (e) => {
    e.preventDefault();
    // 박스 자체를 드래그하다가 놓았을 때 텍스트 저장이 실행되지 않도록 방어
    if (isDragging) return;

    const text = e.dataTransfer.getData('text');
    if (text && text.trim().length > 0) {
      box.style.transform = 'scale(0.8)';
      icon.textContent = '✓';
      
      try {
        saveBookmark(text.trim());
      } catch (err) {
        console.error('Save failed:', err);
        icon.textContent = '!';
        icon.style.color = '#ef4444';
      }

      setTimeout(() => {
        resetStyle(box, icon, styles);
        icon.textContent = '❖';
      }, 1000);
    }
  });

  return box;
}

function resetStyle(box, icon, styles) {
  // 드래그로 이동된 위치는 유지하되 transform 초기화
  box.style.transform = 'scale(1) rotate(0deg)';
  box.style.background = styles.bg;
  box.style.border = `1px solid ${styles.border}`;
  icon.style.transform = 'scale(1) rotate(0deg)';
  icon.style.color = styles.text;
  icon.style.opacity = '0.8';
}

function saveBookmark(content) {
  chrome.storage.local.get(['bookmarks'], function(result) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    const bookmarks = result.bookmarks || [];
    const dateStr = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' });
    const cleanText = content.replace(/\s+/g, ' ').trim();
    const urlObj = new URL(window.location.href);
    urlObj.hash = ''; 
    const searchText = cleanText.length > 500 ? cleanText.substring(0, 500) : cleanText;
    urlObj.searchParams.set('prism_text', searchText);

    bookmarks.push({
      text: content, url: urlObj.toString(), title: document.title, date: dateStr, folder: 'Inbox' // 기본 폴더 지정
    });
    
    chrome.storage.local.set({ bookmarks: bookmarks }, () => {
      if (chrome.runtime.lastError) {
        alert("저장 공간이 부족합니다. 정리 후 다시 시도해주세요.");
      }
    });
  });
}

// =================================================================
// 2. 심플 스크롤 엔진 (v2.3 유지)
// =================================================================

function initAutoScroll() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetText = urlParams.get('prism_text');
  
  if (!targetText) return;

  let attempts = 0;
  const maxAttempts = 10;

  const interval = setInterval(() => {
    attempts++;
    if (tryFind(targetText) || attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 1000);
  
  tryFind(targetText);
}

function tryFind(text) {
  window.getSelection().removeAllRanges();
  const cleanText = text.replace(/\s+/g, ' ').trim();

  if (doSearch(cleanText)) return true;
  if (cleanText.length > 70) {
    if (doSearch(cleanText.substring(0, 70))) return true;
  }
  if (cleanText.length > 30) {
    if (doSearch(cleanText.substring(0, 30))) return true;
  }

  return false;
}

function doSearch(keyword) {
  const found = window.find(keyword, false, false, true, false, true, false);
  if (found) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const element = selection.anchorNode.parentElement;
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElement(element);
        return true;
      }
    }
  }
  return false;
}

function highlightElement(element) {
  const originalTransition = element.style.transition;
  const originalBg = element.style.backgroundColor;
  
  element.style.transition = 'background-color 0.5s ease';
  element.style.backgroundColor = 'rgba(216, 180, 254, 0.7)'; 

  setTimeout(() => {
    element.style.backgroundColor = originalBg;
    setTimeout(() => {
        element.style.transition = originalTransition;
    }, 500);
    window.getSelection().removeAllRanges();
  }, 2000);
}

// =================================================================
// 3. 초기화
// =================================================================
function init() {
  chrome.storage.local.get(['memoEnabled'], (result) => {
    isEnabled = result.memoEnabled !== false; 
    if (isEnabled && !document.getElementById(DROPZONE_ID)) {
      memoBox = createDropzone();
      document.body.appendChild(memoBox);
    }
  });
  
  setTimeout(initAutoScroll, 500);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.memoEnabled !== undefined) {
    isEnabled = changes.memoEnabled.newValue;
    if (isEnabled) {
      if (!document.getElementById(DROPZONE_ID)) {
        memoBox = createDropzone();
        document.body.appendChild(memoBox);
      }
    } else {
      const existing = document.getElementById(DROPZONE_ID);
      if (existing) existing.remove();
    }
  }
});

const observer = new MutationObserver(() => {
  if (isEnabled && !document.getElementById(DROPZONE_ID)) {
    memoBox = createDropzone();
    document.body.appendChild(memoBox);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

init();
