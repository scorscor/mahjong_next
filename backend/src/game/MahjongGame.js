import { TileSet, isFlowerTile, FLOWER_OWNER, getNextTile } from './TileSet.js';
import { WinChecker } from './WinChecker.js';
import { calculateFan } from './Scorer.js';
import { 
  drawBirdTiles, 
  calculateBirdHits, 
  calculateBirdMultiplier,
  getBirdCount 
} from './AdvancedRules.js';

// Claim priority: win > kong > pong > chow
const CLAIM_PRIORITY = { win: 4, kong: 3, pong: 2, chow: 1 };

// Tile sort order: W(万) < T(条) < D(筒) < F(风) < J(箭), numeric within suit
const TILE_SORT_ORDER = { W: 0, T: 1, D: 2, F: 3, J: 4 };

export class MahjongGame {
  constructor(players, dealerIndex = 0, options = {}) {
    this.players = players.map(p => ({ id: p.id, name: p.name }));
    this.tileSet = new TileSet(options.useFlowers !== false);
    this.tileSet.shuffle();

    this.hands = this.tileSet.dealTiles();
    this.melds = [[], [], [], []]; // melds per player (pong, chow, etc.)
    this.flowerMelds = [[], [], [], []]; // flower tiles per player
    this.discardPile = [];
    this.dealerIndex = dealerIndex;
    this.currentPlayer = dealerIndex; // dealer goes first
    this.winner = null;
    this.finished = false;
    this.lastDiscard = null;
    this.lastDiscardPlayer = null;

    // Track each player's draw state
    this.hasDrawn = [false, false, false, false];

    // Claim lock state
    this.claimWindow = null;
    this.claimTimerId = null;

    // Seat winds (0=east, 1=south, 2=west, 3=north)
    this.seatWinds = [0, 1, 2, 3];

    // Wild card (laizi) - determined by flipping a tile
    this.wildCard = null;
    this.wildCardTile = null;
    if (options.useWild) {
      this._determineWildCard();
    }

    // Bird tiles (zhania) - drawn after win
    this.birdTiles = [];

    // Dealer draws first tile
    this._initialDraw();

    // Auto-replace flower tiles after initial deal
    this._replaceFlowers();
  }

  // Determine wild card by flipping a tile from the back
  _determineWildCard() {
    const flipped = this.tileSet.peekFromBack(0);
    if (flipped) {
      this.wildCardTile = flipped;
      // Wild card is the next tile in sequence
      this.wildCard = getNextTile(flipped);
    }
  }

  // Check and replace flower tiles
  _replaceFlowers() {
    let hasFlower = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (let p = 0; p < 4; p++) {
        const hand = this.hands[p];
        const flowers = [];

        // Find all flower tiles in hand
        for (let i = hand.length - 1; i >= 0; i--) {
          if (isFlowerTile(hand[i])) {
            flowers.push(hand.splice(i, 1)[0]);
          }
        }

        // Replace each flower with a tile from the back
        if (flowers.length > 0) {
          hasFlower = true;
          changed = true;
          this.flowerMelds[p].push(...flowers);

          for (let i = 0; i < flowers.length; i++) {
            const replacement = this.tileSet.drawOneFromBack();
            if (replacement) {
              hand.push(replacement);
            }
          }
        }
      }
    }

    return hasFlower;
  }

  _initialDraw() {
    const tile = this.tileSet.drawOne();
    if (tile) {
      this.hands[this.dealerIndex].push(tile);
      this.hasDrawn[this.dealerIndex] = true;
    }
  }

  drawTile(playerIndex) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (this.claimWindow && !this.claimWindow.resolved) {
      return { success: false, reason: 'CLAIM_IN_PROGRESS' };
    }
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (this.hasDrawn[playerIndex]) return { success: false, reason: 'ALREADY_DRAWN' };

    const tile = this.tileSet.drawOne();
    if (!tile) {
      this.finished = true;
      return { success: true, tile: null, drawGame: true };
    }

    this.hands[playerIndex].push(tile);
    this.hasDrawn[playerIndex] = true;
    this.lastDiscard = null;
    this.lastDiscardPlayer = null;

    // Check self-draw win
    const checker = new WinChecker();
    if (checker.checkWin(this.hands[playerIndex], this.wildCard)) {
      this.winner = playerIndex;
      this.finished = true;
      const fanResult = calculateFan(
        this.hands[playerIndex], this.melds[playerIndex], tile, true,
        this.flowerMelds[playerIndex], this.wildCard
      );
      
      // Draw bird tiles after self-draw win
      const birdCount = getBirdCount(fanResult, true);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }
      
      return { 
        success: true, 
        tile, 
        selfDrawWin: true, 
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
          playerIndex,
          true,
          null
        ).multiplier
      };
    }

    // Check tingpai (waiting tiles) for hint
    const waitingTiles = checker.getWinningTiles(this.hands[playerIndex]);

    return { success: true, tile, waitingTiles };
  }

  discardTile(playerIndex, tile) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (this.claimWindow && !this.claimWindow.resolved) {
      return { success: false, reason: 'CLAIM_IN_PROGRESS' };
    }

    const hand = this.hands[playerIndex];
    const index = hand.indexOf(tile);
    if (index === -1) return { success: false, reason: 'TILE_NOT_IN_HAND' };

    hand.splice(index, 1);
    this.discardPile.push(tile);
    this.lastDiscard = tile;
    this.lastDiscardPlayer = playerIndex;
    this.hasDrawn[playerIndex] = false;

    // Set next player (tentative - may change with claims)
    this.currentPlayer = (playerIndex + 1) % 4;

    // Open claim window
    const potentialClaims = this._getPotentialClaims(playerIndex, tile);

    if (potentialClaims.length > 0) {
      this.claimWindow = {
        discardTile: tile,
        excludePlayer: playerIndex,
        claims: new Map(),
        passes: new Set(),
        resolved: false,
        requiredResponders: new Set(potentialClaims.map(c => c.playerIndex))
      };
    }

    return {
      success: true,
      nextPlayer: this.currentPlayer,
      tilesLeft: this.tileSet.remaining,
      potentialClaims,
      claimTimerNeeded: potentialClaims.length > 0
    };
  }

  startClaimTimer(onTimeout) {
    this.clearClaimTimer();
    this.claimTimerId = setTimeout(() => {
      this.claimTimerId = null;
      onTimeout();
    }, 30000);
  }

  clearClaimTimer() {
    if (this.claimTimerId) {
      clearTimeout(this.claimTimerId);
      this.claimTimerId = null;
    }
  }

  // Get what claims are possible (sent to clients so they know their options)
  _getPotentialClaims(excludePlayerIndex, tile) {
    const checker = new WinChecker();
    const claims = [];

    for (let i = 0; i < 4; i++) {
      if (i === excludePlayerIndex) continue;

      // Win (ron)
      const testHand = [...this.hands[i], tile];
      if (checker.checkWin(testHand)) {
        claims.push({ playerIndex: i, type: 'win' });
      }

      // Pong
      const count = this.hands[i].filter(t => t === tile).length;
      if (count >= 3) {
        claims.push({ playerIndex: i, type: 'kong' });
      } else if (count >= 2) {
        claims.push({ playerIndex: i, type: 'pong' });
      }

      // Chow - only for next player
      const nextPlayer = (excludePlayerIndex + 1) % 4;
      if (i === nextPlayer) {
        const chowOptions = checker.getChowOptions(this.hands[i], tile);
        if (chowOptions.length > 0) {
          claims.push({ playerIndex: i, type: 'chow', chowOptions });
        }
      }
    }

    // Sort by priority
    claims.sort((a, b) => CLAIM_PRIORITY[b.type] - CLAIM_PRIORITY[a.type]);
    return claims;
  }

  // Player declares a claim
  declareClaim(playerIndex, claimType, chowTiles) {
    if (!this.claimWindow || this.claimWindow.resolved) {
      return { success: false, reason: 'NO_CLAIM_WINDOW' };
    }
    if (this.claimWindow.excludePlayer === playerIndex) {
      return { success: false, reason: 'CANNOT_CLOWN_OWN_DISCARD' };
    }

    // Record the claim
    this.claimWindow.claims.set(playerIndex, { type: claimType, chowTiles: chowTiles || null });

    // Try to resolve immediately
    return this._tryResolveClaims();
  }

  // Player passes on claiming
  passClaim(playerIndex) {
    if (!this.claimWindow || this.claimWindow.resolved) {
      return { success: false, reason: 'NO_CLAIM_WINDOW' };
    }

    this.claimWindow.passes.add(playerIndex);

    // Try to resolve
    return this._tryResolveClaims();
  }

  _forcePassAll() {
    if (!this.claimWindow || this.claimWindow.resolved) return null;
    for (const idx of this.claimWindow.requiredResponders) {
      if (!this.claimWindow.claims.has(idx)) {
        this.claimWindow.passes.add(idx);
      }
    }
    return this._tryResolveClaims();
  }

  _tryResolveClaims() {
    const cw = this.claimWindow;
    if (!cw) return { success: false, reason: 'NO_CLAIM_WINDOW' };

    // Check if all required responders have responded
    const allResponded = [...cw.requiredResponders].every(
      idx => cw.claims.has(idx) || cw.passes.has(idx)
    );

    if (!allResponded) {
      return { success: false, reason: 'WAITING_FOR_RESPONSES', claimWindow: this._getClaimWindowStatus() };
    }

    // Resolve: find highest priority claim
    let bestClaim = null;
    let bestPriority = -1;

    for (const [playerIndex, claim] of cw.claims) {
      const priority = CLAIM_PRIORITY[claim.type] || 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestClaim = { playerIndex, ...claim };
      }
    }

    if (!bestClaim) {
      // Everyone passed - proceed with normal flow
      cw.resolved = true;
      this.claimWindow = null;
      return { success: true, resolved: 'pass', nextPlayer: this.currentPlayer };
    }

    // Apply the winning claim
    cw.resolved = true;
    return this._applyResolvedClaim(bestClaim);
  }

  _applyResolvedClaim(claim) {
    const tile = this.lastDiscard;

    if (claim.type === 'win') {
      this.hands[claim.playerIndex].push(tile);
      this.winner = claim.playerIndex;
      this.finished = true;
      this.discardPile.pop();

      const fanResult = calculateFan(
        this.hands[claim.playerIndex], this.melds[claim.playerIndex], tile, false,
        this.flowerMelds[claim.playerIndex], this.wildCard
      );

      // Draw bird tiles after win
      const birdCount = getBirdCount(fanResult, false);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }

      this.claimWindow = null;
      return { 
        success: true, 
        resolved: 'win', 
        winner: claim.playerIndex, 
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, false),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, false),
          claim.playerIndex,
          false,
          this.lastDiscardPlayer
        ).multiplier
      };
    }

    if (claim.type === 'kong') {
      // Exposed kong: 3 from hand + 1 discarded tile = meld of 4
      let removed = 0;
      this.hands[claim.playerIndex] = this.hands[claim.playerIndex].filter(t => {
        if (t === tile && removed < 3) { removed++; return false; }
        return true;
      });
      this.melds[claim.playerIndex].push([tile, tile, tile, tile]);
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.lastDiscard = null;
      this.claimWindow = null;

      // Draw a replacement tile from the back of the wall
      const replacement = this.tileSet.drawOne();
      if (!replacement) {
        this.finished = true;
        return { success: true, resolved: 'kong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex, drawGame: true };
      }
      this.hands[claim.playerIndex].push(replacement);
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true;

      // Check self-draw win with replacement tile
      const kongChecker = new WinChecker();
      if (kongChecker.checkWin(this.hands[claim.playerIndex], this.wildCard)) {
        this.winner = claim.playerIndex;
        this.finished = true;
        const fanResult = calculateFan(
          this.hands[claim.playerIndex], this.melds[claim.playerIndex], replacement, true,
          this.flowerMelds[claim.playerIndex], this.wildCard
        );
        
        // Draw bird tiles after kong self-draw
        const birdCount = getBirdCount(fanResult, true);
        if (birdCount > 0) {
          this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
        }
        
        return { 
          success: true, 
          resolved: 'win', 
          winner: claim.playerIndex, 
          fan: fanResult, 
          selfDraw: true,
          birdTiles: this.birdTiles,
          birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, true),
          birdMultiplier: calculateBirdMultiplier(
            calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, true),
            claim.playerIndex,
            true,
            null
          ).multiplier
        };
      }

      return { success: true, resolved: 'kong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    if (claim.type === 'pong') {
      let removed = 0;
      this.hands[claim.playerIndex] = this.hands[claim.playerIndex].filter(t => {
        if (t === tile && removed < 2) { removed++; return false; }
        return true;
      });
      this.melds[claim.playerIndex].push([tile, tile, tile]);
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true; // must discard immediately
      this.lastDiscard = null;
      this.claimWindow = null;
      return { success: true, resolved: 'pong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    if (claim.type === 'chow') {
      const chowTiles = claim.chowTiles || [];
      // Remove the two companion tiles from hand
      for (const ct of chowTiles) {
        const idx = this.hands[claim.playerIndex].indexOf(ct);
        if (idx !== -1) this.hands[claim.playerIndex].splice(idx, 1);
      }
      this.melds[claim.playerIndex].push([...chowTiles, tile].sort());
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true; // must discard immediately
      this.lastDiscard = null;
      this.claimWindow = null;
      return { success: true, resolved: 'chow', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    this.claimWindow = null;
    return { success: false };
  }

  // Concealed kong (暗杠): on your turn after drawing, you have 4 of the same tile
  selfKong(playerIndex, tile) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (!this.hasDrawn[playerIndex]) return { success: false, reason: 'MUST_DRAW_FIRST' };

    // Check player has 4 of this tile in hand
    const count = this.hands[playerIndex].filter(t => t === tile).length;
    if (count < 4) return { success: false, reason: 'NEED_FOUR_TILES' };

    // Remove all 4 from hand
    this.hands[playerIndex] = this.hands[playerIndex].filter(t => t !== tile);
    this.melds[playerIndex].push([tile, tile, tile, tile]);

    // Draw a replacement tile
    const replacement = this.tileSet.drawOne();
    if (!replacement) {
      this.finished = true;
      return { success: true, drawGame: true };
    }

    this.hands[playerIndex].push(replacement);
    this.hasDrawn[playerIndex] = true; // still can discard

    // Check self-draw win with replacement tile
    const checker = new WinChecker();
    if (checker.checkWin(this.hands[playerIndex], this.wildCard)) {
      this.winner = playerIndex;
      this.finished = true;
      const fanResult = calculateFan(
        this.hands[playerIndex], this.melds[playerIndex], replacement, true,
        this.flowerMelds[playerIndex], this.wildCard
      );
      
      // Draw bird tiles
      const birdCount = getBirdCount(fanResult, true);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }
      
      return { 
        success: true, 
        selfDrawWin: true, 
        tile: replacement, 
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
          playerIndex,
          true,
          null
        ).multiplier
      };
    }

    return { success: true, tile: replacement };
  }

  // Check which tiles in player's hand can be used for concealed kong
  getSelfKongTiles(playerIndex) {
    const counts = {};
    for (const t of this.hands[playerIndex]) {
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.keys(counts).filter(t => counts[t] === 4);
  }

  // Legacy compatibility - keep for old handler paths
  checkClaims(excludePlayerIndex) {
    if (!this.lastDiscard) return [];
    return this._getPotentialClaims(excludePlayerIndex, this.lastDiscard);
  }

  applyClaim(playerIndex, claimType) {
    if (!this.lastDiscard) return { success: false };
    return this._applyResolvedClaim({ playerIndex, type: claimType });
  }

  _getClaimWindowStatus() {
    const cw = this.claimWindow;
    return {
      discardTile: cw.discardTile,
      excludePlayer: cw.excludePlayer,
      responded: [...cw.claims.keys(), ...cw.passes],
      waitingFor: [...cw.requiredResponders].filter(
        idx => !cw.claims.has(idx) && !cw.passes.has(idx)
      )
    };
  }

  // Get tingpai (waiting tiles) hint for a player
  getTingpaiHint(playerIndex) {
    const checker = new WinChecker();
    return checker.getWinningTiles(this.hands[playerIndex]);
  }

  // Get tingpai with fan preview for each waiting tile
  getTingpaiWithFan(playerIndex) {
    const checker = new WinChecker();
    const waitingTiles = checker.getWinningTiles(this.hands[playerIndex]);

    return waitingTiles.map(tile => {
      const testHand = [...this.hands[playerIndex], tile];
      const fanResult = calculateFan(
        testHand, this.melds[playerIndex], tile, true,
        this.flowerMelds[playerIndex], this.wildCard
      );

      // Estimate remaining count (4 per tile minus what's visible)
      const counts = {};
      for (const t of [...this.hands[playerIndex], ...this.discardPile]) {
        counts[t] = (counts[t] || 0) + 1;
      }
      for (const meld of this.melds.flat()) {
        for (const t of meld) counts[t] = (counts[t] || 0) + 1;
      }
      for (let i = 0; i < 4; i++) {
        if (i !== playerIndex) {
          for (const t of this.hands[i]) counts[t] = (counts[t] || 0) + 1;
        }
      }
      const remaining = 4 - (counts[tile] || 0);

      return {
        tile,
        remaining,
        fan: fanResult.fan,
        patterns: fanResult.patterns
      };
    });
  }

  // Sort a hand in standard order: 万 < 条 < 筒 < 风 < 箭, numeric within suit
  sortHand(hand) {
    return [...hand].sort((a, b) => {
      const orderA = TILE_SORT_ORDER[a[0]] ?? 9;
      const orderB = TILE_SORT_ORDER[b[0]] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      const numA = parseInt(a.slice(1), 10);
      const numB = parseInt(b.slice(1), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }

  getStateForPlayer(playerIndex) {
    const otherHands = this.hands.map((hand, i) => {
      if (i === playerIndex) return hand;
      return hand.length;
    });

    const otherMelds = this.melds.map((m, i) => {
      if (i === playerIndex) return [];
      return m;
    });

    const state = {
      myHand: this.hands[playerIndex],
      myMelds: this.melds[playerIndex],
      otherMelds,
      otherHands,
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      hasDrawn: this.hasDrawn[playerIndex],
      winner: this.winner,
      finished: this.finished,
      tilesLeft: this.tileSet.remaining,
      lastDiscard: this.lastDiscard,
      players: this.players,
      claimWindow: this.claimWindow && !this.claimWindow.resolved
        ? this._getClaimWindowStatus()
        : null,
      dealerIndex: this.dealerIndex
    };

    // Include tingpai hint if player has 13 tiles (before draw) or after discard
    if (this.hands[playerIndex].length === 13 && !this.finished) {
      state.tingpaiTiles = this.getTingpaiHint(playerIndex);
    }

    return state;
  }

  getFullState() {
    return {
      hands: this.hands,
      melds: this.melds,
      flowerMelds: this.flowerMelds,
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      winner: this.winner,
      finished: this.finished,
      tilesLeft: this.tileSet.remaining,
      players: this.players,
      claimWindow: this.claimWindow ? this._getClaimWindowStatus() : null,
      wildCard: this.wildCard,
      wildCardTile: this.wildCardTile,
      birdTiles: this.birdTiles,
      dealerIndex: this.dealerIndex
    };
  }
}
