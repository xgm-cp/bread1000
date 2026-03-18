const AVATARS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐙','🐧','🐦','🦆','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🦖','🦕','🐬']

export function getAvatar(id: string): string {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATARS[Math.abs(hash) % AVATARS.length]
}
