export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'
export type Card = `${Rank}${Suit}`

export type PokerStreet =
  | 'waiting'
  | 'select_upcard'
  | 'seven_3rd_bet'
  | 'seven_4th_bet'
  | 'seven_5th_bet'
  | 'seven_6th_bet'
  | 'seven_7th_bet'
  | 'showdown'

export type PlayerCard = {
  card: Card
  faceUp: boolean
}

export type PokerPlayer = {
  id: string
  name: string
  stack: number
  hand: PlayerCard[]
  folded: boolean
  handRank?: string
  handRankCards?: Card[]
}

export type PokerState = {
  roomCode: string
  gameType: 'seven'
  hostId: string | null
  street: PokerStreet
  players: PokerPlayer[]
  deck: Card[]
  pot: number
  currentBet: number
  contributions: Record<string, number>
  acted: Record<string, boolean>
  actorId: string | null
  winner: string | null
  matchWinner: string | null
  resultText: string
  showdownSummary?: string
  updatedAt?: string
}

export type PublicPokerPlayer = Omit<PokerPlayer, 'hand'> & {
  hand: Array<{ card: Card | '??'; faceUp: boolean }>
}

export type PublicPokerState = Omit<PokerState, 'deck' | 'players'> & {
  players: PublicPokerPlayer[]
  deckCount: number
}

export type PokerAction =
  | 'create'
  | 'rooms'
  | 'join'
  | 'start'
  | 'state'
  | 'selectUpcard'
  | 'check'
  | 'bet'
  | 'fold'
  | 'leave'
  | 'nextHand'
  | 'newMatch'
  | 'reset'
