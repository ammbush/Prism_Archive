// =================================================================
// PRISM ARCHIVE: Simple & Robust Engine (v3.2 - Deployment Ready)
// =================================================================
const DROPZONE_ID = 'prism-archive-dropzone';
let memoBox = null;
let isEnabled = true;

// =================================================================
// 1. Dropzone UI (CSS 충돌 방지 적용)
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
  box.style.cssText = `
    all: initial; 
    position: fixed; bottom: 40px; right: 40px; width: 60px; height: 60px;
    border-radius: 18px; display: flex; justify-content: center; align-items: center;
    z-index: 2147483647; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    background: ${styles.bg}; border: 1px solid ${styles.border};
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    box-shadow: ${styles.shadow}; cursor: default; user-select: none;
    box-sizing: border-box; font-family: sans-serif;
  `;

  const icon = document.createElement('div');
  icon.textContent = '❖';
  // 아이콘 스타일에도 initial 적용 필요할 수 있으나 div 내부는 box의 isolation 영향 받음
  icon.style.cssText = `
    all: unset;
    font-size: 26px; color: ${styles.text}; 
    transition: transform 0.3s ease; opacity: 0.8;
    display: block; line-height: 1;
  `;
  box.appendChild(icon);

  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.style.transform = 'scale(1.15) rotate(45deg)';
    box.style.background = styles.activeGradient;
    box.style.border = 'none';
    icon.style.transform = 'rotate(-45deg) scale(1.2)';
    icon.style.color = '#ffffff'; icon.style.opacity = '1';
  });

  box.addEventListener('dragleave', (e) => {
    e.preventDefault();
    resetStyle(box, icon, styles);
  });

  box.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text');
    if (text && text.trim().length > 0) {
      box.style.transform = 'scale(0.8)';
      icon.textContent = '✓';
      
      // [5️⃣ 에러 로깅] 저장 실패 시 알림
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