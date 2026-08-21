// Turns an ethers/wallet transaction error into a short, human sentence.
// `nativeSymbol` is the chain's gas coin (ETH, BNB, POL, AVAX, ...) so the
// message names what the user is actually short of, per chain.
export function txErrorMessage(e, nativeSymbol = 'ETH') {
  if (!e) return 'Unknown error';

  if (e.code === 'ACTION_REJECTED' || e.code === 4001) return 'Cancelled in wallet';

  const msg = String(e.reason || e.shortMessage || e.message || e);

  if (e.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(msg)) {
    return `Not enough ${nativeSymbol} to cover this transaction`;
  }

  // ethers throws this when a node returns no revert data at all for a failed
  // call/estimateGas — almost always because the wallet can't cover value + gas,
  // occasionally a revert whose reason the RPC stripped.
  if (e.code === 'CALL_EXCEPTION' && !e.reason && /missing revert data/i.test(msg)) {
    return `Not enough ${nativeSymbol} to cover gas (or the transaction would revert)`;
  }

  if (e.reason) return e.reason; // decoded require()/revert string — already readable

  // Fall back to ethers' short message, trimmed of the "(action=..., data=...,
  // transaction={...})" tail it appends to everything.
  return (e.shortMessage || msg).split(' (')[0];
}
