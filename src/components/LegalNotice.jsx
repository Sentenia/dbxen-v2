import { useEffect } from 'react';
import { Scale, X } from 'lucide-react';

// Plain-English terms + disclaimer for the interface. Deliberately NOT boilerplate
// legalese: the whole point is that a reader can tell in thirty seconds what this
// site is (a static, non-custodial front-end that someone publishes) and what it
// isn't (the protocol, a broker, a custodian, or anyone's advisor). Reuses the
// scoreboard modal shell so it matches the app and inherits its mobile behavior.
export const LAST_UPDATED = 'July 25, 2026';

export default function LegalNotice({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scoreboard-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scoreboard-modal">
        <button type="button" className="scoreboard-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <div className="scoreboard-title"><Scale size={18} /> Terms &amp; Disclaimer</div>
        <div className="scoreboard-sub">Last updated {LAST_UPDATED}</div>

        <div className="legal-body">
          <h4>What this site is</h4>
          <p>
            This is a free, open-source web interface. It is a set of static files served to your
            browser. It reads public blockchain data and helps you build transactions that
            <strong> your own wallet</strong> signs and broadcasts.
          </p>

          <h4>What it never does</h4>
          <ul>
            <li>It never takes custody of your funds, tokens, keys, or seed phrase.</li>
            <li>It never takes a fee, commission, or cut of any transaction you make.</li>
            <li>It cannot move, freeze, reverse, or recover your assets — nobody operating this site can.</li>
            <li>It does not match orders, route trades, quote prices for you, or act as a broker, dealer, or exchange.</li>
          </ul>

          <h4>It is not the protocol</h4>
          <p>
            DBXen V2, DXNv2, NXD, and XEN are independent third-party smart contracts deployed on
            public blockchains. They are immutable and have no admin keys, no upgrade path, and no
            owner — including the people who publish this interface. This site is one of many
            possible ways to reach those contracts; you can always interact with them directly.
            Contract addresses are listed in the footer so you can verify them yourself.
          </p>

          <h4>Nothing here is advice</h4>
          <p>
            Nothing on this site is financial, investment, legal, tax, or accounting advice, and
            nothing here is a solicitation or recommendation to buy, sell, or hold anything. Figures,
            charts, projections, APR/APY estimates, and "estimated reward" values are informational
            approximations, not promises. Do your own research.
          </p>

          <h4>Risks</h4>
          <ul>
            <li>Smart contracts can contain bugs. Immutable contracts cannot be patched.</li>
            <li>Burning tokens is irreversible. Transactions cannot be undone.</li>
            <li>Token values are volatile and can go to zero.</li>
            <li>There is no refund, no support desk, no insurance, and no counterparty to make you whole.</li>
            <li>You can permanently lose everything you commit. Do not commit more than you can afford to lose.</li>
          </ul>

          <h4>Your responsibility</h4>
          <p>
            You are responsible for the security of your wallet and keys, for verifying every
            transaction before you sign it, for verifying contract addresses, and for complying with
            the laws that apply to you where you live. This interface is not directed at, and should
            not be used by, anyone in a jurisdiction where using it would be unlawful, or by anyone
            subject to applicable sanctions.
          </p>

          <h4>No warranty</h4>
          <p>
            This interface is provided "as is" and "as available", without warranty of any kind,
            express or implied. On-chain data shown here is fetched best-effort from public RPCs and
            block explorers that are operated by third parties and may be rate-limited, delayed,
            incomplete, or simply wrong. Some figures are estimates by construction and are labeled
            as such. Availability is not guaranteed and the site may change or disappear at any time.
            To the maximum extent permitted by law, the publishers of this interface accept no
            liability for any loss arising from its use.
          </p>

          <p className="legal-foot">
            The source is public at{' '}
            <a href="https://github.com/Sentenia/dbxen-v2" target="_blank" rel="noopener noreferrer">github.com/Sentenia/dbxen-v2</a>
            {' '}— read it, fork it, or run your own copy.
          </p>
        </div>
      </div>
    </div>
  );
}
