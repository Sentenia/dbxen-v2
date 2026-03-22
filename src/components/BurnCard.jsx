import { useState, useEffect } from 'react';
import { Flame, Fuel, TrendingDown, Wallet, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimer } from '../utils/helpers';
import { getBatchSize, getBatchDisplay } from '../config/chains';
import toast from 'react-hot-toast';

export default function BurnCard() {
  const { chain, connected, connectWallet, xenBal, burnBatch, getGasInfo, protocolStats } = useWallet();
  const [batches, setBatches] = useState(1);
  const [gasPrice, setGasPrice] = useState(null);
  const [burning, setBurning] = useState(false);
  const [timerStr, setTimerStr] = useState('—');

  const batchDisplay = getBatchDisplay(chain);
  const maxBatches = Number(xenBal / getBatchSize(chain));
  const xenCost = batches * batchDisplay;
  const discountPct = (batches * 5 / 1000).toFixed(2);

  useEffect(() => {
    getGasInfo().then(gp => gp && setGasPrice(gp));
    const id = setInterval(() => getGasInfo().then(gp => gp && setGasPrice(gp)), 15000);
    return () => clearInterval(id);
  }, [getGasInfo]);

  useEffect(() => {
    if (!protocolStats.nextCycleTs) return;
    const tick = () => {
      const s = protocolStats.nextCycleTs - Math.floor(Date.now() / 1000);
      setTimerStr(s > 0 ? formatTimer(s) : 'New cycle!');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [protocolStats.nextCycleTs]);

  const gasPriceGwei = gasPrice ? parseFloat(ethers.formatUnits(gasPrice, 'gwei')) : null;
  const gasLevel = gasPriceGwei > 20 ? 'high' : gasPriceGwei > 5 ? 'med' : 'low';

  let estFee = null;
  if (gasPrice) {
    const isL2 = chain.chainId !== '0x1';
    const gasEst = BigInt(isL2 ? 600000 : 200000) + 39400n;
    const disc = BigInt(batches) * (100000n - 5n * BigInt(batches));
    let fee = (gasEst * gasPrice * disc) / 100000n;
    if (fee < (chain.minFee || 0n)) fee = chain.minFee;
    estFee = parseFloat(ethers.formatEther(fee));
  }

  const handleBurn = async () => {
    if (!connected) { connectWallet(); return; }
    setBurning(true);
    try { await burnBatch(batches); setBatches(1); }
    catch (e) { toast.error('Burn failed: ' + (e.reason || e.message)); }
    finally { setBurning(false); }
  };

  // Slider fill percentage
  const sliderPct = ((batches - 1) / (10000 - 1)) * 100;

  return (
    <div className="card card-hover fade-up fade-up-2">
      <div className="card-header">
        <div className="card-icon burn"><Flame size={20} color="white" /></div>
        <div>
          <div className="card-title">Burn XEN</div>
          <div className="card-desc">Burn XEN tokens to earn DXN rewards</div>
        </div>
      </div>

      {connected && (
        <div className="wallet-balance">
          <Wallet size={14} style={{ color: 'var(--cyan)' }} />
          <span>Your XEN: <strong>{fmt(xenBal, 0)}</strong></span>
          <span className="balance-sub">({maxBatches.toLocaleString()} batches)</span>
        </div>
      )}
      {chain.dexUrl && (
        <a href={chain.dexUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--cyan)', textDecoration: 'none', marginTop: 4, marginBottom: 8 }}>
          Get {chain.xenSym} <span style={{ fontSize: 10 }}>&#8599;</span>
        </a>
      )}

      <div className="input-group">
        <div className="input-label">Number of Batches</div>
        <input
          className="input-field" type="number" value={batches} min={1} max={10000}
          onChange={(e) => setBatches(Math.max(1, Math.min(parseInt(e.target.value) || 1, 10000)))}
        />
        <input
          className="range-slider" type="range" min={1} max={10000} value={batches}
          onChange={(e) => setBatches(parseInt(e.target.value))}
          style={{ background: `linear-gradient(to right, var(--amber) 0%, var(--amber) ${sliderPct}%, var(--border) ${sliderPct}%, var(--border) 100%)` }}
        />
        <div className="input-hint">
          <span>{xenCost.toLocaleString()} XEN</span>
          <span className="link" onClick={() => maxBatches > 0 && setBatches(Math.min(maxBatches, 10000))}>Max</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="gas-box">
          <div className="gas-box-icon"><Fuel size={14} style={{ color: 'var(--cyan)' }} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="gas-box-label">Gas Price</div>
            <div className="gas-box-value">
              {gasPriceGwei ? <>{gasPriceGwei.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>gwei · {gasLevel}</span></> : '— gwei'}
            </div>
          </div>
        </div>
        <div className="gas-box">
          <div className="gas-box-icon"><TrendingDown size={14} style={{ color: 'var(--green)' }} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="gas-box-label">Batch Discount</div>
            <div className="gas-box-value" style={{ color: 'var(--green)' }}>-{discountPct}%</div>
          </div>
        </div>
      </div>

      <button className={`btn-action primary btn-shimmer${burning ? ' btn-loading' : ''}`} onClick={handleBurn} disabled={burning}>
        {burning ? <Loader2 size={16} className="spin" /> : <Flame size={16} />}
        {burning ? 'Burning...' : connected ? `Burn ${chain.xenSym}` : 'Connect Wallet to Burn'}
      </button>

      <div style={{ marginTop: 16 }}>
        <div className="stat-row">
          <span className="stat-label">XEN Cost</span>
          <span className="stat-value">{xenCost.toLocaleString()} XEN</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Est. Protocol Fee</span>
          <span className="stat-value">{estFee !== null ? `~${estFee.toFixed(4)} ${chain.native}` : '—'}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Next Cycle</span>
          <span className="stat-value green">{timerStr}</span>
        </div>
      </div>
    </div>
  );
}
