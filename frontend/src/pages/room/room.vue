<template>
  <div class="room-page">
    <div class="room-header">
      <h2>房间号</h2>
      <div class="room-id">{{ roomId }}</div>
      <div class="room-options">{{ totalRounds }}局 · 口令 {{ roomPassword }}</div>
      <button @click="copyRoomId" class="btn-copy">复制房间号</button>
    </div>

    <div class="players-grid">
      <div
        v-for="(player, index) in displaySlots"
        :key="index"
        class="player-slot"
        :class="{ filled: !!player }"
      >
        <template v-if="player">
          <div class="player-avatar">{{ player.name[0] }}</div>
          <div class="player-name">{{ player.name }}</div>
          <div v-if="index === 0" class="creator-badge">房主</div>
        </template>
        <template v-else>
          <div class="empty-slot">等待加入...</div>
        </template>
      </div>
    </div>

    <div class="room-footer">
      <button
        v-if="isCreator && players.length === 4"
        @click="startGame"
        class="btn btn-start"
      >
        开始游戏
      </button>
      <div v-else-if="isCreator" class="waiting-text">
        等待玩家加入 ({{ players.length }}/4)
      </div>
      <div v-else class="waiting-text">
        等待房主开始游戏...
      </div>

      <button @click="leaveRoom" class="btn btn-leave">
        离开房间
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSocket } from '@/utils/socket'
import { useToast } from '@/composables/useToast'
import { useGameStore } from '@/store/game'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const gameStore = useGameStore()
const roomId = computed(() => route.params.roomId)
const socket = getSocket()

const players = ref([...gameStore.players])
const isCreator = ref(gameStore.isCreator)
const totalRounds = ref(4)
const roomPassword = ref(gameStore.roomPassword || '8888')

const displaySlots = computed(() => {
  const slots = [...players.value]
  while (slots.length < 4) slots.push(null)
  return slots
})

function syncRoomOptions(options) {
  if (!options) return
  totalRounds.value = options.totalRounds || 4
  roomPassword.value = options.roomPassword || '8888'
  gameStore.roomPassword = roomPassword.value
}

function handlePlayerJoined(data) {
  if (data.players) players.value = [...data.players]
  syncRoomOptions(data.options)
}

function handlePlayerLeft(data) {
  if (data.players) players.value = [...data.players]
}

function handleGameStarted() {
  router.push(`/game/${roomId.value}`)
}

function handleRoomState(data) {
  if (data.players) players.value = [...data.players]
  if (data.isCreator !== undefined) isCreator.value = data.isCreator
  syncRoomOptions(data.options)
}

onMounted(() => {
  if (gameStore.players.length > 0) {
    players.value = [...gameStore.players]
    isCreator.value = gameStore.isCreator
    roomPassword.value = gameStore.roomPassword || '8888'
  }

  socket.on('player_joined', handlePlayerJoined)
  socket.on('player_left', handlePlayerLeft)
  socket.on('game_started', handleGameStarted)
  socket.on('room_state', handleRoomState)

  socket.emit('get_room_state', { roomId: roomId.value })
})

onUnmounted(() => {
  socket.off('player_joined', handlePlayerJoined)
  socket.off('player_left', handlePlayerLeft)
  socket.off('game_started', handleGameStarted)
  socket.off('room_state', handleRoomState)
})

function startGame() {
  socket.emit('start_game', { roomId: roomId.value })
}

function leaveRoom() {
  socket.emit('leave_room')
  router.push('/')
}

function copyRoomId() {
  navigator.clipboard.writeText(roomId.value).then(() => {
    toast.show(`房间号已复制: ${roomId.value}`)
  }).catch(() => {
    toast.show(`复制失败，请手动复制: ${roomId.value}`)
  })
}
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
}

.room-header {
  text-align: center;
  margin: 30px 0;
}

.room-header h2 {
  color: #a0c0a0;
  font-size: 14px;
  margin-bottom: 8px;
}

.room-id {
  font-size: 36px;
  font-weight: bold;
  color: #f0d060;
  letter-spacing: 4px;
  font-family: monospace;
}

.room-options {
  font-size: 14px;
  color: #a0c0a0;
  margin-top: 4px;
}

.btn-copy {
  margin-top: 8px;
  padding: 6px 20px;
  border: 1px solid #3a6b3a;
  border-radius: 8px;
  background: transparent;
  color: #a0c0a0;
  cursor: pointer;
  font-size: 13px;
}

.players-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  margin: 20px 0;
}

.player-slot {
  aspect-ratio: 1;
  border: 2px dashed #3a6b3a;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.player-slot.filled {
  border-style: solid;
  border-color: #5a9b5a;
  background: rgba(76, 175, 80, 0.1);
}

.player-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #4caf50;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  color: white;
  margin-bottom: 8px;
}

.player-name {
  font-size: 16px;
  color: #e0e0e0;
}

.creator-badge {
  margin-top: 4px;
  padding: 2px 10px;
  background: #f0d060;
  color: #1a472a;
  border-radius: 8px;
  font-size: 12px;
  font-weight: bold;
}

.empty-slot {
  color: #5a7a5a;
  font-size: 14px;
}

.room-footer {
  margin-top: auto;
  padding: 20px;
  width: 100%;
  max-width: 360px;
}

.btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  margin-bottom: 10px;
}

.btn-start {
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: white;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3); }
  50% { box-shadow: 0 4px 20px rgba(76, 175, 80, 0.6); }
}

.btn-leave {
  background: transparent;
  color: #a06060;
  border: 1px solid #603030;
}

.waiting-text {
  text-align: center;
  color: #7a9a7a;
  padding: 16px;
  margin-bottom: 10px;
}
</style>
