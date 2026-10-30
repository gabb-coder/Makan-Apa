interface Props {
  eyebrow: string;
  title: string;
  phase: string;
  children?: React.ReactNode;
}

/** Stand-in for screens that arrive in later build phases. */
export function PlaceholderScreen({ eyebrow, title, phase, children }: Props) {
  return (
    <main className="screen" style={{ gap: 18 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="title">{title}</h1>
      </header>
      <section className="card fade-up" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="section-label">Coming in {phase}</span>
        {children}
      </section>
    </main>
  );
}
