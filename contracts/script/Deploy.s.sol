// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {VindicateDelegate} from "../src/VindicateDelegate.sol";

/// @notice Deploys VindicateDelegate.
/// @dev Env: TREASURY (fee receiver), FEE_BPS (default 1000 = 10%).
///      forge script script/Deploy.s.sol --rpc-url bsc_testnet --account deployer --broadcast --verify
contract Deploy is Script {
    function run() external returns (VindicateDelegate delegate) {
        address treasury = vm.envAddress("TREASURY");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(1_000)));

        vm.startBroadcast();
        delegate = new VindicateDelegate(treasury, feeBps);
        vm.stopBroadcast();

        console2.log("VindicateDelegate", address(delegate));
    }
}
