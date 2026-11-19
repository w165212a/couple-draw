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

// 加载词库（包含 word, hint1, hint2）
let wordBank = { words: [], customWords: [] };
function loadWords() {
  try {
    const data = fs.readFileSync(WORDS_FILE, 'utf8');
    wordBank = JSON.parse(data);
    console.log(`成功载入全新词库，共计 ${wordBank.words ? wordBank.words.length : 0} 条词汇与进阶提示`);
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

// 获取 N 个互不相同的候选词（自主选词功能）
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

  while (selected.length < count) {
    selected.push({ word: "摩天轮", hint1: "游乐园慢慢转", hint2: "高处看城市" });
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
    gameStarted: !!room.gameStarted,
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
        currentWordObj: null,
        candidateWords: [],
        state: 'lobby', // 'lobby' | 'selecting_word' | 'playing' | 'round_end'
        gameStarted: false, // 一旦开始，后续回合全自动循环，无需每局再点准备
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

    broadcastRoomInfo(userRoom);

    // 如果中途重连且正在画画，补发画板与回合状态
    if (currentRoom.state === 'playing' && currentRoom.currentWordObj) {
      socket.emit('sync_canvas', currentRoom.drawHistory);
      const isDrawer = currentRoom.players[currentRoom.currentDrawerIndex]?.socketId === socket.id;
      socket.emit('rejoin_round', {
        isDrawer,
        word: isDrawer ? currentRoom.currentWordObj.word : null,
        wordLength: currentRoom.currentWordObj.word.length,
        hint1: currentRoom.hint1Revealed ? currentRoom.currentWordObj.hint1 : null,
        hint2: currentRoom.hint2Revealed ? currentRoom.currentWordObj.hint2 : null,
        drawerName: currentRoom.players[currentRoom.currentDrawerIndex]?.name,
        remainingSeconds: currentRoom.timerSeconds
      });
    }
  });

  // 玩家准备 / 取消准备 (首次进入房间时使用)
  socket.on('toggle_ready', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'lobby') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.isReady = !player.isReady;
    console.log(`[${userRoom}] 玩家 ${player.name} 准备状态: ${player.isReady}`);
    broadcastRoomInfo(userRoom);

    // 检查是否 2 人且均已就绪
    if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
      console.log(`[${userRoom}] 双方首次就绪，启动全自动对局循环！`);
      room.gameStarted = true;
      startWordSelectionPhase(userRoom);
    }
  });

  // 开始自主选词阶段 (4 选 1 + 换一批)
  function startWordSelectionPhase(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    room.state = 'selecting_word';
    room.candidateWords = getCandidateWords(4);
    room.wordPickSeconds = 15;
    room.hint1Revealed = false;
    room.hint2Revealed = false;

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    console.log(`[${roomId}] 画手 ${drawer.name} 正在挑选词汇，备选:`, room.candidateWords.map(c => c.word));

    // 通知画手自主选词（4选1，带提示预览）
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
        const defaultChoice = room.candidateWords[0];
        console.log(`[${roomId}] 选词超时，自动选择第 1 个词: 【${defaultChoice.word}】`);
        startDrawingPhase(roomId, defaultChoice);
      }
    }, 1000);
  }

  // 画手请求换一批词（刷新 4 个新词）
  socket.on('refresh_candidates', () => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;

    const oldWords = room.candidateWords.map(c => c.word);
    room.candidateWords = getCandidateWords(4, oldWords);

    console.log(`[${userRoom}] 画手 ${drawer.name} 刷新了候选词`);

    socket.emit('pick_word_turn', {
      candidates: room.candidateWords,
      duration: room.wordPickSeconds
    });
  });

  // 画手确认挑选某个词
  socket.on('choose_word', ({ word, hint1, hint2 }) => {
    if (!userRoom || !rooms[userRoom]) return;
    const room = rooms[userRoom];
    if (room.state !== 'selecting_word') return;

    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;

    if (room.wordPickInterval) clearInterval(room.wordPickInterval);

    console.log(`[${userRoom}] 画手 ${drawer.name} 选中: 【${word}】`);
    startDrawingPhase(userRoom, { word, hint1, hint2 });
  });

  // 正式进入作画与猜题阶段（包含进阶提示逻辑）
  function startDrawingPhase(roomId, wordObj) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    room.currentWordObj = wordObj;
    room.state = 'playing';
    room.drawHistory = [];
    room.timerSeconds = 90;
    room.roundStartTime = Date.now();
    room.hint1Revealed = false;
    room.hint2Revealed = false;

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    // 通知画手
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

    // 通知猜题人
    io.to(guesser.socketId).emit('round_start', {
      isDrawer: false,
      wordLength: wordObj.word.length,
      drawerName: drawer.name,
      drawerAvatar: drawer.avatar,
      guesserName: guesser.name,
      guesserAvatar: guesser.avatar
    });

    broadcastRoomInfo(roomId);

    // 开启作画倒计时与进阶提示触发
    room.timerInterval = setInterval(() => {
      room.timerSeconds--;
      io.to(roomId).emit('timer_tick', { seconds: room.timerSeconds });

      // 进阶提示 1: 剩余 60 秒时（经过 30 秒）自动揭晓
      if (room.timerSeconds === 60 && !room.hint1Revealed) {
        room.hint1Revealed = true;
        console.log(`[${roomId}] 触发进阶提示 1: ${wordObj.hint1}`);
        io.to(roomId).emit('progressive_hint', {
          level: 1,
          hint: wordObj.hint1,
          msg: `💡 进阶提示 ①：【${wordObj.hint1}】`
        });
      }

      // 进阶提示 2: 剩余 30 秒时（经过 60 秒）自动揭晓
      if (room.timerSeconds === 30 && !room.hint2Revealed) {
        room.hint2Revealed = true;
        console.log(`[${roomId}] 触发进阶提示 2: ${wordObj.hint2}`);
        io.to(roomId).emit('progressive_hint', {
          level: 2,
          hint: wordObj.hint2,
          msg: `💡 进阶提示 ②：【${wordObj.hint2}】`
        });
      }

      // 倒计时结束，无人猜中
      if (room.timerSeconds <= 0) {
        clearInterval(room.timerInterval);
        room.state = 'round_end';

        io.to(roomId).emit('round_timeout', {
          word: wordObj.word,
          hint1: wordObj.hint1,
          hint2: wordObj.hint2,
          drawerName: drawer.name
        });

        // 自动轮换角色并直接进入下一轮自主选词（无需再点准备）
        room.currentDrawerIndex = 1 - room.currentDrawerIndex;
        broadcastRoomInfo(roomId);

        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].players.length >= 2) {
            startWordSelectionPhase(roomId);
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
    if (room.state !== 'playing' || !room.currentWordObj) return;

    const guessText = text.trim();
    const currentGuesser = room.players[1 - room.currentDrawerIndex];
    const currentDrawer = room.players[room.currentDrawerIndex];

    const isGuesser = currentGuesser && currentGuesser.socketId === socket.id;

    if (isGuesser && guessText.toLowerCase() === room.currentWordObj.word.toLowerCase()) {
      // 猜中啦！
      clearInterval(room.timerInterval);
      room.state = 'round_end';
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

      // 角色互换，保持就绪状态，6秒后自动进入下一局自主选词
      room.currentDrawerIndex = 1 - room.currentDrawerIndex;
      broadcastRoomInfo(userRoom);

      setTimeout(() => {
        if (rooms[userRoom] && rooms[userRoom].players.length >= 2) {
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
      room.gameStarted = false; // 有人离开则重置回大厅等待

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
