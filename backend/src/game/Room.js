import { MahjongGame } from './MahjongGame.js';
import { MatchSession } from './MatchSession.js';

export class Room {
  constructor(id, creatorId, options = {}) {
    this.id = id;
    this.creatorId = creatorId;
    this.players = [];
    this.state = 'waiting'; // waiting | playing | finished
    this.game = null;
    this.options = {
      totalRounds: options.totalRounds || 4,
      roomPassword: options.roomPassword || '8888'
    };
    this.matchSession = null;
    this.createdAt = Date.now();
  }

  addPlayer(player) {
    if (this.players.length >= 4) return false;
    if (this.players.some(p => p.id === player.id)) return false;
    this.players.push(player);
    return true;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return null;
    const removed = this.players.splice(index, 1)[0];

    // If room is in waiting state and creator left, reassign
    if (this.state === 'waiting' && this.creatorId === playerId && this.players.length > 0) {
      this.creatorId = this.players[0].id;
    }

    return removed;
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  getPlayerIndex(playerId) {
    return this.players.findIndex(p => p.id === playerId);
  }

  startGame() {
    if (this.players.length !== 4) return false;
    if (this.state === 'playing') return false;

    // Create match session on first game
    if (!this.matchSession) {
      this.matchSession = new MatchSession(this.players, this.options.totalRounds);
    }

    this.state = 'playing';
    this.game = new MahjongGame(this.players, this.matchSession.dealerIndex);
    return true;
  }

  endGame() {
    this.state = 'finished';
    if (this.game) {
      this.game.finished = true;
    }
  }

  isFull() {
    return this.players.length >= 4;
  }

  isEmpty() {
    return this.players.length === 0;
  }

  isCreator(playerId) {
    return this.creatorId === playerId;
  }

  getState() {
    return {
      id: this.id,
      creatorId: this.creatorId,
      players: this.players,
      state: this.state,
      playerCount: this.players.length,
      options: this.options,
      matchSession: this.matchSession ? this.matchSession.getState() : null
    };
  }
}
