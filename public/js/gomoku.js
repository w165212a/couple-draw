// 双人对弈五子棋核心逻辑 (情侣定制版)

const socket = io();

// 元素引用
const homeNavBtn = document.getElementById('homeNavBtn');
const roomBtn = document.getElementById('roomBtn');
const roomDisplay = document.getElementById('roomDisplay');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const skinToggleBtn = document.getElementById('skinToggleBtn');

const blackPlayerAvatar = document.getElementById('blackPlayerAvatar');
const blackPlayerName = document.getElementById('blackPlayerName');
const blackPlayerScore = document.getElementById('blackPlayerScore');
const blackReadyTag = document.getElementById('blackReadyTag');

const whitePlayerAvatar = document.getElementById('whitePlayerAvatar');
const whitePlayerName = document.getElementById('whitePlayerName');
const whitePlayerScore = document.getElementById('whitePlayerScore');
const whiteReadyTag = document.getElementById('whiteReadyTag');

const turnIndicatorPill = document.getElementById('turnIndicatorPill');
const turnText = document.getElementById('turnText');
const vsScoreText = document.getElementById('vsScoreText');

const boardContainer = document.getElementById('boardContainer');
const gomokuCanvas = document.getElementById('gomokuCanvas');
const ctx = gomokuCanvas.getContext('2d');

const readyBtn = document.getElementById('readyBtn');
const undoBtn = document.getElementById('undoBtn');
const surrenderBtn = document.getElementById('surrenderBtn');
const restartBtn = document.getElementById('restartBtn');

// 弹窗引用
const nameModal = document.getElementById('nameModal');
const avatarGrid = document.getElementById('avatarGrid');
const nameInput = document.getElementById('nameInput');
const confirmNameBtn = document.getElementById('confirmNameBtn');

const skinModal = document.getElementById('skinModal');
const closeSkinModalBtn = document.getElementById('closeSkinModalBtn');
const skinCards = document.querySelectorAll('.skin-card');

const undoPromptModal = document.getElementById('undoPromptModal');
const undoPromptDesc = document.getElementById('undoPromptDesc');
const acceptUndoBtn = document.getElementById('acceptUndoBtn');
const rejectUndoBtn = document.getElementById('rejectUndoBtn');

const gameOverModal = document.getElementById('gameOverModal');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverDesc = document.getElementById('gameOverDesc');
const wheelCanvas = document.getElementById('wheelCanvas');
const spinWheelBtn = document.getElementById('spinWheelBtn');
const wheelPointer = document.getElementById('wheelPointer');
const punishmentResultBanner = document.getElementById('punishmentResultBanner');
const nextRoundBtn = document.getElementById('nextRoundBtn');

// 状态变量
let roomName = 'sweet520';
let playerName = '';
let selectedAvatar = '🐱';
let myColor = null; // 'black' | 'white' | 'spectator'
let isMyReady = false;

let board = Array(15).fill(null).map(() => Array(15).fill(0));
let currentTurn = 'black';
let gameStatus = 'waiting'; // 'waiting' | 'playing' | 'ended'
let lastMove = null;
let winningLine = null;
let currentSkin = localStorage.getItem('gomoku_skin') || 'classic'; // 'classic' | 'pets' | 'gems'
let soundEnabled = (localStorage.getItem('gomoku_sound') !== 'false');

// 8项情侣趣味小惩罚
const PUNISHMENTS = [
  "💆 给对方揉肩捏背 5 分钟",
  "🥤 明天给对方买一杯奶茶",
  "💌 录制一条超甜的专属语音",
  "🍧 亲手喂对方吃一口甜点/零食",
  "🌟 答应对方一个不过分的小心愿",
  "🐾 模仿小猫/小狗撒娇叫一声",
  "🍳 明天给对方剥鸡蛋/送早餐",
  "🌹 夸赞对方 3 个无敌大优点"
];

// 1. 初始化音效合成器 (Web Audio API)
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
}

// 模拟实木清脆落子声 "嗒~"
function playStoneSound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch (e) {
    console.error('Audio play error:', e);
  }
}

// 胜利祝贺音效
function playVictorySound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [261.6, 329.6, 392.0, 523.3]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.4, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.28);
    });
  } catch (e) {}
}

// 2. 页面启动与玩家初始化
window.addEventListener('DOMContentLoaded', () => {
  setupCanvasSize();
  window.addEventListener('resize', () => {
    setupCanvasSize();
    drawBoard();
  });

  initPlayerAndRoom();
  setupSkinModal();
  setupSoundToggle();
  setupWheel();
  initBoardInteraction();
});

function initPlayerAndRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    roomName = roomParam.trim();
  }
  roomDisplay.textContent = roomName;

  // 复用本地昵称与头像
  const savedName = localStorage.getItem('couple_player_name');
  const savedAvatar = localStorage.getItem('couple_player_avatar');

  if (savedName) {
    playerName = savedName;
    selectedAvatar = savedAvatar || '🐱';
    joinGomoku();
  } else {
    setupAvatarPicker();
    nameModal.style.display = 'flex';
  }
}

function setupAvatarPicker() {
  const avatarButtons = avatarGrid.querySelectorAll('.avatar-btn');
  avatarButtons.forEach(btn => {
    if (btn.getAttribute('data-avatar') === selectedAvatar) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      avatarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.getAttribute('data-avatar');
    });
  });

  confirmNameBtn.addEventListener('click', () => {
    const val = nameInput.value.trim();
    if (!val) {
      alert('请输入你的专属昵称哦~');
      return;
    }
    playerName = val;
    localStorage.setItem('couple_player_name', playerName);
    localStorage.setItem('couple_player_avatar', selectedAvatar);
    nameModal.style.display = 'none';
    joinGomoku();
  });
}

function joinGomoku() {
  socket.emit('gomoku_join', { room: roomName, name: playerName, avatar: selectedAvatar });
}

// 复制房间分享链接
roomBtn.addEventListener('click', () => {
  const shareUrl = `${window.location.origin}/gomoku.html?room=${encodeURIComponent(roomName)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('🔗 五子棋对弈链接已复制！快发给宝贝吧~');
  }).catch(() => {
    prompt('复制链接发给对方：', shareUrl);
  });
});

// 音效切换
function setupSoundToggle() {
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('gomoku_sound', soundEnabled);
    soundToggleBtn.innerHTML = soundEnabled ? '<span>🔊 音效</span>' : '<span>🔇 静音</span>';
    showToast(soundEnabled ? '🔊 落子音效已开启' : '🔇 音效已静音');
  });
  soundToggleBtn.innerHTML = soundEnabled ? '<span>🔊 音效</span>' : '<span>🔇 静音</span>';
}

// 皮肤切换
function setupSkinModal() {
  skinToggleBtn.addEventListener('click', () => {
    skinModal.style.display = 'flex';
  });
  closeSkinModalBtn.addEventListener('click', () => {
    skinModal.style.display = 'none';
  });
  skinModal.addEventListener('click', (e) => {
    if (e.target === skinModal) skinModal.style.display = 'none';
  });

  skinCards.forEach(card => {
    if (card.getAttribute('data-skin') === currentSkin) {
      card.classList.add('active');
    }
    card.addEventListener('click', () => {
      skinCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentSkin = card.getAttribute('data-skin');
      localStorage.setItem('gomoku_skin', currentSkin);
      drawBoard();
      skinModal.style.display = 'none';
      showToast('🎨 棋子皮肤已更新！');
    });
  });
}

// 3. 画布高DPI适配与棋盘绘制
function setupCanvasSize() {
  const rect = boardContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  gomokuCanvas.width = rect.width * dpr;
  gomokuCanvas.height = rect.height * dpr;
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
}

function drawBoard() {
  const width = gomokuCanvas.width / (window.devicePixelRatio || 1);
  const height = gomokuCanvas.height / (window.devicePixelRatio || 1);
  const padding = width * 0.055;
  const boardSize = 15;
  const cellSize = (width - padding * 2) / (boardSize - 1);

  ctx.clearRect(0, 0, width, height);

  // 1. 绘制棋盘网格线
  ctx.strokeStyle = '#6F4E37';
  ctx.lineWidth = 1.2;

  for (let i = 0; i < boardSize; i++) {
    // 横线
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cellSize);
    ctx.lineTo(width - padding, padding + i * cellSize);
    ctx.stroke();

    // 竖线
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, padding);
    ctx.lineTo(padding + i * cellSize, height - padding);
    ctx.stroke();
  }

  // 2. 绘制星位 (天元与4角星位: (3,3), (3,11), (7,7), (11,3), (11,11))
  const starPoints = [
    [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
  ];
  ctx.fillStyle = '#6F4E37';
  starPoints.forEach(([r, c]) => {
    const x = padding + c * cellSize;
    const y = padding + r * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. 绘制已下棋子
  const radius = cellSize * 0.43;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const stone = board[r][c];
      if (stone !== 0) {
        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        drawStone(x, y, radius, stone);
      }
    }
  }

  // 4. 绘制最后一手的醒目标记
  if (lastMove) {
    const lx = padding + lastMove.col * cellSize;
    const ly = padding + lastMove.row * cellSize;
    ctx.beginPath();
    ctx.arc(lx, ly, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = (lastMove.color === 'black' ? '#FF6B8B' : '#E11D48');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFF';
    ctx.stroke();
  }

  // 5. 绘制获胜五连珠高光金线
  if (winningLine && winningLine.length >= 5) {
    ctx.save();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#FBBF24';
    ctx.shadowBlur = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const startX = padding + winningLine[0].col * cellSize;
    const startY = padding + winningLine[0].row * cellSize;
    ctx.moveTo(startX, startY);
    for (let i = 1; i < winningLine.length; i++) {
      const px = padding + winningLine[i].col * cellSize;
      const py = padding + winningLine[i].row * cellSize;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// 绘制单颗棋子（支持3套皮肤）
function drawStone(x, y, radius, stoneType) {
  const isBlack = (stoneType === 1);

  if (currentSkin === 'pets') {
    // 萌宠爪印皮肤 (Black: 🐾 猫爪 / White: 🐶 狗爪)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isBlack ? '#374151' : '#FFFDF9';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    // 绘制可爱Emoji
    ctx.font = `${radius * 1.2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isBlack ? '🐾' : '🐶', x, y + 1);
    ctx.restore();
    return;
  }

  if (currentSkin === 'gems') {
    // 璀璨珠宝皮肤 (Black: 🔮 黑曜石 / White: 💎 粉钻)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isBlack ? '#1E1B4B' : '#FFF0F3';
    ctx.shadowColor = isBlack ? 'rgba(79, 70, 229, 0.4)' : 'rgba(244, 63, 94, 0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    ctx.font = `${radius * 1.25}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isBlack ? '🔮' : '💎', x, y + 1);
    ctx.restore();
    return;
  }

  // 默认：经典玉石拟真质感
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  const grad = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, radius * 0.1,
    x, y, radius
  );

  if (isBlack) {
    grad.addColorStop(0, '#5A626A');
    grad.addColorStop(0.7, '#242A30');
    grad.addColorStop(1, '#111417');
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  } else {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.8, '#F0EDE6');
    grad.addColorStop(1, '#D9D3C7');
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  }

  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// 4. 点击棋盘落子交互
function initBoardInteraction() {
  function handlePointerAction(e) {
    if (gameStatus !== 'playing') {
      if (gameStatus === 'waiting') showToast('请双方先点击下方“准备”开启对局哦~');
      return;
    }

    if (myColor !== currentTurn) {
      showToast('现在是对方的回合，请耐心等待对方落子~');
      return;
    }

    const rect = gomokuCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = rect.width;
    const padding = width * 0.055;
    const boardSize = 15;
    const cellSize = (width - padding * 2) / (boardSize - 1);

    const col = Math.round((clickX - padding) / cellSize);
    const row = Math.round((clickY - padding) / cellSize);

    if (row < 0 || row >= 15 || col < 0 || col >= 15) return;
    if (board[row][col] !== 0) {
      showToast('这里已经有棋子啦~');
      return;
    }

    // 发送落子
    socket.emit('gomoku_move', { row, col });
  }

  gomokuCanvas.addEventListener('click', handlePointerAction);
}

// 5. 准备与对局操作按钮
readyBtn.addEventListener('click', () => {
  socket.emit('gomoku_ready');
});

undoBtn.addEventListener('click', () => {
  if (gameStatus !== 'playing') {
    showToast('对局未开始，无需悔棋');
    return;
  }
  socket.emit('gomoku_undo_request');
  showToast('🕊️ 悔棋申请已发送给对方，等待对方同意...');
});

surrenderBtn.addEventListener('click', () => {
  if (gameStatus !== 'playing') return;
  if (confirm('确定要认输吗？输了要接受神秘小惩罚哦~ 😜')) {
    socket.emit('gomoku_surrender');
  }
});

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    socket.emit('gomoku_restart');
  });
}

// 6. Socket 事件接收与界面响应
socket.on('gomoku_state', (data) => {
  board = data.board;
  currentTurn = data.currentTurn;
  gameStatus = data.status;
  lastMove = data.lastMove;
  winningLine = data.winningLine;

  const me = data.players.find(p => p.socketId === socket.id);
  if (me) {
    myColor = me.color;
    isMyReady = !!me.isReady;
  }

  // 更新双方玩家信息
  const blackP = data.players.find(p => p.color === 'black');
  const whiteP = data.players.find(p => p.color === 'white');

  if (blackP) {
    blackPlayerAvatar.textContent = blackP.avatar || '🐶';
    blackPlayerName.textContent = blackP.name;
    blackPlayerScore.textContent = `胜局: ${blackP.score || 0}`;
    blackReadyTag.textContent = blackP.isReady ? '已准备' : '未准备';
    blackReadyTag.className = `ready-tag ${blackP.isReady ? 'is-ready' : 'not-ready'}`;
  } else {
    blackPlayerName.textContent = '等待加入...';
    blackReadyTag.textContent = '空缺';
    blackReadyTag.className = 'ready-tag not-ready';
  }

  if (whiteP) {
    whitePlayerAvatar.textContent = whiteP.avatar || '🐱';
    whitePlayerName.textContent = whiteP.name;
    whitePlayerScore.textContent = `胜局: ${whiteP.score || 0}`;
    whiteReadyTag.textContent = whiteP.isReady ? '已准备' : '未准备';
    whiteReadyTag.className = `ready-tag ${whiteP.isReady ? 'is-ready' : 'not-ready'}`;
  } else {
    whitePlayerName.textContent = '等待加入...';
    whiteReadyTag.textContent = '空缺';
    whiteReadyTag.className = 'ready-tag not-ready';
  }

  // 大比分展示
  vsScoreText.textContent = `${data.scores.black} : ${data.scores.white}`;

  // 中间回合指示
  if (gameStatus === 'playing') {
    readyBtn.style.display = 'none';
    undoBtn.disabled = false;
    surrenderBtn.disabled = false;

    if (currentTurn === 'black') {
      turnIndicatorPill.className = 'turn-pill black-turn';
      turnText.textContent = (myColor === 'black' ? '⚫ 轮到你执黑落子' : '⚫ 对方执黑落子中');
    } else {
      turnIndicatorPill.className = 'turn-pill white-turn';
      turnText.textContent = (myColor === 'white' ? '⚪ 轮到你执白落子' : '⚪ 对方执白落子中');
    }
  } else {
    readyBtn.style.display = 'flex';
    readyBtn.innerHTML = isMyReady ? '<span>✓ 已准备 (等待开始)</span>' : '<span>❤️ 准备对局</span>';
    undoBtn.disabled = true;
    surrenderBtn.disabled = true;
    turnIndicatorPill.className = 'turn-pill';
    turnText.textContent = '等待双方准备开局';
  }

  drawBoard();
});

socket.on('gomoku_game_start', (data) => {
  playVictorySound();
  showToast('♟️ 对局开始！执黑先手，祝你好运~');
});

socket.on('gomoku_move_made', (data) => {
  playStoneSound();
});

socket.on('gomoku_undo_prompt', ({ requester }) => {
  undoPromptDesc.textContent = `宝贝【${requester}】手滑下错了，向你申请悔棋一步，是否同意？💕`;
  undoPromptModal.style.display = 'flex';
});

acceptUndoBtn.addEventListener('click', () => {
  socket.emit('gomoku_undo_response', { accepted: true });
  undoPromptModal.style.display = 'none';
});

rejectUndoBtn.addEventListener('click', () => {
  socket.emit('gomoku_undo_response', { accepted: false });
  undoPromptModal.style.display = 'none';
});

socket.on('gomoku_undo_success', (data) => {
  showToast(data.msg || '悔棋成功！');
  playStoneSound();
});

socket.on('gomoku_undo_rejected', (data) => {
  showToast(data.msg || '悔棋请求被拒绝啦~');
});

// 结算与惩罚大转盘弹窗
socket.on('gomoku_game_over', (data) => {
  playVictorySound();

  let title = '';
  let desc = '';

  if (data.winner === 'draw') {
    title = '🤝 势均力敌 · 和棋！';
    desc = '棋盘已满，你们俩的棋艺棋逢对手，不分伯仲！';
  } else {
    const isMeWinner = (data.winner === myColor);
    title = isMeWinner ? '🎉 恭喜你赢下本局！' : '😢 惜败！下次一定能赢回来！';
    desc = data.surrenderedBy 
      ? `【${data.surrenderedBy}】潇洒认输！赢家快来转动惩罚转盘吧~`
      : `五连珠！【${data.winnerName}】达成绝杀！`;
  }

  gameOverTitle.textContent = title;
  gameOverDesc.textContent = desc;
  punishmentResultBanner.textContent = '点击转盘中央指针，抽取专属惩罚彩蛋 🎯';
  gameOverModal.style.display = 'flex';
});

nextRoundBtn.addEventListener('click', () => {
  gameOverModal.style.display = 'none';
  socket.emit('gomoku_restart');
});

// 7. 惩罚大转盘绘制与旋转逻辑
function setupWheel() {
  const wctx = wheelCanvas.getContext('2d');
  const numSlices = PUNISHMENTS.length;
  const sliceAngle = (Math.PI * 2) / numSlices;

  // 柔和马卡龙配色
  const sliceColors = [
    '#FFE4E6', '#FFF0F3', '#FEF3C7', '#F0FDF4',
    '#E0E7FF', '#F3E8FF', '#FCE7F3', '#FFEDD5'
  ];

  function drawWheelCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = 260;
    wheelCanvas.width = size * dpr;
    wheelCanvas.height = size * dpr;
    wctx.resetTransform();
    wctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    for (let i = 0; i < numSlices; i++) {
      const angle = i * sliceAngle - Math.PI / 2;
      wctx.beginPath();
      wctx.moveTo(cx, cy);
      wctx.arc(cx, cy, r, angle, angle + sliceAngle);
      wctx.fillStyle = sliceColors[i % sliceColors.length];
      wctx.fill();
      wctx.strokeStyle = '#FFF';
      wctx.lineWidth = 2;
      wctx.stroke();

      // 文字
      wctx.save();
      wctx.translate(cx, cy);
      wctx.rotate(angle + sliceAngle / 2);
      wctx.textAlign = 'right';
      wctx.fillStyle = '#374151';
      wctx.font = 'bold 11px sans-serif';
      const shortText = PUNISHMENTS[i].split(' ')[1] || PUNISHMENTS[i];
      wctx.fillText(shortText.substring(0, 6), r - 12, 4);
      wctx.restore();
    }
  }

  drawWheelCanvas();

  // 转动转盘
  let isSpinning = false;
  function triggerSpin() {
    if (isSpinning) return;
    isSpinning = true;

    // 随机选中一项
    const targetIndex = Math.floor(Math.random() * numSlices);
    const selectedItem = PUNISHMENTS[targetIndex];

    // 同步给对方
    socket.emit('gomoku_spin_punishment', {
      targetIndex,
      punishment: selectedItem
    });
  }

  wheelPointer.addEventListener('click', triggerSpin);
  if (spinWheelBtn) spinWheelBtn.addEventListener('click', triggerSpin);
}

socket.on('gomoku_punishment_result', ({ targetIndex, punishment, spinner }) => {
  const numSlices = PUNISHMENTS.length;
  const sliceDeg = 360 / numSlices;
  // 逆时针计算指针指向
  const targetDeg = 360 * 5 + (360 - (targetIndex * sliceDeg + sliceDeg / 2));

  wheelCanvas.style.transition = 'transform 3.8s cubic-bezier(0.15, 0.95, 0.2, 1)';
  wheelCanvas.style.transform = `rotate(${targetDeg}deg)`;

  setTimeout(() => {
    punishmentResultBanner.innerHTML = `🎁 抽取结果：<b>${punishment}</b>`;
    showToast(`🎯 【${spinner}】抽取了专属惩罚！`);
  }, 3900);
});

// 提示吐司
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-notice';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
