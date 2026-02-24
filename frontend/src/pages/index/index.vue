<template>
  <view class="container">
    <!-- 登录/大厅界面 -->
    <view v-if="!inRoom" class="lobby">
      <view class="title">德州扑克计分板</view>
      <view class="form-group">
        <text class="label">您的昵称</text>
        <input type="text" v-model="nickname" placeholder="请输入昵称" class="input" />
      </view>
      <view class="form-group">
        <text class="label">房间号</text>
        <input type="text" v-model="roomId" placeholder="例如: 888" class="input" />
      </view>
      <view class="form-group">
        <text class="label">服务器地址 (默认自动)</text>
        <input type="text" v-model="serverUrl" placeholder="例如: http://192.168.1.5:3000" class="input" />
      </view>
      <view class="btn-group">
        <button @click="createRoom">创建房间</button>
        <button @click="joinRoom" class="btn-secondary">加入房间</button>
      </view>
      <view class="tips">
        <text>如果是手机访问，请确保服务器地址填的是电脑的局域网IP。</text>
      </view>
    </view>

    <!-- 游戏界面 -->
    <view v-else class="game-room">
      <view class="header">
        <view class="room-info">房号: {{ roomData.id }}</view>
        <view class="blind-info">盲注: {{ roomData.blind.sb }}/{{ roomData.blind.bb }}</view>
        <view class="header-right">
            <button v-if="amIHost" class="btn-admin" @click="showAdmin = true">管理</button>
            <button class="btn-leave" @click="leaveRoom" size="mini">离开</button>
        </view>
      </view>

      <!-- 扑克桌 -->
      <view class="poker-table">
        <view class="pot-area">
          <view class="pot-label">底池 POT</view>
          <view class="pot-amount">{{ roomData.pot }}</view>
          <view class="phase-label" v-if="roomData.phase && roomData.phase !== 'WAITING'">{{ roomData.phase }}</view>
        </view>

        <!-- 公共牌区域 -->
        <view class="community-cards">
            <PokerCard 
              v-for="(card, i) in roomData.communityCards" 
              :key="i" 
              :code="card" 
              size="normal"
            />
        </view>

        <!-- 9个座位 -->
        <PlayerSeat 
          v-for="(seat, index) in 9" 
          :key="index" 
          :class="'seat-' + index"
          :player="roomData.players[index]"
          :isCurrentActor="roomData.currentActorIndex === index"
          :isWinner="lastWinnerIndex === index"
          @click="handleSeatClick(index)"
        />
      </view>

      <!-- 底部操作栏 -->
      <view class="action-bar-container">
        <GameControls 
          v-if="isMyTurn"
          :canCheck="canCheck"
          :callAmount="callAmount"
          :minRaiseAmount="minRaiseAmount"
          @action="handleGameAction"
        />
        
        <view class="action-bar" v-else>
          <button @click="startHand" class="btn-start" v-if="canStartGame">开始新局</button>
          <view v-else class="waiting-text">
              <text v-if="roomData.status === 'WAITING'">等待房主开始...</text>
              <text v-else>等待 {{ currentActorName }} 行动...</text>
          </view>
          <button @click="showHistory = !showHistory" class="btn-history">历史记录</button>
        </view>
      </view>

      <!-- 结算弹窗 -->
      <view v-if="showSettleModal" class="modal-overlay">
        <view class="modal">
          <view class="modal-title">结算: {{ selectedWinnerName }} 赢了</view>
          <view class="form-group">
            <text class="label">底池总额 (输入数字)</text>
            <input type="number" v-model.number="settleAmount" placeholder="输入赢得的筹码数" class="input" />
          </view>
          <view class="modal-btns">
            <button @click="confirmSettle">确定赢取</button>
            <button @click="closeSettle" class="btn-cancel">取消</button>
          </view>
        </view>
      </view>
      
      <!-- 历史记录弹窗 -->
      <view v-if="showHistory" class="modal-overlay" @click.self="showHistory = false">
        <view class="modal history-modal">
          <view class="modal-title">对局记录</view>
          <scroll-view scroll-y="true" class="history-list">
            <view v-for="(record, idx) in roomData.history" :key="idx" class="history-item">
              <text class="time">{{ record.time }}</text>
              <text class="winner">{{ record.winner }}</text>
              <text class="amount">+{{ record.amount }}</text>
            </view>
          </scroll-view>
          <button @click="showHistory = false">关闭</button>
        </view>
      </view>

      <!-- 管理面板弹窗 -->
      <view v-if="showAdmin" class="modal-overlay" @click.self="showAdmin = false">
        <AdminPanel 
            :currentBlind="roomData.blind" 
            :players="roomData.players" 
            @close="showAdmin = false" 
            @update-blind="handleUpdateBlind" 
            @update-chips="handleUpdateChips" 
            @transfer-host="handleTransferHost" 
        />
      </view>

      <!-- 消息提示 -->
      <view v-if="message" class="toast">{{ message }}</view>
    </view>
  </view>
</template>

<script>
import io from 'socket.io-client';
import PokerCard from '../../components/PokerCard.vue';
import PlayerSeat from '../../components/PlayerSeat.vue';
import GameControls from '../../components/GameControls.vue';
import AdminPanel from '../../components/AdminPanel.vue';

export default {
  components: {
    PokerCard,
    PlayerSeat,
    GameControls,
    AdminPanel
  },
  data() {

    return {
      inRoom: false,
      nickname: '',
      roomId: '',
      serverUrl: '', // 默认为空，自动推导
      socket: null,
      roomData: {
        id: '',
        players: new Array(9).fill(null),
        pot: 0,
        blind: { sb: 10, bb: 20 },
        history: [],
        communityCards: [],
        currentActorIndex: -1,
        currentBet: 0,
        minRaise: 0,
        phase: 'WAITING',
        status: 'WAITING'
      },
      showSettleModal: false,
      settleAmount: 0,
      selectedWinnerIndex: -1,
      selectedWinnerName: '',
      lastWinnerIndex: -1,
      message: '',
      showHistory: false,
      showAdmin: false,
      mySeatIndex: -1
    };
  },
  computed: {
    isMyTurn() {
        return this.inRoom && 
               this.roomData.status === 'PLAYING' && 
               this.roomData.currentActorIndex !== -1 && 
               this.roomData.currentActorIndex === this.mySeatIndex;
    },
    canStartGame() {
        if (!this.inRoom) return false;
        if (this.roomData.status === 'PLAYING') return false;
        if (this.amIHost) return true;
        return false;
    },
    amIHost() {
        if (this.mySeatIndex === -1) return false;
        const p = this.roomData.players[this.mySeatIndex];
        return p && p.isHost;
    },
    currentActorName() {
        if (this.roomData.currentActorIndex === -1) return '';
        const p = this.roomData.players[this.roomData.currentActorIndex];
        return p ? p.nickname : '';
    },
    myPlayer() {
        if (this.mySeatIndex === -1) return null;
        return this.roomData.players[this.mySeatIndex];
    },
    canCheck() {
        // 跟注额为0，或者自己已经下注等于当前最大注
        if (!this.myPlayer) return false;
        return (this.roomData.currentBet - this.myPlayer.bet) <= 0;
    },
    callAmount() {
        if (!this.myPlayer) return 0;
        return this.roomData.currentBet - this.myPlayer.bet;
    },
    minRaiseAmount() {
        return this.roomData.currentBet + this.roomData.minRaise;
    }
  },
  mounted() {
    // 自动填充默认值
    let defaultUrl = '';
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        // 如果是本地开发，通常后端在 3000
        defaultUrl = `${protocol}//${hostname}:3000`;
    }
    
    // 从本地存储读取上次信息
    const saved = uni.getStorageSync('poker_user_info');
    if (saved) {
        this.nickname = saved.nickname || '';
        this.roomId = saved.roomId || '';
        // 如果本地存储有值则使用，否则使用默认推导的
        this.serverUrl = saved.serverUrl || defaultUrl;
    } else {
        this.serverUrl = defaultUrl;
    }
    
    // 强制刷新一次，确保输入框显示
    if (!this.serverUrl) this.serverUrl = defaultUrl;
  },
  methods: {
    async connectSocket() {
      if (this.socket && this.socket.connected) return Promise.resolve();
      
      // 简单的地址校验
      if (!this.serverUrl) {
          this.showMessage('请输入服务器地址');
          return Promise.reject('No server URL');
      }
      
      // 格式化地址，确保有协议
      let url = this.serverUrl;
      if (!url.startsWith('http')) {
          url = 'http://' + url;
          this.serverUrl = url; // 回填
      }

      console.log('Connecting to:', url);
      this.showMessage('正在连接服务器...');
      
      return new Promise((resolve, reject) => {
          try {
              if (this.socket) {
                  this.socket.disconnect();
                  this.socket = null;
              }
              
              this.socket = io(url, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 3,
                timeout: 5000
              });

              // 设置连接超时
              const timer = setTimeout(() => {
                  if (this.socket && !this.socket.connected) {
                      this.showMessage('连接超时，请检查地址和网络');
                      reject('Timeout');
                  }
              }, 5000);

              this.socket.on('connect', () => {
                clearTimeout(timer);
                console.log('Connected to server');
                this.showMessage('已连接服务器');
                resolve();
              });
              
              this.socket.on('connect_error', (err) => {
                  console.error('Connect error:', err);
                  // 不要在连接错误时立即 reject，因为 socket.io 会重试
                  // 但可以给用户提示
                  // clearTimeout(timer);
                  // reject(err);
              });

              this.socket.on('updateRoom', (data) => {
        console.log('Room updated:', data);
        this.roomData = data;
        this.inRoom = true;
        
        // 找到自己的座位
        if (this.socket && this.socket.id) {
            // 注意：socket.id 可能会变，这里后端没有返回 socketId，
            // 更好的方式是后端在 player 对象里标记 isMe
            // 我们之前的实现没有返回 isMe，但是我们在前端可以通过遍历 players 找到自己
            // 因为我们存了 nickname。或者后端修改一下返回结构。
            // 刚才后端修改了 getRoomStateForPlayer，但前端没法直接拿到 socket.id 对比
            // 变通：后端返回的 players 数组里，hand 不为空的那个肯定是我自己（或者 Showdown）
            // 或者我们可以让后端返回 mySeatIndex
            // 暂时用 nickname 匹配（假设昵称唯一），或者修改后端返回 mySeatIndex
            
            // 简单方案：遍历 players，如果 nickname 匹配
            const myIdx = this.roomData.players.findIndex(p => p && p.nickname === this.nickname);
            if (myIdx !== -1) {
                this.mySeatIndex = myIdx;
            }
        }
      });

              this.socket.on('roomClosed', () => {
                  this.showMessage('房间已关闭');
                  // 强制退出房间状态
                  setTimeout(() => {
                      this.leaveRoom();
                  }, 1500);
              });

              this.socket.on('hostUpdated', (isHost) => {
                  // 可选：强制刷新一下本地状态，虽然 updateRoom 也会做
                  // 主要是为了触发 computed 属性的重新计算
                  if (this.mySeatIndex !== -1 && this.roomData.players[this.mySeatIndex]) {
                      this.roomData.players[this.mySeatIndex].isHost = isHost;
                  }
                  this.showMessage(isHost ? '您已成为房主' : '您已不再是房主');
              });

              this.socket.on('message', (msg) => {
                this.showMessage(msg);
              });

              this.socket.on('error', (err) => {
                this.showMessage('错误: ' + err);
              });
              
              this.socket.on('disconnect', () => {
                  // this.showMessage('已断开连接');
              });
          } catch (e) {
              reject(e);
          }
      });
    },
    
    saveInfo() {
        uni.setStorageSync('poker_user_info', {
            nickname: this.nickname,
            roomId: this.roomId,
            serverUrl: this.serverUrl
        });
    },

    async createRoom() {
      if (!this.nickname || !this.roomId) {
        this.showMessage('请输入昵称和房间号');
        return;
      }
      this.saveInfo();
      
      try {
          await this.connectSocket();
          // 连接成功后发送创建请求
          this.socket.emit('createRoom', { roomId: this.roomId, nickname: this.nickname }, (res) => {
            if (res.success) {
              // 创建成功后加入，不需要再次 connect
              this.socket.emit('joinRoom', { roomId: this.roomId, nickname: this.nickname });
            } else {
              this.showMessage(res.message);
            }
          });
      } catch (e) {
          console.error(e);
          this.showMessage('连接失败: ' + (e.message || e));
      }
    },

    async joinRoom() {
      if (!this.nickname || !this.roomId) {
        this.showMessage('请输入昵称和房间号');
        return;
      }
      this.saveInfo();
      
      try {
          await this.connectSocket();
          this.socket.emit('joinRoom', { roomId: this.roomId, nickname: this.nickname });
      } catch (e) {
          console.error(e);
          this.showMessage('连接失败: ' + (e.message || e));
      }
    },

    leaveRoom() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      this.inRoom = false;
      this.roomData = {
        id: '',
        players: new Array(9).fill(null),
        pot: 0,
        blind: { sb: 10, bb: 20 },
        history: [],
        communityCards: [],
        currentActorIndex: -1,
        currentBet: 0,
        minRaise: 0,
        phase: 'WAITING',
        status: 'WAITING'
      };
      this.mySeatIndex = -1;
    },

    handleSeatClick(index) {
      const player = this.roomData.players[index];
      if (!player) {
        // 空座位，坐下
        uni.showModal({
            title: '入座',
            content: `确定要坐在 ${index + 1} 号位吗？`,
            success: (res) => {
                if (res.confirm) {
                    this.socket.emit('sitDown', { 
                        roomId: this.roomId, 
                        seatIndex: index, 
                        nickname: this.nickname 
                    });
                }
            }
        });
      } else {
        // 有人
        if (this.amIHost) {
            this.showMessage('房主请使用上方管理按钮修改筹码');
        }
      }
    },

    startHand() {
      this.socket.emit('startHand', { roomId: this.roomId });
    },

    confirmSettle() {
      if (this.settleAmount <= 0) {
        this.showMessage('金额必须大于0');
        return;
      }
      this.socket.emit('settle', {
        roomId: this.roomId,
        winnerSeatIndex: this.selectedWinnerIndex,
        potAmount: this.settleAmount
      });
      this.lastWinnerIndex = this.selectedWinnerIndex;
      this.closeSettle();
    },

    closeSettle() {
      this.showSettleModal = false;
      this.settleAmount = 0;
      this.selectedWinnerIndex = -1;
    },

    showMessage(msg) {
      this.message = msg;
      setTimeout(() => {
        this.message = '';
      }, 3000);
    },
    
    formatCard(cardCode) {
        // 保留给历史记录或其他地方用，或者干脆删掉
        if (!cardCode) return '';
        return cardCode;
    },
    
    sendAction(action, amount) {
        this.socket.emit('action', {
            roomId: this.roomId,
            action: action,
            amount: amount
        });
    },

    handleGameAction(action, amount) {
        this.sendAction(action, amount);
    },
    
    handleUpdateBlind({ sb, bb }) {
        this.socket.emit('updateBlind', { roomId: this.roomId, sb, bb });
    },
    
    handleUpdateChips({ index, chips }) {
        this.socket.emit('updateChips', { roomId: this.roomId, targetSeatIndex: index, chips });
    },
    
    handleTransferHost(index) {
        this.socket.emit('transferHost', { roomId: this.roomId, targetSeatIndex: index });
    }
  }
};
</script>

<style>
.container {
  min-height: 100vh;
  background-color: #2E8B57;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

.lobby {
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 40px;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
}

.form-group {
  width: 100%;
  margin-bottom: 20px;
}

.form-group .label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  opacity: 0.8;
}

.form-group .input {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.9);
  color: #333;
  font-size: 16px;
  box-sizing: border-box;
  height: 48px; /* uni-app input 需要高度 */
}

.btn-group {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

button {
  flex: 1;
  /* padding: 12px; uni-app button 自带 padding */
  border-radius: 8px;
  /* border: none; uni-app button 自带 border 处理 */
  background: #FFD700;
  color: #333;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

button::after {
  border: none;
}

button:active {
  transform: translateY(1px);
}

.btn-secondary {
  background: #fff;
  color: #333;
}

.tips {
  margin-top: 30px;
  font-size: 12px;
  opacity: 0.6;
  text-align: center;
}

/* 游戏房间 */
.game-room {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,0.1);
}

.header-right {
    display: flex;
    gap: 10px;
}

.room-info, .blind-info {
  font-size: 14px;
}

.btn-leave, .btn-admin {
  /* padding: 4px 10px; uni-app mini button 不需要太多 padding */
  font-size: 12px;
  background: rgba(255,255,255,0.2);
  color: #fff;
  flex: none;
  width: auto;
  margin: 0;
  line-height: 2.3;
}

.btn-admin {
    background: #4682B4;
}

.poker-table {
  flex: 1;
  position: relative;
  margin: 20px;
  background: #35a165;
  border-radius: 100px; /* 椭圆 */
  border: 10px solid #5c3a21; /* 桌边 */
  box-shadow: inset 0 0 50px rgba(0,0,0,0.3);
}

.pot-area {
  position: absolute;
  top: 40%; /* 上移一点给公共牌留位置 */
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
}

.pot-label {
  font-size: 12px;
  opacity: 0.8;
  color: #FFD700;
}

.pot-amount {
  font-size: 24px;
  font-weight: bold;
  color: #FFD700;
}

.phase-label {
  font-size: 10px;
  background: rgba(0,0,0,0.3);
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
}

.community-cards {
    position: absolute;
    top: 55%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 5px;
    z-index: 10;
}

/* 9个座位的位置 (百分比定位) */
/* 椭圆桌子布局优化：避免重叠 */
/* 0: 正下方 (自己) */
.seat-0 { bottom: 2%; left: 50%; transform: translateX(-50%); }

/* 1: 左下方 */
.seat-1 { bottom: 15%; left: 15%; }

/* 2: 左侧中间 */
.seat-2 { top: 50%; left: 2%; transform: translateY(-50%); }

/* 3: 左上方 */
.seat-3 { top: 15%; left: 15%; }

/* 4: 正上方 */
.seat-4 { top: 2%; left: 50%; transform: translateX(-50%); }

/* 5: 右上方 */
.seat-5 { top: 15%; right: 15%; }

/* 6: 右侧中间 */
.seat-6 { top: 50%; right: 2%; transform: translateY(-50%); }

/* 7: 右下方 */
.seat-7 { bottom: 15%; right: 15%; }

/* 8: 稍微往中间挤一点，或者放在右侧偏下 */
/* 重新调整策略：9人桌是 4-1-4 或者 3-3-3 布局 */
/* 让我们尝试更分散的布局 */

/* 重新定义 */
.seat-0 { bottom: 2%; left: 50%; transform: translateX(-50%); } /* S */
.seat-1 { bottom: 12%; left: 22%; } /* SW */
.seat-2 { top: 50%; left: 2%; transform: translateY(-50%); } /* W */
.seat-3 { top: 12%; left: 22%; } /* NW */
.seat-4 { top: 2%; left: 50%; transform: translateX(-50%); } /* N */
.seat-5 { top: 12%; right: 22%; } /* NE */
.seat-6 { top: 50%; right: 2%; transform: translateY(-50%); } /* E */
.seat-7 { bottom: 12%; right: 22%; } /* SE */
.seat-8 { bottom: 12%; right: 5%; display: none; } /* 暂时隐藏第9个座位，或者重新设计 */

/* 8人桌布局可能更对称，如果是9人，第9人通常在 Dealer 旁边 */
/* 修正版 9人桌坐标 */
.seat-0 { bottom: 10px; left: 50%; transform: translateX(-50%); margin-bottom: 0; }
.seat-1 { bottom: 60px; left: 20px; }
.seat-2 { top: 50%; left: 5px; transform: translateY(-50%); }
.seat-3 { top: 60px; left: 20px; }
.seat-4 { top: 10px; left: 35%; }
.seat-5 { top: 10px; right: 35%; }
.seat-6 { top: 60px; right: 20px; }
.seat-7 { top: 50%; right: 5px; transform: translateY(-50%); }
.seat-8 { bottom: 60px; right: 20px; }
 

/* 优化扑克牌阴影 */
.poker-card-view {
    box-shadow: 2px 2px 5px rgba(0,0,0,0.4);
}

/* 优化座位高亮动画 */
.seat.current-actor {
    transform: scale(1.15);
    z-index: 30;
}
.seat.current-actor .avatar {
    box-shadow: 0 0 20px #00BFFF, 0 0 10px #fff;
    border-color: #00BFFF;
    transition: all 0.5s ease-in-out;
}

/* 赢家动画 */
.seat.winner .avatar {
    border-color: #FFD700;
    box-shadow: 0 0 25px #FFD700, 0 0 10px #fff;
    animation: pulse-winner 1s infinite;
}

@keyframes pulse-winner {
    0% { transform: scale(1); box-shadow: 0 0 25px #FFD700; }
    50% { transform: scale(1.1); box-shadow: 0 0 35px #FFD700; }
    100% { transform: scale(1); box-shadow: 0 0 25px #FFD700; }
}

/* 优化公共牌区域布局 */
.community-cards {
    top: 52%; /* 稍微上移 */
    gap: 8px; /* 增加间距 */
}

/* 优化底池显示 */
.pot-area {
    top: 38%;
}
.pot-amount {
    font-size: 28px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    color: #FFD700;
}

/* 优化操作栏 */
.game-controls {
    background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.6));
    border-top: 1px solid rgba(255,255,255,0.2);
    padding-bottom: 20px; /* 适配全面屏底部 */
}

.action-bar-container {
    position: relative;
    z-index: 100;
}

.action-bar {
  padding: 10px;
  background: rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 60px;
  justify-content: center;
}

.waiting-text {
    text-align: center;
    color: #fff;
    font-size: 14px;
    opacity: 0.8;
}

.btn-start {
  background: #FF4500;
  color: #fff;
  flex: 2;
}

.btn-history {
  background: #4682B4;
  color: #fff;
  flex: 1;
}

.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  color: #333;
  padding: 20px;
  border-radius: 10px;
  width: 80%;
  max-width: 300px;
}

.modal .modal-title {
  margin-top: 0;
  text-align: center;
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 15px;
}

.modal-btns {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn-cancel {
  background: #ccc;
}

.toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 10px 20px;
  border-radius: 5px;
  z-index: 200;
}

.history-list {
  list-style: none;
  padding: 0;
  height: 200px; /* scroll-view 需要固定高度 */
  overflow-y: auto;
}

.history-list .history-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.history-list .winner {
  font-weight: bold;
  color: #2E8B57;
}
.history-list .amount {
  color: #FF4500;
}
</style>
