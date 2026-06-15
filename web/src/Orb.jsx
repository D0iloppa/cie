// 앰비언트 오브 — 음성채팅 화면 느낌의 상징적 비주얼(실제 음성 입력은 없음).
// tone: 'idle' | 'first' | 'yes' | 'no' | 'thinking'
export default function Orb({ tone = 'idle', label }) {
  return (
    <div className={`orb-wrap tone-${tone}`}>
      <div className="orb-aurora" />
      <div className="orb-halo" />
      <div className="orb-ring r1" />
      <div className="orb-ring r2" />
      <div className="orb-ring r3" />
      <div className="orb-orbit"><i /><i /><i /></div>
      <div className="orb-core">
        <span className="orb-emoji">
          {tone === 'thinking' ? '◌' : tone === 'no' ? '🌙' : tone === 'first' ? '🍽️' : tone === 'yes' ? '✅' : '🍽️'}
        </span>
      </div>
      {label && <div className="orb-label">{label}</div>}
    </div>
  );
}
