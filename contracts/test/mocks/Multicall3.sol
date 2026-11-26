// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Minimal `aggregate3` from Multicall3, for local chains that lack the canonical deployment.
///      Test-only: the web integration test plants this at 0xcA11bde05977b3631167028862bE2a173976CA11.
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory results) {
        results = new Result[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory data) = calls[i].target.call(calls[i].callData);
            require(ok || calls[i].allowFailure, "Multicall3: call failed");
            results[i] = Result(ok, data);
        }
    }
}
