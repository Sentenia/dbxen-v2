import { ShieldCheck, ArrowRight } from 'lucide-react';

export default function WhyV2() {
  return (
    <section className="why-v2">
      <div className="why-v2-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>Why V2?</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          The original DBXen was exploited on March 12, 2026 for 65.28 ETH (~$150K). The attacker used an ERC2771 sender-spoofing vulnerability combined with a fresh-address fee backdating bug. V2 removes both vulnerabilities entirely. All contracts are verified on Etherscan and fully immutable — owner renounced to address(0).
        </p>
        <a href="https://github.com/Sentenia/dbxen-v2" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--cyan)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Read the full details <ArrowRight size={14} />
        </a>
      </div>
    </section>
  );
}
