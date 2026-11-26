// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VindicateDelegate} from "../src/VindicateDelegate.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Stands in for an airdrop: whoever calls `claim` receives tokens.
contract MockAirdrop {
    MockToken public immutable token;

    constructor(MockToken token_) {
        token = token_;
    }

    function claim() external {
        token.mint(msg.sender, 500 ether);
    }

    function broken() external pure {
        revert("closed");
    }
}

contract VindicateDelegateTest is Test {
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    uint16 private constant FEE_BPS = 1_000; // 10%

    VindicateDelegate private impl;
    MockToken private token;
    MockAirdrop private airdrop;

    address private treasury = makeAddr("treasury");
    address private safe = makeAddr("safe");
    address private sponsor = makeAddr("sponsor");
    address private attacker = makeAddr("attacker");

    uint256 private victimKey = 0xA11CE;
    address private victim = vm.addr(victimKey);

    function setUp() public {
        impl = new VindicateDelegate(treasury, FEE_BPS);
        token = new MockToken();
        airdrop = new MockAirdrop(token);

        token.mint(victim, 1_000 ether);
        vm.deal(victim, 10 ether);
        vm.signAndAttachDelegation(address(impl), victimKey);
    }

    // ---------------------------------------------------------------- helpers

    function _recovery(uint256 nonce) private view returns (VindicateDelegate.Recovery memory r) {
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        r.calls = new VindicateDelegate.Call[](0);
        r.tokens = tokens;
        r.sweepNative = true;
        r.recipient = safe;
        r.executor = sponsor;
        r.nonce = nonce;
        r.deadline = block.timestamp + 10 minutes;
    }

    function _sign(VindicateDelegate.Recovery memory r, uint256 key)
        private
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256("Vindicate"), keccak256("1"), block.chainid, victim
            )
        );
        bytes32 structHash = VindicateDelegate(payable(victim)).hashRecovery(r);
        (uint8 v, bytes32 rr, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(rr, s, v);
    }

    function _execute(VindicateDelegate.Recovery memory r, bytes memory sig) private {
        vm.prank(sponsor);
        VindicateDelegate(payable(victim)).execute(r, sig);
    }

    // ---------------------------------------------------------------- happy paths

    function test_SweepsTokensAndNativeWithFee() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        _execute(r, _sign(r, victimKey));

        assertEq(token.balanceOf(victim), 0);
        assertEq(token.balanceOf(safe), 900 ether);
        assertEq(token.balanceOf(treasury), 100 ether);
        assertEq(victim.balance, 0);
        assertEq(safe.balance, 9 ether);
        assertEq(treasury.balance, 1 ether);
        assertEq(VindicateDelegate(payable(victim)).nonce(), 1);
    }

    function test_ClaimsAndSweepsInOneTransaction() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.sweepNative = false;
        r.calls = new VindicateDelegate.Call[](1);
        r.calls[0] =
            VindicateDelegate.Call(address(airdrop), 0, abi.encodeCall(MockAirdrop.claim, ()));

        _execute(r, _sign(r, victimKey));

        assertEq(token.balanceOf(victim), 0);
        assertEq(token.balanceOf(safe), 1_350 ether);
        assertEq(victim.balance, 10 ether, "native untouched when not requested");
    }

    function test_SkipsEmptyBalances() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.tokens[0] = address(new MockToken());
        _execute(r, _sign(r, victimKey));
        assertEq(safe.balance, 9 ether);
    }

    function test_AnyExecutorWhenUnbound() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.executor = address(0);
        bytes memory sig = _sign(r, victimKey);

        vm.prank(makeAddr("relayer"));
        VindicateDelegate(payable(victim)).execute(r, sig);
        assertEq(token.balanceOf(safe), 900 ether);
    }

    // ---------------------------------------------------------------- access control

    function test_RevertWhen_SignedByAnotherKey() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.recipient = attacker;
        bytes memory sig = _sign(r, 0xBAD);

        vm.expectRevert(VindicateDelegate.InvalidSignature.selector);
        _execute(r, sig);
    }

    function test_RevertWhen_RecipientTamperedAfterSigning() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        bytes memory sig = _sign(r, victimKey);
        r.recipient = attacker;

        vm.expectRevert(VindicateDelegate.InvalidSignature.selector);
        _execute(r, sig);
    }

    function test_RevertWhen_Replayed() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        bytes memory sig = _sign(r, victimKey);
        _execute(r, sig);

        vm.expectRevert(abi.encodeWithSelector(VindicateDelegate.InvalidNonce.selector, 1, 0));
        _execute(r, sig);
    }

    function test_RevertWhen_Expired() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        bytes memory sig = _sign(r, victimKey);
        vm.warp(r.deadline + 1);

        vm.expectRevert(abi.encodeWithSelector(VindicateDelegate.Expired.selector, r.deadline));
        _execute(r, sig);
    }

    function test_RevertWhen_WrongExecutor() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        bytes memory sig = _sign(r, victimKey);

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(VindicateDelegate.UnauthorizedExecutor.selector, attacker)
        );
        VindicateDelegate(payable(victim)).execute(r, sig);
    }

    function test_RevertWhen_ZeroRecipient() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.recipient = address(0);
        bytes memory sig = _sign(r, victimKey);

        vm.expectRevert(VindicateDelegate.ZeroAddress.selector);
        _execute(r, sig);
    }

    function test_RevertWhen_CallFails_RollsBackEverything() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        r.calls = new VindicateDelegate.Call[](1);
        r.calls[0] =
            VindicateDelegate.Call(address(airdrop), 0, abi.encodeCall(MockAirdrop.broken, ()));
        bytes memory sig = _sign(r, victimKey);

        vm.expectRevert(
            abi.encodeWithSelector(
                VindicateDelegate.CallFailed.selector,
                0,
                abi.encodeWithSignature("Error(string)", "closed")
            )
        );
        _execute(r, sig);
        assertEq(token.balanceOf(victim), 1_000 ether);
        assertEq(VindicateDelegate(payable(victim)).nonce(), 0);
    }

    function test_RevertWhen_CalledOnImplementationDirectly() public {
        VindicateDelegate.Recovery memory r = _recovery(0);
        bytes memory sig = _sign(r, victimKey);

        vm.prank(sponsor);
        vm.expectRevert(VindicateDelegate.InvalidSignature.selector);
        impl.execute(r, sig);
    }

    // ---------------------------------------------------------------- deployment

    function test_RevertWhen_DeployedWithZeroTreasury() public {
        vm.expectRevert(VindicateDelegate.ZeroAddress.selector);
        new VindicateDelegate(address(0), FEE_BPS);
    }

    function test_RevertWhen_DeployedWithExcessiveFee() public {
        vm.expectRevert(abi.encodeWithSelector(VindicateDelegate.FeeTooHigh.selector, 3_001));
        new VindicateDelegate(treasury, 3_001);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_FeeSplitConservesBalance(uint96 amount) public {
        vm.assume(amount > 0);
        MockToken fresh = new MockToken();
        fresh.mint(victim, amount);

        VindicateDelegate.Recovery memory r = _recovery(0);
        r.tokens[0] = address(fresh);
        r.sweepNative = false;
        _execute(r, _sign(r, victimKey));

        uint256 fee = (uint256(amount) * FEE_BPS) / 10_000;
        assertEq(fresh.balanceOf(treasury), fee);
        assertEq(fresh.balanceOf(safe), amount - fee);
        assertEq(fresh.balanceOf(victim), 0);
    }
}
