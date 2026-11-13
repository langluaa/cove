export function displayName(p) {
  return p?.display_name || p?.username || 'Unknown'
}

export default function Avatar({ profile, size = 40, online }) {
  const name = displayName(profile)
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: profile?.avatar_color || '#555', fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
      {online !== undefined && <span className={'presence ' + (online ? 'on' : 'off')} />}
    </div>
  )
}
