const BREADS = ['🍞', '🥐', '🥖', '🥨', '🥯', '🧁']
const COLORS = ['#C0392B', '#2980B9', '#27AE60', '#8E44AD', '#D35400']

// 6 × 5 = 30가지 조합
const AVATARS = BREADS.flatMap(emoji => COLORS.map(bg => ({ emoji, bg })))

function hashId(id: string): number {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash)
}

export function getAvatar(id: string, size = 28) {
  const { emoji, bg } = AVATARS[hashId(id) % AVATARS.length]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      fontSize: size * 0.55,
      flexShrink: 0,
      lineHeight: 1,
    }}>
      {emoji}
    </span>
  )
}
