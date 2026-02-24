<template>
  <view class="admin-panel" @click.stop>
    <view class="panel-header">
      <text class="panel-title">房主管理面板</text>
      <button class="btn-close" @click="$emit('close')">×</button>
    </view>
    
    <view class="panel-body">
      <!-- 盲注设置 -->
      <view class="section">
        <text class="section-title">盲注设置</text>
        <view class="blind-inputs">
          <view class="input-group">
            <text>小盲</text>
            <input type="number" v-model.number="sb" />
          </view>
          <view class="input-group">
            <text>大盲</text>
            <input type="number" v-model.number="bb" />
          </view>
          <button class="btn-save" @click="updateBlind">保存盲注</button>
        </view>
      </view>

      <!-- 玩家管理 -->
      <view class="section">
        <text class="section-title">玩家管理</text>
        <scroll-view scroll-y class="player-list">
          <view v-for="(p, index) in players" :key="index" class="player-item">
            <text class="p-name">
                {{ p ? p.nickname : `座位${index+1} (空)` }}
                <text v-if="p && p.isHost" class="host-tag">(房主)</text>
            </text>
            <template v-if="p">
              <input type="number" v-model.number="tempChips[index]" class="chip-input" />
              <button class="btn-update" @click="updateChips(index)">改筹码</button>
              <button class="btn-transfer" v-if="!p.isHost" @click="transferHost(index)">转让</button>
            </template>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'AdminPanel',
  props: {
    currentBlind: {
      type: Object,
      default: () => ({ sb: 10, bb: 20 })
    },
    players: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      sb: 10,
      bb: 20,
      tempChips: {} // 临时存储输入的筹码值
    };
  },
  watch: {
    currentBlind: {
      immediate: true,
      handler(val) {
        this.sb = val.sb;
        this.bb = val.bb;
      }
    },
    players: {
      immediate: true,
      handler(val) {
        // 初始化 tempChips
        val.forEach((p, i) => {
          if (p) {
            // 如果还没输入过，或者切换了玩家，重置为当前筹码
            if (this.tempChips[i] === undefined) {
                this.tempChips[i] = p.chips;
            }
          }
        });
      }
    }
  },
  methods: {
    updateBlind() {
      this.$emit('update-blind', { sb: this.sb, bb: this.bb });
    },
    updateChips(index) {
      const val = this.tempChips[index];
      if (val >= 0) {
        this.$emit('update-chips', { index, chips: val });
      }
    },
    transferHost(index) {
        uni.showModal({
            title: '转让房主',
            content: `确定要将房主权限转让给 ${this.players[index].nickname} 吗？`,
            success: (res) => {
                if (res.confirm) {
                    this.$emit('transfer-host', index);
                }
            }
        });
    }
  }
}
</script>

<style scoped>
/* ... (保留原有样式) */
.host-tag {
    color: #FFD700;
    font-size: 10px;
    margin-left: 4px;
}

.btn-transfer {
    background: #FF8C00;
    color: #fff;
    font-size: 10px;
    padding: 2px 8px;
    margin-left: 4px;
}

.admin-panel {
  width: 300px;
  background: #fff;
  border-radius: 10px;
  padding: 15px;
  color: #333;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.panel-title {
  font-weight: bold;
  font-size: 16px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #999;
  padding: 0 10px;
  line-height: 1;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
  display: block;
  color: #666;
}

.blind-inputs {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.input-group {
  flex: 1;
}

.input-group text {
  font-size: 12px;
  color: #999;
  display: block;
  margin-bottom: 4px;
}

.input-group input {
  width: 100%;
  border: 1px solid #ddd;
  padding: 5px;
  border-radius: 4px;
  font-size: 14px;
}

.btn-save {
  background: #2E8B57;
  color: #fff;
  font-size: 12px;
  padding: 6px 10px;
  height: 32px;
  line-height: 32px;
}

.player-list {
  max-height: 200px;
  border: 1px solid #eee;
  border-radius: 4px;
}

.player-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.p-name {
  flex: 1;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip-input {
  width: 60px;
  border: 1px solid #ddd;
  padding: 2px 5px;
  margin-right: 5px;
  font-size: 12px;
  text-align: center;
}

.btn-update {
  background: #4682B4;
  color: #fff;
  font-size: 10px;
  padding: 2px 8px;
}
</style>
