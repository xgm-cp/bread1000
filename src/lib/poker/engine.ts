import type { Card, PokerPlayer, PokerState, PokerStreet, Suit } from './types'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const SUIT_POWER: Record<Suit, number> = { S: 4, H: 3, D: 2, C: 1 }
const BET_STREETS: PokerStreet[] = ['seven_3rd_bet', 'seven_4th_bet', 'seven_5th_bet', 'seven_6th_bet', 'seven_7th_bet']
const ANTE = 1

export function createEmptyState(roomCode: string): PokerState {
  return {
    roomCode,
    gameType: 'seven',
    hostId: null,
    street: 'waiting',
    players: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    contributions: {},
    acted: {},
    actorId: null,
    winner: null,
    matchWinner: null,
    resultText: '',
    showdownSummary: '',
  }
}

export function normalizeState(roomCode: string, raw: unknown): PokerState {
  if (!raw || typeof raw !== 'object') return createEmptyState(roomCode)
  const state = raw as Partial<PokerState>
  return {
    ...createEmptyState(roomCode),
    ...state,
    roomCode,
    players: Array.isArray(state.players) ? state.players : [],
    deck: Array.isArray(state.deck) ? state.deck : [],
    contributions: state.contributions ?? {},
    acted: state.acted ?? {},
  }
}

export function isExpired(updatedAt: string | null, expiresAt: string | null) {
  const now = Date.now()
  const updated = updatedAt ? new Date(updatedAt).getTime() : 0
  const expires = expiresAt ? new Date(expiresAt).getTime() : 0
  return (updated > 0 && now - updated > 30 * 60 * 1000) || (expires > 0 && now > expires)
}

export function addPlayer(state: PokerState, player: { id: string; name: string }) {
  if (state.players.some(p => p.id === player.id)) return state
  if (state.players.length >= 4) throw new Error('방이 가득 찼습니다.')
  if (state.street !== 'waiting') throw new Error('진행 중인 방에는 참가할 수 없습니다.')
  const next: PokerState = {
    ...state,
    hostId: state.hostId ?? player.id,
    players: [...state.players, { id: player.id, name: player.name, stack: 100, hand: [], folded: false }],
  }
  return next
}

export function removePlayer(state: PokerState, playerId: string): PokerState {
  const players = state.players.filter(player => player.id !== playerId)
  if (players.length === 0) return createEmptyState(state.roomCode)

  const hostId = state.hostId === playerId ? players[0].id : state.hostId
  const contributions = { ...state.contributions }
  const acted = { ...state.acted }
  delete contributions[playerId]
  delete acted[playerId]

  if (state.street === 'showdown' || state.street === 'waiting') {
    return {
      ...state,
      players,
      hostId,
      contributions,
      acted,
      actorId: state.actorId === playerId ? null : state.actorId,
    }
  }

  const active = players.filter(player => !player.folded && player.stack > 0)
  if (active.length <= 1) {
    const winner = active[0]
    if (!winner) return { ...state, players, hostId, street: 'showdown' as const, actorId: null, resultText: '게임이 종료되었습니다.' }
    const awarded = awardPot(players, winner.id, state.pot)
    const matchWinner = getMatchWinner(awarded)
    return {
      ...state,
      players: revealAll(awarded),
      hostId,
      street: 'showdown',
      actorId: null,
      winner: winner.id,
      matchWinner: matchWinner?.id ?? null,
      pot: 0,
      currentBet: 0,
      contributions: {},
      acted: {},
      resultText: matchWinner ? `${matchWinner.name} 최종 승리` : `${winner.name} 승리`,
      showdownSummary: `${winner.name}님이 남은 플레이어로 승리했습니다.`,
    }
  }

  return {
    ...state,
    players,
    hostId,
    contributions,
    acted,
    actorId: state.actorId === playerId ? nextActor({ ...state, players, contributions, acted }, playerId) : state.actorId,
  }
}

export function startSevenPoker(state: PokerState, actorId: string) {
  if (state.hostId !== actorId) throw new Error('방장만 시작할 수 있습니다.')
  if (state.players.length < 2) throw new Error('멀티 모드는 2명 이상 필요합니다.')
  state = { ...state, matchWinner: null }
  return dealSevenHand({
    ...state,
    players: state.players.map(player => ({ ...player, stack: 100 })),
  }, '공개할 카드 1장을 선택하세요.')
}

export function startNextHand(state: PokerState, actorId: string) {
  if (state.roomCode !== 'practice' && state.hostId !== actorId) throw new Error('방장만 다음 판을 시작할 수 있습니다.')
  if (state.street !== 'showdown') throw new Error('쇼다운 이후에만 다음 판을 시작할 수 있습니다.')
  const activeStacks = state.players.filter(player => player.stack > 0)
  if (state.matchWinner || activeStacks.length < 2) throw new Error('최종 승자가 정해졌습니다. 한 판 더 하기를 눌러 새로 시작하세요.')
  return dealSevenHand({
    ...state,
  }, '다음 판을 시작합니다.')
}

export function startNewMatch(state: PokerState, actorId: string) {
  if (state.roomCode !== 'practice' && state.hostId !== actorId) throw new Error('방장만 새 게임을 시작할 수 있습니다.')
  return dealSevenHand({
    ...state,
    matchWinner: null,
    players: state.players.map(player => ({
      ...player,
      stack: 100,
      folded: false,
      hand: [],
      handRank: undefined,
    })),
  }, '새 게임을 시작합니다.')
}

function dealSevenHand(state: PokerState, resultText: string) {
  const deck = shuffle(makeDeck())
  const players = state.players.map(player => ({
    ...player,
    stack: player.stack > 0 ? Math.max(0, player.stack - ANTE) : player.stack,
    folded: player.stack <= 0,
    hand: player.stack > 0 ? [draw(deck, false), draw(deck, false), draw(deck, false)] : [],
    handRank: player.stack > 0 ? undefined : '관전',
  }))
  const contributions: Record<string, number> = {}
  for (const player of players) {
    if (player.hand.length > 0) contributions[player.id] = ANTE
  }
  const pot = Object.values(contributions).reduce((sum, amount) => sum + amount, 0)
  return {
    ...state,
    street: 'select_upcard' as const,
    players,
    deck,
    pot,
    currentBet: 0,
    contributions,
    acted: {},
    actorId: null,
    winner: null,
    resultText: `${resultText} 기본 베팅 ${ANTE}칩이 팟에 들어갔습니다.`,
    showdownSummary: '',
  }
}

export function createPracticeState(player: { id: string; name: string }) {
  const state = addPlayer(createEmptyState('practice'), player)
  const botState = addPlayer(state, { id: 'bot', name: '연습 상대' })
  return startSevenPoker({ ...botState, hostId: player.id }, player.id)
}

export function selectUpcard(state: PokerState, actorId: string, cardIndex: number) {
  if (state.street !== 'select_upcard') throw new Error('지금은 공개 카드를 고르는 단계가 아닙니다.')
  const players = state.players.map(player => {
    if (player.id !== actorId) return player
    if (!player.hand[cardIndex]) throw new Error('카드를 찾을 수 없습니다.')
    return {
      ...player,
      hand: player.hand.map((card, idx) => ({ ...card, faceUp: idx === cardIndex ? true : card.faceUp })),
    }
  })
  const acted = { ...state.acted, [actorId]: true }
  const allSelected = players.every(p => p.folded || p.hand.some(c => c.faceUp))
  if (!allSelected) return { ...state, players, acted }
  const actor = firstActorByUpcard(players)
  return { ...state, players, acted: {}, street: 'seven_3rd_bet' as const, actorId: actor?.id ?? null, resultText: '첫 베팅을 진행하세요.' }
}

export function checkOrCall(state: PokerState, actorId: string) {
  ensureActor(state, actorId)
  const actor = state.players.find(player => player.id === actorId)
  if (!actor) throw new Error('플레이어를 찾을 수 없습니다.')
  const paid = state.contributions[actorId] ?? 0
  const callAmount = Math.max(0, state.currentBet - paid)
  const payAmount = Math.min(callAmount, actor.stack)
  const players = state.players.map(player => {
    if (player.id !== actorId) return player
    return { ...player, stack: Math.max(0, player.stack - payAmount) }
  })
  const contributions = { ...state.contributions, [actorId]: paid + payAmount }
  const acted = { ...state.acted, [actorId]: true }
  return maybeAdvance({ ...state, players, contributions, pot: state.pot + payAmount, acted })
}

export function bet(state: PokerState, actorId: string, amount: number) {
  ensureActor(state, actorId)
  const actor = state.players.find(player => player.id === actorId)
  if (!actor) throw new Error('플레이어를 찾을 수 없습니다.')
  const requested = Math.floor(amount || 0)
  if (requested <= 0) throw new Error('베팅 금액을 입력해주세요.')
  const betAmount = Math.min(requested, actor.stack)
  if (betAmount <= 0) throw new Error('베팅할 스택이 없습니다.')
  const players = state.players.map(player => {
    if (player.id !== actorId) return player
    return { ...player, stack: Math.max(0, player.stack - betAmount) }
  })
  const nextContribution = (state.contributions[actorId] ?? 0) + betAmount
  const contributions = { ...state.contributions, [actorId]: nextContribution }
  const raised = nextContribution > state.currentBet
  const acted = raised ? resetActedForRaise(state, actorId) : { ...state.acted, [actorId]: true }
  return maybeAdvance({
    ...state,
    players,
    pot: state.pot + betAmount,
    currentBet: Math.max(state.currentBet, nextContribution),
    contributions,
    acted,
  })
}

export function fold(state: PokerState, actorId: string) {
  ensureActor(state, actorId)
  const players = state.players.map(player => player.id === actorId ? { ...player, folded: true } : player)
  const active = players.filter(p => !p.folded)
  if (active.length === 1) {
    const awarded = awardPot(players, active[0].id, state.pot)
    const matchWinner = getMatchWinner(awarded)
    return {
      ...state,
      players: revealAll(awarded),
      street: 'showdown' as const,
      actorId: null,
      winner: active[0].id,
      matchWinner: matchWinner?.id ?? null,
      pot: 0,
      currentBet: 0,
      contributions: {},
      resultText: matchWinner ? `${matchWinner.name} 최종 승리` : `${active[0].name} 승리`,
      showdownSummary: matchWinner
        ? `${matchWinner.name}님이 모든 칩을 가져갔습니다.`
        : `${active[0].name}님이 폴드 승리했습니다.`,
    }
  }
  return maybeAdvance({ ...state, players, acted: { ...state.acted, [actorId]: true } })
}

export function resetRoom(roomCode: string) {
  return createEmptyState(roomCode)
}

function maybeAdvance(state: PokerState): PokerState {
  const active = state.players.filter(p => !p.folded)
  const allActed = active.every(p => {
    if (p.stack === 0) return true
    const paid = state.contributions[p.id] ?? 0
    return state.acted[p.id] && paid >= state.currentBet
  })
  if (!allActed) {
    return { ...state, actorId: nextActor(state, state.actorId) }
  }
  const streetIndex = BET_STREETS.indexOf(state.street)
  if (streetIndex === -1) return state
  if (state.street === 'seven_7th_bet') return showdown(state)

  const nextStreet = BET_STREETS[streetIndex + 1]
  const players = dealNextStreet(state.players, state.deck, nextStreet)
  const actor = firstActorByUpcard(players.filter(p => !p.folded))
  return {
    ...state,
    players,
    street: nextStreet,
    currentBet: 0,
    contributions: {},
    acted: {},
    actorId: actor?.id ?? active[0]?.id ?? null,
    resultText: '다음 카드가 공개되었습니다.',
  }
}

function dealNextStreet(players: PokerPlayer[], deck: Card[], street: PokerStreet) {
  return players.map(player => {
    if (player.folded) return player
    const faceUp = street !== 'seven_7th_bet'
    return { ...player, hand: [...player.hand, draw(deck, faceUp)] }
  })
}

function showdown(state: PokerState): PokerState {
  const evaluatedPlayers = revealAll(state.players).map(player => {
    if (player.folded) return { ...player, handRank: '폴드' }
    const evaluation = evaluateSeven(player.hand.map(c => c.card))
    return { ...player, handRank: evaluation.label, handRankCards: evaluation.cards }
  })
  const active = evaluatedPlayers.filter(p => !p.folded)
  const winner = [...active].sort((a, b) => compareEvaluation(evaluateSeven(b.hand.map(c => c.card)), evaluateSeven(a.hand.map(c => c.card))))[0]
  const winnerRank = winner ? evaluateSeven(winner.hand.map(c => c.card)).label : ''
  const players = winner ? awardPot(evaluatedPlayers, winner.id, state.pot) : evaluatedPlayers
  const matchWinner = getMatchWinner(players)
  return {
    ...state,
    players,
    street: 'showdown',
    actorId: null,
    winner: winner?.id ?? null,
    matchWinner: matchWinner?.id ?? null,
    pot: 0,
    currentBet: 0,
    contributions: {},
    resultText: matchWinner ? `${matchWinner.name} 최종 승리` : winner ? `${winner.name} 승리` : '무승부',
    showdownSummary: matchWinner
      ? `${matchWinner.name}님이 모든 칩을 가져갔습니다.`
      : winner ? `${winner.name}님이 ${winnerRank}으로 이겼습니다.` : '무승부입니다.',
  }
}

function revealAll(players: PokerPlayer[]) {
  return players.map(player => ({ ...player, hand: player.hand.map(card => ({ ...card, faceUp: true })) }))
}

function ensureActor(state: PokerState, actorId: string) {
  if (!BET_STREETS.includes(state.street)) throw new Error('베팅 단계가 아닙니다.')
  if (state.actorId !== actorId) throw new Error('지금은 내 차례가 아닙니다.')
}

function nextActor(state: PokerState, currentId: string | null) {
  const active = state.players.filter(p => !p.folded)
  if (active.length === 0) return null
  const idx = Math.max(0, active.findIndex(p => p.id === currentId))
  for (let offset = 1; offset <= active.length; offset += 1) {
    const candidate = active[(idx + offset) % active.length]
    const paid = state.contributions[candidate.id] ?? 0
    if (candidate.stack > 0 && (!state.acted[candidate.id] || paid < state.currentBet)) return candidate.id
  }
  return active[0].id
}

function resetActedForRaise(state: PokerState, raiserId: string) {
  const acted: Record<string, boolean> = {}
  for (const player of state.players) {
    if (!player.folded) acted[player.id] = player.id === raiserId
  }
  return acted
}

function awardPot(players: PokerPlayer[], winnerId: string, pot: number) {
  return players.map(player => player.id === winnerId ? { ...player, stack: player.stack + pot } : player)
}

function getMatchWinner(players: PokerPlayer[]) {
  const alive = players.filter(player => player.stack > 0)
  return alive.length === 1 ? alive[0] : null
}

function firstActorByUpcard(players: PokerPlayer[]) {
  return [...players].sort((a, b) => bestUpcardScore(b) - bestUpcardScore(a))[0]
}

function bestUpcardScore(player: PokerPlayer) {
  const upcards = player.hand.filter(c => c.faceUp)
  if (upcards.length === 0) return 0
  return Math.max(...upcards.map(c => cardScore(c.card)))
}

function cardScore(card: Card) {
  const rank = card.slice(0, 1) as typeof RANKS[number]
  const suit = card.slice(1, 2) as Suit
  return RANKS.indexOf(rank) * 10 + SUIT_POWER[suit]
}

type HandEvaluation = {
  category: number
  tiebreakers: number[]
  label: string
  cards: Card[]
}

const CATEGORY_LABELS = [
  '하이카드',
  '원페어',
  '투페어',
  '트리플',
  '스트레이트',
  '플러시',
  '풀하우스',
  '포카드',
  '스트레이트 플러시',
]

function evaluateSeven(cards: Card[]): HandEvaluation {
  const combos = fiveCardCombos(cards)
  return combos
    .map(evaluateFive)
    .sort((a, b) => compareEvaluation(b, a))[0]
}

function evaluateFive(cards: Card[]): HandEvaluation {
  const values = cards.map(rankValue).sort((a, b) => b - a)
  const suits = cards.map(card => card.slice(1, 2))
  const flush = suits.every(suit => suit === suits[0])
  const straightHigh = getStraightHigh(values)
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  if (flush && straightHigh) return named(8, [straightHigh], cards)
  if (groups[0][1] === 4) return named(7, [groups[0][0], highestExcept(values, [groups[0][0]])], cards)
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return named(6, [groups[0][0], groups[1][0]], cards)
  if (flush) return named(5, values, cards)
  if (straightHigh) return named(4, [straightHigh], cards)
  if (groups[0][1] === 3) return named(3, [groups[0][0], ...values.filter(v => v !== groups[0][0])], matchingCards(cards, [groups[0][0]]))
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pairs = groups.filter(group => group[1] === 2).map(group => group[0]).sort((a, b) => b - a)
    return named(2, [...pairs, highestExcept(values, pairs)], matchingCards(cards, pairs))
  }
  if (groups[0][1] === 2) return named(1, [groups[0][0], ...values.filter(v => v !== groups[0][0])], matchingCards(cards, [groups[0][0]]))
  return named(0, values, [cards.sort((a, b) => rankValue(b) - rankValue(a))[0]])
}

function named(category: number, tiebreakers: number[], cards: Card[]): HandEvaluation {
  return { category, tiebreakers, label: CATEGORY_LABELS[category], cards }
}

function compareEvaluation(a: HandEvaluation, b: HandEvaluation) {
  if (a.category !== b.category) return a.category - b.category
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function fiveCardCombos(cards: Card[]) {
  const combos: Card[][] = []
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1)
            combos.push([cards[a], cards[b], cards[c], cards[d], cards[e]])
  return combos
}

function rankValue(card: Card) {
  const rank = card.slice(0, 1) as typeof RANKS[number]
  return RANKS.indexOf(rank) + 2
}

function matchingCards(cards: Card[], values: number[]) {
  return cards.filter(card => values.includes(rankValue(card)))
}

function getStraightHigh(values: number[]) {
  const unique = [...new Set(values)].sort((a, b) => b - a)
  if (unique.includes(14)) unique.push(1)
  for (let i = 0; i <= unique.length - 5; i += 1) {
    const window = unique.slice(i, i + 5)
    if (window[0] - window[4] === 4) return window[0]
  }
  return 0
}

function highestExcept(values: number[], excludes: number[]) {
  return values.find(value => !excludes.includes(value)) ?? 0
}

function makeDeck() {
  const deck: Card[] = []
  for (const rank of RANKS) {
    for (const suit of SUITS) deck.push(`${rank}${suit}` as Card)
  }
  return deck
}

function shuffle(deck: Card[]) {
  const next = [...deck]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function draw(deck: Card[], faceUp: boolean) {
  const card = deck.pop()
  if (!card) throw new Error('덱이 비었습니다.')
  return { card, faceUp }
}
