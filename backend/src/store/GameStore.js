import { Room } from '../game/Room.js';
import { randomBytes } from 'crypto';

export class GameStore {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // socketId -> roomId
  }

  createRoom(creatorId, options = {}) {
    const roomId = this._generateRoomId();
    const room = new Room(roomId, creatorId, options);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomByPlayer(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, player, roomPassword = '8888') {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: 'ROOM_NOT_FOUND' };
    if (room.isFull()) return { success: false, reason: 'ROOM_FULL' };
    if (room.state === 'playing') return { success: false, reason: 'GAME_IN_PROGRESS' };
    if ((room.options.roomPassword || '8888') !== (roomPassword || '8888')) {
      return { success: false, reason: 'INVALID_ROOM_PASSWORD' };
    }

    if (!room.addPlayer(player)) {
      return { success: false, reason: 'ALREADY_JOINED' };
    }

    this.playerRooms.set(player.id, roomId);
    return { success: true, room };
  }

  leaveRoom(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      return null;
    }

    const removedPlayer = room.removePlayer(socketId);
    this.playerRooms.delete(socketId);

    if (room.isEmpty()) {
      this.rooms.delete(roomId);
    }

    return { room, removedPlayer };
  }

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      id += chars[bytes[i] % chars.length];
    }

    // Ensure uniqueness
    if (this.rooms.has(id)) {
      return this._generateRoomId();
    }
    return id;
  }

  getRoomCount() {
    return this.rooms.size;
  }
}

export const gameStore = new GameStore();
