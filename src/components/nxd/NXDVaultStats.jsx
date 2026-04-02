import { useState, useEffect, useCallback } from 'react';
import { Lock, Info } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmt, fmtFixed, shortAddr } from '../../utils/helpers';
import { NXD_CONTRACTS, NXD_ABIS } from '../../config/nxd';
import { useWallet } from '../../hooks/WalletContext';

export default function NXDVaultStats() {
  const { protocolStats, vaultStats } = useNXD();
  const { connected, chainKey, contractsRef } = useWallet();
  const [governance, setGovernance] = useState(null);

  const fetchGovernance = useCallback(async () => {
    try {
      let provider;
      if (connected && chainKey === 'ethereum' && contractsRef.current.provider) {
        provider = contractsRef.current.provider;
      } else {
        provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth');
      }
      const token = new ethers.Contract(NXD_CONTRACTS.NXDv2Token, NXD_ABIS.NXDv2Token, provider);
      const gov = await token.governance();
      setGovernance(gov);
    } catch (e) {
      console.error('[NXDVaultStats] governance() read failed', e);
    }
  }, [connected, chainKey, contractsRef]);

  useEffect(() => { fetchGovernance(); }, [fetchGovernance]);

  const isRenounced = governance && governance === ethers.ZeroAddress;

  const totalDxnLocked = (protocolStats.totalDXNDeposited || 0n) + (protocolStats.dxnStaked || 0n);

  const maxSupFloat = protocolStats.maxSupply > 0n ? parseFloat(ethers.formatEther(protocolStats.maxSupply)) : 0;
  const burnPct = protocolStats.nxdSupply > 0n && protocolStats.nxdBurned > 0n
    ? ((parseFloat(ethers.formatEther(protocolStats.nxdBurned)) / (parseFloat(ethers.formatEther(protocolStats.nxdSupply)) + parseFloat(ethers.formatEther(protocolStats.nxdBurned)))) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="nxd-vault-stats fade-up fade-up-3">
      {/* DXN Holdings TVL Overview */}
      <div className="card nxd-card">
        <div className="card-header">
          <div className="card-icon nxd-icon-stake"><Lock size={20} color="white" /></div>
          <div>
            <div className="card-title">DXN Holdings TVL Overview</div>
            <div className="card-desc">Protocol DXN lock metrics</div>
          </div>
        </div>
        <div className="stat-row">
          <span className="stat-label">DXN Staked (LMP)</span>
          <span className="stat-value">{fmt(protocolStats.totalDXNDeposited)} DXN</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">DXN Compounded</span>
          <span className="stat-value">{fmt(protocolStats.dxnStaked)} DXN</span>
        </div>
        <div className="stat-row stat-total">
          <span className="stat-label">Total DXN Locked</span>
          <span className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(totalDxnLocked)} DXN</span>
        </div>
      </div>

      {/* ETH Distribution Strategy */}
      <div className="card nxd-card">
        <div className="card-header">
          <div className="card-icon nxd-icon-stake"><Lock size={20} color="white" /></div>
          <div>
            <div className="card-title">ETH Distribution Strategy</div>
            <div className="card-desc">Protocol fee allocation</div>
          </div>
        </div>
        <div className="stat-row stat-total">
          <span className="stat-label">Total ETH Distributed</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{fmtFixed(protocolStats.ethToVault, 6)} ETH</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">DXN Compounded</span>
          <span className="stat-value">{fmt(protocolStats.dxnStaked)} DXN</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">DXN Burned</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{fmt(protocolStats.dxnBurned)} DXN</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">NXD Burned</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{fmt(protocolStats.nxdBurned)} NXD</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">To Staking Vault</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{fmtFixed(protocolStats.ethToVault, 6)} ETH</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Dev Fee</span>
          <span className="stat-value">{fmtFixed(protocolStats.ethDevFee, 6)} ETH</span>
        </div>
      </div>

      {/* Protocol Info */}
      <div className="card nxd-card">
        <div className="card-header">
          <div className="card-icon nxd-icon-info"><Info size={20} color="white" /></div>
          <div>
            <div className="card-title">Protocol Info</div>
            <div className="card-desc">NXDv2 tokenomics and mechanics</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Sell Tax Breakdown (5%)</div>
          <div className="stat-row"><span className="stat-label">Burn NXD</span><span className="stat-value" style={{ color: 'var(--red)' }}>1.5%</span></div>
          <div className="stat-row"><span className="stat-label">Stake DXN</span><span className="stat-value">1.5%</span></div>
          <div className="stat-row"><span className="stat-label">Add to LP</span><span className="stat-value">1%</span></div>
          <div className="stat-row"><span className="stat-label">Dev Fee</span><span className="stat-value">1%</span></div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>ETH Fee Split</div>
          <div className="stat-row"><span className="stat-label">Buy + Burn NXD</span><span className="stat-value" style={{ color: 'var(--amber)' }}>50%</span></div>
          <div className="stat-row"><span className="stat-label">Stake DXN</span><span className="stat-value">30%</span></div>
          <div className="stat-row"><span className="stat-label">Staking Vault</span><span className="stat-value" style={{ color: 'var(--green)' }}>15%</span></div>
          <div className="stat-row"><span className="stat-label">Burn DXN</span><span className="stat-value" style={{ color: 'var(--red)' }}>5%</span></div>
          <div className="stat-row"><span className="stat-label">Dev Fee</span><span className="stat-value">5%</span></div>
        </div>

        <div className="stat-row"><span className="stat-label">Max Supply</span><span className="stat-value">{maxSupFloat.toLocaleString()} NXD</span></div>
        <div className="stat-row"><span className="stat-label">NXD Burned %</span><span className="stat-value" style={{ color: 'var(--red)' }}>{burnPct}%</span></div>
        <div className="stat-row"><span className="stat-label">Withdraw Cooldown</span><span className="stat-value">24 hours</span></div>
        <div className="stat-row"><span className="stat-label">Early Withdraw Penalty</span><span className="stat-value" style={{ color: 'var(--red)' }}>25%</span></div>
        <div className="stat-row">
          <span className="stat-label">Contract Owner</span>
          <span className="stat-value" style={{ color: isRenounced ? 'var(--green)' : 'var(--text-primary)' }}>
            {governance === null ? '—' : isRenounced ? 'Renounced' : shortAddr(governance)}
          </span>
        </div>
      </div>
    </div>
  );
}
