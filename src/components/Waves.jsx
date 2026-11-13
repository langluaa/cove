// Decorative animated ocean for the login screen.
const WAVE = 'M0 60 C 150 20 350 100 500 60 S 850 20 1000 60 S 1350 100 1500 60 S 1850 20 2000 60 V 200 H 0 Z'

const BUBBLES = [
  { left: '8%', size: 10, dur: 14, delay: 0 },
  { left: '18%', size: 6, dur: 11, delay: 3 },
  { left: '33%', size: 14, dur: 17, delay: 6 },
  { left: '52%', size: 8, dur: 12, delay: 1 },
  { left: '67%', size: 12, dur: 16, delay: 8 },
  { left: '80%', size: 7, dur: 10, delay: 4 },
  { left: '91%', size: 11, dur: 15, delay: 10 },
]

export default function Waves() {
  return (
    <>
      <div className="bubbles" aria-hidden="true">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            style={{ left: b.left, width: b.size, height: b.size, animationDuration: b.dur + 's', animationDelay: b.delay + 's' }}
          />
        ))}
      </div>
      <div className="waves" aria-hidden="true">
        {[
          ['w1', '#2bd4be'],
          ['w2', '#4aa3df'],
          ['w3', '#8b7cf8'],
        ].map(([cls, color]) => (
          <svg key={cls} className={cls} viewBox="0 0 2000 200" preserveAspectRatio="none">
            <path d={WAVE} fill={color} />
          </svg>
        ))}
      </div>
    </>
  )
}
