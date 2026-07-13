import { useState, useRef, useEffect } from 'react';
import { Flame, ArrowLeftRight, Activity, BarChart3, FileCode, Wallet, ChevronDown, Copy, ExternalLink, LogOut, Zap, Shield, Droplet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWallet } from '../hooks/WalletContext';
import { shortAddr } from '../utils/helpers';
import { NXD_CONTRACTS } from '../config/nxd';
import ChainSelector from './ChainSelector';
import MobileChainDot from './MobileChainDot';
import TipJar from './TipJar';

export default function Nav({ activeTab, setActiveTab, protocolMode, setProtocolMode }) {
  const { chain, chainKey, userAddr, ethBal, connected, connectWallet, disconnectWallet, switchChain } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoSpin, setLogoSpin] = useState(false);
  const walletRef = useRef(null);
  const logoClicks = useRef([]);

  const onLogoClick = () => {
    const now = Date.now();
    logoClicks.current = logoClicks.current.filter((t) => now - t < 600);
    logoClicks.current.push(now);
    if (logoClicks.current.length >= 3) {
      logoClicks.current = [];
      setLogoSpin(true);
      setTimeout(() => setLogoSpin(false), 900);
      toast('🛠️ built by the DBXen community');
    }
  };

  // Close wallet dropdown on tap/click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (!walletRef.current?.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('touchstart', handler);
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [dropdownOpen]);

  const isNXD = protocolMode === 'nxd';

  const handleNXDToggle = () => {
    if (isNXD) {
      setProtocolMode('dbxen');
      setActiveTab('protocol');
    } else {
      // NXD is Ethereum-only — switch chain if needed
      if (chainKey !== 'ethereum') {
        switchChain('ethereum');
      }
      setProtocolMode('nxd');
      setActiveTab('nxd-mint');
    }
  };

  const contractLink = isNXD
    ? `https://etherscan.io/address/${NXD_CONTRACTS.NXDProtocol}#code`
    : `${chain.explorer}/address/${chain.contracts.DBXEN_V2}#code`;

  return (
    <nav>
      <div className="nav-brand" onClick={onLogoClick}>
        <div className={`nav-logo${isNXD ? ' nxd-logo' : ''}${logoSpin ? ' logo-spin' : ''}`}>{isNXD ? 'NX' : 'V2'}</div>
        <div className="nav-name">
          {isNXD ? <>NXD <span className="nxd-accent">V2</span></> : <>DBXen <span>V2</span></>}
        </div>
      </div>

      {/* Protocol Toggle */}
      <div className="protocol-toggle">
        <button className={`protocol-pill${!isNXD ? ' active' : ''}`} onClick={() => { setProtocolMode('dbxen'); setActiveTab('protocol'); }}>
          <Flame size={14} /> <span className="pill-label">DBXen</span>
        </button>
        <button className={`protocol-pill nxd-pill${isNXD ? ' active' : ''}`} onClick={handleNXDToggle}>
          <Zap size={14} /> <span className="pill-label">NXD</span>
        </button>
      </div>

      {!isNXD && <MobileChainDot />}

      <div className="nav-links">
        {!isNXD ? (
          <>
            <button className={`nav-link${activeTab === 'protocol' ? ' active' : ''}`} onClick={() => setActiveTab('protocol')}>
              <Flame size={14} /> Burn
            </button>
            <button className={`nav-link bridge-link${activeTab === 'bridge' ? ' active' : ''}`} onClick={() => setActiveTab('bridge')}>
              <ArrowLeftRight size={14} /> Migration
            </button>
            <button className={`nav-link${activeTab === 'activity' ? ' active' : ''}`} onClick={() => setActiveTab('activity')}>
              <Activity size={14} /> Activity
            </button>
            <button className={`nav-link${activeTab === 'analytics' ? ' active' : ''}`} onClick={() => setActiveTab('analytics')}>
              <BarChart3 size={14} /> Analytics
            </button>
          </>
        ) : (
          <>
            <button className={`nav-link nxd-nav-link${activeTab === 'nxd-mint' ? ' active nxd-active' : ''}`} onClick={() => setActiveTab('nxd-mint')}>
              <Zap size={14} /> Stake
            </button>
            <button className={`nav-link nxd-nav-link${activeTab === 'nxd-analytics' ? ' active nxd-active' : ''}`} onClick={() => setActiveTab('nxd-analytics')}>
              <BarChart3 size={14} /> Analytics
            </button>
            <a className="nav-link nxd-nav-link" href="https://app.uniswap.org/#/swap?inputCurrency=0x1B08d317963CC65932F3f79F00987B2E23df52Ab&outputCurrency=0xCD6Db53AbD32c1B58265E5468a94eFa3B41E37E4" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> Trade NXDv2
            </a>
          </>
        )}
        <a
          className="nav-link lp-link"
          href="https://dbxen-v2-lp.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          title="Community-built LP, locked forever"
          onClick={(e) => {
            // In-app wallet browsers (MetaMask mobile) swallow target="_blank" and
            // just re-render the current page. Navigate in the same tab there.
            if (window.ethereum?.isMetaMask && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
              e.preventDefault();
              window.location.assign('https://dbxen-v2-lp.vercel.app');
            }
          }}
        >
          <Droplet size={14} /> LP
        </a>
        <a className="nav-link" href={contractLink} target="_blank" rel="noopener noreferrer">
          <FileCode size={14} /> Contract
        </a>
      </div>
      <div className="wallet-area">
        <TipJar />
        {!isNXD && <ChainSelector />}
        {!connected ? (
          <button className={`btn-connect${isNXD ? ' nxd-btn-connect' : ''}`} onClick={connectWallet}>
            <Wallet size={16} /> Connect Wallet
          </button>
        ) : (
          <div className="wallet-connected" ref={walletRef}>
            <div className="wallet-eth">{ethBal} {isNXD ? 'ETH' : chain.native}</div>
            <button className="wallet-addr-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <span className="wallet-dot" />
              <span className="addr-desktop">{shortAddr(userAddr)}</span>
              <span className="addr-mobile">{'0x...' + userAddr.slice(-4)}</span>
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <div className="wallet-dropdown show">
                {/* Mobile: address + balance */}
                <div className="wallet-dd-mobile-info">
                  <button className="wallet-dd-addr-copy" onClick={() => { navigator.clipboard.writeText(userAddr); toast.success('Address copied!'); setDropdownOpen(false); }}>
                    <span className="wallet-dd-addr-text">{userAddr}</span>
                    <Copy size={14} />
                  </button>
                  <div className="wallet-dd-balance">{ethBal} {isNXD ? 'ETH' : chain.native}</div>
                </div>
                {/* Desktop: address display */}
                <div className="wallet-dropdown-addr">{userAddr}</div>
                <button className="wallet-dropdown-item" onClick={() => { navigator.clipboard.writeText(userAddr); toast.success('Address copied!'); setDropdownOpen(false); }}>
                  <Copy size={14} /> Copy Address
                </button>
                <a className="wallet-dropdown-item" href={`${(isNXD ? 'https://etherscan.io' : chain.explorer)}/address/${userAddr}`} target="_blank" rel="noopener noreferrer" onClick={() => setDropdownOpen(false)}>
                  <ExternalLink size={14} /> View on Explorer
                </a>
                <button className="wallet-dropdown-item" onClick={() => { disconnectWallet(); setDropdownOpen(false); }}>
                  <LogOut size={14} /> Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
