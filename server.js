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
        { name: "甜蜜日常", words: ["第一次看电影", "偷喝奶茶", "压马路", "拍合照", "赖床"] }
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

// 随机获取一个词
function getRandomWord() {
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
    return { word: "心有灵犀", category: "甜蜜默契" };
  }
  const idx = Math.floor(Math.random() * allPool.length);
  return allPool[idx];
}

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 房间状态数据
// rooms[roomId] = { players: [], currentDrawerIndex: 0, currentWord: '', ... }
const rooms = {};

io.on('connection', (socket) => {
  let userRoom = null;
  let userName = null;

  socket.on('join_room', ({ room, name }) => {
    userRoom = (room || 'sweet520').trim();
    userName = (name || '神秘宝贝').trim();

    socket.join(userRoom);

    if (!rooms[userRoom]) {
      rooms[userRoom] = {
        id: userRoom,
        players: [],
        currentDrawerIndex: 0,
        currentWord: '',
        category: '',
        state: 'waiting', // 'waiting' | 'playing' | 'round_end'
        timerSeconds: 90,
        timerInterval: null,
        roundStartTime: 0,
        drawHistory: []
      };
    }

    const currentRoom = rooms[userRoom];

    // 检查是否已有同名玩家重连
    const existingIndex = currentRoom.players.findIndex(p => p.name === userName);
    if (existingIndex !== -1) {
      currentRoom.players[existingIndex].socketId = socket.id;
    } else {
      if (currentRoom.players.length >= 2) {
        // 允许替换断开连接的空槽，或者按候补加入
        currentRoom.players[1] = { socketId: socket.id, name: userName, score: 0 };
      } else {
        currentRoom.players.push({ socketId: socket.id, name: userName, score: 0 });
      }
    }

    console.log(`[${userRoom}] 玩家加入: ${userName}，当前人数: ${currentRoom.players.length}`);

    // 通知房间内当前玩家信息
    io.to(userRoom).emit('room_info', {
      players: currentRoom.players.map(p => ({ name: p.name })),
      playerCount: currentRoom.players.length,
      state: currentRoom.state
    });

    // 如果正好满 2 人且处于等待中，开启第一轮！
    if (currentRoom.players.length === 2 && currentRoom.state === 'waiting') {
      startRound(userRoom);
    } else if (currentRoom.state === 'playing') {
      // 若中途重连，补发当前绘画记录
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

  // 开始新一轮
  function startRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;

    if (room.timerInterval) clearInterval(room.timerInterval);

    const { word, category } = getRandomWord();
    room.currentWord = word;
    room.category = category;
    room.state = 'playing';
    room.drawHistory = [];
    room.timerSeconds = 90;
    room.roundStartTime = Date.now();

    const drawer = room.players[room.currentDrawerIndex];
    const guesser = room.players[1 - room.currentDrawerIndex];

    console.log(`[${roomId}] 新回合: 画手=${drawer.name}, 题目=${word}(${category})`);

    // 通知画手
    io.to(drawer.socketId).emit('round_start', {
      isDrawer: true,
      word: room.currentWord,
      category: room.category,
      drawerName: drawer.name,
      guesserName: guesser.name
    });

    // 通知猜题人
    io.to(guesser.socketId).emit('round_start', {
      isDrawer: false,
      wordLength: room.currentWord.length,
      category: room.category,
      drawerName: drawer.name,
      guesserName: guesser.name
    });

    // 开启倒计时
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

        // 角色互换，5秒后开始下一轮
        room.currentDrawerIndex = 1 - room.currentDrawerIndex;
        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].players.length >= 2) {
            startRound(roomId);
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

    // 记录历史
    if (data.type === 'clear') {
      room.drawHistory = [];
    } else {
      room.drawHistory.push(data);
    }

    // 广播给房间内另一位
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

    // 只有猜题人猜中才算
    const isGuesser = currentGuesser && currentGuesser.socketId === socket.id;

    if (isGuesser && guessText.toLowerCase() === room.currentWord.toLowerCase()) {
      // 猜中啦！
      clearInterval(room.timerInterval);
      room.state = 'round_end';
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - room.roundStartTime) / 1000));

      console.log(`[${userRoom}] 猜中了！${userName} 猜中词语【${room.currentWord}】，耗时 ${elapsedSeconds}s`);

      io.to(userRoom).emit('round_win', {
        word: room.currentWord,
        category: room.category,
        drawerName: currentDrawer.name,
        guesserName: currentGuesser.name,
        elapsedSeconds
      });

      // 角色互换
      room.currentDrawerIndex = 1 - room.currentDrawerIndex;

      // 7 秒后自动开启下一回合（留足时间欣赏和保存回忆卡）
      setTimeout(() => {
        if (rooms[userRoom] && rooms[userRoom].players.length >= 2) {
          startRound(userRoom);
        }
      }, 7000);
    } else {
      // 没猜中，作为普通猜题弹幕/聊天展示给双方
      io.to(userRoom).emit('chat_message', {
        sender: userName,
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
      
      io.to(userRoom).emit('room_info', {
        players: room.players.map(p => ({ name: p.name })),
        playerCount: room.players.length,
        state: 'waiting'
      });

      if (room.players.length < 2) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        room.state = 'waiting';
      }

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
  console.log(`📱 手机/平板测试: http://<你的电脑局域网IP>:${PORT}`);
  console.log(`===============================================`);
});
