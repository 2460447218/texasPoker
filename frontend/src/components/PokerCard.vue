<template>
  <view class="poker-card-view" :class="[suitClass, size]">
    <text class="rank">{{ rank }}</text>
    <text class="suit">{{ suitSymbol }}</text>
  </view>
</template>

<script>
export default {
  name: 'PokerCard',
  props: {
    code: {
      type: String,
      default: '' // e.g. 'Ah', 'Td', '2c'
    },
    size: {
      type: String,
      default: 'normal' // 'small', 'normal', 'large'
    }
  },
  computed: {
    rank() {
      if (!this.code) return '';
      return this.code.slice(0, -1);
    },
    suit() {
      if (!this.code) return '';
      return this.code.slice(-1);
    },
    suitClass() {
      switch(this.suit) {
        case 'h': return 'heart';
        case 'd': return 'diamond';
        case 'c': return 'club';
        case 's': return 'spade';
        default: return '';
      }
    },
    suitSymbol() {
      switch(this.suit) {
        case 'h': return '♥';
        case 'd': return '♦';
        case 'c': return '♣';
        case 's': return '♠';
        default: return '';
      }
    }
  }
}
</script>

<style scoped>
.poker-card-view {
  background-color: #fff;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 1px 1px 3px rgba(0,0,0,0.2);
  position: relative;
  box-sizing: border-box;
  user-select: none;
}

/* Sizes */
.small {
  width: 26px;
  height: 38px;
  font-size: 10px;
  border-radius: 2px;
}

.normal {
  width: 36px;
  height: 52px;
  font-size: 14px;
  border-radius: 4px;
}

.large {
  width: 50px;
  height: 72px;
  font-size: 20px;
  border-radius: 6px;
}

/* Colors */
.heart, .diamond {
  color: #d00;
}

.club, .spade {
  color: #000;
}

.rank {
  font-weight: bold;
  line-height: 1;
}

.suit {
  margin-top: 2px;
  line-height: 1;
}
</style>
