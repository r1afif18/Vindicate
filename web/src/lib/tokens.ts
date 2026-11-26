import type { Address } from "viem"

import type { NetworkId } from "@/lib/chains"

/**
 * Tokens checked automatically on scan. Symbol and decimals are always read on-chain,
 * so this list only decides which contracts to look at. Users can add any other token.
 */
export const watchedTokens: Record<NetworkId, readonly Address[]> = {
  bsc: [
    "0x55d398326f99059fF775485246999027B3197955", // USDT
    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
    "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", // FDUSD
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // ETH
    "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB
    "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
  ],
  "bsc-testnet": [
    "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // WBNB
    "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", // USDT
    "0x64544969ed7EBf5f083679233325356EbE738930", // USDC
    "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee", // BUSD
    "0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867", // DAI
    "0xFa60D973F7642B748046464e165A65B7323b0DEE", // CAKE
  ],
}
