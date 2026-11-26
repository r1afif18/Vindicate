// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// Test-only assets and adversaries for web/e2e/scenarios.e2e.test.ts. Nothing here is deployed
// anywhere real. Each contract stands in for one kind of thing a drained wallet meets on chain.

/// @dev Plain BEP-20 with a configurable number of decimals.
contract E2EToken is ERC20 {
    uint8 private immutable _DECIMALS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Old USDT-style token: `transfer`, `transferFrom` and `approve` return nothing.
contract E2ENoReturnToken {
    string public constant name = "Legacy Dollar";
    string public constant symbol = "LUSD";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
    }

    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @dev Burns 5% of every transfer, so the receiver gets less than was sent.
contract E2EFeeOnTransferToken is ERC20 {
    constructor() ERC20("Taxed", "TAX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 burned = value * 5 / 100;
        super._update(from, address(0), burned);
        super._update(from, to, value - burned);
    }
}

/// @dev Issuer can freeze a holder, after which that holder's transfers revert.
contract E2EFreezableToken is ERC20 {
    mapping(address => bool) public frozen;

    constructor() ERC20("Freezable", "FRZ") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function freeze(address holder) external {
        frozen[holder] = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!frozen[from], "frozen");
        super._update(from, to, value);
    }
}

/// @dev MKR-style metadata: `symbol` is a bytes32, not a string.
contract E2EBytes32SymbolToken {
    bytes32 public constant symbol = "OLD";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

contract E2ENft is ERC721 {
    constructor() ERC721("Fresh Apes", "FAPE") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    /// @dev Airdrop path that checks the receiver hook when `to` has code.
    function safeMint(address to, uint256 id) external {
        _safeMint(to, id);
    }
}

contract E2EItems is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

/// @dev Airdrop: each address claims 500 tokens once.
contract E2EAirdrop {
    E2EToken public immutable TOKEN;
    mapping(address => bool) public claimed;

    constructor(E2EToken token_) {
        TOKEN = token_;
    }

    function claim() external {
        require(!claimed[msg.sender], "already claimed");
        claimed[msg.sender] = true;
        TOKEN.mint(msg.sender, 500 ether);
    }

    function closed() external pure {
        revert("airdrop closed");
    }
}

/// @dev Native staking vault: `unstake` sends the caller's BNB back to it.
contract E2EVault {
    mapping(address => uint256) public staked;

    function stake() external payable {
        staked[msg.sender] += msg.value;
    }

    function unstake() external {
        uint256 amount = staked[msg.sender];
        require(amount != 0, "nothing staked");
        staked[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }
}

/// @dev Drainer contract the victim once approved. Pulls to whoever deployed it.
contract E2EDrainer {
    address public immutable BOSS;

    constructor() {
        BOSS = msg.sender;
    }

    function pull(address token, address from, uint256 amount) external {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, BOSS, amount)
        );
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "pull failed");
    }

    function pullNft(address collection, address from, uint256 id) external {
        ERC721(collection).transferFrom(from, BOSS, id);
    }
}

/// @dev A drainer's own EIP-7702 delegate: anyone may sweep the wallet to the boss, and any
///      unknown call (including Vindicate's `execute`) is silently accepted.
contract E2EDrainerDelegate {
    address public immutable BOSS;

    constructor(address boss_) {
        BOSS = boss_;
    }

    function sweepNative() external {
        (bool ok,) = BOSS.call{value: address(this).balance}("");
        require(ok, "send failed");
    }

    fallback() external payable {}

    receive() external payable {}
}

/// @dev A safe wallet that is a contract, like a multisig: accepts BNB and NFTs.
contract E2EContractSafe {
    receive() external payable {}

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
}

/// @dev A contract that cannot receive BNB or NFTs. A wrong "safe wallet" address.
contract E2ERejectingSafe {}

/// @dev Token staking vault: takes a token with `stake`, hands it back with `unstake`. It exposes
///      no getter naming the token, so the only clue to what it pays is the wallet's own history.
contract E2ETokenVault {
    mapping(address => mapping(address => uint256)) public staked;
    mapping(address => address) public tokenOf;

    function stake(address token, uint256 amount) external {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
        staked[msg.sender][token] += amount;
        tokenOf[msg.sender] = token;
    }

    function unstake() external {
        address token = tokenOf[msg.sender];
        uint256 amount = staked[msg.sender][token];
        require(amount != 0, "nothing staked");
        staked[msg.sender][token] = 0;
        ERC20(token).transfer(msg.sender, amount);
    }
}

/// @dev Old-style token that reports failure by returning false instead of reverting.
contract E2EFalseReturnToken {
    string public constant symbol = "FLS";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

/// @dev Emits a TransferSingle-shaped log with no data, naming any address as the receiver.
///      Anyone can do this to a wallet, so readers of history must survive it.
contract E2ELogSpammer {
    function spam(address victim) external {
        bytes32 sig = keccak256("TransferSingle(address,address,address,uint256,uint256)");
        assembly {
            log4(0, 0, sig, 0, 0, victim)
        }
    }
}
