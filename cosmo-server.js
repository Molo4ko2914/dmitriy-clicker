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
    const dt = (now - this.lastUpdate) / 16.67; // Нормализация к 60 FPS
    this.lastUpdate = now;

    // Обновление позиции мяча
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

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
    }

    // Игрок 2 (вверху)
    if (this.ball.y - COSMO_BALL_R <= this.paddle2.y + COSMO_PADDLE_H &&
        this.ball.y - COSMO_BALL_R >= this.paddle2.y &&
        this.ball.x >= this.paddle2.x &&
        this.ball.x <= this.paddle2.x + COSMO_PADDLE_W) {
      this.ball.vy = Math.abs(this.ball.vy);
      const hitPos = (this.ball.x - this.paddle2.x) / COSMO_PADDLE_W - 0.5;
      this.ball.vx += hitPos * 2;
    }

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
      ball: this.ball,
      paddle1: this.paddle1,
      paddle2: this.paddle2,
      score1: this.score1,
      score2: this.score2,
      gameOver: this.gameOver,
      winner: this.winner
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
setInterval(() => {
  activeGames.forEach((game, gameId) => {
    if (game.started && !game.gameOver) {
      game.update();

      // Отправляем состояние обоим игрокам
      const state = game.getState();
      io.to(game.player1).emit('game-state', state);
      io.to(game.player2).emit('game-state', state);

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

        // Удаляем игру через 5 секунд
        setTimeout(() => {
          activeGames.delete(gameId);
        }, 5000);
      }
    }
  });
}, 16); // ~60 FPS

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
