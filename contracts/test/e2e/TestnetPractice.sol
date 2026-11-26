// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Practice-only contract for web/scripts/testnet-wallets.mjs. BNB testnet only.

/// @dev An airdrop that pays out a token that already exists on the network (WBNB on testnet),
/// instead of minting a mock. Each address can claim once, while the contract is funded.
contract PracticeTokenDrop {
    IERC20 public immutable TOKEN;
    uint256 public immutable AMOUNT;
    mapping(address => bool) public claimed;

    constructor(IERC20 token_, uint256 amount_) {
        TOKEN = token_;
        AMOUNT = amount_;
    }

    function claim() external {
        require(!claimed[msg.sender], "already claimed");
        claimed[msg.sender] = true;
        require(TOKEN.transfer(msg.sender, AMOUNT), "transfer failed");
    }
}
