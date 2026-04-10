export class WinChecker {
  checkWin(hand, wildCard = null) {
    if (!hand || hand.length !== 14) return false;

    // If wild card is specified, use wild-aware win checking
    if (wildCard) {
      return this.checkWinWithWild(hand, wildCard);
    }

    if (this.checkSevenPairs(hand)) return true;

    return this.checkStandard(hand);
  }

  // Win checking with wild card (laizi)
  checkWinWithWild(hand, wildCard) {
    if (!hand || hand.length !== 14) return false;

    // Count wild cards in hand
    let wildCount = 0;
    const nonWildHand = [];
    
    for (const tile of hand) {
      if (tile === wildCard) {
        wildCount++;
      } else {
        nonWildHand.push(tile);
      }
    }

    // Try all possible uses of wild cards
    return this._tryWildCombinations(nonWildHand, wildCount, wildCard);
  }

  // Try all combinations of wild card usage
  _tryWildCombinations(hand, wildCount, wildCard) {
    // Base case: no wild cards left, check if hand wins
    if (wildCount === 0) {
      if (this.checkSevenPairs(hand)) return true;
      return this.checkStandard(hand);
    }

    // Try using wild as each possible tile
    const allTiles = this._getAllPossibleTiles();
    
    for (const tile of allTiles) {
      const testHand = [...hand, tile];
      if (this._tryWildCombinations(testHand, wildCount - 1, wildCard)) {
        return true;
      }
    }

    return false;
  }

  _getAllPossibleTiles() {
    const tiles = [];
    for (let i = 1; i <= 9; i++) {
      tiles.push(`W${i}`, `T${i}`, `D${i}`);
    }
    tiles.push('FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW');
    return tiles;
  }

  checkStandard(hand) {
    const counts = this._countTiles(hand);

    for (const tile in counts) {
      if (counts[tile] >= 2) {
        counts[tile] -= 2;
        if (this._checkRemaining(counts)) {
          return true;
        }
        counts[tile] += 2;
      }
    }
    return false;
  }

  _checkRemaining(counts) {
    const firstTile = Object.keys(counts).find(t => counts[t] > 0);
    if (!firstTile) return true;

    // Try pong (three of a kind)
    if (counts[firstTile] >= 3) {
      counts[firstTile] -= 3;
      if (this._checkRemaining(counts)) return true;
      counts[firstTile] += 3;
    }

    // Try chow (sequence) - only for number tiles
    if (this._isNumberTile(firstTile)) {
      const prefix = firstTile[0];
      const num = parseInt(firstTile.slice(1), 10);
      const next1 = `${prefix}${num + 1}`;
      const next2 = `${prefix}${num + 2}`;

      if (counts[next1] > 0 && counts[next2] > 0) {
        counts[firstTile] -= 1;
        counts[next1] -= 1;
        counts[next2] -= 1;
        if (this._checkRemaining(counts)) return true;
        counts[firstTile] += 1;
        counts[next1] += 1;
        counts[next2] += 1;
      }
    }

    return false;
  }

  checkSevenPairs(hand) {
    const counts = this._countTiles(hand);
    const values = Object.values(counts);
    return values.length === 7 && values.every(c => c === 2);
  }

  _countTiles(hand) {
    const counts = {};
    for (const tile of hand) {
      counts[tile] = (counts[tile] || 0) + 1;
    }
    return counts;
  }

  _isNumberTile(tile) {
    const prefix = tile[0];
    return prefix === 'W' || prefix === 'T' || prefix === 'D';
  }

  // Check if a player can win by drawing a specific tile (tingpai check)
  getWinningTiles(hand) {
    if (hand.length !== 13) return [];
    const winning = [];

    const allTiles = [];
    for (let i = 1; i <= 9; i++) {
      allTiles.push(`W${i}`, `T${i}`, `D${i}`);
    }
    allTiles.push('FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW');

    for (const tile of allTiles) {
      const testHand = [...hand, tile];
      if (this.checkWin(testHand)) {
        winning.push(tile);
      }
    }

    return winning;
  }

  // Extract sets from a winning hand (14 tiles)
  _extractSets(hand) {
    const counts = this._countTiles(hand);

    // Find pair first
    for (const pairTile in counts) {
      if (counts[pairTile] >= 2) {
        counts[pairTile] -= 2;
        const sets = [];
        if (this._extractSetsRecursive(counts, sets)) {
          return sets;
        }
        counts[pairTile] += 2;
      }
    }
    return [];
  }

  _extractSetsRecursive(counts, sets) {
    const firstTile = Object.keys(counts).find(t => counts[t] > 0);
    if (!firstTile) return true;

    // Try pong
    if (counts[firstTile] >= 3) {
      counts[firstTile] -= 3;
      sets.push([firstTile, firstTile, firstTile]);
      if (this._extractSetsRecursive(counts, sets)) return true;
      sets.pop();
      counts[firstTile] += 3;
    }

    // Try chow
    if (this._isNumberTile(firstTile)) {
      const prefix = firstTile[0];
      const num = parseInt(firstTile.slice(1), 10);
      const next1 = `${prefix}${num + 1}`;
      const next2 = `${prefix}${num + 2}`;

      if (counts[next1] > 0 && counts[next2] > 0) {
        counts[firstTile] -= 1;
        counts[next1] -= 1;
        counts[next2] -= 1;
        sets.push([firstTile, next1, next2]);
        if (this._extractSetsRecursive(counts, sets)) return true;
        sets.pop();
        counts[firstTile] += 1;
        counts[next1] += 1;
        counts[next2] += 1;
      }
    }

    return false;
  }

  _isHonorTile(tile) {
    return tile[0] === 'F' || tile[0] === 'J';
  }

  _checkFlush(hand, melds) {
    const allTiles = [...hand];
    for (const meld of melds) {
      allTiles.push(...meld);
    }

    const suits = new Set();
    const honors = new Set();
    for (const tile of allTiles) {
      if (['W', 'T', 'D'].includes(tile[0])) {
        suits.add(tile[0]);
      } else {
        honors.add(tile[0]);
      }
    }

    if (suits.size === 1 && honors.size === 0) return 'full';
    if (suits.size === 1 && honors.size > 0) return 'half';
    return 'none';
  }

  _tileDisplayName(tile) {
    const prefix = tile[0];
    const numMap = ['一','二','三','四','五','六','七','八','九'];
    const suitNames = { W: '万', T: '条', D: '筒' };
    const windNames = { E: '东', S: '南', W: '西', N: '北' };
    const dragonNames = { C: '中', F: '發', W: '白' };

    if (prefix === 'F') return windNames[tile.slice(1)] || tile;
    if (prefix === 'J') return dragonNames[tile.slice(1)] || tile;
    const num = parseInt(tile.slice(1), 10);
    return `${numMap[num - 1]}${suitNames[prefix]}`;
  }

  // Get possible chow combinations for a given tile in a hand
  // Returns array of [tile1, tile2] pairs that complete a sequence with the discarded tile
  getChowOptions(hand, discardedTile) {
    const prefix = discardedTile[0];
    if (!['W', 'T', 'D'].includes(prefix)) return [];

    const num = parseInt(discardedTile.slice(1), 10);
    const counts = {};
    for (const t of hand) {
      if (t[0] === prefix) {
        const n = parseInt(t.slice(1), 10);
        counts[n] = (counts[n] || 0) + 1;
      }
    }

    const options = [];

    // Discarded tile is the low: need num+1, num+2
    if (num + 1 <= 9 && num + 2 <= 9 && counts[num + 1] && counts[num + 2]) {
      options.push({
        tiles: [discardedTile, `${prefix}${num + 1}`, `${prefix}${num + 2}`],
        missing: [`${prefix}${num + 1}`, `${prefix}${num + 2}`]
      });
    }

    // Discarded tile is the middle: need num-1, num+1
    if (num - 1 >= 1 && num + 1 <= 9 && counts[num - 1] && counts[num + 1]) {
      options.push({
        tiles: [`${prefix}${num - 1}`, discardedTile, `${prefix}${num + 1}`],
        missing: [`${prefix}${num - 1}`, `${prefix}${num + 1}`]
      });
    }

    // Discarded tile is the high: need num-2, num-1
    if (num - 2 >= 1 && num - 1 >= 1 && counts[num - 2] && counts[num - 1]) {
      options.push({
        tiles: [`${prefix}${num - 2}`, `${prefix}${num - 1}`, discardedTile],
        missing: [`${prefix}${num - 2}`, `${prefix}${num - 1}`]
      });
    }

    return options;
  }
}
