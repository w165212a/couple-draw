// 全局状态管理
const socket = io();

// 元素引用
const roomBtn = document.getElementById('roomBtn');
const roomNameDisplay = document.getElementById('roomNameDisplay');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const addWordBtn = document.getElementById('addWordBtn');

const roleBadge = document.getElementById('roleBadge');
const topicWord = document.getElementById('topicWord');
const categoryTag = document.getElementById('categoryTag');
const timerText = document.getElementById('timerText');

const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const reactionLayer = document.getElementById('reactionLayer');

const toolsBar = document.getElementById('toolsBar');
const colorDots = document.querySelectorAll('.color-dot');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');

const quickReactions = document.querySelectorAll('.reaction-btn');
const chatStream = document.getElementById('chatStream');
const guessForm = document.getElementById('guessForm');
const guessInput = document.getElementById('guessInput');
const sendBtn = document.getElementById('sendBtn');

// 弹窗引用
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const confirmNameBtn = document.getElementById('confirmNameBtn');

const wordModal = document.getElementById('wordModal');
const newWordInput = document.getElementById('newWordInput');
const closeWordModalBtn = document.getElementById('closeWordModalBtn');
const submitWordBtn = document.getElementById('submitWordBtn');

const victoryModal = document.getElementById('victoryModal');
const polaroidImage = document.getElementById('polaroidImage');
const nextRoundTimer = document.getElementById('nextRoundTimer');

// 游戏逻辑变量
let isDrawer = false;
let isDrawing = false;
let currentColor = '#2d3436';
let currentSize = 3;
let isEraser = false;

let roomName = 'sweet520';
let playerName = '';
let currentWord = '';
let currentCategory = '';
let countdownInterval = null;

// 本地绘画动作历史（用于窗口重调比例或生成卡片）
let drawHistory = [];

// 1. 初始化用户身份与房间
function initPlayerAndRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  roomName = urlParams.get('room') || 'sweet520';
  roomNameDisplay.innerText = `房间: ${roomName}`;

  const savedName = localStorage.getItem('couple_player_name');
  const queryName = urlParams.get('name');

  if (queryName) {
    playerName = queryName.trim();
    localStorage.setItem('couple_player_name', playerName);
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

confirmNameBtn.addEventListener('click', () => {
  const inputVal = nameInput.value.trim();
  if (!inputVal) {
    alert('请输入昵称哦~');
    return;
  }
  playerName = inputVal;
  localStorage.setItem('couple_player_name', playerName);
  nameModal.style.display = 'none';
  joinGame();
});

function joinGame() {
  socket.emit('join_room', { room: roomName, name: playerName });
}

// 复制专属房间链接
roomBtn.addEventListener('click', () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('🔗 专属游戏链接已复制！快发给宝贝吧~');
  }).catch(() => {
    prompt('复制此链接发给对方：', shareUrl);
  });
});

// 2. 画板尺寸与高分屏（DPR）适配
function setupCanvas() {
  const rect = canvasContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 每次重置大小时重绘历史
  redrawHistory();
}

window.addEventListener('resize', setupCanvas);
window.addEventListener('orientationchange', () => setTimeout(setupCanvas, 200));

// 重绘画布
function redrawHistory() {
  const rect = canvasContainer.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  let currentPath = null;
  drawHistory.forEach(action => {
    executeDrawAction(action, false);
  });
}

// 执行画画指令（无论是本地还是从 Socket 收到）
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

// 3. 触摸与画笔事件绑定（使用统一 Pointer Events，支持触屏、鼠标与 Apple Pencil）
function getRelativeCoord(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!isDrawer) return;
  e.preventDefault();
  isDrawing = true;
  canvas.setPointerCapture(e.pointerId);

  const coord = getRelativeCoord(e);
  const strokeColor = isEraser ? '#FFFFFF' : currentColor;
  const strokeSize = isEraser ? 16 : currentSize;

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
  if (!isDrawer || !isDrawing) return;
  e.preventDefault();

  const coord = getRelativeCoord(e);
  const strokeColor = isEraser ? '#FFFFFF' : currentColor;
  const strokeSize = isEraser ? 16 : currentSize;

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
  const action = { type: 'end' };
  executeDrawAction(action);
  socket.emit('draw_action', action);
}

canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// 4. 颜色与工具栏选择
colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    colorDots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentColor = dot.getAttribute('data-color');
    isEraser = false;
    eraserBtn.classList.remove('active');
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
  if (!isDrawer) return;
  if (confirm('确认清空当前画布吗？')) {
    const action = { type: 'clear' };
    executeDrawAction(action);
    socket.emit('draw_action', action);
  }
});

// 5. 猜词与消息提交
guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = guessInput.value.trim();
  if (!text) return;

  socket.emit('send_guess', { text });
  guessInput.value = '';
});

// 快捷调侃反应弹幕
quickReactions.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.getAttribute('data-emoji');
    const text = btn.getAttribute('data-text');
    socket.emit('send_reaction', { emoji, text });
  });
});

// 触发气泡浮动弹幕动效
function triggerReactionBubble(sender, emoji, text) {
  const bubble = document.createElement('div');
  bubble.className = 'reaction-bubble';
  bubble.innerHTML = `<span>${emoji}</span> <span>${sender}: ${text}</span>`;

  // 稍微随机水平偏移（35% ~ 65%）防止堆叠
  const randomOffset = 40 + Math.random() * 20;
  bubble.style.left = `${randomOffset}%`;

  reactionLayer.appendChild(bubble);
  setTimeout(() => bubble.remove(), 3000);
}

// 投喂新词功能
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

// 6. 核心：生成“拍立得画作回忆卡”
function generatePolaroidMemoryCard(word, category, drawer, guesser, seconds) {
  const card = document.createElement('canvas');
  card.width = 640;
  card.height = 840;
  const c = card.getContext('2d');

  // 1. 拍立得复古暖白相纸底色
  c.fillStyle = '#FFFDF9';
  c.fillRect(0, 0, card.width, card.height);

  // 外边框微阴影
  c.strokeStyle = '#EADECF';
  c.lineWidth = 4;
  c.strokeRect(4, 4, card.width - 8, card.height - 8);

  // 2. 将刚画好的画贴入相纸画面区
  const margin = 40;
  const photoSize = 560;
  c.fillStyle = '#FFFFFF';
  c.fillRect(margin, margin, photoSize, photoSize);
  c.strokeStyle = '#F0E5D8';
  c.lineWidth = 2;
  c.strokeRect(margin, margin, photoSize, photoSize);

  // 绘制画作内容
  c.drawImage(canvas, margin, margin, photoSize, photoSize);

  // 3. 绘制文字信息
  c.fillStyle = '#2D3436';
  c.font = 'bold 36px -apple-system, sans-serif';
  c.fillText(`“${word}”`, margin, photoSize + margin + 55);

  // 分类标签
  c.fillStyle = '#FF6B81';
  c.font = 'bold 20px -apple-system, sans-serif';
  c.fillText(`🏷️ ${category}`, margin, photoSize + margin + 95);

  // 画手与心有灵犀信息
  c.fillStyle = '#636E72';
  c.font = '22px -apple-system, sans-serif';
  c.fillText(`🎨 画手: ${drawer}  |  💡 猜中: ${guesser}`, margin, photoSize + margin + 135);

  const now = new Date();
  const dateStr = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  c.font = '18px -apple-system, sans-serif';
  c.fillStyle = '#B2BEC3';
  c.fillText(`⏱️ 耗时 ${seconds}秒 · ${dateStr}`, margin, photoSize + margin + 170);

  // 4. 右下角专属浪漫印章
  c.save();
  c.translate(card.width - margin - 150, card.height - margin - 45);
  c.rotate(-0.06);
  c.strokeStyle = '#FF6B81';
  c.lineWidth = 2;
  c.strokeRect(0, 0, 160, 42);
  c.fillStyle = '#FF6B81';
  c.font = 'bold 16px -apple-system, sans-serif';
  c.fillText('💕 恋爱画画纪念 💕', 10, 26);
  c.restore();

  // 5. 渲染为图片弹窗
  polaroidImage.src = card.toDataURL('image/png');
  victoryModal.style.display = 'flex';

  // 倒计时提醒
  let remaining = 7;
  nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后自动开始...`;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      nextRoundTimer.innerHTML = `下一局将在 <span>${remaining}</span> 秒后自动开始...`;
    } else {
      clearInterval(countdownInterval);
      victoryModal.style.display = 'none';
    }
  }, 1000);
}

// 7. 接收 Socket 服务端事件
socket.on('room_info', ({ players, playerCount, state }) => {
  if (playerCount < 2) {
    statusIndicator.classList.remove('connected');
    statusText.innerText = '等待宝贝连线中...💕';
    roleBadge.innerText = '等待中';
    topicWord.innerText = '等待对方扫码/点击专属链接加入';
    categoryTag.innerText = '1v1 专属房';
    timerText.innerText = '--';
  } else {
    statusIndicator.classList.add('connected');
    statusText.innerText = '双人已连线';
  }
});

// 新一轮开始
socket.on('round_start', (data) => {
  victoryModal.style.display = 'none';
  if (countdownInterval) clearInterval(countdownInterval);

  isDrawer = data.isDrawer;
  drawHistory = [];
  setupCanvas(); // 清空并重设

  currentCategory = data.category;
  categoryTag.innerText = data.category;

  if (isDrawer) {
    // 我是画手
    roleBadge.innerText = '我是画手';
    roleBadge.style.background = '#FF6B81';
    currentWord = data.word;
    topicWord.innerText = `请画: 【 ${data.word} 】`;
    toolsBar.classList.remove('disabled');
    guessInput.disabled = true;
    guessInput.placeholder = '你正在作画，等待对方猜词...';
    sendBtn.disabled = true;
  } else {
    // 我是猜题人
    roleBadge.innerText = '我是猜题人';
    roleBadge.style.background = '#1E90FF';
    const blanks = Array(data.wordLength).fill(' _ ').join('');
    topicWord.innerText = `题目(${data.wordLength}字): ${blanks}`;
    toolsBar.classList.add('disabled');
    guessInput.disabled = false;
    guessInput.placeholder = '输入你猜的词汇，回车发送...';
    sendBtn.disabled = false;
    guessInput.focus();
  }
});

// 倒计时跳动
socket.on('timer_tick', ({ seconds }) => {
  timerText.innerText = seconds;
  if (seconds <= 15) {
    timerText.style.color = '#EE5253';
  } else {
    timerText.style.color = '#FF6B81';
  }
});

// 接收同步画笔
socket.on('draw_action', (action) => {
  executeDrawAction(action);
});

// 猜中胜利
socket.on('round_win', (data) => {
  addChatMessage('系统', `🎉 猜中啦！答案是【${data.word}】，耗时 ${data.elapsedSeconds} 秒！`, true);
  generatePolaroidMemoryCard(data.word, data.category, data.drawerName, data.guesserName, data.elapsedSeconds);
});

// 时间到无人猜中
socket.on('round_timeout', (data) => {
  addChatMessage('系统', `⏰ 时间到啦！正确答案是【${data.word}】`, false);
  showToast(`⏰ 时间到！答案是【${data.word}】`);
});

// 聊天与猜词展示
socket.on('chat_message', ({ sender, text, isGuesser }) => {
  addChatMessage(sender, text, isGuesser);
});

function addChatMessage(sender, text, isHighlight) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  const color = isHighlight ? 'color: #ff6b81; font-weight: bold;' : '';
  item.innerHTML = `<span class="sender">${sender}:</span> <span class="message" style="${color}">${escapeHtml(text)}</span>`;
  chatStream.appendChild(item);
  chatStream.scrollTop = chatStream.scrollHeight;
}

// 接收表情弹幕
socket.on('reaction_popup', ({ sender, emoji, text }) => {
  triggerReactionBubble(sender, emoji, text);
});

// 新词添加广播通知
socket.on('custom_word_added', ({ adder, word }) => {
  showToast(`💌 ${adder} 偷偷添加了新回忆词汇！`);
});

// 工具函数：轻提示 Toast
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
