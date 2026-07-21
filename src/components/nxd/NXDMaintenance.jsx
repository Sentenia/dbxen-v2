import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmt } from '../../utils/helpers';

export default function NXDMaintenance() {
  const { protocolStats, maintenanceStats, updateOracle, collectFees, stakeProtocolDXN } = useNXD();
  const [loading, setLoading] = useState({ oracle: false, fees: false, stake: false });

  const run = async (key, fn) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try { await fn(); } catch (e) {
      console.error(`[NXD maintenance ${key}]`, e);
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const pendingDxnFloat = protocolStats.pendingDXNToStake > 0n
    ? parseFloat(ethers.formatEther(protocolStats.pendingDXNToStake))
    : 0;

  return (
    <div className="card nxd-card" style={{ marginTop: 24 }}>
      <div className="card-header">
        <div className="card-icon nxd-icon-maintenance"><Wrench size={20} color="white" /></div>
        <div>
          <div className="card-title">Protocol Maintenance</div>
          <div className="card-desc">Community-callable functions to keep the protocol healthy</div>
        </div>
      </div>

      <div className="maintenance-actions">
        <div className="maintenance-action">
          <div className="maintenance-info">
            <div className="maintenance-name">Refresh Price Feed</div>
            <div className="maintenance-desc">Updates the TWAP oracle (5 min cooldown)</div>
          </div>
          <button
            className="btn nxd-btn-maintenance"
            disabled={!maintenanceStats.canUpdateOracle || loading.oracle}
            title={!maintenanceStats.canUpdateOracle ? 'Cooldown active, try again in a few minutes' : 'Update oracle price feed'}
            onClick={() => run('oracle', updateOracle)}
          >
            {loading.oracle ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className="maintenance-action">
          <div className="maintenance-info">
            <div className="maintenance-name">Collect Fees</div>
            <div className="maintenance-desc">Claims accumulated ETH and distributes to vault, buy+burn, and staking</div>
          </div>
          <button
            className="btn nxd-btn-maintenance"
            disabled={loading.fees}
            onClick={() => run('fees', collectFees)}
          >
            {loading.fees ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className="maintenance-action">
          <div className="maintenance-info">
            <div className="maintenance-name">Stake Protocol DXNv2</div>
            <div className="maintenance-desc">
              Stakes pending DXNv2 in the protocol{pendingDxnFloat > 0 ? ` (${fmt(protocolStats.pendingDXNToStake)} DXNv2 pending)` : ''}
            </div>
          </div>
          <button
            className="btn nxd-btn-maintenance"
            disabled={loading.stake}
            onClick={() => run('stake', stakeProtocolDXN)}
          >
            {loading.stake ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  );
}
