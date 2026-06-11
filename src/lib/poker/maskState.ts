import type { PublicPokerState, PokerState } from './types'

export function maskState(state: PokerState, viewerId: string): PublicPokerState {
  return {
    ...state,
    deckCount: state.deck.length,
    players: state.players.map(player => ({
      ...player,
      hand: player.hand.map(card => ({
        faceUp: card.faceUp,
        card: player.id === viewerId || card.faceUp || state.street === 'showdown' ? card.card : '??',
      })),
    })),
  }
}
