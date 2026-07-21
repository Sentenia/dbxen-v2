import { useState } from 'react';
import { ShieldCheck, ArrowRight, ChevronDown } from 'lucide-react';

export default function WhyV2() {
  const [open, setOpen] = useState(false);

  return (
    <section className="why-v2">
      <div className="why-v2-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>Why V2?</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          The original DBXen was exploited on March 12, 2026 for 65.28 ETH (~$150K). The attacker used an ERC2771 sender-spoofing vulnerability combined with a fresh-address fee backdating bug. V2 removes both vulnerabilities entirely. All contracts are verified on Etherscan and fully immutable, with the owner renounced to address(0).
        </p>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: open ? 14 : 0,
            padding: 0, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit',
          }}
        >
          {open ? 'Hide details' : 'Full details'}
          <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {open && (
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 14 }}>
            <p style={{ marginBottom: 12 }}>
              <b style={{ color: 'var(--text-primary)' }}>What happened.</b> On March 12, 2026 the original DBXen (V1) was drained of 65.28 ETH (~$150K). The attacker chained two bugs: an ERC2771 sender-spoofing flaw that let them forge who a transaction came from, and a fresh-address fee-backdating bug that let a brand-new wallet claim protocol fees it never paid into.
            </p>
            <p style={{ marginBottom: 12 }}>
              <b style={{ color: 'var(--text-primary)' }}>What V2 is.</b> V2 is a faithful clone of V1 with only those two vulnerabilities removed. It runs the exact same XEN-burn → DXNv2-mint → protocol-fee reward mechanics you already know. Nothing else about how the protocol works has changed: no new tokenomics, no new trust assumptions, no added privileges.
            </p>
            <p style={{ marginBottom: 12 }}>
              <b style={{ color: 'var(--text-primary)' }}>Community-built and immutable.</b> V2 is built by the community and fully immutable. Every contract is verified on Etherscan and ownership is renounced to address(0), so there are no admin keys, no upgrade switch, and no pause button. No one, including the people who deployed it, can alter, halt, or drain it.
            </p>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
              The exploit is gone and the code is immutable, so you can safely burn XEN again on V2.
            </p>
          </div>
        )}

        <div>
          <a href="https://etherscan.io/address/0x61614137edE60C65458F76a51D6431052EBE03D0#code" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--cyan)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            View the verified contract <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
