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

// 加载词库
let wordBank = { categories: [], customWords: [] };
function loadWords() {
  try {
    const data = fs.readFileSync(WORDS_FILE, 'utf8');
    wordBank = JSON.parse(data);
  } catch (err) {
    console.error('加载词库失败，使用备用词库:', err);
    wordBank = {
      categories: [
        { name: "甜蜜日常", words: ["第一次看电影", "偷喝奶茶", "压马路", "拍合照", "赖床", "摩天轮接吻", "撑一把伞"] }
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
  if (!wordBank.customWords.includes(cleanWord)) {
    wordBank.customWords.push(cleanWord);
    try {
      fs.writeFileSync(WORDS_FILE, JSON.stringify(wordBank, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('保存新词失败:', e);
    }
  }
  return false;
}

// 获取全部词汇池
function getAllWordsPool() {
  const allPool = [];
  if (wordBank.categories) {
    wordBank.categories.forEach(cat => {
      cat.words.forEach(w => allPool.push({ word: w, category: cat.name }));
    });
  }
  if (wordBank.customWords) {
    wordBank.customWords.forEach(w => allPool.push({ word: w, category: "我们的专属回忆" }));
  }
  if (allPool.length === 0) {
    allPool.push({ word: "心有灵犀", category: "甜蜜默契" });
  }
  return allPool;
}

// 获取 N 个互不相同的候选词（自主选词功能）
function getCandidateWords(count = 4, excludeWords = []) {
  const pool = getAllWordsPool();
  // 尽量排除上一组词
  const filtered = pool.filter(item => !excludeWords.includes(item.word));
  const candidatePool = filtered.length >= count ? filtered : pool;

  // 洗牌算法随机挑选 count 个
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

  // 若不足则用备用词补足
  while (selected.length < count) {
    selected.push({ word: "甜蜜约会", category: "甜蜜日常" });
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
      isDrawer: room.state !== 'lobby' && idx === room.currentDrawerIndex
    })),
    playerCount: room.players.length,
    state: room.state,
    currentDrawerIndex: room.currentDrawerIndex
  });
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
        currentWord: '',
        category: '',
        candidateWords: [],
        state: 'lobby', // 'lobby' | 'selecting_word' | 'playing' | 'round_end'
        timerSeconds: 90,
        timerInterval: null,
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
    } else {
      const newPlayer = {
        socketId: socket.id,
        name: userName,
        avatar: userAvatar,
        isReady: false,
        score: 0
      };
      if (currentRoom.players.length >= 2) {
        currentRoom.players[1] = newPlayer;
      } else {
        currentRoom.players.push(newPlayer);
      }
    }

    console.log(`[${userRoom}] 玩家加入: ${userAvatar} ${userName}，当前人数: ${currentRoom.players.length}`);

    // 通知房间信息
    broadcastRoomInfo(userRoom);

    // 如果中途重连且正在画画，补发画板与回合状态
    if (currentRoom.state === 'playing') {
      socket.emit('sync_canvas', currentRoom.drawHistory);
      const isDrawer = currentRoom.players[currentRoom.currentDrawerIndex]?.socketId === socket.id;
      socket.emit('rejoin_round', {
        isDrawer,
        word: isDrawer ? currentRoom.currentWord : null,
        wordLength: currentRoom.currentWord.length,
        category: currentRoom.category,
        drawerName: currentRoom.players[currentRoom.currentDrawerIndex]?.name,
        remainingSeconds: currentRoom.timerSeconds
      });
    }
  });

  // 玩家准备 / 取消准备
  socket.on('toggle_ready', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'lobby' && room.state !== 'round_end') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.isReady = !player.isReady;
    console.log(`[${userRoom}] 玩家 ${player.name} 状态变更为: ${player.isReady ? '已准备' : '取消准备'}`);
    broadcastRoomInfo(userRoom);

    // 检查是否 2 人且均已准备好
    if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
      console.log(`[${userRoom}] 双方均已准备就绪，进入自主选词阶段！`);
      startWordSelectionPhase(userRoom);
    }
  });

  // 开始自主选词阶段 (4 选 1)
  function startWordSelectionPhase(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    room.state = 'selecting_word';
    room.candidateWords = getCandidateWords(4);
    room.wordPickSeconds = 15;

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    console.log(`[${roomId}] 画手 ${drawer.name} 正在挑选词汇，备选:`, room.candidateWords.map(c => c.word));

    // 通知画手自主选词（4选1）
    io.to(drawer.socketId).emit('pick_word_turn', {
      candidates: room.candidateWords,
      duration: room.wordPickSeconds
    });

    // 通知猜题人等待
    io.to(guesser.socketId).emit('guesser_waiting_pick', {
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      duration: room.wordPickSeconds
    });

    broadcastRoomInfo(roomId);

    // 开启 15 秒选词倒计时
    room.wordPickInterval = setInterval(() => {
      room.wordPickSeconds--;
      io.to(roomId).emit('word_pick_tick', { seconds: room.wordPickSeconds });

      if (room.wordPickSeconds <= 0) {
        clearInterval(room.wordPickInterval);
        // 超时未选则默认选中第 1 个词
        const defaultChoice = room.candidateWords[0];
        console.log(`[${roomId}] 选词超时，自动选定: 【${defaultChoice.word}】`);
        startDrawingPhase(roomId, defaultChoice.word, defaultChoice.category);
      }
    }, 1000);
  }

  // 画手请求换一批词（刷新 4 个词）
  socket.on('refresh_candidates', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;

    const oldWords = room.candidateWords.map(c => c.word);
    room.candidateWords = getCandidateWords(4, oldWords);

    console.log(`[${userRoom}] 画手 ${drawer.name} 刷新了词汇，新候选:`, room.candidateWords.map(c => c.word));

    // 重新发给画手
    socket.emit('pick_word_turn', {
      candidates: room.candidateWords,
      duration: room.wordPickSeconds
    });
  });

  // 画手确认选中某个词
  socket.on('choose_word', ({ word, category }) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;

    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    console.log(`[${userRoom}] 画手 ${drawer.name} 选定题目: 【${word}】(${category})`);
    startDrawingPhase(userRoom, word, category);
  });

  // 正式进入作画与猜题阶段
  function startDrawingPhase(roomId, word, category) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    room.currentWord = word;
    room.category = category;
    room.state = 'playing';
    room.drawHistory = [];
    room.timerSeconds = 90;
    room.roundStartTime = Date.now();

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    // 通知画手
    io.to(drawer.socketId).emit('round_start', {
      isDrawer: true,
      word: room.currentWord,
      category: room.category,
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      guesserName: guesser.name,
      guesserAvatar: guesser.avatar
    });

    // 通知猜题人
    io.to(guesser.socketId).emit('round_start', {
      isDrawer: false,
      wordLength: room.currentWord.length,
      category: room.category,
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      guesserName: guesser.name,
      guesserAvatar: guesser.avatar
    });

    broadcastRoomInfo(roomId);

    // 开启作画 90 秒倒计时
    room.timerInterval = setInterval(() => {
      room.timerSeconds--;
      io.to(roomId).emit('timer_tick', { seconds: room.timerSeconds });

      if (room.timerSeconds <= 0) {
        clearInterval(room.timerInterval);
        room.state = 'round_end';
        io.to(roomId).emit('round_timeout', {
          word: room.currentWord,
          category: room.category,
          drawerName: drawer.name
        });

        // 倒计时结束重置准备状态，角色互换
        room.currentDrawerIndex = 1 - room.currentDrawerIndex;
        room.players.forEach(p => p.isReady = false);
        broadcastRoomInfo(roomId);

        // 5秒后恢复大厅等待状态
        setTimeout(() => {
          if (rooms[roomId]) {
            rooms[roomId].state = 'lobby';
            broadcastRoomInfo(roomId);
          }
        }, 5000);
      }
    }, 1000);
  }

  // 绘图同步（仅当前画手可以绘图）
  socket.on('draw_action', (data) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'playing') return;
    
    const currentDrawer = room.players[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.socketId !== socket.id) return;

    if (data.type === 'clear') {
      room.drawHistory = [];
    } else {
      room.drawHistory.push(data);
    }

    socket.to(userRoom).emit('draw_action', data);
  });

  // 猜答案 / 聊天消息
  socket.on('send_guess', ({ text }) => {
    if (!userRoom || !rooms[userRoom] || !text) return;
    const room = rooms[userRoom];
    if (room.state !== 'playing') return;

    const guessText = text.trim();
    const currentGuesser = room.players[1 - room.currentDrawerIndex];
    const currentDrawer = room.players[room.currentDrawerIndex];

    const isGuesser = currentGuesser && currentGuesser.socketId === socket.id;

    if (isGuesser && guessText.toLowerCase() === room.currentWord.toLowerCase()) {
      // 猜中啦！
      clearInterval(room.timerInterval);
      room.state = 'round_end';
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - room.roundStartTime) / 1000));

      // 双方增加得分
      currentGuesser.score = (currentGuesser.score || 0) + 3;
      currentDrawer.score = (currentDrawer.score || 0) + 2;

      console.log(`[${userRoom}] 猜中！${userName} 猜中【${room.currentWord}】，耗时 ${elapsedSeconds}s`);

      io.to(userRoom).emit('round_win', {
        word: room.currentWord,
        category: room.category,
        drawerName: currentDrawer.name,
        drawerAvatar: currentDrawer.avatar,
        guesserName: currentGuesser.name,
        guesserAvatar: currentGuesser.avatar,
        elapsedSeconds
      });

      // 角色互换，重置准备状态
      room.currentDrawerIndex = 1 - room.currentDrawerIndex;
      room.players.forEach(p => p.isReady = false);
      broadcastRoomInfo(userRoom);

      // 7 秒后恢复大厅准备状态
      setTimeout(() => {
        if (rooms[userRoom]) {
          rooms[userRoom].state = 'lobby';
          broadcastRoomInfo(userRoom);
        }
      }, 7000);
    } else {
      // 没猜中，作为普通弹幕/聊天展示给双方
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

  // 添加自定义新词（投喂新词）
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
