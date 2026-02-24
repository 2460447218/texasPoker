<template>
  <view class="game-controls">
    <view class="my-action-panel">
      <button @click="$emit('action', 'fold')" class="btn-action btn-fold">弃牌</button>
      
      <button 
        @click="$emit('action', 'check')" 
        class="btn-action btn-check" 
        v-if="canCheck"
      >
        过牌
      </button>
      
      <button 
        @click="$emit('action', 'call')" 
        class="btn-action btn-call" 
        v-else
      >
        跟注 {{ callAmount }}
      </button>
      
      <view class="raise-group">
        <button 
          @click="$emit('action', 'raise', minRaiseAmount)" 
          class="btn-action btn-raise"
        >
          加注 {{ minRaiseAmount }}
        </button>
        <button 
          @click="$emit('action', 'allin')" 
          class="btn-action btn-allin"
        >
          All-in
        </button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'GameControls',
  props: {
    canCheck: {
      type: Boolean,
      default: false
    },
    callAmount: {
      type: Number,
      default: 0
    },
    minRaiseAmount: {
      type: Number,
      default: 0
    }
  }
}
</script>

<style scoped>
.game-controls {
  padding: 10px;
  background: rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 60px;
  justify-content: center;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.my-action-panel {
  display: flex;
  gap: 8px;
  width: 100%;
}

.btn-action {
  padding: 0;
  font-size: 14px;
  height: 44px;
  line-height: 44px;
  border-radius: 6px;
  font-weight: bold;
}

.btn-action::after {
  border: none;
}

.btn-fold { background: #A52A2A; color: #fff; flex: 1; }
.btn-check { background: #4682B4; color: #fff; flex: 1; }
.btn-call { background: #4682B4; color: #fff; flex: 1; }

.raise-group {
  flex: 2;
  display: flex;
  gap: 5px;
}
.btn-raise { background: #FF8C00; color: #fff; flex: 2; font-size: 12px; }
.btn-allin { background: #FF0000; color: #fff; flex: 1; font-size: 12px; }
</style>
