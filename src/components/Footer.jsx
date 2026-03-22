import { useState } from 'react';
import { BookOpen, Github, ExternalLink, Copy, Check } from 'lucide-react';
import { useWallet } from '../hooks/WalletContext';
import { shortAddr } from '../utils/helpers';

function FooterAddr({ label, addr, explorer }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="footer-address">
      <span className="footer-address-label">{label}</span>
      <code>{shortAddr(addr)}</code>
      <button className="footer-copy-btn" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
      <a href={`${explorer}/address/${addr}`} target="_blank" rel="noopener noreferrer" className="footer-icon-link"><ExternalLink size={12} /></a>
    </div>
  );
}

export default function Footer() {
  const { chain } = useWallet();
  const ct = chain.contracts;
  const ex = chain.explorer;

  const rows = [
    { label: chain.xenSym + ':', addr: ct.XEN },
    { label: 'DBXenV2:', addr: ct.DBXEN_V2 },
    { label: chain.dxnSym + 'v2:', addr: ct.DXN_V2 },
    { label: 'Migration:', addr: ct.MIGRATION },
  ];
  if (chain.legacy) {
    rows.push({ label: 'Old DBXenV2:', addr: chain.legacy.DBXEN_V2 });
    rows.push({ label: 'Old ' + chain.dxnSym + 'v2:', addr: chain.legacy.DXN_V2 });
    rows.push({ label: 'Old Migration:', addr: chain.legacy.MIGRATION });
  }

  return (
    <footer>
      <div className="footer-grid">
        <div className="footer-col">
          <div className="footer-heading">Contract Addresses</div>
          {rows.filter(r => r.addr).map(r => <FooterAddr key={r.addr} label={r.label} addr={r.addr} explorer={ex} />)}
        </div>
        <div className="footer-col">
          <div className="footer-heading">Resources</div>
          <a href="https://dbxen.gitbook.io/dbxen-litepaper" target="_blank" rel="noopener noreferrer" className="footer-link"><BookOpen size={13} /> Litepaper</a>
          <a href="https://github.com/Sentenia/dbxen-v2" target="_blank" rel="noopener noreferrer" className="footer-link"><Github size={13} /> GitHub</a>
          <a href="https://xen.network" target="_blank" rel="noopener noreferrer" className="footer-link"><ExternalLink size={13} /> XEN Network</a>
        </div>
        <div className="footer-col">
          <div className="footer-heading">Community</div>
          <div className="footer-socials">
            <a href="https://x.com/DBXen_crypto" target="_blank" rel="noopener noreferrer" className="footer-social" title="X / Twitter">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://t.me/DBXenV2" target="_blank" rel="noopener noreferrer" className="footer-social" title="Telegram">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        DBXen V2 — Community-owned. Fully immutable. No admin keys.
      </div>
    </footer>
  );
}
