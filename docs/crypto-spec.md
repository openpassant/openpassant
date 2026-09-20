# Passant crypto spec (`passant-crypto/1`)

Status: normative. This document defines, byte for byte, how a passport version becomes a Merkle leaf, how leaves become a root, and how anyone verifies a passport against an anchored root. If an implementation disagrees with the test vectors in `docs/test-vectors.json`, the implementation is wrong.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Primitives

| Item | Definition |
| --- | --- |
| Hash | SHA-256. `H(x)` is the 32-byte digest of byte string `x`. |
| Concatenation | `a \|\| b` is byte concatenation with no separators or length prefixes. |
| Canonical JSON | RFC 8785 (JSON Canonicalization Scheme, JCS), encoded as UTF-8 with no BOM. `JCS(v)` is that byte string. |
| Salt | 16 bytes from a cryptographically secure random source. One fresh salt per tier per version. Salts MUST NOT be reused or derived from passport content. |
| Hex | Lowercase hexadecimal, no `0x` prefix, in all JSON produced by Passant. The `0x` prefix is used only for on-chain values (addresses, transaction ids, `bytes32` arguments). |

Domain-separation bytes prevent a value of one kind from being mistaken for another:

| Prefix | Used for |
| --- | --- |
| `0x10` | Tier hash |
| `0x00` | Leaf hash |
| `0x01` | Merkle interior node |

Note: the HLD shows the hashing formula without these prefix bytes for readability. This spec is authoritative.

## 2. Tier documents

Each passport version is split into exactly three tier documents, one per access tier, in this fixed order:

1. `public`
2. `legitimate_interest`
3. `authority`

A tier document is a JSON object with exactly these four members:

```json
{
  "id": "<passport identifier URL, identical in all three>",
  "version": 1,
  "tier": "public",
  "data": { }
}
```

- `id` and `version` bind the hash to one passport version, so a tier document cannot be replayed under another passport or version.
- `version` is a positive integer starting at 1.
- `data` holds the schema fields tagged with that tier. A tier with no fields MUST still be present with `"data": {}`; it is hashed like any other.
- `core` treats `data` as opaque JSON. Which field belongs to which tier is the schema's job, not this spec's.

**Numbers.** JCS serialises numbers using the ECMAScript number-to-string algorithm. All numbers MUST be finite. Implementations in languages other than JavaScript MUST reproduce that algorithm exactly. To stay clear of edge cases, the schema SHOULD express measured quantities as integers in a smaller unit (for example watt-hours, not kilowatt-hours) or as decimal strings.

## 3. Hash construction

```
tierHash(t) = H( 0x10 || salt_t || JCS(tierDoc_t) )          t in {public, legitimate_interest, authority}
leaf        = H( 0x00 || tierHash(public) || tierHash(legitimate_interest) || tierHash(authority) )
```

The leaf preimage is always 1 + 32 + 32 + 32 = 97 bytes.

## 4. Merkle tree

The tree follows the structure of RFC 6962 section 2.1. Passant leaves are already hashed (section 3), so they enter the tree as they are; the RFC's own leaf-hashing step is NOT applied again.

For an ordered list of leaves `D[0..n-1]`, `n >= 1`:

```
MTH(D[0..0])   = D[0]
MTH(D[0..n-1]) = H( 0x01 || MTH(D[0..k-1]) || MTH(D[k..n-1]) )      for n > 1
                 where k is the largest power of two strictly less than n
```

- Leaf order is the order in which versions were added to the batch. It MUST be recorded, since the root depends on it.
- There is no padding and no duplication of the last leaf. (Duplicating leaves, as Bitcoin does, allows two different leaf lists to share a root.)
- A batch of one leaf has `root = leaf` and an empty proof.
- An empty batch is not anchored.

### 4.1 Proof (audit path)

A proof is an ordered list of steps from the leaf up to the root. Each step carries a sibling hash and the side the sibling is on:

```
PATH(m, D[0..0])   = []
PATH(m, D[0..n-1]) = PATH(m, D[0..k-1])     ++ [ (right, MTH(D[k..n-1])) ]     if m <  k
                   = PATH(m - k, D[k..n-1]) ++ [ (left,  MTH(D[0..k-1])) ]     if m >= k
```

### 4.2 Folding a proof

```
h = leaf
for each step in order:
    if step.position == "right":  h = H( 0x01 || h || step.hash )
    if step.position == "left":   h = H( 0x01 || step.hash || h )
root' = h
```

Carrying the position in each step means a verifier needs neither the leaf index nor the batch size.

## 5. Proof bundle (`passant-proof/1`)

The resolver returns this object alongside a passport. Tiers the caller may see appear as `doc` + `salt`; the others appear as a bare `hash`.

```json
{
  "spec": "passant-proof/1",
  "id": "https://id.example.com/01/09506000134352/21/SN-0001",
  "version": 1,
  "tiers": {
    "public": {
      "doc": {
        "version": 1,
        "tier": "public",
        "id": "https://id.example.com/01/09506000134352/21/SN-0001",
        "data": {
          "ratedCapacityWh": 504,
          "chemistry": "Li-ion NMC",
          "manufacturer": "Vélo Énergie",
          "recycledShare": {
            "nickel": 0.5,
            "cobalt": 12,
            "lithium": 0
          },
          "hazardous": false,
          "notes": null
        }
      },
      "salt": "000102030405060708090a0b0c0d0e0f"
    },
    "legitimate_interest": {
      "hash": "8b833d77351df4342d682610aaf384f470e0e7afa71b8db1a1b5d1f5676aed33"
    },
    "authority": {
      "hash": "c550316400f523ab88437adb2cdb88050c6149db46ca1f1ea97496871017e262"
    }
  },
  "merkle": {
    "path": [
      {
        "position": "left",
        "hash": "d2dbf006f96dd05044a8f63d8f118f23925ba4cc5750f8b6c8e287fd506c8188"
      },
      {
        "position": "right",
        "hash": "649837ddcb7e1967086d7d35aaef7b975c513815d96fc6e70015e93a2bfe0f9a"
      }
    ],
    "root": "810f4987724d085812ec50602ec006026aff7e54ca149e7c8245df9dcd91f30c"
  },
  "anchor": {
    "chain": "vechain:testnet",
    "contract": "0x0000000000000000000000000000000000000000",
    "txId": "0x0000000000000000000000000000000000000000000000000000000000000000"
  }
}
```

Rules:

- All three tiers MUST be present. Each is either `{ "doc", "salt" }` or `{ "hash" }`, never both and never neither.
- `merkle.root` is informational. A verifier MUST compare against the root read from the chain, not the root in the bundle.
- `anchor.chain` uses the form `<network>:<environment>`, for example `vechain:testnet` or `vechain:mainnet`.

## 6. Verification algorithm

A verifier holding a bundle MUST perform these steps and fail closed on any error:

1. Check `spec == "passant-proof/1"`.
2. For every tier given as `doc` + `salt`: check that `doc.id == bundle.id`, `doc.version == bundle.version` and `doc.tier` equals the tier's key. Compute its tier hash per section 3.
3. For every tier given as `hash`: take the hash as supplied.
4. Compute `leaf` from the three tier hashes in the fixed order.
5. Fold `merkle.path` per section 4.2 to get `root'`.
6. Fetch the `Anchored` event for `anchor.txId` from a node of `anchor.chain`. Check that it was emitted by `anchor.contract` and read its `root`.
7. The passport verifies if and only if `root'` equals the on-chain root. Report the event's sender address and block time with the result.

Steps 1 to 5 are pure functions and live in the `core` package. Step 6 needs network access and lives in the chain adapter. A verifier SHOULD also display which tiers it actually checked, because a bare `hash` tier is taken on trust.

## 7. Registry contract interface

```solidity
event Anchored(bytes32 indexed root, address indexed sender, uint256 timestamp);
function anchor(bytes32 root) external;
```

`anchor` emits the event and stores nothing. Anchoring the same root twice is harmless and MUST NOT revert.

## 8. Test vectors

The complete, machine-readable set is in `docs/test-vectors.json`. Tests MUST load that file rather than copy values from this page. The vectors were generated by a Python reference implementation and independently re-verified with a separate JavaScript implementation. A few are reproduced here for orientation.

### 8.1 Canonicalisation

Input members in arbitrary order, with a non-ASCII string, a fraction, `false` and `null`. Canonical output (one line):

```
{"data":{"chemistry":"Li-ion NMC","hazardous":false,"manufacturer":"Vélo Énergie","notes":null,"ratedCapacityWh":504,"recycledShare":{"cobalt":12,"lithium":0,"nickel":0.5}},"id":"https://id.example.com/01/09506000134352/21/SN-0001","tier":"public","version":1}
```

SHA-256 of its UTF-8 bytes: `521e4ed44815d3587d550f0b66c0df0525ce00d4c8bd346c0a609c32c34865aa`

### 8.2 Tier hashes and leaf

Salts are `00..0f`, `10..1f` and `20..2f` for the three tiers in order.

| Tier | Salt | Tier hash |
| --- | --- | --- |
| public | `000102030405060708090a0b0c0d0e0f` | `4d854766aba7b0896f2594c445692b3766a31082b070d736d71c262fadf7a4d7` |
| legitimate_interest | `101112131415161718191a1b1c1d1e1f` | `8b833d77351df4342d682610aaf384f470e0e7afa71b8db1a1b5d1f5676aed33` |
| authority (empty `data`) | `202122232425262728292a2b2c2d2e2f` | `c550316400f523ab88437adb2cdb88050c6149db46ca1f1ea97496871017e262` |

Leaf: `7f4092a5256c0fb9f96f2bbcbe7a7288257fa72b54e4688a8c5ac32aaec71686`

### 8.3 Merkle roots

Synthetic leaves are defined as `leaf_i = SHA256(utf8("leaf-" + i))`, `i` from 0.

| Size | Root |
| --- | --- |
| 1 | `d2dbf006f96dd05044a8f63d8f118f23925ba4cc5750f8b6c8e287fd506c8188` |
| 2 | `c76c1321b98ab0ea04447b38d8daeb85fa04df66731a8f25a60c84a1548d9831` |
| 3 | `3fd64e951bb292c4cc9ea78ea50e1115c0b754f0ca8b4a4f4a9610bd2c258877` |
| 5 | `05d1a932e1c8acc9119e8dd9ad1a95f81a03443f90110935d9fc1c862aff9d91` |
| 8 | `d4f61b1e2303c35f0c89277fcfdd91e9d6631e11d5b6275e44f625f12d1648a6` |
| 1000 | `5af48cfbfc873f79f45f989062b310cf6f50b6de3a13c3aa1ee4ceb27345d5de` |

Proof for index 2 in the 5-leaf tree, which exercises both sibling sides and the unbalanced right edge:

| Step | Position | Sibling hash |
| --- | --- | --- |
| 0 | right | `9fde56c376760bd399b82eb8569229a2dff19219411ac71154dfeab2cf502454` |
| 1 | left | `c76c1321b98ab0ea04447b38d8daeb85fa04df66731a8f25a60c84a1548d9831` |
| 2 | right | `697f943b9ec5f90eddda8ae7473f5eb688187e3467f312fefa8677dde255042c` |

For the 1,000-leaf tree, the proof for index 777 has 10 steps.

### 8.4 End-to-end bundle

The bundle shown in section 5 is a real vector: the leaf from 8.2 sits at index 1 of a three-leaf batch between `leaf_0` and `leaf_2`. Verifying it per section 6, steps 1 to 5, MUST yield root `810f4987724d085812ec50602ec006026aff7e54ca149e7c8245df9dcd91f30c`.

## 9. Versioning

Any change to sections 1 to 6 that alters a single output byte requires a new spec identifier (`passant-crypto/2`, `passant-proof/2`). Verifiers MUST reject identifiers they do not know. Passports anchored under an old version stay verifiable under that version forever.
