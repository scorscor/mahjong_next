import { gameStore } from '../store/GameStore.js';
import { MahjongGame } from '../game/MahjongGame.js';

const QUICK_PHRASES = [
  '等等我', '打快一点', '不好意思', '厉害',
  '再来一局', '好牌', '太慢了', '加油'
];

const ALLOWED_EMOJIS = ['😀', '😤', '🎉', '👍', '😮', '💪'];

// Helper: build game_over payload with match session data and advanced rules
function buildGameOverPayload(room, winner, isSelfDraw, isDrawGame, fan) {
  const payload = {
    winner,
    selfDraw: isSelfDraw || false,
    drawGame: isDrawGame || false,
    fan,
    fullState: room.game.getFullState()
  };

  // Record in match session with bird multiplier
  if (room.matchSession) {
    const birdHits = room.game.birdHits || [];
    const birdMultiplier = room.game.birdMultiplier || 1;
    
    room.matchSession.recordRound(
      winner,
      fan,
      isDrawGame || false,
      isSelfDraw || false,
      null, // loserIndex not tracked in claim-based wins
      birdHits,
      birdMultiplier
    );
    room.matchSession.advanceDealer(winner);
    payload.matchSession = room.matchSession.getState();
  }

  return payload;
}

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // --- Room Management ---

    socket.on('create_room', (data) => {
      const existing = gameStore.leaveRoom(socket.id);
      if (existing && existing.room) {
        socket.leave(existing.room.id);
        io.to(existing.room.id).emit('player_left', {
          players: existing.room.players,
          playerId: socket.id
        });
      }

      const options = { totalRounds: data.totalRounds || 4 };
      const room = gameStore.createRoom(socket.id, options);
      const result = gameStore.joinRoom(room.id, { id: socket.id, name: data.name || 'Player' });

      if (result.success) {
        socket.join(room.id);
        socket.emit('room_created', {
          roomId: room.id,
          players: room.players,
          isCreator: true,
          options: room.options
        });
        console.log(`Room created: ${room.id} by ${socket.id}`);
      }
    });

    socket.on('join_room', ({ roomId, name }) => {
      if (!roomId) {
        socket.emit('error', { message: 'Room ID is required' });
        return;
      }

      const formattedId = roomId.toUpperCase().trim();
      const result = gameStore.joinRoom(formattedId, { id: socket.id, name: name || 'Player' });

      if (result.success) {
        socket.join(formattedId);
        socket.emit('join_success', {
          roomId: formattedId,
          players: result.room.players,
          isCreator: result.room.isCreator(socket.id),
          options: result.room.options
        });
        io.to(formattedId).emit('player_joined', {
          players: result.room.players
        });
        console.log(`Player ${socket.id} joined room ${formattedId}`);
      } else {
        socket.emit('join_failed', { reason: result.reason });
      }
    });

    socket.on('leave_room', () => {
      const result = gameStore.leaveRoom(socket.id);
      if (result && result.room) {
        socket.leave(result.room.id);
        io.to(result.room.id).emit('player_left', {
          players: result.room.players,
          playerId: socket.id
        });
      }
    });

    // --- Game Actions ---

    socket.on('start_game', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (!room.isCreator(socket.id)) {
        socket.emit('error', { message: 'Only the room creator can start the game' });
        return;
      }

      if (room.startGame()) {
        const matchInfo = room.matchSession ? room.matchSession.getState() : null;
        for (let i = 0; i < room.players.length; i++) {
          const playerId = room.players[i].id;
          const playerState = room.game.getStateForPlayer(i);
          io.to(playerId).emit('game_started', {
            playerIndex: i,
            roundNumber: matchInfo ? matchInfo.currentRound + 1 : 1,
            totalRounds: matchInfo ? matchInfo.totalRounds : 1,
            matchSession: matchInfo,
            ...playerState
          });
        }
        console.log(`Game started in room ${roomId}`);
      } else {
        socket.emit('error', { message: 'Cannot start game (need 4 players or already started)' });
      }
    });

    socket.on('draw_tile', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.drawTile(playerIndex);

      if (result.success) {
        if (result.drawGame) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, null, false, true, null));
        } else if (result.selfDrawWin) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, playerIndex, true, false, result.fan));
        } else {
          const state = room.game.getStateForPlayer(playerIndex);
          const tingpai = room.game.getTingpaiWithFan(playerIndex);
          socket.emit('tile_drawn', {
            tile: result.tile,
            waitingTiles: result.waitingTiles,
            tingpai,
            selfKongTiles: room.game.getSelfKongTiles(playerIndex),
            ...state
          });
          socket.to(roomId).emit('player_drew', {
            playerIndex,
            tilesLeft: room.game.tileSet.remaining
          });
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('self_kong', ({ roomId, tile }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.selfKong(playerIndex, tile);

      if (result.success) {
        if (result.drawGame) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, null, false, true, null));
        } else if (result.selfDrawWin) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, playerIndex, true, false, result.fan));
        } else {
          io.to(roomId).emit('claim_resolved', {
            type: 'kong',
            playerIndex,
            currentPlayer: playerIndex
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('discard_tile', ({ roomId, tile }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.discardTile(playerIndex, tile);

      if (result.success) {
        io.to(roomId).emit('tile_discarded', {
          playerIndex,
          tile,
          nextPlayer: result.nextPlayer,
          tilesLeft: result.tilesLeft
        });

        if (result.potentialClaims && result.potentialClaims.length > 0) {
          const playerClaims = new Map();
          for (const claim of result.potentialClaims) {
            if (!playerClaims.has(claim.playerIndex)) {
              playerClaims.set(claim.playerIndex, []);
            }
            playerClaims.get(claim.playerIndex).push(claim);
          }

          for (const [pIdx, claims] of playerClaims) {
            const claimPlayerId = room.players[pIdx].id;
            const claimOptions = claims.map(c => ({
              type: c.type,
              tile,
              chowOptions: c.chowOptions || null,
              fromPlayer: playerIndex
            }));
            io.to(claimPlayerId).emit('can_claim', {
              claims: claimOptions,
              discardTile: tile
            });
          }

          // Start 30s claim timeout
          room.game.startClaimTimer(() => {
            const game = room.game;
            if (!game || !game.claimWindow || game.claimWindow.resolved) return;
            const result = game._forcePassAll();
            if (result && result.resolved === 'pass') {
              io.to(roomId).emit('claim_resolved', {
                type: 'pass',
                nextPlayer: result.nextPlayer
              });
            }
          });
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('declare_claim', ({ roomId, claimType, chowTiles }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      room.game.clearClaimTimer();
      const result = room.game.declareClaim(playerIndex, claimType, chowTiles);

      if (result.success && result.resolved) {
        if (result.resolved === 'win') {
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'win',
            playerIndex: result.winner,
            fan: result.fan
          });
          io.to(roomId).emit('game_over', buildGameOverPayload(room, result.winner, false, false, result.fan));
        } else if (result.resolved === 'pong' || result.resolved === 'chow' || result.resolved === 'kong') {
          io.to(roomId).emit('claim_resolved', {
            type: result.resolved,
            playerIndex: result.playerIndex,
            currentPlayer: result.currentPlayer
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
        } else if (result.resolved === 'pass') {
          io.to(roomId).emit('claim_resolved', {
            type: 'pass',
            nextPlayer: result.nextPlayer
          });
        }
      } else if (!result.success && result.reason === 'WAITING_FOR_RESPONSES') {
        socket.emit('claim_received', { claimType });
        socket.to(roomId).emit('claim_declared', {
          playerIndex,
          claimType
        });
      } else {
        socket.emit('error', { message: result.reason || 'Cannot claim' });
      }
    });

    socket.on('pass_claim', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) return;

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      room.game.clearClaimTimer();
      const result = room.game.passClaim(playerIndex);

      if (result.success && result.resolved) {
        if (result.resolved === 'win') {
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'win',
            playerIndex: result.winner,
            fan: result.fan
          });
          io.to(roomId).emit('game_over', buildGameOverPayload(room, result.winner, false, false, result.fan));
        } else if (result.resolved === 'pong' || result.resolved === 'chow' || result.resolved === 'kong') {
          io.to(roomId).emit('claim_resolved', {
            type: result.resolved,
            playerIndex: result.playerIndex,
            currentPlayer: result.currentPlayer
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
        } else if (result.resolved === 'pass') {
          io.to(roomId).emit('claim_resolved', {
            type: 'pass',
            nextPlayer: result.nextPlayer
          });
        }
      }
    });

    // --- Next Round ---

    socket.on('next_round', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.matchSession) {
        socket.emit('error', { message: 'No active match' });
        return;
      }

      if (!room.isCreator(socket.id)) {
        socket.emit('error', { message: 'Only the room creator can start next round' });
        return;
      }

      if (!room.matchSession.nextRound()) {
        // Match is over
        io.to(roomId).emit('match_finished', room.matchSession.getState());
        return;
      }

      // Start next round
      room.state = 'playing';
      if (room.game) room.game.clearClaimTimer();
      room.game = new MahjongGame(room.players, room.matchSession.dealerIndex);

      const matchInfo = room.matchSession.getState();
      for (let i = 0; i < room.players.length; i++) {
        const state = room.game.getStateForPlayer(i);
        io.to(room.players[i].id).emit('game_started', {
          playerIndex: i,
          roundNumber: matchInfo.currentRound,
          totalRounds: matchInfo.totalRounds,
          matchSession: matchInfo,
          ...state
        });
      }
      console.log(`Round ${matchInfo.currentRound} started in room ${roomId}, dealer: player ${matchInfo.dealerIndex}`);
    });

    // --- Quick Chat ---

    socket.on('quick_chat', ({ roomId, phrase, emoji }) => {
      const room = gameStore.getRoom(roomId);
      if (!room) return;

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      // Validate
      if (phrase && !QUICK_PHRASES.includes(phrase)) return;
      if (emoji && !ALLOWED_EMOJIS.includes(emoji)) return;

      const player = room.players[playerIndex];
      io.to(roomId).emit('quick_chat', {
        playerIndex,
        playerName: player.name,
        phrase: phrase || null,
        emoji: emoji || null,
        timestamp: Date.now()
      });
    });

    // --- Query Events ---

    socket.on('get_tingpai', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const tingpai = room.game.getTingpaiWithFan(playerIndex);
      socket.emit('tingpai_result', { tiles: tingpai });
    });

    socket.on('get_game_state', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const state = room.game.getStateForPlayer(playerIndex);
      state.playerIndex = playerIndex;
      socket.emit('game_state_update', state);
    });

    socket.on('get_room_state', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }

      socket.emit('room_state', {
        roomId: room.id,
        players: room.players,
        state: room.state,
        isCreator: room.isCreator(socket.id),
        options: room.options,
        matchSession: room.matchSession ? room.matchSession.getState() : null,
        game: room.game ? room.game.getStateForPlayer(playerIndex) : null
      });
    });

    // --- Disconnect ---

    socket.on('disconnect', () => {
      console.log('Player disconnected:', socket.id);
      const result = gameStore.leaveRoom(socket.id);
      if (result && result.room) {
        io.to(result.room.id).emit('player_left', {
          players: result.room.players,
          playerId: socket.id
        });
      }
    });
  });
}
