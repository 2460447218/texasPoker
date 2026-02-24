const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const PokerGame = require('./poker');

const app = express();
app.use(cors());

// 托管前端静态文件 (生产环境)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 房间数据存储
// 结构: { roomId: { players: [], pot: 0, blind: {sb: 10, bb: 20}, dealerIndex: 0, history: [], game: PokerGameInstance } }
const rooms = {};

const DEFAULT_CHIPS = 2000;

// 辅助函数：过滤敏感信息，发送给前端
function getRoomStateForPlayer(room, socketId) {
    // 基础信息
    const publicState = {
        id: room.id,
        pot: room.game ? room.game.pot : room.pot,
        blind: room.blind,
        dealerIndex: room.dealerIndex,
        history: room.history,
        status: room.status, // WAITING, PLAYING
        phase: room.game ? room.game.phase : 'WAITING',
        communityCards: room.game ? room.game.communityCards : [],
        currentActorIndex: room.game ? room.game.currentActorIndex : -1,
        currentBet: room.game ? room.game.currentBet : 0,
        minRaise: room.game ? room.game.minRaise : 0,
        showdownResult: room.game ? room.game.showdownResult : null
    };

    // 玩家信息 (需要隐藏别人的底牌)
    publicState.players = room.players.map(p => {
        if (!p) return null;
        const isMe = p.socketId === socketId;
        return {
            nickname: p.nickname,
            chips: p.chips,
            bet: p.bet || 0, // 本轮下注
            totalBet: p.totalBet || 0,
            status: p.status || 'ACTIVE',
            action: p.action,
            isDealer: p.isDealer,
            isSB: p.isSB,
            isBB: p.isBB,
            isHost: p.isHost, // 确保这个字段被发送了
            seatIndex: p.seatIndex,
            // 只有自己或者是 Showdown 阶段，才显示手牌
            hand: (isMe || (room.game && room.game.phase === 'SHOWDOWN')) ? p.hand : null
        };
    });

    return publicState;
}

// 广播房间状态 (每个人的视角不同)
function broadcastRoomState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (sockets) {
        for (const socketId of sockets) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('updateRoom', getRoomStateForPlayer(room, socketId));
            }
        }
    }
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('createRoom', ({ roomId, nickname }, callback) => {
    if (rooms[roomId]) {
      callback({ success: false, message: '房间已存在' });
      return;
    }
    
    rooms[roomId] = {
      id: roomId,
      players: new Array(9).fill(null),
      pot: 0,
      blind: { sb: 10, bb: 20 },
      dealerIndex: -1,
      history: [],
      status: 'WAITING',
      game: null // 游戏引擎实例
    };
    
    callback({ success: true });
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    if (!rooms[roomId]) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    socket.join(roomId);
    
    // 如果房间里没有人（可能是所有人都断开了），则第一个加入的人（或者重连的人）应该尝试继承 Host
    // 这里简单处理：如果 rooms[roomId].hostId 为空，则当前 socket 成为 Host
    // 注意：joinRoom 只是加入房间，还没有入座 (sitDown)
    // 但为了管理方便，通常我们会把 Host 权限绑定给某个人
    // 让我们在 sitDown 时处理 Host 逻辑更稳妥，或者在这里先记录 socket
    
    socket.emit('updateRoom', getRoomStateForPlayer(rooms[roomId], socket.id));
    console.log(`User ${nickname} joined room ${roomId}`);
  });

  socket.on('sitDown', ({ roomId, seatIndex, nickname, chips }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    if (room.players[seatIndex]) {
      socket.emit('error', '该座位已被占用');
      return;
    }

    const existingSeat = room.players.findIndex(p => p && p.socketId === socket.id);
    if (existingSeat !== -1) {
      room.players[existingSeat] = null;
    }
    
    // 判断是否正在进行游戏
    let initialStatus = 'ACTIVE';
    if (room.status === 'PLAYING') {
        initialStatus = 'SITTING_OUT'; 
    }
    
    // 判断是否是房主 (如果是第一个入座的，或者之前就是房主)
    // 简单逻辑：如果房间还没有 active host，这个入座的人就是 host
    let isHost = false;
    const hasHost = room.players.some(p => p && p.isHost);
    if (!hasHost) {
        isHost = true;
    }

    room.players[seatIndex] = {
      socketId: socket.id,
      nickname: nickname,
      chips: chips || DEFAULT_CHIPS,
      seatIndex: seatIndex, // 记录座位号
      isDealer: false,
      isSB: false,
      isBB: false,
      isHost: isHost, // 标记房主
      hand: null,
      bet: 0,
      totalBet: 0,
      status: initialStatus
    };
    
    broadcastRoomState(roomId);
    
    if (initialStatus === 'SITTING_OUT') {
        socket.emit('message', '您已入座，请等待下一局开始');
    }
    if (isHost) {
        socket.emit('message', '您是房主，拥有管理权限');
    }
  });

  socket.on('standUp', ({ roomId, seatIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const leavingPlayer = room.players[seatIndex];
    if (leavingPlayer && leavingPlayer.isHost) {
        // 房主离开了，关闭房间
        io.to(roomId).emit('error', '房主已解散房间');
        io.to(roomId).emit('roomClosed'); // 通知前端房间关闭
        
        // 稍微延迟一下再删，确保消息发出去
        setTimeout(() => {
            // 强制所有 socket 离开房间
            const sockets = io.sockets.adapter.rooms.get(roomId);
            if (sockets) {
                for (const socketId of sockets) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s) s.leave(roomId);
                }
            }
            delete rooms[roomId];
        }, 100);
        return;
    }
    
    room.players[seatIndex] = null;
    broadcastRoomState(roomId);
  });

  // 房主转让权限
  socket.on('transferHost', ({ roomId, targetSeatIndex }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      const player = room.players.find(p => p && p.socketId === socket.id);
      if (!player || !player.isHost) {
          socket.emit('message', '您不是房主，无法转让');
          return;
      }

      const target = room.players[targetSeatIndex];
      if (target) {
          // 修改内存状态
          player.isHost = false;
          target.isHost = true;
          
          // 广播更新
          broadcastRoomState(roomId);
          io.to(roomId).emit('message', `房主权限已转让给 ${target.nickname}`);
          
          // 单独通知旧房主和新房主，确保前端状态刷新（虽然 broadcastRoomState 应该够了）
          io.to(player.socketId).emit('hostUpdated', false);
          io.to(target.socketId).emit('hostUpdated', true);
      }
  });


  socket.on('startHand', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // 初始化游戏引擎
    if (!room.game) {
        room.game = new PokerGame(roomId);
    }

    // 确定 Dealer 位置 (简单逻辑：顺时针)
    const activePlayers = room.players
      .map((p, i) => p ? { ...p, seatIndex: i } : null)
      .filter(p => p !== null); // 这里不看 chips，因为可能刚输光又买入

    if (activePlayers.length < 2) {
      io.to(roomId).emit('message', '人数不足，无法开始');
      return;
    }

    let nextDealerIndex;
    if (room.dealerIndex === -1) {
      nextDealerIndex = activePlayers[0].seatIndex;
    } else {
      const currentDealerPos = activePlayers.findIndex(p => p.seatIndex === room.dealerIndex);
      // 找下一个
      let nextPos = (currentDealerPos + 1) % activePlayers.length;
      if (currentDealerPos === -1) nextPos = 0;
      nextDealerIndex = activePlayers[nextPos].seatIndex;
    }
    room.dealerIndex = nextDealerIndex;

    // 启动新局
    const success = room.game.startNewHand(room.players, room.dealerIndex, room.blind);
    
    if (success) {
        room.status = 'PLAYING';
        // 同步 Dealer/SB/BB 标记回 room.players (虽然 room.game.players 引用的是同一个对象，但为了保险)
        // 其实不用做，因为是引用传递
        io.to(roomId).emit('message', `新牌局开始！Dealer: ${room.players[room.dealerIndex].nickname}`);
        broadcastRoomState(roomId);
    } else {
        io.to(roomId).emit('message', '启动失败，可能是筹码不足');
    }
  });

  // 玩家操作 (Fold, Check, Call, Raise)
  socket.on('action', ({ roomId, action, amount }) => {
      const room = rooms[roomId];
      if (!room || !room.game || room.status !== 'PLAYING') return;

      // 找到是谁发的请求
      const playerIndex = room.players.findIndex(p => p && p.socketId === socket.id);
      if (playerIndex === -1) return;

      const result = room.game.handleAction(playerIndex, action, amount);
      if (result.success) {
          // 检查是否有结算结果
          if (room.game.phase === 'SHOWDOWN' && room.game.showdownResult) {
               // 处理结算逻辑
               const winners = room.game.showdownResult.winners;
               let winnerMsg = '';
               
               winners.forEach(w => {
                   const player = room.players[w.seatIndex];
                   if (player) {
                       player.chips += w.amount;
                       winnerMsg += `${player.nickname}赢${w.amount} `;
                   }
               });
               
               room.history.unshift({
                   time: new Date().toLocaleTimeString(),
                   winner: winners.map(w => room.players[w.seatIndex].nickname).join('&'),
                   amount: winners.reduce((sum, w) => sum + w.amount, 0),
                   desc: winners[0].handDescription
               });
               
               io.to(roomId).emit('message', `本局结束: ${winnerMsg}`);
               
               // 稍微延迟一点重置状态，让前端展示 Showdown
               // 这里不做自动重置，等待下一次 startHand
               // 但要把 pot 清零
               // room.pot = 0; // game.pot 还在，前端显示用
               room.status = 'WAITING';
          }
          
          broadcastRoomState(roomId);
      } else {
          socket.emit('message', result.message || '操作无效');
      }
  });

  // 手动结算接口保留，以防万一
  socket.on('settle', ({ roomId, winnerSeatIndex, potAmount }) => {
      // ... (旧逻辑保留，作为管理员后门)
  });

  // 管理员设置盲注
  socket.on('updateBlind', ({ roomId, sb, bb }) => {
      const room = rooms[roomId];
      if (!room) return;

      const player = room.players.find(p => p && p.socketId === socket.id);
      if (!player || !player.isHost) {
          socket.emit('message', '只有房主可以修改盲注');
          return;
      }

      room.blind = { sb: parseInt(sb), bb: parseInt(bb) };
      broadcastRoomState(roomId);
      io.to(roomId).emit('message', `房主修改盲注为 ${sb}/${bb}`);
  });

  // 管理员修改筹码
  socket.on('updateChips', ({ roomId, targetSeatIndex, chips }) => {
      const room = rooms[roomId];
      if (!room) return;

      const player = room.players.find(p => p && p.socketId === socket.id);
      if (!player || !player.isHost) {
          socket.emit('message', '只有房主可以修改筹码');
          return;
      }

      const target = room.players[targetSeatIndex];
      if (target) {
          target.chips = parseInt(chips);
          broadcastRoomState(roomId);
          io.to(roomId).emit('message', `房主修改了 ${target.nickname} 的筹码`);
      }
  });
  
  // 管理员强制开始（哪怕有人没准备好，其实 startHand 本身就可以，只是加上权限校验）
  // 目前 startHand 任何人都能点，建议改成只有房主能点
  // 为了兼容旧版，暂时不强制校验，或者前端只给房主显示开始按钮

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
