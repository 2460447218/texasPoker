<template>
  <view 
    class="seat" 
    :class="{ 
      'active': player, 
      'current-actor': isCurrentActor,
      'folded': player && player.status === 'FOLD',
      'winner': isWinner
    }"
    @click="$emit('click')"
  >
    <template v-if="player">
      <view class="avatar">
        {{ player.nickname.slice(0, 1) }}
        <view v-if="player.isDealer" class="badge dealer">D</view>
        <view v-if="player.isSB" class="badge sb">SB</view>
        <view v-if="player.isBB" class="badge bb">BB</view>
      </view>
      
      <view class="player-info">
        <view class="name">{{ player.nickname }}</view>
        <view class="chips">{{ player.chips }}</view>
        <view v-if="player.bet > 0" class="bet-amount">下注: {{ player.bet }}</view>
        <view v-if="player.action" class="last-action">{{ player.action }}</view>
      </view>

      <!-- 手牌显示 (2张) -->
      <view class="hand-cards" v-if="player.hand && player.hand.length > 0">
        <PokerCard 
          v-for="(card, i) in player.hand" 
          :key="i" 
          :code="card" 
          size="small" 
          class="card-item"
          :style="{ transform: `rotate(${(i - 0.5) * 10}deg)` }"
        />
      </view>
    </template>
    
    <template v-else>
      <view class="empty-seat">+</view>
    </template>
  </view>
</template>

<script>
import PokerCard from './PokerCard.vue';

export default {
  name: 'PlayerSeat',
  components: { PokerCard },
  props: {
    player: {
      type: Object,
      default: null
    },
    isCurrentActor: {
      type: Boolean,
      default: false
    },
    isWinner: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
.seat {
  position: absolute;
  width: 60px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.seat.current-actor {
  transform: scale(1.1);
  z-index: 20;
}

.seat.current-actor .avatar {
  box-shadow: 0 0 15px #00BFFF;
  border-color: #00BFFF;
}

.seat.folded {
  opacity: 0.5;
}

.empty-seat {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px dashed rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: rgba(255,255,255,0.3);
}

.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #fff;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 20px;
  position: relative;
  border: 2px solid #fff;
}

.seat.winner .avatar {
  border-color: #FFD700;
  box-shadow: 0 0 15px #FFD700;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

.badge {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border: 1px solid #fff;
}

.badge.dealer {
  background: #fff;
  color: #000;
  top: -5px;
  right: -5px;
}

.badge.sb {
  background: #0000CD;
  bottom: -5px;
  left: -5px;
}

.badge.bb {
  background: #FF4500;
  bottom: -5px;
  right: -5px;
}

.player-info {
  margin-top: 5px;
  text-align: center;
  position: relative;
  width: 100%;
}

.name {
  font-size: 12px;
  max-width: 60px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chips {
  font-size: 12px;
  color: #FFD700;
  font-weight: bold;
}

.bet-amount {
  font-size: 10px;
  color: #FFD700;
  background: rgba(0,0,0,0.5);
  border-radius: 4px;
  padding: 2px;
  margin-top: 2px;
}

.last-action {
  position: absolute;
  top: -45px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255,255,255,0.9);
  color: #000;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 4px;
  white-space: nowrap;
  font-weight: bold;
  z-index: 25;
}

.hand-cards {
  position: absolute;
  top: -15px;
  right: -15px;
  display: flex;
}

.card-item {
  margin-left: -10px; /* Overlap cards */
  box-shadow: 1px 1px 2px rgba(0,0,0,0.5);
}

.card-item:first-child {
  margin-left: 0;
}
</style>
