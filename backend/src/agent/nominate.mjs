// nominate.mjs — Submit staking.nominate extrinsic and log the action.

import { getApi } from '../chain/substrate.mjs';
import { getRelayerSigner, getRegistryContract } from '../chain/evm.mjs';
import { ethers } from 'ethers';

// Submit staking.nominate(targets) from the managed sr25519 keypair.
// Returns the extrinsic hash (hex string).
export async function submitNominate(pair, targets) {
  const api = await getApi();
  const tx  = api.tx.staking.nominate(targets);

  return new Promise((resolve, reject) => {
    tx.signAndSend(pair, ({ status, dispatchError }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          reject(new Error(`${decoded.section}.${decoded.name}`));
        } else {
          reject(new Error(dispatchError.toString()));
        }
        return;
      }
      if (status.isFinalized) {
        resolve(status.asFinalized.toHex());
      }
    }).catch(reject);
  });
}

// Log the agent action in PolicyRegistry (called via EVM by the agent signer).
export async function logAction(policyOwnerEVM, era, policyVersion, ruleBroken, extrinsicHash, fromSet, toSet) {
  const signer   = getRelayerSigner();
  const registry = getRegistryContract(signer);

  const fromSetHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [fromSet]));
  const toSetHash   = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [toSet]));
  const extHash     = extrinsicHash.startsWith('0x') ? extrinsicHash : `0x${extrinsicHash}`;
  // Pad to 32 bytes (block hash is 32 bytes, extrinsic hash is also 32)
  const extHash32   = extHash.padEnd(66, '0');

  // Estimate gas (Revive returns weight; pass directly as gasLimit)
  const calldata = registry.interface.encodeFunctionData('logAction', [
    policyOwnerEVM, era, policyVersion, ruleBroken, extHash32, fromSetHash, toSetHash,
  ]);
  const gasLimit = await signer.provider.estimateGas({
    from: signer.address,
    to:   await registry.getAddress(),
    data: calldata,
  });

  const tx = await registry.logAction(
    policyOwnerEVM, era, policyVersion, ruleBroken, extHash32, fromSetHash, toSetHash,
    { gasLimit },
  );
  const receipt = await tx.wait();
  console.log(`[agent] logAction confirmed block=${receipt.blockNumber}`);
  return receipt;
}
