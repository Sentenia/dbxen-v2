import { useState, useEffect } from 'react';
import { Lock, Wallet, Timer, Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimerHMS } from '../utils/helpers';
import { txErrorMessage } from '../utils/txError';
import toast from 'react-hot-toast';

export default function StakeCard() {
  const { chain, connected, dxnBal, userStats, protocolStats, stakeTokens, unstakeTokens, addTokenToWallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingTimer, setPendingTimer] = useState('—');

  useEffect(() => {
    if (!userStats.pendingUnlockTs) return;
    const tick = () => {
      const s = userStats.pendingUnlockTs - Math.floor(Date.now() / 1000);
      setPendingTimer(s > 0 ? `Unlock in: ${formatTimerHMS(s)}` : 'Now withdrawable');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userStats.pendingUnlockTs]);

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await stakeTokens(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Stake failed: ' + txErrorMessage(e, chain.native)); }
    finally { setBusy(false); }
  };

  const handleUnstake = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await unstakeTokens(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Unstake failed: ' + txErrorMessage(e, chain.native)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card card-hover fade-up fade-up-3">
      <div className="card-header">
        <div className="card-icon stake"><Lock size={20} color="white" /></div>
        <div>
          <div className="card-title">Stake DXNv2</div>
          <div className="card-desc">Stake DXNv2 to earn {chain.native} protocol fees</div>
        </div>
      </div>

      {connected && (
        <div className="wallet-balance">
          <Wallet size={14} style={{ color: 'var(--cyan)' }} />
          <span>Your DXNv2: <strong>{fmt(dxnBal)}</strong></span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 4, marginBottom: 8 }}>
        {/* Most chains reuse the XEN swap link with the output token swapped (note: a string
            .replace hits only the FIRST occurrence, which is why XEN's address stays first in
            dexUrl). A chain can set dexUrlDxn to override that where the derived link wouldn't
            work — on ETHW the only DXNv2 pool is vvDXNv2/vvXEN and there's no WETHW pair, so
            the input token has to be pinned to vvXEN or the swap opens with no route. */}
        {(chain.dexUrlDxn || chain.dexUrl) && (
          <a href={chain.dexUrlDxn || chain.dexUrl.replace(chain.contracts.XEN, chain.contracts.DXN_V2)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--cyan)', textDecoration: 'none' }}>
            Get {chain.dxnSym} <span style={{ fontSize: 10 }}>&#8599;</span>
          </a>
        )}
        {connected && (
          <button onClick={addTokenToWallet} title={`Add ${chain.dxnSym} to your wallet's token list`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--cyan)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={12} /> Add {chain.dxnSym} to wallet
          </button>
        )}
      </div>

      <div className="input-group">
        <div className="input-label">Amount to Stake</div>
        <input className="input-field" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>Balance: {fmt(dxnBal)} DXNv2</span>
          <span className="link" onClick={() => dxnBal > 0n && setAmount(ethers.formatEther(dxnBal))}>Max</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-action primary" style={{ flex: 1 }} onClick={handleStake} disabled={!connected || busy}>
          {busy ? 'Processing...' : 'Stake'}
        </button>
        <button className="btn-action secondary" style={{ flex: 1 }} onClick={handleUnstake} disabled={!connected || busy}>Unstake</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="stat-row">
          <span className="stat-label">Your Stake</span>
          <span className="stat-value">{fmt(userStats.totalStake)} DXNv2</span>
        </div>
        {userStats.pendingStake > 0n && (
          <>
            <div className="stat-row">
              <span className="stat-label">⏳ Pending (unlocks next cycle)</span>
              <span className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(userStats.pendingStake)} DXNv2</span>
            </div>
            <div className="stat-row">
              <span className="stat-label" />
              <span className="pending-unlock-timer"><Timer size={12} /> {pendingTimer}</span>
            </div>
          </>
        )}
        <div className="stat-row">
          <span className="stat-label">Withdrawable</span>
          <span className="stat-value">{fmt(userStats.withdrawable)} DXNv2</span>
        </div>
        <div className="stat-row" title="Annualized: last completed cycle's protocol fees ÷ the native-token value of all staked DXNv2 (DXNv2 priced via DexScreener). Rough estimate. Fee revenue varies per cycle and DXNv2 DEX liquidity is thin.">
          <span className="stat-label">Est. APR (24h) ⓘ</span>
          <span className="stat-value green">{protocolStats.apy ? protocolStats.apy + '%' : '—'}</span>
        </div>
      </div>
    </div>
  );
}
