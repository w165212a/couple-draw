// 全局 Socket 实例
const socket = io();

// 元素引用
const homeNavBtn = document.getElementById('homeNavBtn');
const roomBtn = document.getElementById('roomBtn');
const roomNameDisplay = document.getElementById('roomNameDisplay');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const addWordBtn = document.getElementById('addWordBtn');
const openGalleryBtn = document.getElementById('openGalleryBtn');

// 玩家列表与准备栏
const playersChipsContainer = document.getElementById('playersChipsContainer');
const readyActionBtn = document.getElementById('readyActionBtn');

// 题目、横幅与暂停
const roleBadge = document.getElementById('roleBadge');
const pauseBtn = document.getElementById('pauseBtn');
const topicWord = document.getElementById('topicWord');
const timerText = document.getElementById('timerText');
const hintContainer = document.getElementById('hintContainer');

// 画板与工具
const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const reactionLayer = document.getElementById('reactionLayer');

const toolsBar = document.getElementById('toolsBar');
const colorDots = document.querySelectorAll('.color-dot');
const sizeDotBtns = document.querySelectorAll('.size-dot-btn');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');

// 底部互动与猜词
const quickReactions = document.querySelectorAll('.reaction-btn');
const chatStream = document.getElementById('chatStream');
const guessForm = document.getElementById('guessForm');
const guessInput = document.getElementById('guessInput');
const sendBtn = document.getElementById('sendBtn');

// 弹窗引用
const nameModal = document.getElementById('nameModal');
const avatarGrid = document.getElementById('avatarGrid');
const nameInput = document.getElementById('nameInput');
const confirmNameBtn = document.getElementById('confirmNameBtn');

const wordSelectModal = document.getElementById('wordSelectModal');
const selectTimerBadge = document.getElementById('selectTimerBadge');
const candidateWordsGrid = document.getElementById('candidateWordsGrid');
const refreshWordsBtn = document.getElementById('refreshWordsBtn');
const customWordTriggerBtn = document.getElementById('customWordTriggerBtn');
const customTopicBox = document.getElementById('customTopicBox');
const customTopicInput = document.getElementById('customTopicInput');
const customHintInput = document.getElementById('customHintInput');
const cancelCustomTopicBtn = document.getElementById('cancelCustomTopicBtn');
const confirmCustomTopicBtn = document.getElementById('confirmCustomTopicBtn');

const guesserWaitingModal = document.getElementById('guesserWaitingModal');
const waitingDrawerAvatar = document.getElementById('waitingDrawerAvatar');
const waitingDrawerTitle = document.getElementById('waitingDrawerTitle');
const guesserWaitTimer = document.getElementById('guesserWaitTimer');

const wordModal = document.getElementById('wordModal');
const newWordInput = document.getElementById('newWordInput');
const closeWordModalBtn = document.getElementById('closeWordModalBtn');
const submitWordBtn = document.getElementById('submitWordBtn');

const victoryModal = document.getElementById('victoryModal');
const polaroidImage = document.getElementById('polaroidImage');
const nextRoundTimer = document.getElementById('nextRoundTimer');
const chooseDrawerBtn = document.getElementById('chooseDrawerBtn');
const chooseGuesserBtn = document.getElementById('chooseGuesserBtn');
const myChoiceStatus = document.getElementById('myChoiceStatus');
const closeVictoryBtn = document.getElementById('closeVictoryBtn');

const galleryModal = document.getElementById('galleryModal');
const galleryGrid = document.getElementById('galleryGrid');
const closeGalleryBtn = document.getElementById('closeGalleryBtn');
const clearGalleryBtn = document.getElementById('clearGalleryBtn');

const imagePreviewModal = document.getElementById('imagePreviewModal');
const previewModalImage = document.getElementById('previewModalImage');
const previewTitle = document.getElementById('previewTitle');
const closePreviewBtn = document.getElementById('closePreviewBtn');

// 状态变量
let isDrawer = false;
let isPaused = false;
let isDrawing = false;
let currentColor = '#2d3436';
let currentSize = 3;
let isEraser = false;

let roomName = 'sweet520';
let playerName = '';
let selectedAvatar = '🐱';
let isMyReady = false;
let isGameActive = false;

let currentWord = '';
let currentHint1 = '';
let currentHint2 = '';
let countdownInterval = null;
let drawHistory = [];

// 1. 初始化头像与昵称
function initPlayerAndRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  roomName = urlParams.get('room') || 'sweet520';
  roomNameDisplay.innerText = `房间: ${roomName}`;

  const savedName = localStorage.getItem('couple_player_name');
  const savedAvatar = localStorage.getItem('couple_player_avatar') || '🐱';
  const queryName = urlParams.get('name');
  const queryAvatar = urlParams.get('avatar');

  selectedAvatar = queryAvatar || savedAvatar;
  setupAvatarGridUI();

  if (queryName) {
    playerName = queryName.trim();
    localStorage.setItem('couple_player_name', playerName);
    localStorage.setItem('couple_player_avatar', selectedAvatar);
    nameModal.style.display = 'none';
    joinGame();
  } else if (savedName) {
    playerName = savedName;
    nameModal.style.display = 'none';
    joinGame();
  } else {
    nameModal.style.display = 'flex';
  }
}

// 自动重连高容错支持
socket.on('connect', () => {
  console.log('Socket 已连接:', socket.id);
  if (playerName) {
    joinGame();
  }
});

function setupAvatarGridUI() {
  const avatarButtons = avatarGrid.querySelectorAll('.avatar-btn');
  avatarButtons.forEach(btn => {
    if (btn.getAttribute('data-avatar') === selectedAvatar) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      avatarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.getAttribute('data-avatar');
    });
  });
}

confirmNameBtn.addEventListener('click', () => {
  const inputVal = nameInput.value.trim();
  if (!inputVal) {
    alert('请输入你的专属昵称哦~');
    return;
  }
  playerName = inputVal;
  localStorage.setItem('couple_player_name', playerName);
  localStorage.setItem('couple_player_avatar', selectedAvatar);
  nameModal.style.display = 'none';
  joinGame();
});

function joinGame() {
  socket.emit('join_room', { room: roomName, name: playerName, avatar: selectedAvatar });
}

if (homeNavBtn) {
  homeNavBtn.addEventListener('click', (e) => {
    if (isGameActive && !confirm('正在游戏中，确定要返回情侣小世界大厅吗？')) {
      e.preventDefault();
      return;
    }
    // 正常导航到首页大厅 /
  });
}

roomBtn.addEventListener('click', () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('🔗 专属游戏链接已复制！快发给宝贝吧~');
  }).catch(() => {
    prompt('复制此链接发给对方：', shareUrl);
  });
});

// 2. 准备 / 取消准备交互
readyActionBtn.addEventListener('click', () => {
  socket.emit('toggle_ready');
});

// 3. 暂停 / 恢复游戏功能（双人自由涂鸦）
pauseBtn.addEventListener('click', () => {
  socket.emit('toggle_pause');
});

socket.on('pause_status_changed', (data) => {
  isPaused = data.isPaused;
  if (isPaused) {
    pauseBtn.innerHTML = '▶️ 继续';
    pauseBtn.classList.add('paused');
    // 解锁双方画笔工具栏
    toolsBar.classList.remove('disabled');
    topicWord.innerText = '⏸️ 游戏已暂停：双人自由涂鸦开启 💕';
    showToast(`⏸️ ${data.operator} 暂停了游戏，开启双人涂鸦！`);
  } else {
    pauseBtn.innerHTML = '⏸️ 暂停';
    pauseBtn.classList.remove('paused');
    if (isDrawer) {
      topicWord.innerText = `请画: 【 ${currentWord} 】`;
      toolsBar.classList.remove('disabled');
    } else {
      const blanks = Array(currentWord.length).fill(' _ ').join('');
      topicWord.innerText = `题目(${currentWord.length}字): ${blanks}`;
      toolsBar.classList.add('disabled');
    }
    showToast(`▶️ ${data.operator} 恢复了游戏！`);
  }
});

// 4. 画手自主选词 (1000 词库海量随机 4选1 + 换一批 + 自己定词)
function renderCandidateWords(candidates) {
  candidateWordsGrid.innerHTML = '';
  candidates.forEach(c => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.innerHTML = `
      <span class="card-word">${escapeHtml(c.word)}</span>
      <span class="card-hint-preview">① ${escapeHtml(c.hint1 || '常见事物')}<br>② ${escapeHtml(c.hint2 || '仔细想想')}</span>
    `;
    card.addEventListener('click', () => {
      socket.emit('choose_word', { word: c.word, hint1: c.hint1, hint2: c.hint2 });
      wordSelectModal.style.display = 'none';
    });
    candidateWordsGrid.appendChild(card);
  });
}

refreshWordsBtn.addEventListener('click', () => {
  socket.emit('refresh_candidates');
});

// 自定义题目交互
if (customWordTriggerBtn) {
  customWordTriggerBtn.addEventListener('click', () => {
    customTopicBox.style.display = 'flex';
    setTimeout(() => customTopicInput.focus(), 100);
  });
}

if (cancelCustomTopicBtn) {
  cancelCustomTopicBtn.addEventListener('click', () => {
    customTopicBox.style.display = 'none';
  });
}

if (confirmCustomTopicBtn) {
  confirmCustomTopicBtn.addEventListener('click', () => {
    const customWord = customTopicInput.value.trim();
    if (!customWord) {
      alert('请输入你想画的自定义题目哦~');
      return;
    }
    if (customWord.length > 20) {
      alert('题目不能超过20个字哦~');
      return;
    }
    const customHint = customHintInput.value.trim() || '专属甜蜜回忆';
    socket.emit('choose_word', {
      word: customWord,
      hint1: customHint,
      hint2: '心有灵犀一点通'
    });
    wordSelectModal.style.display = 'none';
    customTopicBox.style.display = 'none';
  });

  customTopicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmCustomTopicBtn.click();
  });
}

// 5. 画板高分屏适配与绘图同步
function setupCanvas() {
  const rect = canvasContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  redrawHistory();
}

window.addEventListener('resize', setupCanvas);
window.addEventListener('orientationchange', () => setTimeout(setupCanvas, 200));

function redrawHistory() {
  const rect = canvasContainer.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawHistory.forEach(action => executeDrawAction(action, false));
}

function executeDrawAction(action, saveToHistory = true) {
  if (saveToHistory) {
    if (action.type === 'clear') {
      drawHistory = [];
    } else {
      drawHistory.push(action);
    }
  }

  const rect = canvasContainer.getBoundingClientRect();
  const actualX = action.x * rect.width;
  const actualY = action.y * rect.height;

  if (action.type === 'start') {
    ctx.beginPath();
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.size;
    ctx.moveTo(actualX, actualY);
  } else if (action.type === 'move') {
    ctx.lineTo(actualX, actualY);
    ctx.stroke();
  } else if (action.type === 'end') {
    ctx.closePath();
  } else if (action.type === 'clear') {
    ctx.clearRect(0, 0, rect.width, rect.height);
  }
}

function getRelativeCoord(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  };
}

// 触摸/鼠标/手写笔绘制：如果当前是画手，或者正处于暂停双人涂鸦模式，均可绘制！
canvas.addEventListener('pointerdown', (e) => {
  if (!isDrawer && !isPaused) return;
  e.preventDefault();
  isDrawing = true;

  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}

  const coord = getRelativeCoord(e);
  if (isNaN(coord.x) || isNaN(coord.y)) return;

  const strokeColor = isEraser ? '#FFFFFF' : currentColor;
  const strokeSize = isEraser ? Math.max(16, currentSize * 2.5) : currentSize;

  const action = {
    type: 'start',
    x: coord.x,
    y: coord.y,
    color: strokeColor,
    size: strokeSize
  };

  executeDrawAction(action);
  socket.emit('draw_action', action);
});

canvas.addEventListener('pointermove', (e) => {
  if ((!isDrawer && !isPaused) || !isDrawing) return;
  e.preventDefault();

  const coord = getRelativeCoord(e);
  if (isNaN(coord.x) || isNaN(coord.y)) return;

  const strokeColor = isEraser ? '#FFFFFF' : currentColor;
  const strokeSize = isEraser ? Math.max(16, currentSize * 2.5) : currentSize;

  const action = {
    type: 'move',
    x: coord.x,
    y: coord.y,
    color: strokeColor,
    size: strokeSize
  };

  executeDrawAction(action);
  socket.emit('draw_action', action);
});

function stopDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;
  try {
    if (e && e.pointerId) canvas.releasePointerCapture(e.pointerId);
  } catch (err) {}

  const action = { type: 'end' };
  executeDrawAction(action);
  socket.emit('draw_action', action);
}

canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// 工具栏切换
colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    colorDots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentColor = dot.getAttribute('data-color');
    isEraser = false;
    eraserBtn.classList.remove('active');
  });
});

// 画笔粗细切换
sizeDotBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    sizeDotBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = parseInt(btn.getAttribute('data-size'), 10) || 3;
    if (isEraser) {
      isEraser = false;
      eraserBtn.classList.remove('active');
      colorDots.forEach(d => {
        if (d.getAttribute('data-color') === currentColor) d.classList.add('active');
      });
    }
  });
});

eraserBtn.addEventListener('click', () => {
  isEraser = !isEraser;
  if (isEraser) {
    eraserBtn.classList.add('active');
    colorDots.forEach(d => d.classList.remove('active'));
  } else {
    eraserBtn.classList.remove('active');
    colorDots[0].classList.add('active');
    currentColor = colorDots[0].getAttribute('data-color');
  }
});

clearBtn.addEventListener('click', () => {
  if (!isDrawer && !isPaused) return;
  if (confirm('确认清空当前画布吗？')) {
    const action = { type: 'clear' };
    executeDrawAction(action);
    socket.emit('draw_action', action);
  }
});

// 6. 下一局角色意向选择
chooseDrawerBtn.addEventListener('click', () => {
  chooseDrawerBtn.classList.add('active');
  chooseGuesserBtn.classList.remove('active');
  myChoiceStatus.innerText = '已选择：🎨 想画画（等待下局开始...）';
  socket.emit('set_role_preference', { role: 'drawer' });
});

chooseGuesserBtn.addEventListener('click', () => {
  chooseGuesserBtn.classList.add('active');
  chooseDrawerBtn.classList.remove('active');
  myChoiceStatus.innerText = '已选择：🤔 想猜题（等待下局开始...）';
  socket.emit('set_role_preference', { role: 'guesser' });
});

function resetRoleChoiceUI() {
  chooseDrawerBtn.classList.remove('active');
  chooseGuesserBtn.classList.remove('active');
  myChoiceStatus.innerText = '（双方未选或冲突时自动轮流互换）';
}

closeVictoryBtn.addEventListener('click', () => {
  victoryModal.style.display = 'none';
  if (countdownInterval) clearInterval(countdownInterval);
});

// 7. 猜词与消息互动
guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = guessInput.value.trim();
  if (!text) return;

  socket.emit('send_guess', { text });
  guessInput.value = '';
});

// 快捷调侃表情气泡
quickReactions.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.getAttribute('data-emoji');
    const text = btn.getAttribute('data-text');
    socket.emit('send_reaction', { emoji, text });
  });
});

function triggerReactionBubble(sender, avatar, emoji, text) {
  const bubble = document.createElement('div');
  bubble.className = 'reaction-bubble';
  bubble.innerHTML = `<span>${avatar || '🐱'} ${emoji}</span> <span>${sender}: ${text}</span>`;

  const randomOffset = 35 + Math.random() * 30;
  bubble.style.left = `${randomOffset}%`;

  reactionLayer.appendChild(bubble);
  setTimeout(() => bubble.remove(), 3000);
}

// 投喂新词
addWordBtn.addEventListener('click', () => {
  wordModal.style.display = 'flex';
  newWordInput.value = '';
  newWordInput.focus();
});

closeWordModalBtn.addEventListener('click', () => {
  wordModal.style.display = 'none';
});

submitWordBtn.addEventListener('click', () => {
  const word = newWordInput.value.trim();
  if (!word) {
    alert('请输入词汇内容哦~');
    return;
  }
  socket.emit('add_custom_word', { word });
  wordModal.style.display = 'none';
});

// 8. 恋爱画册与大图预览（带返回画册功能）
function saveCardToGallery(cardDataUrl, word, dateStr) {
  try {
    let gallery = JSON.parse(localStorage.getItem('couple_draw_gallery') || '[]');
    gallery.unshift({
      img: cardDataUrl,
      word: word,
      date: dateStr
    });
    if (gallery.length > 50) gallery = gallery.slice(0, 50);
    localStorage.setItem('couple_draw_gallery', JSON.stringify(gallery));
  } catch (e) {
    console.warn('本地相册存储失败:', e);
  }
}

openGalleryBtn.addEventListener('click', renderGallery);
closeGalleryBtn.addEventListener('click', () => galleryModal.style.display = 'none');

function renderGallery() {
  galleryGrid.innerHTML = '';
  const gallery = JSON.parse(localStorage.getItem('couple_draw_gallery') || '[]');

  if (gallery.length === 0) {
    galleryGrid.innerHTML = `<div class="gallery-empty">还没有画作记录哦，快和宝贝猜对一局来解锁第一幅画吧！💕</div>`;
    clearGalleryBtn.style.display = 'none';
  } else {
    clearGalleryBtn.style.display = 'block';
    gallery.forEach((item) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'gallery-item';
      cardEl.innerHTML = `
        <img src="${item.img}" alt="${item.word}">
        <span class="gallery-item-title">“${escapeHtml(item.word)}”</span>
        <span class="gallery-item-date">${escapeHtml(item.date)}</span>
      `;
      // 点击缩略图：打开专属大图预览弹窗（带一键返回画册按钮）
      cardEl.addEventListener('click', () => {
        previewModalImage.src = item.img;
        previewTitle.innerText = `“${item.word}”`;
        imagePreviewModal.style.display = 'flex';
      });
      galleryGrid.appendChild(cardEl);
    });
  }
  galleryModal.style.display = 'flex';
}

closePreviewBtn.addEventListener('click', () => {
  imagePreviewModal.style.display = 'none';
});

clearGalleryBtn.addEventListener('click', () => {
  if (confirm('确认清空你手机上的画册记录吗？（已保存至相册的图片不受影响）')) {
    localStorage.removeItem('couple_draw_gallery');
    renderGallery();
  }
});

// 9. 生成拍立得画作回忆卡
function generatePolaroidMemoryCard(word, hint1, hint2, drawer, drawerAvatar, guesser, guesserAvatar, seconds) {
  const card = document.createElement('canvas');
  card.width = 640;
  card.height = 840;
  const c = card.getContext('2d');

  c.fillStyle = '#FFFDF9';
  c.fillRect(0, 0, card.width, card.height);

  c.strokeStyle = '#EADECF';
  c.lineWidth = 4;
  c.strokeRect(4, 4, card.width - 8, card.height - 8);

  const margin = 40;
  const photoSize = 560;
  c.fillStyle = '#FFFFFF';
  c.fillRect(margin, margin, photoSize, photoSize);
  c.strokeStyle = '#F0E5D8';
  c.lineWidth = 2;
  c.strokeRect(margin, margin, photoSize, photoSize);

  c.drawImage(canvas, margin, margin, photoSize, photoSize);

  c.fillStyle = '#2D3436';
  c.font = 'bold 36px -apple-system, sans-serif';
  c.fillText(`“${word}”`, margin, photoSize + margin + 55);

  c.fillStyle = '#FF6B81';
  c.font = 'bold 18px -apple-system, sans-serif';
  const hintSummary = hint1 ? `💡 线索：${hint1} · ${hint2 || ''}` : '💡 甜蜜默契考验';
  c.fillText(hintSummary, margin, photoSize + margin + 95);

  c.fillStyle = '#636E72';
  c.font = '22px -apple-system, sans-serif';
  c.fillText(`🎨 画手: ${drawerAvatar} ${drawer}  |  💡 猜中: ${guesserAvatar} ${guesser}`, margin, photoSize + margin + 135);

  const now = new Date();
  const dateStr = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  c.font = '18px -apple-system, sans-serif';
  c.fillStyle = '#B2BEC3';
  c.fillText(`⏱️ 耗时 ${seconds}秒 · ${dateStr}`, margin, photoSize + margin + 170);

  c.save();
  c.translate(card.width - margin - 150, card.height - margin - 45);
  c.rotate(-0.06);
  c.strokeStyle = '#FF6B81';
  c.lineWidth = 2;
  c.strokeRect(0, 0, 160, 42);
  c.fillStyle = '#FF6B81';
  c.font = 'bold 16px -apple-system, sans-serif';
  c.fillText('💕 默契猜画印章 💕', 10, 26);
  c.restore();

  const dataUrl = card.toDataURL('image/png');
  polaroidImage.src = dataUrl;

  saveCardToGallery(dataUrl, word, dateStr);

  resetRoleChoiceUI();
  victoryModal.style.display = 'flex';

  let remaining = 6;
  nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后开始...`;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后开始...`;
    } else {
      clearInterval(countdownInterval);
      victoryModal.style.display = 'none';
    }
  }, 1000);
}

// 10. Socket 监听服务

socket.on('room_info', ({ players, playerCount, state, gameStarted }) => {
  isGameActive = !!gameStarted;

  playersChipsContainer.innerHTML = '';
  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `
      <span class="chip-avatar">${p.avatar}</span>
      <span class="chip-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
      ${state !== 'lobby' ? `<span class="chip-role ${p.isDrawer ? 'drawer' : ''}">${p.isDrawer ? '🎨画手' : '🤔猜题'}</span>` : ''}
      ${!isGameActive ? `<span class="chip-ready ${p.isReady ? '' : 'unready'}">${p.isReady ? '✅已准备' : '⏳未准备'}</span>` : '<span class="chip-ready">🎮对战中</span>'}
      <span class="chip-score">🏆${p.score}</span>
    `;
    playersChipsContainer.appendChild(chip);

    if (p.name === playerName) {
      isMyReady = p.isReady;
    }
  });

  if (isGameActive) {
    readyActionBtn.style.display = 'none';
  } else {
    readyActionBtn.style.display = 'block';
    if (isMyReady) {
      readyActionBtn.innerText = '✅ 取消准备';
      readyActionBtn.classList.add('is-ready');
    } else {
      readyActionBtn.innerText = '❤️ 我准备好了';
      readyActionBtn.classList.remove('is-ready');
    }
  }

  if (playerCount < 2) {
    statusIndicator.classList.remove('connected');
    statusText.innerText = '等待宝贝连线...💕';
    roleBadge.innerText = '等待中';
    topicWord.innerText = '等待对方点击专属链接进房';
    timerText.innerText = '--';
    pauseBtn.style.display = 'none';
    hintContainer.style.display = 'none';
    readyActionBtn.disabled = true;
  } else {
    statusIndicator.classList.add('connected');
    statusText.innerText = '双人已连线';
    readyActionBtn.disabled = false;

    if (state === 'lobby' && !isGameActive) {
      topicWord.innerText = '点击右侧【我准备好了】即可开启全自动轮换！';
    }
  }
});

socket.on('pick_word_turn', ({ candidates, duration }) => {
  guesserWaitingModal.style.display = 'none';
  wordSelectModal.style.display = 'flex';
  if (customTopicBox) customTopicBox.style.display = 'none';
  if (customTopicInput) customTopicInput.value = '';
  if (customHintInput) customHintInput.value = '';
  pauseBtn.style.display = 'none';
  selectTimerBadge.innerText = `⏱️ ${duration}s`;
  renderCandidateWords(candidates);
});

socket.on('guesser_waiting_pick', ({ drawerName, drawerAvatar, duration }) => {
  wordSelectModal.style.display = 'none';
  guesserWaitingModal.style.display = 'flex';
  pauseBtn.style.display = 'none';
  waitingDrawerAvatar.innerText = drawerAvatar || '🎨';
  waitingDrawerTitle.innerText = `画手 ${drawerName} 正在挑选题目...`;
  guesserWaitTimer.innerText = `⏱️ ${duration}s`;
});

socket.on('word_pick_tick', ({ seconds }) => {
  selectTimerBadge.innerText = `⏱️ ${seconds}s`;
  guesserWaitTimer.innerText = `⏱️ ${seconds}s`;
});

socket.on('round_start', (data) => {
  wordSelectModal.style.display = 'none';
  guesserWaitingModal.style.display = 'none';
  victoryModal.style.display = 'none';
  if (countdownInterval) clearInterval(countdownInterval);

  isDrawer = data.isDrawer;
  isPaused = false;
  drawHistory = [];
  setupCanvas();

  currentHint1 = data.hint1 || '';
  currentHint2 = data.hint2 || '';

  // 显示暂停按钮与提示栏
  pauseBtn.style.display = 'inline-flex';
  pauseBtn.innerHTML = '⏸️ 暂停';
  pauseBtn.classList.remove('paused');
  hintContainer.style.display = 'flex';

  if (isDrawer) {
    roleBadge.innerText = '我是画手';
    roleBadge.style.background = '#FF6B81';
    currentWord = data.word;
    topicWord.innerText = `请画: 【 ${data.word} 】`;
    toolsBar.classList.remove('disabled');
    guessInput.disabled = true;
    guessInput.placeholder = '你正在作画，等待对方猜词...';
    sendBtn.disabled = true;

    hintContainer.innerHTML = `
      <span class="hint-badge level-1">线索①：${escapeHtml(data.hint1 || '等待揭晓')}</span>
      <span class="hint-badge level-2">线索②：${escapeHtml(data.hint2 || '等待揭晓')}</span>
    `;
  } else {
    roleBadge.innerText = '我是猜题人';
    roleBadge.style.background = '#1E90FF';
    const blanks = Array(data.wordLength).fill(' _ ').join('');
    topicWord.innerText = `题目(${data.wordLength}字): ${blanks}`;
    toolsBar.classList.add('disabled');
    guessInput.disabled = false;
    guessInput.placeholder = '输入你猜的词汇，回车发送...';
    sendBtn.disabled = false;
    guessInput.focus();

    hintContainer.innerHTML = `<span class="hint-placeholder" id="hintPlaceholder">💡 进阶提示：开局30秒后解锁线索①...</span>`;
  }
});

socket.on('progressive_hint', ({ level, hint, msg }) => {
  if (level === 1) {
    currentHint1 = hint;
    if (!isDrawer) {
      hintContainer.innerHTML = `
        <span class="hint-badge level-1">💡 提示①：${escapeHtml(hint)}</span>
        <span class="hint-next-tip">(30s后解锁线索②)</span>
      `;
    }
    showToast(`💡 进阶提示①揭晓：【${hint}】`);
    addChatMessage('系统', `💡 进阶提示①：【${hint}】`, true);
  } else if (level === 2) {
    currentHint2 = hint;
    if (!isDrawer) {
      hintContainer.innerHTML = `
        <span class="hint-badge level-1">💡 提示①：${escapeHtml(currentHint1)}</span>
        <span class="hint-badge level-2">💡 提示②：${escapeHtml(hint)}</span>
      `;
    }
    showToast(`💡 进阶提示②揭晓：【${hint}】`);
    addChatMessage('系统', `💡 终极提示②：【${hint}】`, true);
  }
});

socket.on('timer_tick', ({ seconds }) => {
  timerText.innerText = seconds;
  if (seconds <= 15) {
    timerText.style.color = '#EE5253';
  } else {
    timerText.style.color = '#FF6B81';
  }
});

socket.on('draw_action', (action) => {
  executeDrawAction(action);
});

socket.on('sync_canvas', (history) => {
  drawHistory = history || [];
  redrawHistory();
});

socket.on('round_win', (data) => {
  pauseBtn.style.display = 'none';
  addChatMessage('系统', `🎉 猜中啦！答案是【${data.word}】，耗时 ${data.elapsedSeconds} 秒！`, true);
  generatePolaroidMemoryCard(
    data.word, 
    data.hint1,
    data.hint2,
    data.drawerName, 
    data.drawerAvatar || '🎨', 
    data.guesserName, 
    data.guesserAvatar || '💡', 
    data.elapsedSeconds
  );
});

socket.on('round_timeout', (data) => {
  pauseBtn.style.display = 'none';
  addChatMessage('系统', `⏰ 时间到啦！正确答案是【${data.word}】`, false);
  showToast(`⏰ 时间到！答案是【${data.word}】`);
  resetRoleChoiceUI();
  victoryModal.style.display = 'flex';
  let remaining = 6;
  nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后开始...`;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后开始...`;
    } else {
      clearInterval(countdownInterval);
      victoryModal.style.display = 'none';
    }
  }, 1000);
});

socket.on('chat_message', ({ sender, avatar, text, isGuesser }) => {
  addChatMessage(`${avatar || '🐱'} ${sender}`, text, isGuesser);
});

function addChatMessage(sender, text, isHighlight) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  const color = isHighlight ? 'color: #ff6b81; font-weight: bold;' : '';
  item.innerHTML = `<span class="sender">${sender}:</span> <span class="message" style="${color}">${escapeHtml(text)}</span>`;
  chatStream.appendChild(item);
  chatStream.scrollTop = chatStream.scrollHeight;
}

socket.on('reaction_popup', ({ sender, avatar, emoji, text }) => {
  triggerReactionBubble(sender, avatar, emoji, text);
});

socket.on('custom_word_added', ({ adder, word }) => {
  showToast(`💌 ${adder} 偷偷添加了新回忆词汇！`);
});

function showToast(msg) {
  const toast = document.createElement('div');
  toast.innerText = msg;
  toast.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(45, 52, 54, 0.9);
    color: #FFF;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    z-index: 999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: popIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(string) {
  return String(string).replace(/[&<>"'`=\/]/g, function (s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    }[s];
  });
}

// 页面启动
window.addEventListener('DOMContentLoaded', () => {
  setupCanvas();
  initPlayerAndRoom();
});
