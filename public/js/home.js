// 首页大厅逻辑

document.addEventListener('DOMContentLoaded', () => {
  // 1. 兼容老链接：如果 URL 中包含 room 参数，直接自动重定向至对局页面
  const urlParams = new URLSearchParams(window.location.search);
  const directRoom = urlParams.get('room');
  if (directRoom) {
    window.location.replace(`/game.html?room=${encodeURIComponent(directRoom)}`);
    return;
  }

  // 2. 房间跳转逻辑
  initRoomNavigation();

  // 3. 筹备中卡片弹窗
  initUpcomingCards();

  // 4. 大厅画册弹窗
  initGalleryModal();

  // 5. 随机情侣每日甜甜寄语
  initDailyQuote();
});

// 房间快捷进入与自定义
function initRoomNavigation() {
  const quickEnterBtn = document.getElementById('quickEnterBtn');
  const customRoomBtn = document.getElementById('customRoomBtn');
  const roomModal = document.getElementById('roomModal');
  const roomInput = document.getElementById('roomInput');
  const enterRoomConfirmBtn = document.getElementById('enterRoomConfirmBtn');
  const cancelRoomBtn = document.getElementById('cancelRoomBtn');

  // 一键进入默认房间
  if (quickEnterBtn) {
    quickEnterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/game.html?room=sweet520';
    });
  }

  // 自定义房间弹窗
  if (customRoomBtn && roomModal) {
    customRoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      roomInput.value = '';
      roomModal.style.display = 'flex';
      setTimeout(() => roomInput.focus(), 150);
    });

    cancelRoomBtn.addEventListener('click', () => {
      roomModal.style.display = 'none';
    });

    enterRoomConfirmBtn.addEventListener('click', () => {
      const room = roomInput.value.trim();
      if (!room) {
        alert('请输入房间名哦~');
        return;
      }
      window.location.href = `/game.html?room=${encodeURIComponent(room)}`;
    });

    roomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enterRoomConfirmBtn.click();
    });

    roomModal.addEventListener('click', (e) => {
      if (e.target === roomModal) roomModal.style.display = 'none';
    });
  }
}

// 规划中模块温馨提示
function initUpcomingCards() {
  const upcomingCards = document.querySelectorAll('.card-upcoming-trigger');
  const upcomingModal = document.getElementById('upcomingModal');
  const upcomingModalTitle = document.getElementById('upcomingModalTitle');
  const upcomingModalDesc = document.getElementById('upcomingModalDesc');
  const closeUpcomingBtn = document.getElementById('closeUpcomingBtn');

  upcomingCards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const title = card.getAttribute('data-feature') || '心动功能';
      const desc = card.getAttribute('data-desc') || '正在精心烘焙中，马上与你们见面 💕';
      if (upcomingModalTitle) upcomingModalTitle.textContent = title;
      if (upcomingModalDesc) upcomingModalDesc.textContent = desc;
      if (upcomingModal) upcomingModal.style.display = 'flex';
    });
  });

  if (closeUpcomingBtn && upcomingModal) {
    closeUpcomingBtn.addEventListener('click', () => {
      upcomingModal.style.display = 'none';
    });
    upcomingModal.addEventListener('click', (e) => {
      if (e.target === upcomingModal) upcomingModal.style.display = 'none';
    });
  }
}

// 大厅画册预览（读取 IndexedDB 画作）
function initGalleryModal() {
  const openLobbyGalleryBtn = document.getElementById('openLobbyGalleryBtn');
  const lobbyGalleryModal = document.getElementById('lobbyGalleryModal');
  const closeLobbyGalleryBtn = document.getElementById('closeLobbyGalleryBtn');
  const lobbyGalleryGrid = document.getElementById('lobbyGalleryGrid');
  const emptyGalleryTip = document.getElementById('emptyGalleryTip');

  if (!openLobbyGalleryBtn || !lobbyGalleryModal) return;

  openLobbyGalleryBtn.addEventListener('click', () => {
    loadLobbyGallery();
    lobbyGalleryModal.style.display = 'flex';
  });

  closeLobbyGalleryBtn.addEventListener('click', () => {
    lobbyGalleryModal.style.display = 'none';
  });

  lobbyGalleryModal.addEventListener('click', (e) => {
    if (e.target === lobbyGalleryModal) lobbyGalleryModal.style.display = 'none';
  });

  function loadLobbyGallery() {
    lobbyGalleryGrid.innerHTML = '';
    
    // 打开 IndexedDB
    const req = indexedDB.open('CoupleDrawDB', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('paintings')) {
        showEmpty();
        return;
      }
      const tx = db.transaction('paintings', 'readonly');
      const store = tx.objectStore('paintings');
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const list = getAllReq.result || [];
        if (list.length === 0) {
          showEmpty();
        } else {
          if (emptyGalleryTip) emptyGalleryTip.style.display = 'none';
          list.sort((a, b) => b.id - a.id).forEach(item => {
            const card = document.createElement('div');
            card.className = 'polaroid-card';
            card.innerHTML = `
              <img src="${item.dataUrl}" alt="${item.word}">
              <div class="word-title">《${item.word}》</div>
              <div style="font-size:10px; color:#9CA3AF; margin-top:2px;">${item.date}</div>
            `;
            lobbyGalleryGrid.appendChild(card);
          });
        }
      };
    };
    req.onerror = () => showEmpty();

    function showEmpty() {
      if (emptyGalleryTip) emptyGalleryTip.style.display = 'block';
    }
  }
}

// 随机每日温馨情话
function initDailyQuote() {
  const quoteText = document.getElementById('quoteText');
  if (!quoteText) return;

  const quotes = [
    "每一次下笔，都是属于我们两人的心有灵犀 🐾",
    "今天也超级超级喜欢你呀 💕",
    "世界很大，但这里只有我们两个人 ✨",
    "和你在一起的每一天，都闪闪发光 🌸",
    "所有的浪漫与温柔，都只想留给你 💌"
  ];
  const randomPick = quotes[Math.floor(Math.random() * quotes.length)];
  quoteText.textContent = randomPick;
}
