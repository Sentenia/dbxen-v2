export default function HowItWorks() {
  const steps = [
    { num: 1, title: 'Burn XEN', desc: 'Burn XEN in batches to earn DXN rewards.' },
    { num: 2, title: 'Earn DXN', desc: 'DXN rewards distributed at end of each 24h cycle.' },
    { num: 3, title: 'Stake for Fees', desc: 'Stake DXN to earn protocol fees in native tokens.' },
  ];

  return (
    <section className="how-it-works">
      <h2 className="hiw-title">How DBXen Works</h2>
      <div className="hiw-grid">
        {steps.map((s, i) => (
          <div key={s.num} className={`hiw-step fade-up fade-up-${i + 1}`}>
            <div className="hiw-number">{s.num}</div>
            <div className="hiw-step-title">{s.title}</div>
            <div className="hiw-step-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
