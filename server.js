const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const WORDS_FILE = path.join(__dirname, 'words.json');

// 加载词库（去除潜在的 UTF-8 BOM）
let wordBank = { words: [], customWords: [] };
function loadWords() {
  try {
    let raw = fs.readFileSync(WORDS_FILE, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    wordBank = JSON.parse(raw);
    const count = (wordBank.words ? wordBank.words.length : 0);
    console.log(`成功载入 500 词库，实际有效词汇条数: ${count}`);
  } catch (err) {
    console.error('加载词库失败，使用备用词库:', err);
    wordBank = {
      words: [
        { word: "望远镜", hint1: "把景物拉近", hint2: "观星常用" },
        { word: "仙人掌", hint1: "沙漠耐旱", hint2: "带刺会开花" },
        { word: "摩天轮", hint1: "游乐园慢慢转", hint2: "高处看城市" },
        { word: "灭火器", hint1: "红瓶身", hint2: "拔销压把喷白粉" }
      ],
      customWords: []
    };
  }
}
loadWords();

// 保存自定义词
function addCustomWord(word) {
  if (!word || typeof word !== 'string') return false;
  const cleanWord = word.trim();
  if (!cleanWord || cleanWord.length > 20) return false;
  
  if (!wordBank.customWords) wordBank.customWords = [];
  const exists = wordBank.customWords.some(w => w.word === cleanWord);
  if (!exists) {
    wordBank.customWords.push({
      word: cleanWord,
      hint1: "两人的专属回忆",
      hint2: "仔细回忆一下发生过的事"
    });
    try {
      fs.writeFileSync(WORDS_FILE, JSON.stringify(wordBank, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('保存新词失败:', e);
    }
  }
  return false;
}

// 获取全部候选词汇池
function getAllWordsPool() {
  const allPool = [];
  if (wordBank.words && Array.isArray(wordBank.words)) {
    allPool.push(...wordBank.words);
  }
  if (wordBank.customWords && Array.isArray(wordBank.customWords)) {
    allPool.push(...wordBank.customWords);
  }
  if (allPool.length === 0) {
    allPool.push({ word: "心有灵犀", hint1: "默契大考验", hint2: "彼此懂得" });
  }
  return allPool;
}

// 从 500 个词库中真正随机挑出 4 个（支持换一批刷新）
function getCandidateWords(count = 4, excludeWords = []) {
  const pool = getAllWordsPool();
  const filtered = pool.filter(item => !excludeWords.includes(item.word));
  const candidatePool = filtered.length >= count ? filtered : pool;

  const shuffled = [...candidatePool].sort(() => 0.5 - Math.random());
  const selected = [];
  const pickedWords = new Set();

  for (const item of shuffled) {
    if (!pickedWords.has(item.word)) {
      pickedWords.add(item.word);
      selected.push(item);
    }
    if (selected.length >= count) break;
  }

  return selected;
}

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 房间状态数据
const rooms = {};

// 广播房间人员与状态信息
function broadcastRoomInfo(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  io.to(roomId).emit('room_info', {
    players: room.players.map((p, idx) => ({
      name: p.name,
      avatar: p.avatar || '🐱',
      isReady: !!p.isReady,
      score: p.score || 0,
      isDrawer: room.state !== 'lobby' && idx === room.currentDrawerIndex,
      preferredRole: p.preferredRole || null
    })),
    playerCount: room.players.length,
    state: room.state,
    gameStarted: !!room.gameStarted,
    isPaused: !!room.isPaused,
    currentDrawerIndex: room.currentDrawerIndex
  });
}

// 启动或恢复游戏倒计时
function startOrResumeGameTimer(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== 'playing' || !room.currentWordObj) return;

  if (room.timerInterval) clearInterval(room.timerInterval);

  room.timerInterval = setInterval(() => {
    room.timerSeconds--;
    io.to(roomId).emit('timer_tick', { seconds: room.timerSeconds });

    // 剩余 60 秒触发第一提示
    if (room.timerSeconds === 60 && !room.hint1Revealed) {
      room.hint1Revealed = true;
      io.to(roomId).emit('progressive_hint', {
        level: 1,
        hint: room.currentWordObj.hint1,
        msg: `💡 进阶提示 ①：【${room.currentWordObj.hint1}】`
      });
    }

    // 剩余 30 秒触发第二提示
    if (room.timerSeconds === 30 && !room.hint2Revealed) {
      room.hint2Revealed = true;
      io.to(roomId).emit('progressive_hint', {
        level: 2,
        hint: room.currentWordObj.hint2,
        msg: `💡 进阶提示 ②：【${room.currentWordObj.hint2}】`
      });
    }

    // 倒计时结束，无人猜中
    if (room.timerSeconds <= 0) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      room.state = 'round_end';
      room.isPaused = false;

      const drawer = room.players[room.currentDrawerIndex];
      io.to(roomId).emit('round_timeout', {
        word: room.currentWordObj.word,
        hint1: room.currentWordObj.hint1,
        hint2: room.currentWordObj.hint2,
        drawerName: drawer ? drawer.name : '画手'
      });

      broadcastRoomInfo(roomId);

      setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].players.length >= 2) {
          resolveNextDrawer(roomId);
          startWordSelectionPhase(roomId);
        }
      }, 6500);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  let userRoom = null;
  let userName = null;
  let userAvatar = null;

  socket.on('join_room', ({ room, name, avatar }) => {
    userRoom = (room || 'sweet520').trim();
    userName = (name || '神秘宝贝').trim();
    userAvatar = avatar || '🐱';

    socket.join(userRoom);

    if (!rooms[userRoom]) {
      rooms[userRoom] = {
        id: userRoom,
        players: [],
        currentDrawerIndex: 0,
        currentWordObj: null,
        candidateWords: [],
        state: 'lobby', // 'lobby' | 'selecting_word' | 'playing' | 'round_end'
        gameStarted: false,
        isPaused: false,
        timerSeconds: 90,
        timerInterval: null,
        hint1Revealed: false,
        hint2Revealed: false,
        wordPickSeconds: 15,
        wordPickInterval: null,
        roundStartTime: 0,
        drawHistory: []
      };
    }

    const currentRoom = rooms[userRoom];

    // 检查是否已有同名玩家重连
    const existingIndex = currentRoom.players.findIndex(p => p.name === userName);
    if (existingIndex !== -1) {
      currentRoom.players[existingIndex].socketId = socket.id;
      currentRoom.players[existingIndex].avatar = userAvatar;
      console.log(`[${userRoom}] 玩家重连并更新 Socket: ${userName} -> ${socket.id}`);
    } else {
      const newPlayer = {
        socketId: socket.id,
        name: userName,
        avatar: userAvatar,
        isReady: false,
        score: 0,
        preferredRole: null
      };
      if (currentRoom.players.length >= 2) {
        currentRoom.players[1] = newPlayer;
      } else {
        currentRoom.players.push(newPlayer);
      }
    }

    broadcastRoomInfo(userRoom);

    // 如果中途重连，立即补发当前画板完整历史
    if (currentRoom.state === 'playing') {
      socket.emit('sync_canvas', currentRoom.drawHistory);
      const isDrawer = currentRoom.players[currentRoom.currentDrawerIndex]?.name === userName;
      if (currentRoom.currentWordObj) {
        socket.emit('rejoin_round', {
          isDrawer,
          word: isDrawer ? currentRoom.currentWordObj.word : null,
          wordLength: currentRoom.currentWordObj.word.length,
          hint1: currentRoom.hint1Revealed ? currentRoom.currentWordObj.hint1 : null,
          hint2: currentRoom.hint2Revealed ? currentRoom.currentWordObj.hint2 : null,
          drawerName: currentRoom.players[currentRoom.currentDrawerIndex]?.name,
          remainingSeconds: currentRoom.timerSeconds,
          isPaused: currentRoom.isPaused
        });
      }
    }
  });

  // 玩家准备 / 取消准备
  socket.on('toggle_ready', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'lobby') return;

    const player = room.players.find(p => p.socketId === socket.id || p.name === userName);
    if (!player) return;

    player.isReady = !player.isReady;
    broadcastRoomInfo(userRoom);

    if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
      room.gameStarted = true;
      startWordSelectionPhase(userRoom);
    }
  });

  // 暂停 / 恢复游戏功能（开启双人涂鸦模式）
  socket.on('toggle_pause', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'playing') return;

    room.isPaused = !room.isPaused;
    console.log(`[${userRoom}] 玩家 ${userName} 切换暂停状态: ${room.isPaused ? '已暂停(双人涂鸦)' : '继续游戏'}`);

    if (room.isPaused) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
      }
    } else {
      startOrResumeGameTimer(userRoom);
    }

    io.to(userRoom).emit('pause_status_changed', {
      isPaused: room.isPaused,
      operator: userName
    });
  });

  // 下一局角色意向选择
  socket.on('set_role_preference', ({ role }) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    const player = room.players.find(p => p.socketId === socket.id || p.name === userName);
    if (!player) return;

    player.preferredRole = role; // 'drawer' | 'guesser'
    console.log(`[${userRoom}] 玩家 ${player.name} 选择下一局意向: ${role}`);
    broadcastRoomInfo(userRoom);
  });

  // 开始自主选词阶段 (4 选 1 + 换一批)
  function startWordSelectionPhase(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    room.state = 'selecting_word';
    room.isPaused = false;
    room.candidateWords = getCandidateWords(4);
    room.wordPickSeconds = 15;
    room.hint1Revealed = false;
    room.hint2Revealed = false;

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    console.log(`[${roomId}] 画手 ${drawer.name} 挑选词汇，备选:`, room.candidateWords.map(c => c.word));

    io.to(drawer.socketId).emit('pick_word_turn', {
      candidates: room.candidateWords,
      duration: room.wordPickSeconds
    });

    io.to(guesser.socketId).emit('guesser_waiting_pick', {
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      duration: room.wordPickSeconds
    });

    broadcastRoomInfo(roomId);

    room.wordPickInterval = setInterval(() => {
      room.wordPickSeconds--;
      io.to(roomId).emit('word_pick_tick', { seconds: room.wordPickSeconds });

      if (room.wordPickSeconds <= 0) {
        clearInterval(room.wordPickInterval);
        const defaultChoice = room.candidateWords[0];
        console.log(`[${roomId}] 选词超时，自动选择第 1 个词: 【${defaultChoice.word}】`);
        startDrawingPhase(roomId, defaultChoice);
      }
    }, 1000);
  }

  // 画手刷新候选词（换一批）
  socket.on('refresh_candidates', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.name !== userName) return;

    const oldWords = room.candidateWords.map(c => c.word);
    room.candidateWords = getCandidateWords(4, oldWords);

    console.log(`[${userRoom}] 画手 ${drawer.name} 刷新了候选词:`, room.candidateWords.map(c => c.word));

    socket.emit('pick_word_turn', {
      candidates: room.candidateWords,
      duration: room.wordPickSeconds
    });
  });

  // 画手选定某个词
  socket.on('choose_word', ({ word, hint1, hint2 }) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.name !== userName) return;

    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    console.log(`[${userRoom}] 画手 ${drawer.name} 选中: 【${word}】`);
    startDrawingPhase(userRoom, { word, hint1, hint2 });
  });

  // 正式进入作画与猜题阶段
  function startDrawingPhase(roomId, wordObj) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    room.currentWordObj = wordObj;
    room.state = 'playing';
    room.isPaused = false;
    room.drawHistory = [];
    room.timerSeconds = 90;
    room.roundStartTime = Date.now();
    room.hint1Revealed = false;
    room.hint2Revealed = false;

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    io.to(drawer.socketId).emit('round_start', {
      isDrawer: true,
      word: wordObj.word,
      hint1: wordObj.hint1,
      hint2: wordObj.hint2,
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      guesserName: guesser.name,
      guesserAvatar: guesser.avatar
    });

    io.to(guesser.socketId).emit('round_start', {
      isDrawer: false,
      wordLength: wordObj.word.length,
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      guesserName: guesser.name,
      guesserAvatar: guesser.avatar
    });

    broadcastRoomInfo(roomId);

    startOrResumeGameTimer(roomId);
  }

  // 仲裁下一局画手
  function resolveNextDrawer(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    const p0 = room.players[0];
    const p1 = room.players[1];
    const pref0 = p0?.preferredRole;
    const pref1 = p1?.preferredRole;

    if (pref0 === 'drawer' && pref1 !== 'drawer') {
      room.currentDrawerIndex = 0;
    } else if (pref1 === 'drawer' && pref0 !== 'drawer') {
      room.currentDrawerIndex = 1;
    } else if (pref0 === 'guesser' && pref1 !== 'guesser') {
      room.currentDrawerIndex = 1;
    } else if (pref1 === 'guesser' && pref0 !== 'guesser') {
      room.currentDrawerIndex = 0;
    } else {
      room.currentDrawerIndex = 1 - room.currentDrawerIndex;
    }

    if (p0) p0.preferredRole = null;
    if (p1) p1.preferredRole = null;
  }

  // 绘图同步：在暂停状态下开启【双人涂鸦】，任何一方均可画画！
  socket.on('draw_action', (data) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'playing') return;

    // 暂停状态下开启双人涂鸦模式：双方皆可作画并同步！
    if (room.isPaused) {
      if (data.type === 'clear') {
        room.drawHistory = [];
      } else {
        room.drawHistory.push(data);
      }
      socket.to(userRoom).emit('draw_action', data);
      return;
    }

    // 正常游戏时：仅当前画手可以绘图
    const currentDrawer = room.players[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.name !== userName) return;

    if (data.type === 'clear') {
      room.drawHistory = [];
    } else {
      room.drawHistory.push(data);
    }

    socket.to(userRoom).emit('draw_action', data);
  });

  // 猜答案
  socket.on('send_guess', ({ text }) => {
    if (!userRoom || !rooms[userRoom] || !text) return;
    const room = rooms[userRoom];
    if (room.state !== 'playing' || !room.currentWordObj) return;

    const guessText = text.trim();
    const currentGuesser = room.players[1 - room.currentDrawerIndex];
    const currentDrawer = room.players[room.currentDrawerIndex];

    const isGuesser = currentGuesser && currentGuesser.name === userName;

    if (isGuesser && guessText.toLowerCase() === room.currentWordObj.word.toLowerCase()) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = null;
      room.state = 'round_end';
      room.isPaused = false;

      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - room.roundStartTime) / 1000));

      currentGuesser.score = (currentGuesser.score || 0) + 3;
      currentDrawer.score = (currentDrawer.score || 0) + 2;

      console.log(`[${userRoom}] 猜中！${userName} 猜中【${room.currentWordObj.word}】，耗时 ${elapsedSeconds}s`);

      io.to(userRoom).emit('round_win', {
        word: room.currentWordObj.word,
        hint1: room.currentWordObj.hint1,
        hint2: room.currentWordObj.hint2,
        drawerName: currentDrawer.name,
        drawerAvatar: currentDrawer.avatar,
        guesserName: currentGuesser.name,
        guesserAvatar: currentGuesser.avatar,
        elapsedSeconds
      });

      broadcastRoomInfo(userRoom);

      setTimeout(() => {
        if (rooms[userRoom] && rooms[userRoom].players.length >= 2) {
          resolveNextDrawer(userRoom);
          startWordSelectionPhase(userRoom);
        }
      }, 6500);
    } else {
      io.to(userRoom).emit('chat_message', {
        sender: userName,
        avatar: userAvatar,
        text: guessText,
        isGuesser
      });
    }
  });

  // 快捷表情与互动弹幕
  socket.on('send_reaction', ({ emoji, text }) => {
    if (!userRoom) return;
    io.to(userRoom).emit('reaction_popup', {
      sender: userName,
      avatar: userAvatar,
      emoji: emoji || '❤️',
      text: text || ''
    });
  });

  // 添加自定义新词
  socket.on('add_custom_word', ({ word }) => {
    if (!userRoom) return;
    const success = addCustomWord(word);
    if (success) {
      io.to(userRoom).emit('custom_word_added', {
        adder: userName,
        word: word.trim()
      });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`玩家离开: ${userName || socket.id}`);
    if (userRoom && rooms[userRoom]) {
      const room = rooms[userRoom];
      room.players = room.players.filter(p => p.socketId !== socket.id);
      
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.wordPickInterval) clearInterval(room.wordPickInterval);
      room.state = 'lobby';
      room.gameStarted = false;
      room.isPaused = false;

      broadcastRoomInfo(userRoom);

      if (room.players.length === 0) {
        delete rooms[userRoom];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`💕 情侣你画我猜服务已启动!`);
  console.log(`🌐 本地访问地址: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
