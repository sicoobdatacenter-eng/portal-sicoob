// As logos são usadas exatamente como entregues (PNG), só com a altura definida; a largura segue a proporção original.
export function Lockup({ sicoobH = 28, unbH = 32, className = '' }: { sicoobH?: number; unbH?: number; className?: string }) {
  return (
    <div className={`lockup ${className}`}>
      <img className="l-sicoob" src="/brand/sicoob.png" alt="Sicoob" width={Math.round(sicoobH * (552 / 154))} height={sicoobH} style={{ height: sicoobH }} />
      <span className="sep" aria-hidden="true" />
      <img className="l-unb" src="/brand/unb.png" alt="Universidade de Brasília" width={Math.round(unbH * (308 / 270))} height={unbH} style={{ height: unbH }} />
    </div>
  );
}

/** Logos dos dois parceiros ligados por um cabo: origem e destino, como numa conexão registrada no sistema. */
export function CableHero() {
  return (
    <div className="hero-logos">
      <img src="/brand/sicoob.png" alt="Sicoob" width={Math.round(48 * (552 / 154))} height={48} style={{ height: 48 }} />
      <div className="cable" aria-hidden="true">
        <span className="port port--a" />
        <svg viewBox="0 0 400 30" preserveAspectRatio="none">
          <path d="M0 15 C110 15 130 4 200 4 S290 15 400 15" pathLength={1} />
        </svg>
        <span className="port port--b" />
      </div>
      <img src="/brand/unb.png" alt="Universidade de Brasília" width={Math.round(56 * (308 / 270))} height={56} style={{ height: 56 }} />
    </div>
  );
}
