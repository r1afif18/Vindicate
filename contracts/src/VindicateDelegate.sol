// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title VindicateDelegate
/// @notice EIP-7702 delegation target that lets the owner of a compromised EOA move its assets
///         to a safe wallet in a single transaction, with gas paid by a separate wallet.
/// @dev The code runs in the context of the delegating EOA, so `address(this)` is the EOA.
///      Every recovery must carry an EIP-712 signature from that EOA, bound to a nonce, a deadline
///      and (optionally) the address allowed to submit it. Without that signature nothing moves,
///      so a wallet left delegated to this contract cannot be drained by third parties.
///      State lives in an ERC-7201 namespaced slot to avoid clashing with other delegates.
contract VindicateDelegate is EIP712 {
    using SafeERC20 for IERC20;

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    struct Recovery {
        Call[] calls;
        address[] tokens;
        bool sweepNative;
        address recipient;
        address executor;
        uint256 nonce;
        uint256 deadline;
    }

    /// @custom:storage-location erc7201:vindicate.storage.delegate
    struct DelegateStorage {
        uint256 nonce;
    }

    bytes32 public constant CALL_TYPEHASH =
        keccak256("Call(address target,uint256 value,bytes data)");
    bytes32 public constant RECOVERY_TYPEHASH = keccak256(
        "Recovery(Call[] calls,address[] tokens,bool sweepNative,address recipient,address executor,uint256 nonce,uint256 deadline)"
        "Call(address target,uint256 value,bytes data)"
    );

    uint16 public constant MAX_FEE_BPS = 3_000;
    uint16 private constant BPS = 10_000;

    // keccak256(abi.encode(uint256(keccak256("vindicate.storage.delegate")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_SLOT =
        0x39229323e81384f951a0cdef3eff5fe1b85bb796dc156831150ba46c8b86cd00;

    /// @notice Receives the protocol fee on swept assets.
    address public immutable treasury;
    /// @notice Protocol fee on swept assets, in basis points. Arbitrary calls are never charged.
    uint16 public immutable feeBps;

    event Recovered(address indexed recipient, address indexed executor, uint256 nonce);
    event Swept(address indexed token, address indexed recipient, uint256 amount, uint256 fee);

    error ZeroAddress();
    error FeeTooHigh(uint16 feeBps);
    error Expired(uint256 deadline);
    error InvalidNonce(uint256 expected, uint256 provided);
    error UnauthorizedExecutor(address executor);
    error InvalidSignature();
    error CallFailed(uint256 index, bytes reason);

    constructor(address treasury_, uint16 feeBps_) EIP712("Vindicate", "1") {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    /// @notice Runs the signed calls, then sweeps the listed tokens and (optionally) the native
    ///         balance to `recovery.recipient`, minus the protocol fee.
    /// @param recovery The instruction the EOA owner signed.
    /// @param signature EIP-712 signature of `recovery` by the delegating EOA.
    function execute(Recovery calldata recovery, bytes calldata signature) external {
        if (block.timestamp > recovery.deadline) revert Expired(recovery.deadline);
        if (recovery.executor != address(0) && msg.sender != recovery.executor) {
            revert UnauthorizedExecutor(msg.sender);
        }
        if (recovery.recipient == address(0)) revert ZeroAddress();

        DelegateStorage storage $ = _storage();
        if (recovery.nonce != $.nonce) revert InvalidNonce($.nonce, recovery.nonce);
        unchecked {
            $.nonce = recovery.nonce + 1;
        }

        bytes32 digest = _hashTypedDataV4(hashRecovery(recovery));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != address(this)) {
            revert InvalidSignature();
        }

        emit Recovered(recovery.recipient, msg.sender, recovery.nonce);

        _runCalls(recovery.calls);
        _sweepTokens(recovery.tokens, recovery.recipient);
        if (recovery.sweepNative) _sweepNative(recovery.recipient);
    }

    /// @notice Next nonce the EOA owner must sign.
    function nonce() external view returns (uint256) {
        return _storage().nonce;
    }

    /// @notice EIP-712 struct hash of a recovery instruction. Exposed so clients can cross-check.
    function hashRecovery(Recovery calldata recovery) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RECOVERY_TYPEHASH,
                _hashCalls(recovery.calls),
                keccak256(abi.encodePacked(recovery.tokens)),
                recovery.sweepNative,
                recovery.recipient,
                recovery.executor,
                recovery.nonce,
                recovery.deadline
            )
        );
    }

    /// @dev Keeps NFT airdrops that use `safeMint` from reverting while the EOA is delegated.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    receive() external payable {}

    function _runCalls(Call[] calldata calls) private {
        for (uint256 i; i < calls.length; ++i) {
            Call calldata c = calls[i];
            (bool ok, bytes memory reason) = c.target.call{value: c.value}(c.data);
            if (!ok) revert CallFailed(i, reason);
        }
    }

    function _sweepTokens(address[] calldata tokens, address recipient) private {
        for (uint256 i; i < tokens.length; ++i) {
            IERC20 token = IERC20(tokens[i]);
            uint256 balance = token.balanceOf(address(this));
            if (balance == 0) continue;
            uint256 fee = _fee(balance);
            if (fee != 0) token.safeTransfer(treasury, fee);
            token.safeTransfer(recipient, balance - fee);
            emit Swept(address(token), recipient, balance - fee, fee);
        }
    }

    function _sweepNative(address recipient) private {
        uint256 balance = address(this).balance;
        if (balance == 0) return;
        uint256 fee = _fee(balance);
        if (fee != 0) Address.sendValue(payable(treasury), fee);
        Address.sendValue(payable(recipient), balance - fee);
        emit Swept(address(0), recipient, balance - fee, fee);
    }

    function _fee(uint256 amount) private view returns (uint256) {
        return (amount * feeBps) / BPS;
    }

    function _hashCalls(Call[] calldata calls) private pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            hashes[i] = keccak256(
                abi.encode(CALL_TYPEHASH, calls[i].target, calls[i].value, keccak256(calls[i].data))
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _storage() private pure returns (DelegateStorage storage $) {
        assembly {
            $.slot := STORAGE_SLOT
        }
    }
}
