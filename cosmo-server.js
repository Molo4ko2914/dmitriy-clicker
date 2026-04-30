// Cosmo-Batalii PvP Server
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Game state
const waitingPlayers = []; // Игроки в очереди
const activeGames = new Map(); // Активные игры
const pvpTables = new Map(); // PvP столы

// PvP Table class
class PvPTable {
  constructor(id, creatorId, creatorName) {
    this.id = id;
    this.creator = creatorName;
    this.creatorId = creatorId;
    this.players = [creatorId];
    this.playerNames = [creatorName];
    this.gameStarted = false;
    this.createdAt = Date.now();
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= 2) return false;
    this.players.push(playerId);
    this.playerNames.push(playerName);
    return true;
  }

  isFull() {
    return this.players.length >= 2;
  }

  getInfo() {
    return {
      id: this.id,
      creator: this.creator,
      players: this.players.length,
      gameStarted: this.gameStarted
    };
  }
}

// Константы игры
const COSMO_W = 310;
const COSMO_H = 420;
const COSMO_PADDLE_W = 70;
const COSMO_PADDLE_H = 12;
const COSMO_BALL_R = 18;
const COSMO_WIN = 9;
const COSMO_ULT_HITS = 15;
const COSMO_ULT_BOOST = 1.6;
const COSMO_GADGET_R = 14;
const COSMO_GADGET_FREEZE_MS = 2200;
const COSMO_GRENADE_R = 12;
const COSMO_GRENADE_SPAWN_CHANCE = 0.002; // Уменьшено с 0.004 для меньшей нагрузки
const COSMO_MAX_GRENADES = 2; // Максимум гранат на поле

class Game {
  constructor(player1, player2, difficulty) {
    this.id = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.player1 = player1;
    this.player2 = player2;
    this.difficulty = difficulty;

    // Игровое состояние
    this.ball = {
      x: COSMO_W / 2,
      y: COSMO_H / 2,
      vx: 0,
      vy: 0
    };

    this.paddle1 = { x: COSMO_W / 2 - COSMO_PADDLE_W / 2, y: COSMO_H - 30 };
    this.paddle2 = { x: COSMO_W / 2 - COSMO_PADDLE_W / 2, y: 18 };

    this.score1 = 0;
    this.score2 = 0;

    this.started = false;
    this.gameOver = false;
    this.winner = null;

    this.lastUpdate = Date.now();

    // Механики ульты
    this.ult1Available = false;
    this.ult1Used = false;
    this.ult1Hits = 0;
    this.ult1PendingHit = false;
    this.lightningTime1 = 0;

    this.ult2Available = false;
    this.ult2Used = false;
    this.ult2Hits = 0;
    this.ult2PendingHit = false;
    this.lightningTime2 = 0;

    // Гаджеты (ловушки заморозки)
    this.gadgets = [];
    this.ballFrozen = false;
    this.ballFreezeTimer = 0;
    this.ballFreezeVx = 0;
    this.ballFreezeVy = 0;

    // Гранаты
    this.grenades = [];
    this.whiteFlash = 0;
  }

  start() {
    this.started = true;
    // Начальная скорость мяча
    const angle = (Math.random() - 0.5) * Math.PI / 3;
    const speed = 5;
    this.ball.vx = Math.sin(angle) * speed;
    this.ball.vy = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
  }

  update() {
    if (!this.started || this.gameOver) return;

    const now = Date.now();
    const dt = (now - this.lastUpdate) / 8.33; // Нормализация к 120 FPS
    this.lastUpdate = now;

    // Обновление заморозки мяча
    if (this.ballFrozen) {
      this.ballFreezeTimer -= dt * 8.33;
      if (this.ballFreezeTimer <= 0) {
        this.ballFrozen = false;
        this.ball.vx = this.ballFreezeVx;
        this.ball.vy = this.ballFreezeVy;
      }
    }

    // Обновление позиции мяча (если не заморожен)
    if (!this.ballFrozen) {
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
    }

    // Отскок от стен
    if (this.ball.x - COSMO_BALL_R < 0 || this.ball.x + COSMO_BALL_R > COSMO_W) {
      this.ball.vx *= -1;
      this.ball.x = Math.max(COSMO_BALL_R, Math.min(COSMO_W - COSMO_BALL_R, this.ball.x));
    }

    // Столкновение с ракетками
    // Игрок 1 (внизу)
    if (this.ball.y + COSMO_BALL_R >= this.paddle1.y &&
        this.ball.y + COSMO_BALL_R <= this.paddle1.y + COSMO_PADDLE_H &&
        this.ball.x >= this.paddle1.x &&
        this.ball.x <= this.paddle1.x + COSMO_PADDLE_W) {
      this.ball.vy = -Math.abs(this.ball.vy);
      const hitPos = (this.ball.x - this.paddle1.x) / COSMO_PADDLE_W - 0.5;
      this.ball.vx += hitPos * 2;

      // Ульта игрока 1
      if (this.ult1PendingHit) {
        this.ball.vx *= COSMO_ULT_BOOST;
        this.ball.vy *= COSMO_ULT_BOOST;
        this.ult1PendingHit = false;
        this.ult1Used = true;
        this.ult1Available = false;
        this.lightningTime1 = 30;
      }

      // Счётчик хитов для ульты
      this.ult1Hits++;
      if (this.ult1Hits >= COSMO_ULT_HITS && !this.ult1Available && !this.ult1Used) {
        this.ult1Available = true;
        this.ult1Hits = 0;
      }
    }

    // Игрок 2 (вверху)
    if (this.ball.y - COSMO_BALL_R <= this.paddle2.y + COSMO_PADDLE_H &&
        this.ball.y - COSMO_BALL_R >= this.paddle2.y &&
        this.ball.x >= this.paddle2.x &&
        this.ball.x <= this.paddle2.x + COSMO_PADDLE_W) {
      this.ball.vy = Math.abs(this.ball.vy);
      const hitPos = (this.ball.x - this.paddle2.x) / COSMO_PADDLE_W - 0.5;
      this.ball.vx += hitPos * 2;

      // Ульта игрока 2
      if (this.ult2PendingHit) {
        this.ball.vx *= COSMO_ULT_BOOST;
        this.ball.vy *= COSMO_ULT_BOOST;
        this.ult2PendingHit = false;
        this.ult2Used = true;
        this.ult2Available = false;
        this.lightningTime2 = 30;
      }

      // Счётчик хитов для ульты
      this.ult2Hits++;
      if (this.ult2Hits >= COSMO_ULT_HITS && !this.ult2Available && !this.ult2Used) {
        this.ult2Available = true;
        this.ult2Hits = 0;
      }
    }

    // Столкновение с гаджетами (ловушками)
    for (let i = this.gadgets.length - 1; i >= 0; i--) {
      const g = this.gadgets[i];
      const dx = this.ball.x - g.x;
      const dy = this.ball.y - g.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < COSMO_BALL_R + COSMO_GADGET_R) {
        // Заморозка мяча
        if (!this.ballFrozen) {
          this.ballFrozen = true;
          this.ballFreezeTimer = COSMO_GADGET_FREEZE_MS;
          this.ballFreezeVx = this.ball.vx;
          this.ballFreezeVy = this.ball.vy;
          this.ball.vx = 0;
          this.ball.vy = 0;
        }
        this.gadgets.splice(i, 1);
      }
    }

    // Столкновение с гранатами
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      const dx = this.ball.x - gr.x;
      const dy = this.ball.y - gr.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < COSMO_BALL_R + COSMO_GRENADE_R) {
        // Взрыв - отбрасываем мяч
        const angle = Math.atan2(dy, dx);
        const force = 8;
        this.ball.vx = Math.cos(angle) * force;
        this.ball.vy = Math.sin(angle) * force;
        this.whiteFlash = 10;
        this.grenades.splice(i, 1);
      }
    }

    // Обновление гранат (движение)
    for (const gr of this.grenades) {
      gr.x += gr.vx * dt;
      gr.y += gr.vy * dt;
      // Удаляем гранаты за пределами поля
      if (gr.x < -50 || gr.x > COSMO_W + 50 || gr.y < -50 || gr.y > COSMO_H + 50) {
        this.grenades = this.grenades.filter(g => g !== gr);
      }
    }

    // Спавн гранат (с ограничением максимального количества)
    if (this.grenades.length < COSMO_MAX_GRENADES && Math.random() < COSMO_GRENADE_SPAWN_CHANCE) {
      const side = Math.floor(Math.random() * 4);
      let gx, gy, gvx, gvy;
      if (side === 0) { // слева
        gx = -20; gy = Math.random() * COSMO_H;
        gvx = 2 + Math.random() * 2; gvy = (Math.random() - 0.5) * 2;
      } else if (side === 1) { // справа
        gx = COSMO_W + 20; gy = Math.random() * COSMO_H;
        gvx = -(2 + Math.random() * 2); gvy = (Math.random() - 0.5) * 2;
      } else if (side === 2) { // сверху
        gx = Math.random() * COSMO_W; gy = -20;
        gvx = (Math.random() - 0.5) * 2; gvy = 2 + Math.random() * 2;
      } else { // снизу
        gx = Math.random() * COSMO_W; gy = COSMO_H + 20;
        gvx = (Math.random() - 0.5) * 2; gvy = -(2 + Math.random() * 2);
      }
      this.grenades.push({ x: gx, y: gy, vx: gvx, vy: gvy });
    }

    // Уменьшение таймеров анимаций
    if (this.lightningTime1 > 0) this.lightningTime1--;
    if (this.lightningTime2 > 0) this.lightningTime2--;
    if (this.whiteFlash > 0) this.whiteFlash--;

    // Гол
    if (this.ball.y - COSMO_BALL_R < 0) {
      // Гол игрока 1
      this.score1++;
      this.resetBall();
      if (this.score1 >= COSMO_WIN) {
        this.endGame(this.player1);
      }
    } else if (this.ball.y + COSMO_BALL_R > COSMO_H) {
      // Гол игрока 2
      this.score2++;
      this.resetBall();
      if (this.score2 >= COSMO_WIN) {
        this.endGame(this.player2);
      }
    }
  }

  resetBall() {
    this.ball.x = COSMO_W / 2;
    this.ball.y = COSMO_H / 2;
    const angle = (Math.random() - 0.5) * Math.PI / 3;
    const speed = 5;
    this.ball.vx = Math.sin(angle) * speed;
    this.ball.vy = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
  }

  endGame(winner) {
    this.gameOver = true;
    this.winner = winner;
  }

  getState() {
    return {
      ball: {
        x: Math.round(this.ball.x * 10) / 10, // Округляем до 1 знака после запятой
        y: Math.round(this.ball.y * 10) / 10,
        vx: Math.round(this.ball.vx * 10) / 10,
        vy: Math.round(this.ball.vy * 10) / 10
      },
      paddle1: { x: Math.round(this.paddle1.x) }, // Только x координата, y статична
      paddle2: { x: Math.round(this.paddle2.x) },
      score1: this.score1,
      score2: this.score2,
      ult1Available: this.ult1Available,
      ult1Used: this.ult1Used,
      ult1Hits: this.ult1Hits,
      lightningTime1: this.lightningTime1,
      ult2Available: this.ult2Available,
      ult2Used: this.ult2Used,
      ult2Hits: this.ult2Hits,
      lightningTime2: this.lightningTime2,
      gadgets: this.gadgets.map(g => ({ x: Math.round(g.x), y: Math.round(g.y) })),
      grenades: this.grenades.map(gr => ({ x: Math.round(gr.x), y: Math.round(gr.y) })),
      ballFrozen: this.ballFrozen,
      whiteFlash: this.whiteFlash
    };
  }
}

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Поиск игры
  socket.on('find-match', (data) => {
    const { username, difficulty } = data;
    console.log(`${username} ищет игру (${difficulty})`);

    // Ищем игрока с такой же сложностью
    const matchIndex = waitingPlayers.findIndex(p => p.difficulty === difficulty);

    if (matchIndex !== -1) {
      // Нашли соперника!
      const opponent = waitingPlayers.splice(matchIndex, 1)[0];

      // Создаём игру
      const game = new Game(socket.id, opponent.socketId, difficulty);
      activeGames.set(game.id, game);

      // Связываем сокеты с игрой
      socket.gameId = game.id;
      socket.playerNum = 1;
      socket.username = username;

      const opponentSocket = io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.gameId = game.id;
        opponentSocket.playerNum = 2;
      }

      // Уведомляем обоих игроков
      socket.emit('match-found', {
        gameId: game.id,
        playerNum: 1,
        opponent: opponent.username,
        difficulty: difficulty
      });

      if (opponentSocket) {
        opponentSocket.emit('match-found', {
          gameId: game.id,
          playerNum: 2,
          opponent: username,
          difficulty: difficulty
        });
      }

      console.log(`Match created: ${username} vs ${opponent.username}`);
    } else {
      // Добавляем в очередь
      waitingPlayers.push({
        socketId: socket.id,
        username: username,
        difficulty: difficulty,
        timestamp: Date.now()
      });

      socket.emit('searching', { queueSize: waitingPlayers.length });
      console.log(`${username} added to queue. Queue size: ${waitingPlayers.length}`);
    }
  });

  // ===== PvP TABLES =====

  // Получить список столов
  socket.on('get-tables', () => {
    const tables = Array.from(pvpTables.values()).map(t => t.getInfo());
    socket.emit('tables-update', tables);
  });

  // Создать стол
  socket.on('create-table', (data) => {
    const { username } = data;
    const tableId = `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const table = new PvPTable(tableId, socket.id, username);
    pvpTables.set(tableId, table);

    socket.tableId = tableId;
    socket.username = username;

    console.log(`${username} created table ${tableId}`);

    // Отправляем обновлённый список всем
    broadcastTables();

    socket.emit('table-joined', {
      tableId: tableId,
      tableName: `Стол #${tableId.substr(-4)}`
    });
  });

  // Присоединиться к столу
  socket.on('join-table', (data) => {
    const { tableId, username } = data;
    const table = pvpTables.get(tableId);

    if (!table) {
      socket.emit('error', { message: 'Стол не найден' });
      return;
    }

    if (table.isFull()) {
      socket.emit('error', { message: 'Стол занят' });
      return;
    }

    // Добавляем игрока к столу
    table.addPlayer(socket.id, username);
    socket.tableId = tableId;
    socket.username = username;

    console.log(`${username} joined table ${tableId}`);

    // Создаём игру
    const game = new Game(table.players[0], table.players[1], 'pvp');
    game.tableId = tableId; // Связываем игру со столом
    activeGames.set(game.id, game);

    // Связываем сокеты с игрой
    socket.gameId = game.id;
    socket.playerNum = 2;

    const player1Socket = io.sockets.sockets.get(table.players[0]);
    if (player1Socket) {
      player1Socket.gameId = game.id;
      player1Socket.playerNum = 1;
    }

    // Помечаем стол как занятый
    table.gameStarted = true;

    // Уведомляем обоих игроков о начале матча
    socket.emit('match-start', {
      gameId: game.id,
      playerNum: 2,
      opponent: table.playerNames[0]
    });

    if (player1Socket) {
      player1Socket.emit('match-start', {
        gameId: game.id,
        playerNum: 1,
        opponent: username
      });
    }

    // Автоматически стартуем игру
    game.start();
    io.to(game.player1).emit('game-start');
    io.to(game.player2).emit('game-start');

    console.log(`Game ${game.id} started at table ${tableId}`);

    // Обновляем список столов
    broadcastTables();
  });

  // Отмена поиска
  socket.on('cancel-search', () => {
    const index = waitingPlayers.findIndex(p => p.socketId === socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
      console.log(`Player ${socket.id} cancelled search`);
    }
  });

  // Игрок готов начать
  socket.on('player-ready', () => {
    const game = activeGames.get(socket.gameId);
    if (!game) return;

    if (!game.started) {
      game.start();

      // Уведомляем обоих игроков
      io.to(game.player1).emit('game-start');
      io.to(game.player2).emit('game-start');

      console.log(`Game ${game.id} started`);
    }
  });

  // Обновление позиции ракетки
  socket.on('paddle-move', (data) => {
    const game = activeGames.get(socket.gameId);
    if (!game || game.gameOver) return;

    if (socket.playerNum === 1) {
      game.paddle1.x = Math.max(0, Math.min(COSMO_W - COSMO_PADDLE_W, data.x));
    } else if (socket.playerNum === 2) {
      game.paddle2.x = Math.max(0, Math.min(COSMO_W - COSMO_PADDLE_W, data.x));
    }
  });

  // Активация ульты
  socket.on('use-ult', () => {
    const game = activeGames.get(socket.gameId);
    if (!game || game.gameOver) return;

    if (socket.playerNum === 1 && game.ult1Available && !game.ult1Used) {
      game.ult1PendingHit = true;
    } else if (socket.playerNum === 2 && game.ult2Available && !game.ult2Used) {
      game.ult2PendingHit = true;
    }
  });

  // Размещение гаджета (ловушки)
  socket.on('place-gadget', (data) => {
    const game = activeGames.get(socket.gameId);
    if (!game || game.gameOver) return;

    // Ограничение: максимум 3 гаджета на поле
    if (game.gadgets.length < 3) {
      game.gadgets.push({ x: data.x, y: data.y });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Удаляем из очереди
    const queueIndex = waitingPlayers.findIndex(p => p.socketId === socket.id);
    if (queueIndex !== -1) {
      waitingPlayers.splice(queueIndex, 1);
    }

    // Удаляем стол если игрок был создателем
    if (socket.tableId) {
      const table = pvpTables.get(socket.tableId);
      if (table && !table.gameStarted) {
        pvpTables.delete(socket.tableId);
        console.log(`Table ${socket.tableId} removed (creator left)`);
        broadcastTables();
      }
    }

    // Завершаем активную игру
    if (socket.gameId) {
      const game = activeGames.get(socket.gameId);
      if (game && !game.gameOver) {
        // Определяем победителя (оставшийся игрок)
        const winnerId = socket.playerNum === 1 ? game.player2 : game.player1;
        game.endGame(winnerId);

        // Уведомляем оставшегося игрока
        io.to(winnerId).emit('opponent-disconnected');

        console.log(`Game ${game.id} ended due to disconnect`);

        // Удаляем стол
        if (socket.tableId) {
          pvpTables.delete(socket.tableId);
          broadcastTables();
        }
      }

      // Удаляем игру через 10 секунд
      setTimeout(() => {
        activeGames.delete(socket.gameId);
      }, 10000);
    }
  });
});

// Функция рассылки обновлений столов всем подключённым
function broadcastTables() {
  const tables = Array.from(pvpTables.values()).map(t => t.getInfo());
  io.emit('tables-update', tables);
}

// Очистка старых столов (старше 10 минут без игры)
setInterval(() => {
  const now = Date.now();
  pvpTables.forEach((table, tableId) => {
    if (!table.gameStarted && now - table.createdAt > 10 * 60 * 1000) {
      pvpTables.delete(tableId);
      console.log(`Table ${tableId} removed (timeout)`);
    }
  });
  broadcastTables();
}, 60000); // Каждую минуту

// Игровой цикл - обновление всех активных игр
let frameCounter = 0;
setInterval(() => {
  frameCounter++;
  activeGames.forEach((game, gameId) => {
    if (game.started && !game.gameOver) {
      game.update();

      // Отправляем состояние каждый 3-й кадр (~40 FPS для сети, экономия трафика)
      if (frameCounter % 3 === 0) {
        const state = game.getState();
        io.to(game.player1).emit('game-state', state);
        io.to(game.player2).emit('game-state', state);
      }

      // Если игра закончилась
      if (game.gameOver) {
        io.to(game.player1).emit('game-over', {
          winner: game.winner === game.player1 ? 1 : 2,
          score1: game.score1,
          score2: game.score2
        });
        io.to(game.player2).emit('game-over', {
          winner: game.winner === game.player2 ? 2 : 1,
          score1: game.score1,
          score2: game.score2
        });

        console.log(`Game ${gameId} ended. Winner: ${game.winner}`);

        // Удаляем стол, связанный с этой игрой
        if (game.tableId && pvpTables.has(game.tableId)) {
          pvpTables.delete(game.tableId);
          console.log(`Table ${game.tableId} removed (game ended)`);
          broadcastTables();
        }

        // Удаляем игру через 5 секунд
        setTimeout(() => {
          activeGames.delete(gameId);
        }, 5000);
      }
    }
  });
}, 8); // ~120 FPS (1000ms / 120 = 8.33ms)

// Статус сервера
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length,
    connectedPlayers: io.sockets.sockets.size,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Healthcheck для Railway
app.get('/', (req, res) => {
  res.send('Cosmo-Batalii PvP Server is running! 🪐');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

server.listen(PORT, HOST, () => {
  console.log(`🪐 Cosmo-Batalii PvP Server running on port ${PORT}`);
  console.log(`Host: ${HOST}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Status: http://localhost:${PORT}/status`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Server started at: ${new Date().toISOString()}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});
