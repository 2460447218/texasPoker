const Hand = require('pokersolver').Hand;

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits = ['h', 'd', 'c', 's']; // hearts, diamonds, clubs, spades
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        
        for (let s of suits) {
            for (let r of ranks) {
                this.cards.push(r + s);
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        return this.cards.pop();
    }
}

class PokerGame {
    constructor(roomId) {
        this.roomId = roomId;
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.players = []; // 引用 Room 中的 players
        this.phase = 'WAITING'; // WAITING, PREFLOP, FLOP, TURN, RIVER, SHOWDOWN
        this.dealerIndex = 0;
        this.currentActorIndex = -1;
        this.currentBet = 0; // 当前轮次最大注额
        this.minRaise = 0; // 最小加注额
    }

    // 重置并开始新局
    startNewHand(players, dealerIndex, blind) {
        this.deck.reset();
        this.communityCards = [];
        this.pot = 0;
        this.players = players; // 更新玩家列表引用
        this.dealerIndex = dealerIndex;
        this.phase = 'PREFLOP';
        
        // 重置玩家状态
        this.players.forEach(p => {
            if (p) {
                // 如果之前是 SITTING_OUT，现在转正
                // 或者只要有筹码，都可以参加新的一局
                if (p.chips > 0) {
                    p.status = 'ACTIVE';
                    p.hand = [this.deck.deal(), this.deck.deal()];
                } else {
                    p.status = 'SITTING_OUT'; // 没筹码了
                    p.hand = null;
                }
                
                p.bet = 0; // 本轮下注
                p.totalBet = 0; // 本局总下注
                p.action = null; // 上一步动作
            }
        });

        // 盲注逻辑
        // Heads-up (2人): Dealer=SB, Other=BB
        // >2人: Dealer -> SB -> BB
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length < 2) return false;

        let sbIndex, bbIndex;
        // 找到 Dealer 在 activePlayers 中的相对位置
        const dealerPos = activePlayers.findIndex(p => p.seatIndex === this.dealerIndex);
        
        if (activePlayers.length === 2) {
            sbIndex = activePlayers[dealerPos].seatIndex;
            bbIndex = activePlayers[(dealerPos + 1) % activePlayers.length].seatIndex;
        } else {
            sbIndex = activePlayers[(dealerPos + 1) % activePlayers.length].seatIndex;
            bbIndex = activePlayers[(dealerPos + 2) % activePlayers.length].seatIndex;
        }

        // 扣除盲注
        this.placeBet(sbIndex, blind.sb);
        this.players[sbIndex].isSB = true;
        
        this.placeBet(bbIndex, blind.bb);
        this.players[bbIndex].isBB = true;

        this.currentBet = blind.bb;
        this.minRaise = blind.bb; // 初始最小加注为大盲

        // 行动权给 BB 的下一家 (UTG)
        let utgPos;
        if (activePlayers.length === 2) {
            utgPos = dealerPos; // Heads-up: Dealer (SB) acts first preflop
        } else {
            utgPos = (dealerPos + 3) % activePlayers.length;
        }
        this.currentActorIndex = activePlayers[utgPos].seatIndex;
        
        return true;
    }

    // 获取所有在座且未弃牌的玩家 (参与当前牌局的)
    // 必须排除 SITTING_OUT 的人 (中途加入的)
    getActivePlayers() {
        return this.players
            .map((p, i) => p ? { ...p, seatIndex: i } : null)
            .filter(p => p !== null && 
                         p.status !== 'FOLD' && 
                         p.status !== 'SITTING_OUT' &&
                         p.chips + p.bet + p.totalBet > 0); 
    }

    // 获取所有不仅Active而且没有Allin的玩家（可以继续行动的）
    getActionablePlayers() {
        return this.getActivePlayers().filter(p => p.status !== 'ALLIN');
    }

    // 玩家下注
    placeBet(seatIndex, amount) {
        const player = this.players[seatIndex];
        if (!player) return;

        const actualAmount = Math.min(player.chips, amount);
        player.chips -= actualAmount;
        player.bet += actualAmount;
        player.totalBet += actualAmount;
        this.pot += actualAmount;
        
        if (player.chips === 0) {
            player.status = 'ALLIN';
        }
    }

    // 玩家行动
    handleAction(seatIndex, action, amount = 0) {
        if (seatIndex !== this.currentActorIndex) return { success: false, message: 'Not your turn' };
        
        const player = this.players[seatIndex];
        const callAmount = this.currentBet - player.bet;

        switch (action) {
            case 'fold':
                player.status = 'FOLD';
                player.hand = null; // 弃牌不显示
                break;
            
            case 'check':
                if (callAmount > 0) return { success: false, message: 'Cannot check, must call ' + callAmount };
                player.action = 'check';
                break;
                
            case 'call':
                if (callAmount > player.chips) {
                     // 筹码不足，算 All-in
                     this.placeBet(seatIndex, player.chips);
                     player.action = 'allin';
                } else {
                    this.placeBet(seatIndex, callAmount);
                    player.action = 'call';
                }
                break;
                
            case 'raise':
                // amount 是加注到的总额 (Total Bet in this round)
                // 或者是 增量？通常前端传增量比较容易理解，或者传目标值。
                // 这里假设 amount 是 "加注到 X" (Raise To)
                if (amount < this.currentBet + this.minRaise && amount < player.chips + player.bet) {
                    return { success: false, message: 'Raise amount too small' };
                }
                
                const diff = amount - player.bet;
                if (diff > player.chips) return { success: false, message: 'Not enough chips' };
                
                // 计算实际加注增量（用于更新 minRaise）
                const raiseDiff = amount - this.currentBet;
                if (raiseDiff > 0) this.minRaise = raiseDiff;
                
                this.placeBet(seatIndex, diff);
                this.currentBet = amount;
                player.action = 'raise';
                break;
                
            case 'allin':
                const allinAmount = player.chips + player.bet;
                if (allinAmount > this.currentBet) {
                    const raiseDiff = allinAmount - this.currentBet;
                    if (raiseDiff > this.minRaise) this.minRaise = raiseDiff; // 只有超过最小加注额才更新？Full Raise规则比较复杂，这里简化
                    this.currentBet = allinAmount;
                }
                this.placeBet(seatIndex, player.chips);
                player.action = 'allin';
                break;
        }

        // 检查回合是否结束
        if (this.isRoundComplete()) {
            this.nextPhase();
        } else {
            this.nextActor();
        }

        return { success: true };
    }

    // 移动行动权到下一个人
    nextActor() {
        const activePlayers = this.getActivePlayers(); // 包含 Allin
        const actionablePlayers = this.getActionablePlayers(); // 不含 Allin

        if (actionablePlayers.length === 0) {
            // 没人能动了（都Allin或Fold），直接快进到结束
            this.runToShowdown();
            return;
        }

        // 找下一个
        // 简单遍历：从 currentActorIndex + 1 开始找，直到找到一个在 actionablePlayers 里的
        let idx = (this.currentActorIndex + 1) % 9;
        let count = 0;
        while (count < 9) {
            const p = this.players[idx];
            if (p && p.status === 'ACTIVE') {
                this.currentActorIndex = idx;
                return;
            }
            idx = (idx + 1) % 9;
            count++;
        }
    }

    // 检查本轮下注是否结束
    isRoundComplete() {
        const activePlayers = this.getActivePlayers();
        // 1. 只有一个人未Fold -> 赢了，直接结束
        const nonFoldPlayers = activePlayers.filter(p => p.status !== 'FOLD');
        if (nonFoldPlayers.length === 1) {
            this.phase = 'SHOWDOWN'; // 提前结束
            this.distributePot(nonFoldPlayers[0].seatIndex); // 唯一的赢家
            return true; // 特殊情况，外部需要处理
        }

        // 2. 所有 Active 玩家下注额一致（或者Allin）
        // 且所有 Active 玩家都已经表态过 (action != null，除非是 BB 在 Preflop check)
        
        // 过滤出需要行动的玩家（非Allin，非Fold）
        const actionable = this.getActionablePlayers();
        
        if (actionable.length === 0) return true; // 大家都Allin了

        // 检查是否所有可行动玩家的 bet 都等于 currentBet
        const allMatched = actionable.every(p => p.bet === this.currentBet);
        
        // 检查是否所有人都行动过 (防止新的一轮刚开始还没人动就判断结束)
        // 特殊情况：BB 在 Preflop 如果没人加注，可以选择 Check。
        const allActed = actionable.every(p => p.action !== null);

        // 如果是 Preflop，BB 还没有 Act (且 bet == currentBet)，不能结束
        if (this.phase === 'PREFLOP' && allMatched && !allActed) return false;

        return allMatched && allActed;
    }

    nextPhase() {
        // 重置本轮注额
        this.players.forEach(p => {
            if (p) {
                p.bet = 0; 
                p.action = null;
            }
        });
        this.currentBet = 0;
        this.minRaise = 20; // 应该重置为大盲，这里暂时写死或者从 config 取

        if (this.phase === 'PREFLOP') {
            this.phase = 'FLOP';
            this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
        } else if (this.phase === 'FLOP') {
            this.phase = 'TURN';
            this.communityCards.push(this.deck.deal());
        } else if (this.phase === 'TURN') {
            this.phase = 'RIVER';
            this.communityCards.push(this.deck.deal());
        } else if (this.phase === 'RIVER') {
            this.phase = 'SHOWDOWN';
            this.evaluateShowdown();
            return;
        }

        // 新的一轮，行动权从 SB 开始（Dealer 下一家）
        const active = this.getActionablePlayers();
        if (active.length === 0) {
             this.runToShowdown();
             return;
        }

        // 寻找第一个可行动玩家 (从 Dealer+1 开始搜)
        let idx = (this.dealerIndex + 1) % 9;
        let count = 0;
        while(count < 9) {
             const p = this.players[idx];
             if (p && p.status === 'ACTIVE') {
                 this.currentActorIndex = idx;
                 break;
             }
             idx = (idx + 1) % 9;
             count++;
        }
    }

    // 快进到摊牌（用于全员 Allin）
    runToShowdown() {
        while (this.communityCards.length < 5) {
            this.communityCards.push(this.deck.deal());
        }
        this.phase = 'SHOWDOWN';
        this.evaluateShowdown();
    }

    evaluateShowdown() {
        const activePlayers = this.getActivePlayers().filter(p => p.status !== 'FOLD');
        
        if (activePlayers.length === 0) return; // Should not happen
        if (activePlayers.length === 1) {
             // 只有一人（其他人Fold），不用比牌
             this.distributePot(activePlayers[0].seatIndex);
             return;
        }

        // 使用 pokersolver 计算
        const solvedHands = activePlayers.map(p => {
            const hand = Hand.solve([...this.communityCards, ...p.hand]);
            hand.seatIndex = p.seatIndex; // 绑回玩家
            return hand;
        });

        const winners = Hand.winners(solvedHands); // 返回赢家数组（可能有多个平分）
        
        // 简单分池：暂不支持复杂边池，直接平分
        const winAmount = Math.floor(this.pot / winners.length);
        
        // 构造结果对象返回给 Server 处理
        this.showdownResult = {
            winners: winners.map(w => ({
                seatIndex: w.seatIndex,
                amount: winAmount,
                handDescription: w.descr, // e.g. "Two Pair, A's & K's"
                cards: w.cardPool.map(c => c.toString()) // 最佳5张牌
            }))
        };
    }
    
    // 立即结算（用于只有一人未弃牌）
    distributePot(winnerSeatIndex) {
        this.showdownResult = {
            winners: [{
                seatIndex: winnerSeatIndex,
                amount: this.pot,
                handDescription: 'Opponents Folded',
                cards: []
            }]
        };
    }
}

module.exports = PokerGame;
