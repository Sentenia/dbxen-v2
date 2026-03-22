import { useState } from 'react';
import { Flame, ArrowLeftRight, Activity, BarChart3, FileCode, Wallet, ChevronDown, Copy, ExternalLink, LogOut } from 'lucide-react';
import { useWallet } from '../hooks/WalletContext';
import { shortAddr } from '../utils/helpers';
import ChainSelector from './ChainSelector';

export default function Nav({ activeTab, setActiveTab }) {
  const { chain, userAddr, ethBal, connected, connectWallet } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <nav>
      <div className="nav-brand">
        <div className="nav-logo">V2</div>
        <div className="nav-name">DBXen <span>V2</span></div>
      </div>
      <div className="nav-links">
        <button className={`nav-link${activeTab === 'protocol' ? ' active' : ''}`} onClick={() => setActiveTab('protocol')}>
          <Flame size={16} /> Burn
        </button>
        <button className={`nav-link bridge-link${activeTab === 'bridge' ? ' active' : ''}`} onClick={() => setActiveTab('bridge')}>
          <ArrowLeftRight size={16} /> Bridge
        </button>
        <button className={`nav-link${activeTab === 'activity' ? ' active' : ''}`} onClick={() => setActiveTab('activity')}>
          <Activity size={16} /> Activity
        </button>
        <button className={`nav-link${activeTab === 'analytics' ? ' active' : ''}`} onClick={() => setActiveTab('analytics')}>
          <BarChart3 size={16} /> Analytics
        </button>
        <a className="nav-link" href={`${chain.explorer}/address/${chain.contracts.DBXEN_V2}#code`} target="_blank" rel="noopener noreferrer">
          <FileCode size={16} /> Contract
        </a>
      </div>
      <div className="wallet-area">
        <ChainSelector />
        {!connected ? (
          <button className="btn-connect" onClick={connectWallet}>
            <Wallet size={16} /> Connect Wallet
          </button>
        ) : (
          <div className="wallet-connected">
            <div className="wallet-eth">{ethBal} {chain.native}</div>
            <button className="wallet-addr-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <span className="wallet-dot" />
              <span>{shortAddr(userAddr)}</span>
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <>
                <div className="chain-overlay" onClick={() => setDropdownOpen(false)} />
                <div className="wallet-dropdown show">
                  <div className="wallet-dropdown-addr">{userAddr}</div>
                  <button className="wallet-dropdown-item" onClick={() => { navigator.clipboard.writeText(userAddr); setDropdownOpen(false); }}>
                    <Copy size={14} /> Copy Address
                  </button>
                  <a className="wallet-dropdown-item" href={`${chain.explorer}/address/${userAddr}`} target="_blank" rel="noopener noreferrer" onClick={() => setDropdownOpen(false)}>
                    <ExternalLink size={14} /> View on Explorer
                  </a>
                  <button className="wallet-dropdown-item" onClick={() => location.reload()}>
                    <LogOut size={14} /> Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
