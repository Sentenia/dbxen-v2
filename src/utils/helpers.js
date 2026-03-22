import { ethers } from 'ethers';

export function fmt(wei, decimals = 2) {
  const str = ethers.formatEther(wei);
  const num = parseFloat(str);
  // Always show 2 decimal places at T/B/M scale regardless of decimals param
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function shortAddr(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export function formatTimer(secsLeft) {
  if (secsLeft <= 0) return null;
  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatTimerHMS(secsLeft) {
  if (secsLeft <= 0) return null;
  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;
  return `${h}h ${m}m ${s}s`;
}

export function formatDeadline(secsLeft) {
  if (secsLeft <= 0) return 'CLOSED';
  const days = Math.floor(secsLeft / 86400);
  const hours = Math.floor((secsLeft % 86400) / 3600);
  return `${days}d ${hours}h remaining`;
}
