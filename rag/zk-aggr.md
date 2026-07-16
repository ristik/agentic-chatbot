# Unicity Infrastructure: the Aggregation Layer

**Author:** Risto Laanoja, Unicity Labs

**Date:** July 16, 2026

## Abstract

Unicity is a novel blockchain protocol with the ambitious goal of enabling peer-to-peer token transactions to occur off-chain, without shared ordering and execution overhead. This premise requires supporting infrastructure to guarantee that there are no parallel states of assets, or more specifically, that there is no double-spending; a property we term the *unicity*. It turns out that the lack of globally shared state and ordering reduces the blockchain overhead considerably. In designing this infrastructure, no compromises were made regarding its trust assumptions. This paper details the design of the Aggregation Layer, the component responsible for producing Proofs of Inclusion and Non-inclusion to the users. We analyze its design for efficiency and evaluate the robustness of its trust and security model, and design optimal data structures and algorithms for this setup. We then identify the critical property that the Consensus Layer must verify on each round---*append-only consistency*, combining prior-state preservation with coherent placement of insertions---give it a formal definition, and prove that the RSMT consistency proof enforces it over the entire certified history, assuming only collision resistance of the hash function. The structural core of this statement is implemented (Laanoja 2026) as Algebraic Intermediate Representation (AIR) circuit on top of the Plonky3 (Polygon Zero Team 2025) STARK toolkit. The implementation sustains a proving throughput in excess of $10\,000$ insertions per second on a single consumer-class CPU, with a succinct proof and tens of milliseconds verification time, and no trusted setup. Finally, we describe how the per-round proofs of all shards, together with the Consensus Layer's state transitions, are folded into a single recursively aggregated STARK: a fixed-size certificate of the correctness of the system's entire operating history, verifiable against the genesis configuration alone, without trusting the validator set.

## Motivation

The foundational principle of the Unicity Network (The Unicity Developers 2025) is to minimize the volume of on-chain data. This is based on the observation that shared ("on-chain") state is unavoidable only to prevent double-spending.[^1] The core tenets of Unicity also include minimizing trust requirements, enhancing user privacy, and providing linear scale.

In a hierarchical trustless system, the principle is that the base layer (e.g., L1 blockchain) provides decentralization, while the layers below it (e.g., rollups) present cryptographic proofs of the correctness of their operation. In scaling Unicity, we have designed efficient data structures to prove the correctness of operation of Aggregation Layer to the Consensus Layer. Based on cryptographic hashes alone, the consistency proof grows linearly with respect to the number of user transactions. This imposes a hard limit of approx. $10\,000$ transactions per second (tx/s), beyond which the networking bandwidth of the Consensus Layer becomes the bottleneck.

To scale further, we use cryptographic zero-knowledge proofs (ZKPs) to compress the size of the consistency proofs. As an application of ZKPs, this use-case is fundamentally more efficient than using ZKPs to process the transaction data itself, as is done in many privacy coins and ZK-rollups: the statement being proved is a single tree-update, with the batch as a private witness, not the whole execution trace of a virtual machine.

A useful scoping observation is that the consensus-relevant statement is narrower than "the SMT was updated correctly". The Consensus Layer needs to be convinced that *no previously-recorded leaf was deleted or modified* and that *every new leaf is placed coherently with its key*; Remark [1](#rem:placement) shows, by a concrete attack, that the second half cannot be dropped. Request liveness, submitted-request accountability, and exclusion of unauthorized inserts are self-policed by the protocol layer around the public root commitment: their violation only damages the dishonest aggregator's own ability to serve users, a denial of service by an operationally replaceable component. Section [4.3](#sec:scope) details this scoping argument, and Section [5.2](#sec:consistency-formal) proves that the resulting statement is sufficient. The narrowness of the in-circuit statement is what makes the AIR small and the proving cheap.

In this paper, we show how to scale the Aggregation Layer to $10\,000$ tx/s *per shard* and beyond. This figure was the original design target; the measured proving throughput of our reference implementation exceeds it by roughly $3\times$ on a single consumer-class CPU (Section [6](#sec:custom-air-circuit)). Shards process disjoint key ranges and prove their state transitions independently, so aggregate transaction capacity is the sum of their capacities. The BFT Core receives one succinct transition proof per advancing shard rather than one item per transaction; Section [3.2](#sec:sharding-architecture) makes this scaling boundary precise.

<a id="sec:sota"></a>

## State of the Art and Comparison

The Aggregation Layer occupies a fairly narrow point in the design space of authenticated and zero-knowledge data structures. We briefly position it against the most directly comparable lines of work and contrast its proving objectives with those of related systems.

### Authenticated Append-Only Dictionaries

Sparse Merkle Trees originate as an extension of binary Merkle hash trees to large key spaces: every potential key is assigned a deterministic position, and the proof that a key is absent is just the root computation taken over canonical-empty subtrees. The systematic study of their cost and engineering trade-offs is more recent. Dahlberg, Pulls, and Peeters (Dahlberg et al. 2016) present efficient SMT constructions and caching strategies for membership and non-membership proofs with realistic key-space sizes; their analysis is part of the foundation that makes deep-keyed SMTs practical. The path-compressed (radix) variant we use in the Aggregation Layer (Section [6](#sec:custom-air-circuit)) is a constant-factor refinement of the same line of work.

A related and operationally closer system is Certificate Transparency (CT) (Laurie et al. 2013), which maintains append-only Merkle logs of TLS certificates and provides both inclusion and *consistency* proofs between successive signed tree heads. The cryptographic role of the CT consistency proof is conceptually the same as our consistency proof: it convinces an auditor that a new log state extends the previous one without rewriting it. The differences are operational: CT logs are chronologically append-only with no key-determined position, log entries are not deduplicated against double-spending semantics, and there is no per-round ZK compression of the consistency witness. Our use of SMTs adds a key-determined position (so that double-spending becomes a key collision) and our use of ZK compresses the per-round witness to a constant size.

### Comparison with ZK-Rollups on Ethereum L1

Ethereum's ZK-rollup ecosystem (Polygon zkEVM (Polygon zkEVM Team 2023), zkSync, Scroll, StarkNet, and similar systems) uses zero-knowledge proofs to compress the execution trace of an entire L2 virtual machine into a succinct proof that the L1 chain can verify. The statement being proved is, schematically, "starting from L2 state root $r_{i-1}$ and a block of L2 transactions $B_i$, the L2 EVM produced state root $r_i$". This requires the circuit to arithmetize the EVM instruction set, account-storage Merkle Patricia tries, signature verification, gas accounting, and so on. The resulting proving cost is large enough that production rollups run dedicated GPU farms or outsource to specialized proving markets.

The Unicity Aggregation Layer proves a much smaller statement: not "the VM executed correctly" but only "the SMT changed in an allowed way". There is no in-circuit execution, no signature verification, no contract interpretation. Validation of transactions is done off-chain by the parties who have an economic interest in the outcome, namely the recipients in the Execution Layer (Buldas et al. 2026a). The ZK proof ensures that the global no-double-spend invariant is preserved. As a result the same cryptographic toolkit (small-field STARKs, FRI, Poseidon-family hashes) delivers ~10$^4$ tx/s per shard on a single CPU rather than ~10$^2$ tx/s on a GPU rack.

### Comparison with Privacy-Oriented ZK Chains

Privacy-oriented chains such as Zcash (Ben-Sasson et al. 2014) use ZK-SNARKs to hide transaction contents---sender, receiver, and amount---behind a commitment scheme. A spent note is identified by a public *nullifier* derived from a secret, and the chain maintains a global nullifier set to prevent double-spending. The ZK proof at spend time asserts that the spender knows a commitment in the note tree and the corresponding nullifier without revealing which one. Each user-level transaction therefore carries its own succinct ZK proof.

The Unicity protocol does not use ZK for transaction privacy. Privacy of payloads and recipient information is achieved structurally, by keeping transaction execution off-chain and exposing only an unlinkable per-spend identifier to the global system; the user wallet and service-side privacy aspects of this model are detailed in the companion paper (Buldas et al. 2026a). ZK is used only for the much narrower purpose of compressing the Aggregation Layer's per-round consistency proof on its way to the Consensus Layer. Consequently, the prover does not need to run a circuit per user transaction; one batch proof per round amortizes over thousands of transactions, and there is no anonymity-set scaling cost.

### Comparison with Nullifier-Tree Mixers

Nullifier-tree mixers such as Tornado Cash (Pertsev et al. 2019) occupy a third design point. They maintain two related authenticated structures: a commitment tree of deposits (a Merkle tree of fixed-denomination notes) and a nullifier set of spent notes. Each withdrawal is accompanied by a ZK proof that the withdrawer knows a deposit commitment in the tree and the associated nullifier, with the nullifier being inserted into the nullifier set to block double-withdrawals. The anonymity set is the population of unspent notes; the privacy guarantee is fundamentally tied to that set's size.

The Unicity Aggregation Layer's SMT is, on the surface, also a structure for preventing double-use of a one-time identifier. The differences are substantive. First, Unicity has no anonymity-set construction: spent state IDs are recorded in clear in the SMT, and unlinkability is provided by the off-chain execution model rather than by hiding the spend inside a crowd (Buldas et al. 2026a). Second, the ZK proof boundary is different: in a nullifier-tree mixer the ZK proof is produced *by the user* for each withdrawal and the chain only verifies it, whereas in Unicity the ZK proof is produced *by the aggregator* once per batched round and is invisible to end users. Third, the underlying tree semantics differ: Tornado's commitment tree is an append-only log used for set-membership proofs, while Unicity's SMT is a keyed dictionary used both for inclusion (Proof of Unicity for the current spend) and non-inclusion (proof that a given state has not yet been spent) proofs.

### Why ZK Proving in Unicity Is Comparatively Efficient

The combined effect of the design choices above is a proving workload that is one to three orders of magnitude smaller than in comparable ZK systems. The principal reasons:

1.  *Narrow in-circuit statement.* The circuit enforces only append-only consistency: prior-state preservation and coherent placement. Unique tree shape follows from those local constraints, while request liveness, accountability, and authorization remain in the surrounding protocol (Section [4.3](#sec:scope)).

2.  *No in-circuit transaction execution.* Validation of signatures, predicates, and business logic happens off-chain at the Execution Layer (Buldas et al. 2026a); the ZK circuit does not see any of it.

3.  *Batch-amortized proving.* One proof per Aggregation Layer round covers thousands of insertions; there is no per-transaction ZK proof and no anonymity-set scaling.

4.  *Local update, sublinear cost in tree capacity.* The proof attests only to the modification of a small subset of the SMT---the paths and siblings touched by the batch---rather than the whole tree. Proving effort scales with the batch size and only logarithmically with the current tree capacity, so a single shard can grow without inflating the per-round prover work.

5.  *Private batch as witness.* The batch contents are bound to the public roots through the in-circuit bus chain but never appear in the public statement, keeping the verifier's work independent of batch size.

6.  *Custom AIR over a small field.* Hand-built arithmetization with a ZK-friendly hash (Poseidon2) over BabyBear avoids the 32-bit-to-field translation overhead of general-purpose zkVMs.

7.  *No privacy obligation in-circuit.* Transaction privacy is provided structurally; the ZK proof is used only for succinctness, not for zero-knowledge, removing a constraint family that ZK-rollup and mixer designs typically must satisfy.

## System Architecture

To prevent double-spending of tokens, the Unicity Infrastructure permanently[^2] records a unique identifier for every spent token state. This identifier is the cryptographic hash of the token state data. If a user attempts to double-spend a token, the resulting identifier will be identical to the one already recorded, making it impossible to obtain a new Proof of Unicity. A transaction is considered invalid unless it is accompanied by a valid Proof of Unicity.

The rest of the processing---executing transactions, running smart contracts, etc.---can happen at the client layer, executed by users or "agents". Agents are themselves the interested parties in data availability and transaction validation, and they choose the ordering of incoming messages for processing. Thus, the Unicity Infrastructure is relieved of these duties, removing a major scaling bottleneck of traditional L1 blockchains.

The Unicity Infrastructure operates in a trust-minimized way by utilizing distributed authenticated data structures and succinct cryptographic proofs. The Proof of Unicity is a fresh *proof of inclusion* of the token state being spent. This can be efficiently generated based on a Merkle Tree data structure. The proof size is logarithmic with respect to the tree's capacity, making it highly efficient. If the root of the tree is securely fixed, the integrity of the rest of the tree can be verified trustlessly: it is computationally infeasible to generate a valid inclusion proof for an element not present in the tree, without changing the root, or breaking underlying cryptographic assumptions. The infrastructure also supports *non-inclusion proofs*, making it possible to prove to other parties that a particular token state has not yet been spent. The Unicity Infrastructure can thus be conceptualized as a large-scale, distributed Sparse Merkle Tree (SMT). Specifically, the tree is implemented as a path-compressed radix variant, the RSMT (Section [5.1](#sec:stack-verifier)), which eliminates single-child internal chains while preserving the standard property that the key uniquely determines the leaf position. Its key-determined layout also gives a canonical horizontal partition: the prefix of an identifier selects exactly one shard, while the remaining bits locate the identifier within that shard (Section [3.2](#sec:sharding-architecture)).

Aggregation Layer connects to the Consensus Layer. For fully trustless operation, each request is accompanied by a cryptographic proof of SMT consistency.

<a id="fig:layers"></a>

~~~text
Consensus Layer
       |
Aggregation Layer
----------------- operational boundary
       |
Execution Layer
~~~

*Figure 1. Layered architecture of the Unicity Network.*

<a id="sec:consensus-layer"></a>

### Consensus Layer

The Consensus Layer consists of a single logical component, the *BFT Core*: a bounded-size committee of validator nodes running a Byzantine fault tolerant (BFT) consensus protocol. During a round of execution, it receives certification requests from Aggregation Layer shards, checks that each request extends the previously certified state of its shard, verifies the accompanying consistency proof, and issues a *Unicity Certificate* over the updated global state. BFT consensus provides deterministic finality; its usual quorum assumption is needed for prompt progress and for uniqueness of the most recent certified tip.

The BFT Core maintains no blockchain. Its persistent protocol state is cumulative: the vector of most recently certified shard roots (combined into a single global root, Section [3.4](#sec:data-flow)) and the *Unicity Trust Base*, an authenticated record of the validator set and quorum rule applicable to each configuration period. There are no transaction blocks: ordering and availability of user requests are handled below, at the Aggregation and Execution Layers, and issued certificates are persisted by the parties who need them and by the public round archive (Section [7.5](#sec:data-availability)).

Committee formation and its operational policy are orthogonal to the Aggregation Layer and outside the scope of this paper. For the immediate validation path we assume an authenticated Trust Base and a non-equivocating BFT quorum. Section [7](#sec:aggregation-audit) then shows how recursive proof aggregation removes the quorum from the correctness argument for the recorded history; equivocation between otherwise valid tips remains detectable from conflicting signed artifacts.

<a id="sec:sharding-architecture"></a>

### Aggregation Layer

The Aggregation Layer implements a global, append-only key-value store that immutably records every spent token state. More specifically, it provides the following services: 1) recording of key-value tuples where the key identifies a token state and value is recording some meta-data, 2) returning inclusion proofs of keys, 3) returning non-inclusion proofs of keys not present in the store.

The Aggregation Layer periodically has its state authenticator certified by the Consensus Layer.

<a id="fig:sharding"></a>

~~~text
BFT Core
certifies shard-root transitions and commits
c_i = H(SH_i) and R_i = MerkleRoot({r_(i,σ)}_(σ∈SH_i))

       ↕ root transition + consistency proof / Unicity Certificate

Aggregation shard    Aggregation shard    Aggregation shard    Aggregation shard
σ=00, keys 00...     σ=01, keys 01...     σ=10, keys 10...     σ=11, keys 11...
RSMT root r_(i,00)   RSMT root r_(i,01)   RSMT root r_(i,10)   RSMT root r_(i,11)
~~~

*Figure 2. Aggregation shards beneath one logical BFT Core. The four equal prefixes are illustrative.*

#### Deterministic keyspace partition.

Let keys be $\kappa$-bit strings and let the sharding scheme $\mathcal{SH}\subseteq\{0,1\}^{*}$ be prefix-free and exhaustive: no shard identifier is a prefix of another, and every $\kappa$-bit key has a prefix in $\mathcal{SH}$. It induces the total routing function $$f_{\mathcal{SH}}(k)=\text{the unique }\sigma\in\mathcal{SH}
    \text{ such that }\sigma\preceq k.$$ (where $\preceq k$ denotes that bit-string $\sigma$ is a prefix of bit-string $k$). Shard $\sigma$ maintains an independent RSMT $T_\sigma$ containing exactly the bindings whose keys satisfy $f_{\mathcal{SH}}(k)=\sigma$. Routing therefore depends only on public key bits: it needs neither a directory lookup nor cross-shard execution, and two requests addressed to different prefixes can be batched, inserted, and proved concurrently.

#### Authentication across shards.

In each BFT Core round, the latest root of every shard is a leaf of a Merkle *shard-root tree*; a shard that does not advance retains its previous root. The tree root $R_i$ commits to the entire Aggregation Layer state, while $c_i=H(\mathcal{SH}_i)$ binds its active prefix partition. A Unicity Certificate for shard $\sigma$ authenticates $c_i$, authenticates $r_{i,\sigma}$ to $R_i$ with the sibling hashes on the prefix path, and authenticates $R_i$ with the BFT Core's quorum certificate. Consequently, an inclusion or non-inclusion proof has two independent parts: a local RSMT path within $T_\sigma$, and a short shard-root path to $R_i$. Neither part grows with transaction throughput; the latter contains $|\sigma|$ sibling hashes.

#### Dynamic shard splitting.

A busy shard can be split by replacing one prefix $\sigma$ in $\mathcal{SH}$ with the two children $\sigma\|0$ and $\sigma\|1$. The children retain the parent leaves selected by the next key bit. Because RSMT leaves commit to full keys and internal nodes commit to absolute bifurcation depths and key regions (Section [5.1](#sec:stack-verifier)), each child root is either the hash of an existing parent subtree or the canonical empty root; retained nodes need not be rehashed and the certified history need not be replayed. The split is activated as a configuration change, after which both children evolve and prove independently. A local RSMT certificate may lose the junction at the split depth while its shard-root certificate gains one sibling hash, moving authentication work from the shard-local tree to the common root without introducing another aggregation tier.

#### Horizontal capacity and proof aggregation.

If shard $\sigma$ sustains insertion rate $q_\sigma$, the Aggregation Layer sustains $$Q=\sum_{\sigma\in\mathcal{SH}} q_\sigma$$ subject to the BFT Core's capacity for shard summaries. A shard round containing thousands of insertions exports only $(r_{i-1,\sigma},r_{i,\sigma},\pi_{i,\sigma})$, where the succinct consistency proof $\pi_{i,\sigma}$ has verifier cost independent of the number of stored leaves and is verified independently of other shards. Thus, adding a shard adds storage, batching, and proving capacity without increasing any existing shard's workload; the Core's work grows with the number of advancing shards, not with $Q$. These verifications are mutually independent and can be parallelized. The off-critical-path construction of Section [7](#sec:aggregation-audit) subsequently folds all changed-shard proofs and the corresponding $R_i$ transitions into one recursively updated proof whose public statement remains fixed-size regardless of the number of shards or elapsed rounds.

#### Per-shard consistency.

Once a key is set, it must remain there permanently. Every shard transition is therefore accompanied by a cryptographic proof that pre-existing keys were neither removed nor modified and that new keys were placed at the positions determined by the keys themselves. The direct hash-based witness grows with the insertion batch, whereas the STARK construction of Section [6](#sec:custom-air-circuit) makes the public statement just the old and new shard roots and gives succinct verification independent of the batch size. Correct verification and BFT chaining of those roots make each shard an untrusted, cryptographically checked service.

### Execution Layer

The Execution Layer is responsible for executing transactions and other business logic, using the services of the Aggregation Layer and Unicity in general. Its formal security model---including double-spending resistance, non-blocking, and service- and user-side privacy---is developed in (Buldas et al. 2026a). Programmable ownership predicates extend this model with off-chain smart-contract functionality (Buldas et al. 2026b).

<a id="sec:data-flow"></a>

### Data Flow

Figure [3](#fig:dataflow) summarizes the flow of authenticated data through the system, from the shards to the auditing verifier. In BFT Core round $i$, each shard $\sigma$ that advances submits a certification request carrying its previous root $r_{i-1,\sigma}$, its new root $r_{i,\sigma}$, and the consistency proof $\pi_{i,\sigma}$; roots of non-advancing shards are carried forward. The BFT Core verifies the submitted proofs, combines the current shard roots into the global root $R_i$, reaches consensus, and returns Unicity Certificates to the advancing shards. Since the BFT Core keeps no blockchain, the per-round artifacts---shard roots, consistency proofs, certificates, and Trust Base entries---are published to the public round archive (Section [7.5](#sec:data-availability)). From the archive, an aggregation prover folds the history into a single constant-size proof $\Pi_n$ (Section [7](#sec:aggregation-audit)), which any party can verify against the genesis configuration.

<a id="fig:dataflow"></a>

~~~text
Auditing user
    ↑ (Π_n, pv_n)
Aggregation prover (permissionless)
    ↑ fetch, fold recursively
Public round archive: shard transitions, c_i, R_i, certificates
    ↑ per-round artifacts
BFT Core: cumulative shard roots and Trust Base
    ↑ (r_(i-1,σ), r_(i,σ), π_(i,σ))    ↓ certificates
Aggregation shards σ = 1, ..., m
~~~

*Figure 3. Data flow from the shards to the auditing verifier. The pragmatic validation path (Section [4.2](#sec:practical)) uses the certificates directly; the audit path uses the aggregate proof $\Pi_n$.*

## Security Model of the Aggregation Layer

The Aggregation Layer implements a distributed, authenticated, append-only dictionary data structure. It authenticates incoming state transfer certification requests by verifying that the sender possesses the private key corresponding to the public key that identifies the current token owner. The specific authentication protocol is beyond the scope of this paper.

<a id="def:append-only-accumulator"></a>
**Definition 1** (Consistency). An append-only accumulator starts from the empty partial map $M_0$ and incorporates batches of fresh key--value bindings, producing cumulative maps $M_1,M_2,\ldots$ and authenticated roots $r_1,r_2,\ldots$. It is *consistent* if, for every state $i$:

1.  $M_i$ extends $M_{i-1}$ without deleting or changing a binding;

2.  a verifying inclusion certificate for $(k,v)$ against $r_i$ exists exactly when $M_i(k)=v$;

3.  a verifying non-inclusion certificate for $k$ against $r_i$ exists exactly when $k\notin\mathrm{dom}(M_i)$.

In the RSMT instantiation, an inclusion certificate is the hash path from the leaf $(k,v)$ to the root. A non-inclusion certificate follows the key-directed path from the root until the path reaches either a different leaf or a subtree whose region excludes $k$. Definition [5](#def:query-cert) gives both verifiers, and Theorem [1](#thm:query) proves the two exactness claims.

After each batch of additions, the new root of the Aggregation Layer's SMT is certified by the BFT Core, ensuring its uniqueness and immutability. This provides a secure trust anchor for all consistency, inclusion, and non-inclusion proofs. The idealized Consensus Layer is modeled as [Algorithm 1](#alg:consensuslayer).

<a id="fig:model"></a>

~~~text
Consensus Layer
    ↑ (r_i, r_(i-1), π)
    ↓ c = (i, r_i, r_(i-1); s_cl)
SMT
    ↑ B = (k_1, k_2, ..., k_j)
    ↓ π^inc_(k ∈ {B_1, ..., B_i}) = (v_k ⇝ r, c)
      π^non-inc_(k ∉ {B_1, ..., B_i}) = (empty_k ⇝ r, c)
Token Users
~~~

*Figure 4. Security model of the Aggregation Layer.*

For efficiency reasons client requests are processed in batches; the tree is re-calculated and the tree root is certified when a batch is closed. A batch of client requests is denoted as $B_i$. At the end of each batch, the Aggregation Layer produces its summary root hash $r_i$ and sends it to the Consensus Layer for certification. A certification request $(r_i, r_{i-1}, \pi)$ includes: 1) the previous state root hash, 2) the new state root hash, 3) a consistency proof of the changes made during the batch, and 4) an authenticator that identifies the operator.

The Consensus Layer certifies the request only if it uniquely *extends* a previously certified state root and the consistency proof is valid. It returns a certificate $c = (i, r_i, r_{i-1}; s_{\textsf{cl}})$, where $s_{\textsf{cl}}$ is a signature from the Consensus Layer (e.g., a threshold signature from the consensus nodes or a proof of inclusion in a finalized block).

Each state can be extended only once, which prevents forks within the Aggregation Layer. Each subsequent round extends the most recently certified state. We model the Consensus Layer as an oracle, as shown in [Algorithm 1](#alg:consensuslayer).

<a id="alg:consensuslayer"></a>

**Algorithm 1. Consensus Layer modeled as an oracle**

~~~text
Initialize()
    r_- ← ⊥
    i ← 0

CertificationRequest(r_i, r_(i-1), π)
    if (r_(i-1) ≠ r_-) or not valid(π, r_i, r_(i-1))
        return ⊥
    r_- ← r_i
    i ← i + 1
    s_cl ← sig_cl(i, r_i, r_(i-1))
    return c = (i, r_i, r_(i-1); s_cl)
~~~

The SMT provides users with inclusion and non-inclusion proofs. Each proof is anchored to a state root certified by the Consensus Layer.

The Consensus Layer must guarantee data availability. If recent state roots were lost, it would become impossible to reject duplicate state transition requests, potentially allowing malicious actors to double-spend against an old, un-extendable state. The Aggregation Layer itself does not require an internal consensus mechanism; protocols like Raft could be used for replication and coordination among its redundant nodes. The decentralized consensus is provided by the external Consensus Layer.

If each state transition is accompanied by a cryptographic consistency proof (see Section [5](#sec:consistency-proof)), the Aggregation Layer can be considered trustless.

<a id="sec:maximalist"></a>

### "Maximalist" Security Assumptions

In this model, we assume that users wish to validate all aspects of system operation that are relevant to their own assets, accepting no assumptions beyond standard cryptographic ones. This level of trustlessness is close to the strong guarantees introduced by Bitcoin (Nakamoto 2009), where each "client" functions as a full validator, starting from downloading and verifying the blockchain from the genesis block. In Unicity there is no blockchain to replay; the equivalent guarantee is obtained from a single succinct proof.

Upon receiving a token, the user must be able to efficiently verify the following:

1.  The token is valid (as elaborated elsewhere),

2.  The Aggregation Layer has not forked,

3.  The Aggregation Layer has not certified conflicting states of the same token.

The second and third points are covered by the aggregated history proof of Section [7](#sec:aggregation-audit): a fixed-size STARK, updated periodically, attesting that the entire sequence of certified states---from the genesis configuration up to a recent round $n$---forms a single non-forking chain in which every round of every shard satisfies append-only consistency (Definition [6](#def:aoc), established by Theorem [4](#thm:history)). In particular, no inclusion proof can exist for a token state that is absent from the recorded history. Verifying the aggregate proof requires only the genesis parameters of the network instance and takes milliseconds on commodity hardware; neither replay of history nor trust in the validator set is involved.

The aggregate proof is produced with a latency of minutes to hours behind the certified tip, so maximalist verification is not instantaneous. It is best understood as an audit mechanism: it retrospectively confirms---or refutes, with the failure round pinpointed---the correctness of operation of the Consensus and Aggregation Layers. The validation procedure is given in Section [7.6](#sec:maxi-validation).

<a id="sec:practical"></a>

### Practical Security Assumptions

For immediate finality, we assume that a BFT quorum follows the protocol and does not collude maliciously with the Aggregation Layer. Under this standard consensus assumption, users obtain substantially better latency than the delayed full-history audit. BFT layer forking (case 2 above) or certification of conflicting states (case 3 above) produces strong cryptographic evidence that can be processed out of the critical path of serving users.

In this scenario, a transaction is finalized, and an inclusion proof is returned within a few seconds, allowing the transaction to be independently verified---without consulting external data[^3]---within the same timeframe.

The Root of Trust is the Unicity Trust Base: the chain of epoch records of the BFT Core (Section [3.1](#sec:consensus-layer)). These records grow slowly---one aggregated-signature record per validator-set change---and validating a certificate requires checking its signatures against the applicable epoch record only. This validation path is available immediately, within the round time; the delayed audit path of the maximalist model complements rather than replaces it.

<a id="sec:scope"></a>

### Scope of the In-Circuit Statement

A core engineering choice in the design of the Aggregation Layer's consistency proof is to push as much of the per-round security argument out of the cryptographic proof as possible, leaving only a small kernel inside the circuit. The value of the scoping is engineering economy---it keeps the circuit small. Drawing the boundary correctly, however, requires care: it is tempting to place *all* placement-related properties outside the kernel, on the argument that a misplaced insertion only damages the aggregator's own ability to serve proofs. Remark [1](#rem:placement) refutes that argument by a concrete attack; the boundary is drawn below and proved sufficient in Section [5.2](#sec:consistency-formal).

Let $M_{i-1}, M_i \colon \{0,1\}^* \to \{0,1\}^* \cup \{\bot\}$ be the partial maps of recorded key-value bindings committed by, respectively, the previous and the new state roots $r_{i-1}, r_i$ (Section [5.2](#sec:consistency-formal) makes "committed by" precise). We say the round update $r_{i-1} \to r_i$ satisfies *prior-state preservation* iff

<a id="eq:psp"></a>

$$
\forall k \in \mathrm{dom}(M_{i-1})\colon\quad M_i(k) = M_{i-1}(k).
$$

That is, every key already recorded under $r_{i-1}$ is bound to the same value under $r_i$. Equivalently, the round adds a (possibly empty) set of fresh keys and modifies nothing.

<a id="def:minimal"></a>
**Definition 2** (In-circuit statement, informal). For the Aggregation Layer, the cryptographic per-round consistency proof must enforce, given authentic roots $(r_{i-1}, r_i)$: (i) prior-state preservation [Equation 1](#eq:psp), and (ii) *coherent placement*: every leaf inserted in the round sits at the position determined by its own key. Definition [6](#def:aoc) states this formally.

Clause (ii) is important. Because the maps $M_i$ are realized by *provability* against the root---a binding is "recorded" exactly when an inclusion proof for it verifies---an incoherently placed insertion changes which bindings are provable, for old keys as well as new ones. Remark [1](#rem:placement) shows that dropping (ii) admits verifying round transitions under which an already-recorded key becomes re-recordable with a different value: the equivocation that [Equation 1](#eq:psp) is meant to exclude.

The remaining desirable properties of the Aggregation Layer stay outside the kernel, and can be enumerated and accounted for as follows:

Request liveness

: (*every well-formed user request is eventually recorded*). A censoring aggregator does not violate the in-circuit statement; it merely fails to serve some users. The protocol mitigates this by replication (highly-available cluster) and by allowing users to resubmit through alternative aggregators in the same shard.

Submitted-request accountability

: (*omission of an accepted request is detectable*). The consistency proof binds every element of its witness batch to the new root, but it does not prove that this private witness equals the external queue of authenticated requests. A recipient detects omission by requesting an inclusion certificate against the certified root.

No phantom inserts

: (*nothing is recorded that was not a user request*). At worst, an aggregator does free recording work for itself or third parties; phantom entries carry fresh keys (coherent placement forbids re-recording), so they cannot affect any honest user's tokens.

Unique Patricia shape

: (*the post-state tree is the unique tree prescribed by the data structure's rules for its key set*). This does not need to be postulated as a separate in-circuit obligation: the local validity conditions already force that shape (Lemma [1](#lem:shape) and Proposition [1](#prop:unique)), and Theorem [4](#thm:history) preserves those conditions from the empty genesis tree.

Append-only consistency

: (*[Equation 1](#eq:psp) together with coherent placement; Definition [6](#def:aoc)*). *Critical.* If this fails, the operator can rewrite history and double-spending becomes possible. This is the property that must be cryptographically enforced *before* round certification.

Restricting the in-circuit statement to append-only consistency has several useful consequences. First, the witness need not contain the actual batch contents---the prover may keep them entirely private and bind them to the proof through the soundness chain of the circuit (Section [6](#sec:custom-air-circuit)). This shrinks the public statement to the two root digests. Second, the circuit does not have to *reconstruct* the unique global tree shape from scratch, which is by far the most constraint-heavy aspect of any naive arithmetization (cf. (Laanoja 2026), "cost-of-canonical detour"); with the region-committing hash of Section [5.1](#sec:stack-verifier), coherent placement is checked by local constraints on the touched nodes only. Third, the proof scales with the batch size alone, not with the total tree capacity.

<a id="sec:consistency-proof"></a>

## Consistency Proof

A *consistency proof* is a cryptographic construction that validates one round of operation of the append-only accumulator. Round $i$ inserts the batch $B_i = ((k_1, v_1), \ldots, (k_j, v_j))$ of key--value pairs into the tree; the root digest before the round is $r_{i-1}$, and after the round it is $r_i$. The consistency proof $\pi_i$ is a transcript of the part of the tree touched by the insertions. The Consensus Layer verifies $(\pi_i, r_{i-1}, r_i)$ before certifying $r_i$ ([Algorithm 1](#alg:consensuslayer)).

The property that verification enforces is *append-only consistency* (Definition [2](#def:minimal); formally Definition [6](#def:aoc)): every binding recorded under $r_{i-1}$ is recorded unchanged under $r_i$, and every new leaf sits at the position determined by its own key. Section [5.1](#sec:stack-verifier) specifies the tree, the proof encoding, and the verifier; Section [5.2](#sec:consistency-formal) develops the formal model; Section [5.3](#sec:consistency-theorem) proves soundness and completeness, assuming only collision resistance of the hash function.

<a id="sec:stack-verifier"></a>

### The Region-Committing Tree and Its Verifier

The accumulator is implemented as the *RSMT* (radix sparse Merkle tree): a binary Patricia tree over fixed-length keys, path-compressed, with a region-committing node hash. The consistency proof is a transcript of the touched part of the tree, executed by a stack machine.

Let $H \colon \{0,1\}^{*} \to \{0,1\}^{\lambda}$ be the hash function. A leaf hashes the full key together with the value, and a junction hashes its two children together with its bifurcation depth $d$ and its *region* $p$: $$\begin{align*}
  h_L &= H(\texttt{0x00} \parallel k \parallel v),\\
  h_N &= H(\texttt{0x01} \parallel \langle d\rangle \parallel \langle p\rangle \parallel h_l \parallel h_r).
\end{align*}$$ The region $p \in \{0,1\}^d$ is the key prefix that addresses the node: every key below the junction extends $p$, with $p\|0$ leading left and $p\|1$ leading right; $\langle\cdot\rangle$ are fixed-length injective encodings. A leaf's region is its full key, and its depth is $\kappa = 256$. (We write $\varrho[j]$ for bit $j$ of a region and $\varrho[0..d)$ for its first $d$ bits.) The domain-separation prefixes make leaf and junction hashes disjoint; the depth commitment prevents re-attaching a subtree at a different level; the region commitment pins the node to its key-space position; and fixed child positions prevent swapping. Crucially, depth and region are *absolute* properties of a node---splitting an edge above it changes neither---so inserting new keys never re-hashes any pre-existing node: an insertion creates only new leaf and junction hashes. This immutability of pre-state hashes is what the proof encoding exploits. (The hash function is an instantiation detail: the portable reference implementation uses SHA-256, the AIR a Poseidon2 sponge.) Inclusion proofs transmit only junction depths and sibling digests: the verifier reconstructs the expected region of every junction on the path from the queried key itself, as $k[0..d_j)$.

The consistency proof $\pi$ for round $i$ is the post-order serialization of the *touched* part of the post-state tree, over a five-opcode alphabet:

$S(c)$:

: an untouched pre-state subtree, as an opaque digest;

$O(d', p', c_l, c_r)$:

: an untouched pre-state junction, opened one level; the verifier hashes the opening, so the annotations are collision-bound to the digest;

$O_L(k', v')$:

: an untouched pre-state leaf, opened;

$L$:

: a leaf newly inserted in this round; its key and value are not part of the proof, but are consumed from the batch $B_i$;

$N(d)$:

: a junction at bifurcation depth $d$, over the two preceding stack entries. Junction regions do not travel in the proof; the verifier derives them.

The verifier ([Algorithm 2](#alg:stackverify-core); the complete form is [Algorithm 3](#alg:stackverify) in [Appendix A](#app:verifier)) executes the stream against a stack of triples: the subtree's pre-state digest, its post-state digest, and an *advice tuple* $(\delta, \varrho)$---the depth and region of the subtree's top node, $(\kappa, k)$ for leaves, absent ($\bot$) for opaque $S$ entries. The batch is sorted by the verifier itself into tree-traversal order and must be strictly increasing, so the prover has no freedom in associating $L$ opcodes with batch elements. Processing $N(d)$ combines three rule families:

1.  Edge coherence.* Every child that carries advice must satisfy $\delta > d$ and $\varrho[d] = \beta$, where $\beta$ is the child's side. The first $d$ bits of $\varrho$ yield the junction's region $p$; all advised children must agree on it, and at least one child must be advised, so $p$ is always defined.

2.  Confinement of opaque subtrees.* If the junction is absent from the pre-state---its old side arises by pass-through or $\varnothing$---then *both* children must carry advice. An opaque $S$ may therefore appear only under pre-existing junctions, whose edges were checked in the round that created them and are frozen by the hashes; wherever a preserved subtree meets a new junction, the prover must present its opened form.

3.  Digest algebra.* The pre-state digest of a junction follows a four-way rule: if both children existed in the pre-state, the junction existed too and its old digest is recomputed; if exactly one child existed, the junction is new and the old digest of the existing child passes through unchanged; if neither existed, the old digest is the empty marker $\varnothing$. The post-state digest is always recomputed. The pass-through cases are what keep consistency proofs short: no hashing is performed on the parts of the tree that did not change.

<a id="alg:stackverify-core"></a>

**Algorithm 2. Stack-machine verification of the RSMT consistency proof (operand-domain checks omitted)**

~~~text
VerifyConsistency(π, r_(i-1), r_i, B)
    if B = []
        return r_(i-1) = r_i and π = []
    B ← SortTraversalOrder(B)
    st ← []; b ← 0
    for opcode o in π
        if o = S(c)                              // opaque subtree
            Push(st, (c, c, ⊥))
        else if o = O(d', p', c_l, c_r)         // opening
            c ← H(0x01 || ⟨d'⟩ || ⟨p'⟩ || c_l || c_r)
            Push(st, (c, c, (d', p')))
        else if o = O_L(k', v')                 // opened leaf
            c ← H(0x00 || k' || v')
            Push(st, (c, c, (κ, k')))
        else if o = L                           // new leaf
            (k, v) ← B[b]; b ← b + 1
            Push(st, (empty, H(0x00 || k || v), (κ, k)))
        else if o = N(d)                        // junction
            (c_old_r, c_new_r, a_r) ← Pop(st)
            (c_old_l, c_new_l, a_l) ← Pop(st)
            p ← ⊥
            for x in {l, r} with side bit β in {0, 1}
                if a_x = (δ_x, ρ_x) ≠ ⊥         // coherence
                    assert δ_x > d and ρ_x[d] = β
                    assert p = ⊥ or p = ρ_x[0..d)
                    p ← ρ_x[0..d)
            assert p ≠ ⊥
            if c_old_l = empty or c_old_r = empty
                assert a_l ≠ ⊥ and a_r ≠ ⊥      // new junction
            if c_old_l = empty and c_old_r = empty
                c_old ← empty
            else if c_old_l = empty
                c_old ← c_old_r                 // pass-through
            else if c_old_r = empty
                c_old ← c_old_l                 // pass-through
            else
                c_old ← H(0x01 || ⟨d⟩ || ⟨p⟩ || c_old_l || c_old_r)
            c_new ← H(0x01 || ⟨d⟩ || ⟨p⟩ || c_new_l || c_new_r)
            Push(st, (c_old, c_new, (d, p)))
        else
            return 0                            // unknown opcode
    assert b = |B| and |st| = 1
    return st[0].(c_old, c_new) = (r_(i-1), r_i)
~~~

[Algorithm 2](#alg:stackverify-core) omits only the operand-domain assertions ($c \in \{0,1\}^{\lambda}$, $0 \le d < \kappa$, $p \in \{0,1\}^{d}$, $k \in \{0,1\}^{\kappa}$), for readability. The complete verifier, [Algorithm 3](#alg:stackverify) in [Appendix A](#app:verifier), includes them; the formal statements refer to it. Verification accepts iff the opcode stream and the batch are both fully consumed, the stack holds exactly one triple, and its digest pair equals $(r_{i-1}, r_i)$; any failed assertion, malformed opcode, stack underflow, or batch overrun rejects. The verifier is a short loop with no recursion and no control flow beyond opcode dispatch---one uniform rule per opcode; its memory use is bounded by the tree depth, and the post-order format makes verification a natural streaming computation. This regularity is deliberate: it is what the AIR arithmetization of Section [6](#sec:custom-air-circuit) exploits, one trace row per opcode with a fixed constraint family. In-circuit, deriving the junction regions costs nothing extra---the derivation equalities *are* the edge-coherence constraints, and the region limbs appear as hash inputs either way. Relative to the structural fragment of the statement (opcodes $S$, $L$, $N$ and the digest algebra alone), the coherence machinery costs region limbs in the Poseidon2 junction preimage (roughly one additional permutation per junction hash), the bit-prefix comparisons, and the openings ($\approx$ one extra hash per batch element); we estimate the dominant Poseidon2 table grows by a factor of at most $1.5$. The measured throughput of Section [6.5](#sec:measured), which covers the structural fragment, leaves ample headroom above the $10\,000$ tx/s design target.

For the honest prover, the transcript differs from a bare depth-only encoding only in the openings: one opened junction or leaf per split edge---the node the insertion descends past last. Measured with the reference implementation on a batch of $1\,000$ insertions into a tree of $10^4$ keys, the transcript is within $15\%$ of the size of the depth-only encoding; the derived regions cost nothing on the wire.

<a id="rem:placement"></a>
**Remark 1** (Why the region commitment is necessary). Everything in [Algorithm 2](#alg:stackverify-core) beyond the digest algebra exists to enforce coherent placement. Consider the minimal alternative: the junction hash commits the depth alone, $h_N = H(\texttt{0x01} \| \langle d\rangle \| h_l \| h_r)$, the alphabet shrinks to $S$, $L$, $N$, and only the digest algebra is checked. Let the pre-state with certified root $r_{i-1}$ contain the recorded binding $(k, v)$, and pick any depth $d^{*}$ with $k[d^{*}] = 1$. The three-opcode stream $(S(r_{i-1}), L, N(d^{*}))$ then verifies for the batch $\{(k, v')\}$, $v' \ne v$: the old side of $N(d^{*})$ passes $r_{i-1}$ through, and the new side hangs the entire pre-state tree on the $0$-side of the new junction, while the key-directed descent for $k$ leads to the $1$-side. Under the certified $r_i$, a one-step inclusion proof for $(k, v')$ verifies, and the preserved binding $(k, v)$ is no longer provable: cross-round equivocation on $k$, invisible to every structural check, including the full-history audit of Section [7](#sec:aggregation-audit). [Algorithm 2](#alg:stackverify-core) rejects the stream: the preserved child of a new junction must be presented opened, and edge coherence requires its region to extend $p\|0$ while the new leaf's key extends $p\|1$---impossible, since the preserved subtree's region is a prefix of $k$. Theorem [2](#thm:round) shows that every attack of this kind is excluded.

<a id="sec:consistency-formal"></a>

### Formal Model

We fix the key length $\kappa = 256$, key space $\mathcal{K} = \{0,1\}^{\kappa}$, a value space $\mathcal{V} \subseteq \{0,1\}^{*}$, and a hash function $H \colon \{0,1\}^{*} \to \{0,1\}^{\lambda}$. For bit strings, $p \preceq q$ denotes that $p$ is a prefix of $q$, $q[j]$ is the $j$-th bit, and $q[0..d)$ is the first $d$ bits; $\langle\cdot\rangle$ are fixed-length injective encodings; $\varnothing$ is a distinguished constant outside $\{0,1\}^{\lambda}$. All statements below are unconditional reductions: each concludes either the stated property, or that two distinct strings with equal $H$-images (a *collision*) are computable in time linear in the size of the objects at hand. We do not repeat this disjunction in every statement.

#### Tree commitments

<a id="def:tree"></a>
**Definition 3** (Valid trees). Trees are generated by $$T ::= \mathsf{Leaf}(k, v) \mid \mathsf{Node}(d, p, T_l, T_r)$$ with $k \in \mathcal{K}$, $v \in \mathcal{V}$, $0 \le d < \kappa$, $p \in \{0,1\}^{d}$; $\varepsilon$ denotes the empty tree. Digests: $$\begin{align*}
\mathsf{dig}(\mathsf{Leaf}(k,v)) &= H(\texttt{0x00} \| k \| v),\\
\mathsf{dig}(\mathsf{Node}(d,p,l,r)) &= H(\texttt{0x01} \| \langle d\rangle \| \langle p\rangle \| \mathsf{dig}(l) \| \mathsf{dig}(r)),
\end{align*}$$ and $\mathsf{dig}(\varepsilon) = \varnothing$. Region and depth: $\mathsf{reg}(\mathsf{Leaf}(k,v)) = k$ and $\mathsf{reg}(\mathsf{Node}(d,p,\cdot,\cdot)) = p$; $\mathsf{dep}(\mathsf{Leaf}) = \kappa$ and $\mathsf{dep}(\mathsf{Node}(d,\ldots)) = d$. A tree is *valid* if every junction $\mathsf{Node}(d,p,l,r)$ in it satisfies: $l$ and $r$ are nonempty, $\mathsf{dep}(l) > d$, $\mathsf{dep}(r) > d$, $p\|0 \preceq \mathsf{reg}(l)$, and $p\|1 \preceq \mathsf{reg}(r)$. The trees $\varepsilon$ and $\mathsf{Leaf}(k,v)$ are valid.

The validity conditions are local: one condition per edge. The next three results separate their global consequences from the stronger persistence facts needed only for completeness.

<a id="lem:shape"></a>
**Lemma 1** (Local-to-global shape). Let $T$ be a valid tree. Then:

1.  every leaf key extends the region of each of its ancestors, and distinct leaves carry distinct keys; hence $T$ represents the partial map $\mathsf{map}(T) = \{k \mapsto v \mid \mathsf{Leaf}(k,v) \in T\}$;

2.  at every junction, the region $p$ is the longest common prefix of the keys below it;

3.  the left-to-right leaf order of $T$ is the strictly increasing key order.

*Proof.* (i) Validity gives $p\|\beta \preceq \mathsf{reg}(\text{child})$ at every edge, so by induction every node's region, and every leaf key, extends the region of each ancestor. Two leaves with the same key $k$ would sit on opposite sides of their lowest common ancestor $\mathsf{Node}(d,p,\cdot,\cdot)$, forcing both $p\|0 \preceq k$ and $p\|1 \preceq k$, which is impossible.

\(ii\) Every key below $\mathsf{Node}(d,p,l,r)$ extends $p$. Both children are nonempty, so some key below extends $p\|0$ and some extends $p\|1$. The common prefix therefore ends after exactly the $d$ bits of $p$.

\(iii\) At every junction, keys on the left have bit $0$ and keys on the right have bit $1$ at position $d$, and both sides agree on the first $d$ bits. So every left key precedes every right key, and the claim follows by induction. ◻

For a finite partial map $M$ and a bit string $q$, write $$M_q = \{\,k \mapsto v \in M \mid q \preceq k\,\}$$ for the restriction of $M$ to the key-space cone below $q$.

<a id="prop:unique"></a>
**Proposition 1** (Unique representation). Every finite partial map $M$ has exactly one valid RSMT, written $\mathsf{Tree}(M)$.

*Proof.* Induction on the key set. The empty map gives $\varepsilon$, and a singleton forces its leaf. Otherwise let $p$ be the longest common prefix of all keys. Its next bit partitions $M$ into the two nonempty maps $M_{p\|0}$ and $M_{p\|1}$. By induction these maps have unique valid trees $T_l$ and $T_r$. Their root regions extend $p\|0$ and $p\|1$, respectively, and their root depths exceed $|p|$, so $\mathsf{Node}(|p|,p,T_l,T_r)$ is valid.

Conversely, Lemma [1](#lem:shape)(ii) forces any valid root representing $M$ to have region $p$; validity forces its two children to represent exactly $M_{p\|0}$ and $M_{p\|1}$; and the induction hypothesis forces those children. Values label the determined leaves and do not affect the shape. ◻

<a id="lem:persist"></a>
**Lemma 2** (Extension persistence). Let $M$ and $B$ be finite partial maps with disjoint domains. For any finite partial map $A$, a subtree with region $\varrho$ in $\mathsf{Tree}(A)$ represents exactly $A_\varrho$. Moreover:

1.  $\mathsf{Tree}(M)$ contains a junction with region $p$ iff $M_{p\|0} \neq \emptyset \neq M_{p\|1}$;

2.  every junction of $\mathsf{Tree}(M)$ persists, with the same depth and region, in $\mathsf{Tree}(M \uplus B)$;

3.  if a node with region $\varrho$ occurs in either $\mathsf{Tree}(M)$ or $\mathsf{Tree}(M \uplus B)$ and $B_\varrho = \emptyset$, then it occurs in both trees and the two rooted subtrees are identical.

*Proof.* First consider a subtree $U$ with region $\varrho$ in $\mathsf{Tree}(A)$. Lemma [1](#lem:shape)(i) shows that every key below $U$ extends $\varrho$. Conversely, key-directed descent places every key of $A_\varrho$ below $U$. Hence $\mathsf{map}(U)=A_\varrho$.

\(i\) For the forward direction, the cone identity just proved and the two nonempty children supply keys extending $p\|0$ and $p\|1$. Conversely, suppose both restricted maps are nonempty and descend from the root of $\mathsf{Tree}(M)$. At a current junction with region $q$, the two selected key sets lie below it, so Lemma [1](#lem:shape)(ii) gives $q \preceq p$. If $q \neq p$, all keys extending $p$ select the same child at depth $|q|$; recurse into that child. Depths increase, the two selected sets prevent termination at a leaf, and the descent therefore reaches the junction with region $p$.

\(ii\) The condition in (i) is monotone under extension from $M$ to $M \uplus B$, and a junction's depth is the length of its region.

\(iii\) Suppose first that the node occurs in $\mathsf{Tree}(M)$. A junction persists by (ii), while a leaf persists because its binding remains in the extended map. Conversely, suppose the node occurs in $\mathsf{Tree}(M \uplus B)$. If it is a junction, the two sides of $(M \uplus B)_\varrho$ are nonempty; because $B_\varrho=\emptyset$, clause (i) places the same junction in $\mathsf{Tree}(M)$. If it is a leaf, its binding belongs to $M$ and the same leaf occurs in $\mathsf{Tree}(M)$. In either direction, the two rooted subtrees represent the same map $$(M \uplus B)_\varrho=M_\varrho.$$ Proposition [1](#prop:unique) makes them identical. ◻

For a valid tree $T$ and a batch $B$ whose keys are pairwise distinct and absent from $\mathsf{map}(T)$, we identify $B$ with its induced partial map and write $$T \oplus B = \mathsf{Tree}(\mathsf{map}(T) \uplus B).$$

<a id="def:opening"></a>
**Definition 4** (Opening trees). Opening trees are generated by $$F ::= \mathsf{Hole}(c) \mid \mathsf{OLeaf}(k, v) \mid \mathsf{ONode}(d, p, F_l, F_r)$$ with $c \in \{0,1\}^{\lambda}$ and the other operands as in Definition [3](#def:tree). Evaluation mirrors $\mathsf{dig}$: writing $e_x = \mathsf{eval}(F_x)$, $$\begin{align*}
\mathsf{eval}(\mathsf{Hole}(c)) &= c,\\
\mathsf{eval}(\mathsf{OLeaf}(k,v)) &= H(\texttt{0x00} \| k \| v),\\
\mathsf{eval}(\mathsf{ONode}(d,p,F_l,F_r)) &= H(\texttt{0x01} \| \langle d\rangle \| \langle p\rangle \| e_l \| e_r).
\end{align*}$$

An opening tree is a partially opened commitment: $\mathsf{OLeaf}$ and $\mathsf{ONode}$ present hash preimages, while a $\mathsf{Hole}$ stands for an unopened subtree. The following lemma is the workhorse of every argument below: an opening tree that evaluates to the digest of a known tree is an exact partial copy of that tree.

<a id="lem:match"></a>
**Lemma 3** (Matching). Let $T \neq \varepsilon$ be a tree and $F$ an opening tree with $\mathsf{eval}(F) = \mathsf{dig}(T)$. Then:

1.  every $\mathsf{ONode}(d,p,\cdot,\cdot)$ of $F$ coincides with a junction $\mathsf{Node}(d,p,\cdot,\cdot)$ of $T$ at the same position, with equal child digests;

2.  every $\mathsf{OLeaf}(k,v)$ of $F$ coincides with $\mathsf{Leaf}(k,v)$ of $T$ at the same position;

3.  every $\mathsf{Hole}(c)$ is *assigned* the subtree of $T$ at its position, and that subtree has digest $c$;

4.  replacing every hole by its assigned subtree turns $F$ into $T$.

*Proof.* Induction on $F$, with the invariant $\mathsf{eval}(F) = \mathsf{dig}(T)$ for the current pair. A hole is assigned the current subtree of $T$. Otherwise, compare the two $H$-preimages. If they differ, they are a collision. If they are equal, the domain-separation tag and the injective encodings force the same constructor with equal components: an $\mathsf{OLeaf}$ meets $\mathsf{Leaf}(k,v)$ with the same $k$ and $v$; an $\mathsf{ONode}$ meets a junction with the same $(d,p)$ and equal child digests, and the induction continues in both children. Clause (d) restates that the recursion covers $F$ and $T$ simultaneously and completely. Each step is one comparison, so the reduction is linear. ◻

#### Authenticated queries

Query certificates concern one committed map and do not depend on how that map was reached. We therefore define and prove them before introducing certified update histories.

<a id="def:query-cert"></a>
**Definition 5** (Query certificates). An *inclusion certificate* for $(k,v)$ is a possibly empty sequence $$\gamma=\big((d_1,s_1),\ldots,(d_m,s_m)\big), \qquad m\geq 0.$$ When $m>0$, the depths satisfy $$\kappa>d_1>\cdots>d_m\geq 0,$$ where every $s_j\in\{0,1\}^{\lambda}$. The order is from the leaf toward the root. To verify $\gamma$ against $r$, set $c_0=H(\texttt{0x00}\|k\|v)$ and, for $j=1,\ldots,m$, compute $$c_j = \begin{cases}
H(\texttt{0x01}\|\langle d_j\rangle\|\langle p_j\rangle\|c_{j-1}\|s_j) & \text{if } k[d_j] = 0,\\
H(\texttt{0x01}\|\langle d_j\rangle\|\langle p_j\rangle\|s_j\|c_{j-1}) & \text{if } k[d_j] = 1,
\end{cases}$$ where $p_j=k[0..d_j)$. Accept iff $c_m=r$. When $m=0$, this means accepting iff $c_0=r$.

For later use, $\gamma$ determines an opening tree $F_\gamma$. Start with $F_0=\mathsf{OLeaf}(k,v)$ and wrap it once per pair $(d_j,s_j)$: $$F_j=\begin{cases}
\mathsf{ONode}(d_j,p_j,F_{j-1},\mathsf{Hole}(s_j)) & k[d_j]=0,\\
\mathsf{ONode}(d_j,p_j,\mathsf{Hole}(s_j),F_{j-1}) & k[d_j]=1.
\end{cases}$$ Thus $\mathsf{eval}(F_\gamma)=c_m$, so inclusion verification is exactly the check $\mathsf{eval}(F_\gamma)=r$.

A *non-inclusion certificate* is a list $\eta$ read from the root downward. Its entries are junction openings $$J(d,p,c^0,c^1)
  \quad\text{or opened leaves}\quad
  E(k',v'),$$ with operands in the domains of Definition [4](#def:opening). Verification of $\eta$ for $k$ against $r$ is deterministic:

1.  The empty list accepts iff $r=\varnothing$.

2.  For a nonempty list, set the expected digest to $q=r$ and read entries from left to right. Junction depths must strictly increase.

3.  At $J(d,p,c^0,c^1)$, require $$q=H(\texttt{0x01}\|\langle d\rangle\|\langle p\rangle\|c^0\|c^1).$$ If $p\not\preceq k$, accept iff this is the final entry. If $p\preceq k$, require $p=k[0..d)$ and another entry, set $q=c^{k[d]}$, and continue.

4.  At $E(k',v')$, accept iff this is the final entry, $q=H(\texttt{0x00}\|k'\|v')$, and $k'\neq k$.

Any unmet requirement rejects.

Every accepted nonempty $\eta$ determines an opening tree $F_\eta$. The final entry becomes either $\mathsf{OLeaf}(k',v')$ or an $\mathsf{ONode}$ with two holes. Working backward, replace the $k[d]$-side hole of each preceding junction by the opening already constructed and leave its other child as a hole. The digest checks above give $\mathsf{eval}(F_\eta)=r$.

<a id="thm:query"></a>
**Theorem 1** (Query correctness). Let $M$ be a finite partial map, $T=\mathsf{Tree}(M)$, and $r=\mathsf{dig}(T)$.

1.  An inclusion certificate for $(k,v)$ verifies against $r$ only if $M(k)=v$; if $M(k)=v$, the leaf-to-root path in $T$ gives a verifying inclusion certificate.

2.  A non-inclusion certificate for $k$ verifies against $r$ only if $k\notin\mathrm{dom}(M)$; if $k\notin\mathrm{dom}(M)$, key-directed descent in $T$ gives a verifying non-inclusion certificate.

Both certificates contain at most $\kappa$ junction openings and are constructed in time linear in the path length.

*Proof.* (i) Let $\gamma$ verify. Its opening tree satisfies $\mathsf{eval}(F_\gamma)=r$. Since an opening tree evaluates to an $H$-image, $r\neq\varnothing$ and $T\neq\varepsilon$. Lemma [3](#lem:match) places the terminal $\mathsf{OLeaf}(k,v)$ at the corresponding leaf of $T$, so $M(k)=v$.

Conversely, suppose $M(k)=v$. Starting at $\mathsf{Leaf}(k,v)$, list its ancestors toward the root. For each ancestor record its depth and the digest of the sibling subtree. Depths strictly decrease in this leaf-to-root order, Lemma [1](#lem:shape)(ii) gives the region $k[0..d)$, and the side is $k[d]$. The verifier therefore recomputes the digest of each ancestor and ends at $r$. A singleton tree gives the empty certificate.

\(ii\) The empty certificate verifies only when $r=\varnothing$, which means $T=\varepsilon$ and the key is absent. Now let a nonempty $\eta$ verify. Its opening tree satisfies $\mathsf{eval}(F_\eta)=r$, so Lemma [3](#lem:match) places the entire opened path in $T$. Suppose for contradiction that $T$ contains the leaf for $k$. At every nonterminal junction, the certificate requires the junction region to be a prefix of $k$ and continues through side $k[d]$. The matched path therefore remains on the unique path to that leaf. Its terminal cannot be a junction whose region excludes $k$, because every ancestor region is a prefix of $k$ by Lemma [1](#lem:shape)(i); and it cannot be a leaf with a different key. This contradicts the verifier's terminal check.

Conversely, suppose $k$ is absent. If $T=\varepsilon$, use the empty certificate. Otherwise open the root and descend while the current junction region is a prefix of $k$, following side $k[d]$. Stop and open the first junction whose region is not a prefix of $k$, or the first leaf. The descent is finite because junction depths strictly increase. The terminal leaf cannot have key $k$, and the recorded openings satisfy every digest, path, and terminal check of Definition [5](#def:query-cert).

A valid root-to-leaf path has strictly increasing depths in $\{0,\ldots,\kappa\}$, which gives the size bound; both constructions visit each path node once. ◻

#### Certified histories

We now turn from queries against one root to the sequence of roots accepted by the consistency verifier.

<a id="def:aoc"></a>
**Definition 6** (Certified history; append-only consistency). A *certified history* is a sequence $(B_1, \pi_1, r_1), \ldots, (B_n, \pi_n, r_n)$ with $r_0 = \varnothing$ and [Algorithm 3](#alg:stackverify) accepting $(\pi_i, r_{i-1}, r_i, B_i)$ for every $i$. Define cumulative maps by $$M_0 = \emptyset, \qquad M_i = M_{i-1} \uplus B_i \quad (i=1,\ldots,n),$$ identifying a batch with its induced partial map. The history is *append-only consistent* if every disjoint union above is defined and $$r_i = \mathsf{dig}(\mathsf{Tree}(M_i)) \qquad \text{for } i=0,\ldots,n.$$ Thus definedness requires every batch to have pairwise distinct keys absent from all earlier batches. By Proposition [1](#prop:unique), this definition is equivalent to the existence of valid state trees with the previous round-by-round map-extension property.

Definition [6](#def:aoc) is the formal counterpart of clause (i) in Definition [1](#def:append-only-accumulator); Theorem [1](#thm:query) gives clauses (ii) and (iii) for every canonical state tree. Theorem [4](#thm:history) links those trees to the roots of a certified history. Definition [6](#def:aoc) also subsumes prior-state preservation [Equation 1](#eq:psp), with the committed maps of Section [4.3](#sec:scope) realized as the cumulative maps $M_i$.

<a id="sec:consistency-theorem"></a>

### Certified Update Security

The verifier's checks are node-local. We make this explicit by giving the proof stream a typed syntax tree with recursively defined attributes; the checks become a local predicate on that tree. All reasoning below is structural induction. The algorithm itself appears only in Lemma [4](#lem:parse).

<a id="def:pterm"></a>
**Definition 7** (Proof terms). Proof terms are generated by $$\begin{align*}
P ::={} & S(c) \mid O(d, p, c_l, c_r) \mid O_L(k, v) \mid{}\\
        & L(k, v) \mid N(d, P_l, P_r)
\end{align*}$$ with operands in their domains: $c, c_l, c_r \in \{0,1\}^{\lambda}$, $k \in \mathcal{K}$, $v \in \mathcal{V}$, $0 \le d < \kappa$, $p \in \{0,1\}^{d}$. In $N(d, P_l, P_r)$, the subterm $P_l$ has side $\beta = 0$ and $P_r$ has side $\beta = 1$.

The *advice* attribute is $$\begin{align*}
\mathsf{adv}(S(c)) &= \bot, & \mathsf{adv}(O(d,p,\cdot,\cdot)) &= (d, p),\\
\mathsf{adv}(O_L(k,v)) &= (\kappa, k), & \mathsf{adv}(L(k,v)) &= (\kappa, k),
\end{align*}$$ and $\mathsf{adv}(N(d, P_l, P_r)) = (d, p)$ with the *derived region* $p = \varrho_x[0..d)$, computed from any child with $\mathsf{adv}(P_x) = (\delta_x, \varrho_x) \neq \bot$. (The predicate $\mathsf{ok}$ below makes this well-defined.)

The *old digest* attribute is $$\begin{align*}
\mathsf{old}(S(c)) &= c,\\
\mathsf{old}(O(d,p,c_l,c_r)) &= H(\texttt{0x01}\|\langle d\rangle\|\langle p\rangle\|c_l\|c_r),\\
\mathsf{old}(O_L(k,v)) &= H(\texttt{0x00}\|k\|v),\\
\mathsf{old}(L(k,v)) &= \varnothing,
\end{align*}$$ and, for a junction $N = N(d, P_l, P_r)$ with derived region $p$, writing $o_x = \mathsf{old}(P_x)$, the *four-way rule* $$\mathsf{old}(N) = \begin{cases}
\varnothing & o_l = o_r = \varnothing,\\
o_r & o_l = \varnothing \neq o_r,\\
o_l & o_r = \varnothing \neq o_l,\\
H(\texttt{0x01}\|\langle d\rangle\|\langle p\rangle\|o_l\|o_r) & \text{otherwise}.
\end{cases}$$ The *new digest* attribute equals $\mathsf{old}$ on $S$, $O$, and $O_L$; further, writing $n_x = \mathsf{new}(P_x)$, $$\begin{align*}
\mathsf{new}(L(k,v)) &= H(\texttt{0x00}\|k\|v),\\
\mathsf{new}(N(d,P_l,P_r)) &= H(\texttt{0x01}\|\langle d\rangle\|\langle p\rangle\|n_l\|n_r).
\end{align*}$$

The predicate $\mathsf{ok}(P)$ holds if every junction $N(d, P_l, P_r)$ in $P$ satisfies:

1.  *coherence*: every advised child, $\mathsf{adv}(P_x) = (\delta_x, \varrho_x)$, has $\delta_x > d$ and $\varrho_x[d] = \beta_x$;

2.  *agreement*: at least one child is advised, and all advised children yield the same $\varrho_x[0..d)$;

3.  *confinement*: if $\mathsf{old}(P_l) = \varnothing$ or $\mathsf{old}(P_r) = \varnothing$, then both children are advised.

$P$ *accepts* $(r_{\mathsf o}, r_{\mathsf n}, B)$ if $\mathsf{ok}(P)$, $\mathsf{old}(P) = r_{\mathsf o}$, $\mathsf{new}(P) = r_{\mathsf n}$, and the labels of the $L$ leaves of $P$, read left to right, are exactly the elements of $B$ sorted, with strictly increasing keys.

<a id="lem:parse"></a>
**Lemma 4** (Stream--term correspondence). Let $B \neq [\,]$. [Algorithm 3](#alg:stackverify) accepts $(\pi, r_{i-1}, r_i, B)$ iff $\pi$ is the post-order serialization of a proof term that accepts $(r_{i-1}, r_i, B)$. The term is unique and the translation is linear-time.

*Proof.* Each of $S$, $O$, $O_L$, $L$ pushes one stack entry; $N$ pops two and pushes one. A run without underflow that ends with one entry parses the stream uniquely as the post-order serialization of a term; conversely, the serialization of any term replays without underflow and ends with one entry. By induction over the run, the triple pushed for a subterm is exactly $(\mathsf{old}, \mathsf{new}, \mathsf{adv})$ of that subterm, and the checks executed per opcode are exactly the operand-domain conditions of Definition [7](#def:pterm) plus, at $N$, clauses (a)--(c) of $\mathsf{ok}$. The final comparisons equate the root digest pair with $(r_{i-1}, r_i)$; the batch consumption at $L$ and the final $b = |B|$ check equate the left-to-right $L$ labels with the sorted batch. ◻

<a id="lem:proj"></a>
**Lemma 5** (Old projection). For a proof term $P$, define the *old projection* $P_0$ by structural recursion: $S(c) \mapsto \mathsf{Hole}(c)$; $O(d,p,c_l,c_r) \mapsto \mathsf{ONode}(d,p,\mathsf{Hole}(c_l),\mathsf{Hole}(c_r))$; $O_L(k,v) \mapsto \mathsf{OLeaf}(k,v)$; $L(k,v) \mapsto$ nothing; $N(d,P_l,P_r)$ with derived region $p$: nothing if both children project to nothing, the surviving child's projection if exactly one does, and $\mathsf{ONode}(d,p,\cdot,\cdot)$ over the two projections otherwise. Then $P_0$ is empty iff $\mathsf{old}(P) = \varnothing$, and otherwise $P_0$ is an opening tree with $\mathsf{eval}(P_0) = \mathsf{old}(P)$.

*Proof.* Induction on $P$. A subterm projects to nothing iff its old digest is $\varnothing$: immediate for the terminals, and for $N$ the three projection cases match the four-way rule ($\varnothing$, the two pass-throughs, hashed). In the surviving cases, $\mathsf{eval}$ of the projection recomputes exactly the $\mathsf{old}$ value; the pass-through case forwards both the projection and the digest of the surviving child. ◻

<a id="lem:graft"></a>
**Lemma 6** (Reconstruction). Let $T$ be a valid tree and let the proof term $P$ accept $(\mathsf{dig}(T), r_{\mathsf n}, B)$. Then there is a valid tree $T'$ with $\mathsf{dig}(T') = r_{\mathsf n}$ and $\mathsf{map}(T') = \mathsf{map}(T) \uplus B$.

*Proof.* First obtain a subtree of $T$ for every digest operand of $P$. If $\mathsf{dig}(T) = \varnothing$ then $T = \varepsilon$, and by Lemma [5](#lem:proj) $P_0$ is empty; since a non-$\varnothing$ old digest survives every case of the four-way rule, $P$ then contains no $S$, $O$, or $O_L$, and no assignment is needed. Otherwise $\mathsf{eval}(P_0) = \mathsf{dig}(T)$, and Lemma [3](#lem:match) matches $P_0$ into $T$: every $O$ and $O_L$ of $P$ coincides with the node of $T$ at its position, and every hole---an $S$ operand or a child digest of an $O$---is assigned the subtree of $T$ at its position.

Define $T' = \mathsf{graft}(P)$ by structural recursion: $S(c) \mapsto$ its assigned subtree; $O(d,p,\cdot,\cdot) \mapsto \mathsf{Node}(d,p,\cdot,\cdot)$ over its two assigned subtrees; $O_L(k,v) \mapsto \mathsf{Leaf}(k,v)$; $L(k,v) \mapsto \mathsf{Leaf}(k,v)$; $N(d,P_l,P_r) \mapsto \mathsf{Node}(d,p,\cdot,\cdot)$ with its derived region $p$, over the grafts of its children.

*Digests.* By induction, $\mathsf{dig}(\mathsf{graft}(Q)) = \mathsf{new}(Q)$ for every subterm $Q$: $\mathsf{new}$ agrees with $\mathsf{dig}$ on the terminals and recomputes every junction. Hence $\mathsf{dig}(T') = r_{\mathsf n}$.

*Advice.* Wherever $\mathsf{adv}(Q) = (\delta, \varrho) \neq \bot$, the top node of $\mathsf{graft}(Q)$ has depth $\delta$ and region $\varrho$. This holds by construction for $O$, $O_L$, $L$, and $N$.

*Validity.* Every subterm grafts to a nonempty tree, so every junction of $T'$ has two nonempty children. Classify the edges of $T'$. (1) Edges inside assigned subtrees are edges of $T$. (2) The two edges below an $O$ graft: by the matching, the $O$ coincides with a junction of $T$ and its assigned children are the children of that junction in $T$; these are edges of $T$. (3) An edge whose child is an $S$ graft: the parent is an $N$; the $S$ child is unadvised, so by confinement both old digests at the parent are non-$\varnothing$, and the parent appears in $P_0$ as an $\mathsf{ONode}$ with its derived region. The matching places this junction, and the $T$-subtree assigned to the $S$ hole below it, in $T$; this is an edge of $T$. (4) Every remaining edge has an advised child. Coherence gives $\delta > d$ and, with agreement, $p\|\beta \preceq \varrho$; by the advice claim, $(\delta, \varrho)$ is the true depth and region of the child's top node. Edges of $T$ satisfy the validity conditions because $T$ is valid; edges of kind (4) satisfy them directly. Hence $T'$ is valid.

*Map.* The leaves of $T'$ are the leaves of assigned subtrees, the $O_L$ leaves, and the $L$ leaves. By clause (d) of the matching, the first two groups are exactly the leaves of $T$. The $L$ leaves carry exactly the elements of $B$. By Lemma [1](#lem:shape)(i), all leaf keys of the valid $T'$ are distinct; hence the keys of $B$ are absent from $\mathsf{map}(T)$, and $\mathsf{map}(T') = \mathsf{map}(T) \uplus B$. ◻

<a id="thm:round"></a>
**Theorem 2** (Round soundness). Let $T$ be a valid tree with $\mathsf{dig}(T) = r_{i-1}$, and let [Algorithm 3](#alg:stackverify) accept $(\pi, r_{i-1}, r_i, B)$. Then there is a valid tree $T'$ with $\mathsf{dig}(T') = r_i$ and $\mathsf{map}(T') = \mathsf{map}(T) \uplus B$. In particular, the keys of $B$ are fresh: no accepting run exists for a batch that re-records a present key, short of a collision.

*Proof.* If $B = [\,]$, acceptance forces $\pi = [\,]$ and $r_i = r_{i-1}$; take $T' = T$. Otherwise Lemma [4](#lem:parse) yields a proof term accepting $(r_{i-1}, r_i, B)$, and Lemma [6](#lem:graft) yields $T'$. ◻

<a id="def:generator"></a>
**Definition 8** (Difference generator). Let $T$ be valid, let $B \neq [\,]$ have pairwise distinct keys absent from $M=\mathsf{map}(T)$, and put $T'=T\oplus B$. For a subtree $U$ of $T'$, let $$M[U] = \{\,k \mapsto v \in M \mid \mathsf{Leaf}(k,v)\text{ occurs below }U\,\}.$$ The difference generator traverses $T'$ from the root. On reaching a maximal subtree $U$ containing no key of $B$, it stops: Lemma [2](#lem:persist)(iii) identifies $U$ as a preserved subtree of $T$. It emits $S(\mathsf{dig}(U))$ when the parent junction also occurs in $T$; when the parent is new, it emits the opened root of $U$, namely $O$ with the true node labels and child digests or $O_L$ with the true leaf. A leaf from $B$ emits $L(k,v)$. Every other node $U=\mathsf{Node}(d,p,U_l,U_r)$ emits $N(d,Q_l,Q_r)$ after recursively generating $Q_l$ and $Q_r$. The resulting proof term is $P_B$.

Operationally, $T'$ and $P_B$ are produced together by merging the sorted batch into $T$. Preserved subtrees are emitted at their roots without traversal, so the merge performs constant work per emitted constructor and per batch element.

<a id="lem:generator"></a>
**Lemma 7** (Generator invariant). For every subterm $Q$ generated for a subtree $U$ of $T'$:

1.  $\mathsf{ok}(Q)$;

2.  $\mathsf{old}(Q)=\mathsf{dig}(\mathsf{Tree}(M[U]))$;

3.  $\mathsf{new}(Q)=\mathsf{dig}(U)$;

4.  either $Q=S(\mathsf{dig}(U))$ and $\mathsf{adv}(Q)=\bot$, or $\mathsf{adv}(Q)=(\mathsf{dep}(U),\mathsf{reg}(U))$;

5.  the $L$ labels of $Q$, from left to right, are exactly the bindings of $B$ below $U$, in strictly increasing key order.

Consequently, $P_B$ accepts $(\mathsf{dig}(T),\mathsf{dig}(T'),B)$ and is computable, together with $T'$, in time $O(|P_B|+|B|)$ after sorting $B$.

*Proof.* Induction over the generator.

If $U$ is preserved, then $M[U]=\mathsf{map}(U)$ and Proposition [1](#prop:unique) gives $U=\mathsf{Tree}(M[U])$. Both $S$ and the opened-root forms have equal old and new digest $\mathsf{dig}(U)$; the opened forms carry the true top-node advice, while $S$ is unadvised. There are no $L$ labels. If $U=\mathsf{Leaf}(k,v)$ comes from $B$, freshness gives $M[U]=\emptyset$; the emitted $L(k,v)$ has old digest $\varnothing=\mathsf{dig}(\mathsf{Tree}(\emptyset))$, new digest $\mathsf{dig}(U)$, true leaf advice, and the required singleton label list. Thus all five claims hold in the terminal cases.

Let $U=\mathsf{Node}(d,p,U_l,U_r)$ emit $Q=N(d,Q_l,Q_r)$ and apply the induction hypothesis to its children. At least one child term is not $S$: otherwise both child subtrees would contain no batch key and the generator would have stopped at $U$. Every advised child carries its true top-node depth and region, so validity of $U$ gives coherence; all advised children yield the true prefix $p$, so agreement holds and $\mathsf{adv}(Q)=(d,p)$.

The cone identity of Lemma [2](#lem:persist), applied to $U$ in $T'=\mathsf{Tree}(M\uplus B)$, says that $U$ contains exactly the bindings below $p$. Key placement at $U$ then gives $M[U_l]=M_{p\|0}$ and $M[U_r]=M_{p\|1}$; these maps partition $M[U]$. If both parts are empty, so is $M[U]$ and the four-way rule returns $\varnothing$. If exactly one part is nonempty, its unique valid tree is also $\mathsf{Tree}(M[U])$, and the rule passes through its digest. If both are nonempty, the two parts contain keys on opposite sides of $p$; the construction in Proposition [1](#prop:unique) gives $$\mathsf{Tree}(M[U])
  = \mathsf{Node}(d,p,\mathsf{Tree}(M[U_l]),\mathsf{Tree}(M[U_r])),$$ so the hashed case gives its digest. This proves (ii).

If either child old digest is $\varnothing$, its old map is empty because no nonempty tree has digest $\varnothing$. Lemma [2](#lem:persist)(i) then shows that the junction at $p$ is new. A preserved child below it was emitted opened, and every non-preserved child is advised by the induction hypothesis; hence both children are advised and confinement holds. Together with coherence and agreement this proves (i). The definition of $\mathsf{new}$ and the induction hypothesis give (iii). The preceding advice argument gives (iv). Finally, the $L$ list of $Q$ is the concatenation of its two child lists; Lemma [1](#lem:shape)(iii) places every left key before every right key, proving (v).

At the root, $M[T']=M$, so Proposition [1](#prop:unique) gives $\mathsf{Tree}(M)=T$. Claims (i)--(v) therefore say exactly that $P_B$ accepts $(\mathsf{dig}(T),\mathsf{dig}(T'),B)$. The operational merge of Definition [8](#def:generator) visits each emitted constructor and batch element once, giving the stated time bound. ◻

<a id="thm:complete"></a>
**Theorem 3** (Completeness). Let $T$ be a valid tree and $B$ a batch whose keys are pairwise distinct and absent from $\mathsf{map}(T)$. Then a stream $\pi_B$ such that [Algorithm 3](#alg:stackverify) accepts $(\pi_B, \mathsf{dig}(T), \mathsf{dig}(T \oplus B), B)$ is computable from $T$ and $B$ in linear time after sorting $B$.

*Proof.* For $B=[\,]$, take $\pi_B=[\,]$. Otherwise Lemma [7](#lem:generator) shows that the generated term $P_B$ accepts the required roots and batch. Serialize $P_B$ in post-order and apply Lemma [4](#lem:parse); its linear-time bound and the generator bound give the claim. ◻

<a id="thm:history"></a>
**Theorem 4** (History soundness). Every certified history (Definition [6](#def:aoc)) is append-only consistent, or a collision is computable from the transcript.

*Proof.* Induction on rounds. The base map is $M_0=\emptyset$ and $r_0=\varnothing=\mathsf{dig}(\mathsf{Tree}(M_0))$. Assume $M_{i-1}$ is defined and $r_{i-1}=\mathsf{dig}(\mathsf{Tree}(M_{i-1}))$. Apply Theorem [2](#thm:round) to the valid tree $\mathsf{Tree}(M_{i-1})$ and the accepted round $i$. It yields a valid $T'$ with $$\mathsf{dig}(T')=r_i,
  \qquad
  \mathsf{map}(T')=M_{i-1}\uplus B_i.$$ Thus the disjoint union defining $M_i$ exists, and Proposition [1](#prop:unique) gives $T'=\mathsf{Tree}(M_i)$. Hence $r_i=\mathsf{dig}(\mathsf{Tree}(M_i))$, completing the induction. ◻

<a id="cor:unicity"></a>
**Corollary 1** (Unicity). In a certified history, verifying inclusion certificates for $(k, v)$ against $r_i$ and for $(k, v')$ against $r_j$ imply $v = v'$.

*Proof.* Apply Theorem [4](#thm:history); if it produces a collision, we are done. Otherwise, without loss of generality let $i\leq j$. Then $r_i=\mathsf{dig}(\mathsf{Tree}(M_i))$ and $r_j=\mathsf{dig}(\mathsf{Tree}(M_j))$. Theorem [1](#thm:query)(i) gives $M_i(k)=v$ and $M_j(k)=v'$. Since $M_i\subseteq M_j$, the two values are equal. ◻

<a id="cor:batchbound"></a>
**Corollary 2** (No out-of-batch bindings). In a certified history, if an inclusion certificate for $(k,v)$ verifies against $r_i$, then $$(k,v)\in B_1\uplus\cdots\uplus B_i.$$ Here the $B_j$ are the consistency proof's witness batches. The claim does not assert that every witness binding came from an authenticated user request.

*Proof.* Apply Theorem [4](#thm:history). Unless it produces a collision, $M_i=B_1\uplus\cdots\uplus B_i$ and $r_i=\mathsf{dig}(\mathsf{Tree}(M_i))$; Theorem [1](#thm:query)(i) gives the result. ◻

<a id="cor:noninc"></a>
**Corollary 3** (No false non-inclusion). In a certified history, a verifying inclusion certificate for $(k,v)$ against $r_i$ and a verifying non-inclusion certificate for $k$ against $r_j$, where $j\geq i$, together yield a collision.

*Proof.* Apply Theorem [4](#thm:history); if it produces a collision, we are done. Otherwise the certified roots are the digests of $\mathsf{Tree}(M_i)$ and $\mathsf{Tree}(M_j)$. Theorem [1](#thm:query) gives $$k\in\mathrm{dom}(M_i)\subseteq\mathrm{dom}(M_j)
  \quad\text{and}\quad
  k\notin\mathrm{dom}(M_j),$$ a contradiction. Thus one of the reductions produces a collision. ◻

<a id="cor:service"></a>
**Corollary 4** (Certified query service). For every root $r_i$ of a certified history, $(k,v)$ admits a verifying inclusion certificate exactly when $M_i(k)=v$, and $k$ admits a verifying non-inclusion certificate exactly when $k\notin\mathrm{dom}(M_i)$. Given $\mathsf{Tree}(M_i)$, the corresponding certificates are obtained in time linear in their path length.

*Proof.* Apply Theorem [4](#thm:history); unless it produces a collision, $r_i=\mathsf{dig}(\mathsf{Tree}(M_i))$. The claims are then exactly Theorem [1](#thm:query), including its construction and time bounds. ◻

**Remark 2**. Theorem [1](#thm:query) establishes soundness and completeness of authenticated queries. Theorems [2](#thm:round) and [3](#thm:complete) do the same for each transition, while Theorem [4](#thm:history) and Corollaries [1](#cor:unicity), [2](#cor:batchbound), [3](#cor:noninc), and [4](#cor:service) lift the results to certified histories. Together they establish the accumulator interface of Definition [1](#def:append-only-accumulator). The core arguments use structural induction over trees, opening trees, or proof terms, with recursively defined attributes and explicit collision extraction; query correctness reduces directly to Matching and canonical path construction. The consistency algorithm appears only in Lemma [4](#lem:parse); a re-arithmetization of that verifier, such as the AIR of Section [6](#sec:custom-air-circuit), only needs to be proven equivalent to [Algorithm 3](#alg:stackverify), and the rest of the argument carries over unchanged.

<a id="sec:custom-air-circuit"></a>

## Custom AIR Circuit

By proving correct execution of the consistency-proof verifier inside a succinct proof system, the proof shipped to the Consensus Layer becomes nearly independent of the batch size: the public statement shrinks to the root pair $(r_{i-1}, r_i)$, and the batch and the opcode stream remain a private witness. ZK proving cost is dominated by the hash function: bit-oriented hashes such as SHA-256 are expensive to arithmetize, while ZK-friendly permutations such as Poseidon2 operate directly on field elements. A hand-built AIR (Algebraic Intermediate Representation) circuit over a small prime field, with a transparent FRI-based polynomial commitment scheme, exploits both effects and avoids the integer-to-field translation overhead of general-purpose zkVMs.

We implemented the consistency-proof verification logic as a Plonky3 (Polygon Zero Team 2025) AIR over the BabyBear (Polygon Zero Team 2024) 31-bit prime field, using Poseidon2 (Grassi et al. 2023) (width 16, $\alpha=7$) as the in-circuit hash function. The reference implementation is open-source (Laanoja 2026) and is the source of all measured numbers reported below.

### Underlying Tree Variant

The implementation proves consistency for the RSMT of Section [5.1](#sec:stack-verifier): a path-compressed Patricia trie over 256-bit keys, with three node kinds: leaves (which hash key and value together via an additive Poseidon2 sponge), internal junctions (each is the unique point where two non-empty subtrees diverge; the junction hash includes the bifurcation depth so that subtrees cannot be silently re-attached at a different level), and empty subtrees (denoted by a canonical zero digest). Path compression eliminates single-child chains, drastically reducing the number of hash evaluations relative to a depth-256 indexed SMT, while preserving the standard SMT property that the key uniquely determines the leaf position. As established in Section [4.3](#sec:scope) and Remark [1](#rem:placement), the in-circuit statement must enforce append-only consistency (Definition [6](#def:aoc)); the circuit described in this section implements its structural core (prior-state preservation), with the edge-coherence constraint family of Section [5.1](#sec:stack-verifier) as a specified extension.

### From Stack Verifier to AIR Arithmetization

The consistency proof is the flat post-order opcode stream of Section [5.1](#sec:stack-verifier), and the AIR is the arithmetization of the stack machine of [Algorithm 3](#alg:stackverify): one execution of the verifier becomes one trace, and verification accepts iff the final stack is exactly $(r_{i-1}, r_i)$. The implemented circuit covers the structural fragment of the statement---opcodes $S$, $L$, $N$ and the four-way digest algebra over the depth-only junction hash---whose pre-state rule is the machine's only branching primitive, keeping the constraint system small. Extending the trace with the region limbs, the openings, and the edge-coherence constraint family follows the same arithmetization pattern; the cost estimate is given in Section [5.1](#sec:stack-verifier).

### AIR Tables

The arithmetization is split across six AIRs that share a single `prove_batch` polynomial-commitment commitment, and are tied together by six global LogUp (Haböck 2022) buses. Each table is padded independently to a power-of-two row count.

Table A (opcodes)

: one row per $S/L/N$ opcode in the proof stream. Carries the opcode selector, the row's $(\mathsf{old}, \mathsf{new})$ digests and $\mathsf{old\_is\_none}$ bit, plus $N$-row metadata (depth, left-child pointer, "old hash needed" bit). Boundary constraints on the last real row pin $(\mathsf{old}, \mathsf{new})$ to the public roots $(r_{i-1}, r_i)$.

Table F (N-join)

: one row per $N$ opcode, holding the left and right child digests, the parent digests, and three explicit case-selector bits $b_{01}, b_{10}, b_{11}$ for the four-way rule. Locality constraint $\mathsf{right\_ptr} = \mathsf{parent\_row\_idx} - 1$ together with the children bus implements the post-order shape locally.

Table B (Poseidon2)

: every Poseidon2 permutation evaluated anywhere in the proof. Built directly on `p3-poseidon2-air::VectorizedPoseidon2Air` (lanes per row = 8). Per-lane sends on the $p2$ bus carry the full $(\mathsf{in}[16] \| \mathsf{out}[16])$ tuple.

Table C (leaf sponge)

: three rows per leaf---one per absorption step---driving the additive sponge state transitions and absorbing $(k, v)$ into the Poseidon2 state.

Table D (sorted batch, private)

: preprocessed-only table with the sorted batch packed as $9 \times 30$-bit BabyBear limbs per key and per value. The verifier never receives the batch; it sees only the prover's preprocessed commitment, transcript-bound to the public roots through the LogUp bus chain.

Table E ($u8$ range)

: fixed-256-row table that range-checks every $N$ row's depth into $[0, 256)$.

The six LogUp buses tie the tables together. The most important ones:

1.  Tree bus*: every non-last real Table A row sends its row index and digests; Table F receives them as the left and right children of its junction rows. Combined with Table F's locality, this gives the post-order tree shape.

2.  Poseidon2 bus*: every requested junction hash and every leaf-sponge step receives one Poseidon2 permutation from Table B, ensuring that no in-circuit "hash" is anything other than a real Poseidon2 evaluation.

3.  Parent bus*: each Table F row sends its parent tuple back to the matching Table A $N$ row.

4.  Leaf and batch buses*: Table C step 2 sends $(\mathsf{batch\_idx}, \mathsf{digest})$ to Table A's $L$ rows, and receives $(\mathsf{idx}, \mathsf{key}, \mathsf{value})$ from Table D. The chain $D \to C \to A \to \text{boundary}$ is what binds the private batch to the public new root.

5.  Range bus*: enforces $\mathsf{depth} \in [0, 256)$.

The end result is that a verifying proof, by the LogUp-soundness composition of the per-AIR local constraints, implies the existence of a private batch $B$ and a consistency-proof opcode stream $\pi$ that, when executed by the reference stack verifier, take $r_{i-1}$ to $r_i$ without deleting or modifying any pre-existing leaf---exactly the property of Definition [2](#def:minimal).

The reference implementation includes a battery of adversarial *tamper tests* (Laanoja 2026) that perturb a verifying trace (swap children, duplicate a row, forge $\mathsf{old\_is\_none}$, break the four-way passthrough, reuse a Poseidon2 result across leaves, tamper a hash output tail, etc.) and assert that proving or verification fails. These collectively exercise every bus and every local-constraint family of the AIR.

### Cryptographic Setup

The proof system uses the BabyBear prime field $p = 2^{31} - 2^{27} + 1$, with the degree-4 binomial extension field $\mathbb{F}_{p^4}$ ($|\mathbb{F}_{p^4}| \approx 2^{124}$) for LogUp challenges and FRI low-degree testing. The PCS is `TwoAdicFriPcs` backed by Merkle trees. Conjectured FRI soundness at the default configuration (`log_blowup` $=1$, `num_queries` $=100$, $16$ grinding bits) is ~116 bits. No trusted setup is required; Fiat--Shamir is applied via a duplex Poseidon2 challenger.

LogUp cross-table soundness reduces to a multiset-equality test over $\mathbb{F}_{p^4}$ with error $\leq \sum_\text{AIR} \text{padded\_height} / |\mathbb{F}_{p^4}|$, comfortably below $2^{-100}$ for every bus in the parameter range used here.

<a id="sec:measured"></a>

### Measured Performance

Hardware: 10-core Apple M1 "Pro"; release build with utilizing 8 CPU cores; one consistency proof per row.

<a id="tab:perf-default"></a>

**Table 1. Default configuration ($\sim 116$-bit conjectured soundness, Poseidon2 as FRI hash, fresh-batch workload).**

| Batch | Witness | Trace | Prove | Verify | Proof |
|---:|---:|---:|---:|---:|---:|
| 1024 | 11 ms | 5 ms | 149 ms | 44 ms | 1.69 MB |
| 4096 | 20 ms | 4 ms | 143 ms | 45 ms | 1.76 MB |
| 8192 | 37 ms | 5 ms | 228 ms | 47 ms | 1.82 MB |

<a id="tab:perf-knobs"></a>

**Table 2. Effect of FRI parameters (batch 4096).**

| Configuration | Prove | Verify | Proof |
|---|---:|---:|---:|
| Default | 143 ms | 45 ms | 1.76 MB |
| Small proof (blowup $=2$, q $=50$) | 198 ms | 24 ms | 0.93 MB |
| High grinding (bits $=24$, q $=92$) | 985 ms | 42 ms | 1.62 MB |

<a id="tab:perf-frihash"></a>

**Table 3. Choice of FRI / commitment hash (batch 4096, internal tree hash is always Poseidon2).**

| FRI Hash | Prove | Verify | Proof |
|---|---:|---:|---:|
| Poseidon2 | 138 ms | 41 ms | 1.76 MB |
| SHA-256 | 149 ms | 18 ms | 1.69 MB |
| Blake3 | 130 ms | 12 ms | 1.69 MB |

A few observations on the measured data:

- Sustained proving throughput on a single CPU is ~28 000 tx/s at the default config and ~36 000 tx/s at a batch of 8192. This comfortably exceeds the original design target of $10\,000$ tx/s per shard.

- Increasing the FRI blowup from $2^1$ to $2^2$ halves the proof size and the verifier work, at the cost of ~1.4$\times$ prover time. This is the natural "small proof" operating point.

- Increasing the Fiat--Shamir grinding bits from $16$ to $24$ slows the prover by ~5--7$\times$ for an ~8% proof-size reduction; not a useful trade in this parameter range.

- The choice of FRI / Merkle hash is largely independent of in-circuit performance. For a *native* verifier (e.g., the Consensus Layer's BFT core), Blake3 gives a $3\times$ faster verification at the same prove time. For *recursive* verification inside another circuit, Poseidon2 is the natural choice because it is field-friendly.

- Table B (Poseidon2 evaluations) dominates the cell count, accounting for ~76% of the trace across all batch sizes. Further proving-side gains will come primarily from improvements to the Poseidon2 AIR.

- Verification time is essentially flat (~40 ms with Poseidon2 FRI, ~12 ms with Blake3) across the measured batch range, dominated by FRI Merkle openings rather than by anything that scales with batch size.

Determinism is preserved across serial and parallel builds: `prove_batch` output is byte-identical between the two, for the same challenger seed.

### Deployment

Operationally, the AIR-based consistency-proof producer is a drop-in component of the Unicity aggregator implementation. The proof's public statement is unchanged ($r_{i-1}, r_i$); only the proof bytes shipped from the Aggregation Layer to the Consensus Layer change. Speculative execution of the next round overlaps with the unicity-certificate wait of the current round, so the AIR's prover latency does not lengthen the user-visible round time.

The entire proving stack runs on a single CPU. Unlike L1 ZK-rollup proving pipelines, there is no GPU farm, no proving market, no proving service in the critical path of a round. A single Aggregator that sustains $10\,000$ insertions per second fits within the power budget of a laptop charger. The one place where heavier proving does occur---the recursive aggregation of the next section---runs off the critical path, at checkpoint cadence, and may be performed by any independent operator.

<a id="sec:aggregation-audit"></a>

## Proof Aggregation and Full-History Audit

The per-round consistency proofs of Section [6](#sec:custom-air-circuit) are verified by the BFT Core before certification; a user who relies on a Unicity Certificate therefore relies on a quorum of the committee having performed that verification honestly. This section removes that remaining reliance. All per-round proofs, from all shards, over the entire operating history of the system, are folded into a single fixed-size STARK. Verifying this one proof establishes---under cryptographic assumptions alone---that every certified state transition since genesis was consistent, reducing the BFT committee's residual role from "trusted to compute correctly" to "accountable for not equivocating".

<a id="sec:aggregate-statement"></a>

### The Aggregate Statement

Fix a network instance identifier $\alpha$ and its genesis configuration digest $g$, which commits to the initial sharding scheme $\mathcal{SH}_0$, its empty shard roots, and the genesis Trust Base entry. In round $i$, let $\mathcal{SH}_i$ be the active prefix scheme, let $c_i=H(\mathcal{SH}_i)$ be its canonical commitment, and let $R_i$ be the root of the prefix-shaped shard-root tree over $\{r_{i,\sigma}\}_{\sigma\in\mathcal{SH}_i}$ (Section [3.2](#sec:sharding-architecture)). Let $D_i$ be an append-only commitment---a Merkle Mountain Range (Todd 2012) (MMR)---to the certified sequence $\big((1,c_1,R_1),\ldots,(i,c_i,R_i)\big)$. The MMR supports appending an element (recomputable in-circuit from $D_{i-1}$ and a logarithmic-size witness) and proving membership of any $(j,c_j,R_j)$ against $D_i$ with a logarithmic-size path.

<a id="def:roundok"></a>
**Definition 9** (Round correctness). $\mathsf{RoundOK}(i)$ holds iff

1.  for every shard that persists from $\mathcal{SH}_{i-1}$ to $\mathcal{SH}_i$, either its root is unchanged or its consistency proof $\pi_{i,\sigma}$ verifies the transition $(r_{i-1,\sigma},r_{i,\sigma})$ per [Algorithm 3](#alg:stackverify) (in its STARK-compressed form);

2.  if $\mathcal{SH}_i\ne\mathcal{SH}_{i-1}$, every change replaces a prefix $\sigma$ by $\sigma\|0$ and $\sigma\|1$, and an authenticated split witness proves that the two child seed roots select exactly the corresponding subtrees of $r_{i-1,\sigma}$; any same-round child updates are then covered by ordinary consistency proofs from those seed roots;

3.  $c_i=H(\mathcal{SH}_i)$ and $R_i$ is the root of the shard-root tree determined by $\mathcal{SH}_i$ and its current shard roots; and

4.  $D_i$ extends $D_{i-1}$ by exactly the element $(i,c_i,R_i)$.

The aggregate statement $\mathcal{A}_n$ is then: *starting from the genesis configuration $g$, there exists a sequence of rounds $1, \ldots, n$ such that $\mathsf{RoundOK}(i)$ holds for every $i$*. Its public values are $$\mathsf{pv}_n = (\alpha,\, g,\, n,\, c_n,\, R_n,\, D_n).$$ Everything else---the intermediate sharding schemes and shard roots, per-round consistency and split proofs, and MMR witnesses---is private witness data, so the proof and its statement have constant size regardless of $n$ and of the number of shards.

Note that validator signatures are absent from the statement. The aggregate proof does not verify the committee's quorum signatures, because the truth of $\mathcal{A}_n$ does not depend on *who* certified the transitions; consistency is a property of the data itself. The link to the certified reality is made by the verifier, outside the proof, by checking that the roots it cares about coincide with Unicity Certificates validated against the Trust Base (Section [7.6](#sec:maxi-validation)). Folding signature verification into the circuit is possible but adds cost without adding security: it still could not prevent a quorum from signing two divergent histories, which remains the only residual attack (Section [7.7](#sec:residual-trust)).

### Recursive Aggregation

The statement has the classic shape of incrementally verifiable computation (Valiant 2008): a step relation ($\mathsf{RoundOK}$) iterated from a known initial state ($g$), with a succinct proof carried forward. The aggregate proof $\Pi_i$ attests:

1.  there exists a valid aggregate proof $\Pi_{i-1}$ for public values $\mathsf{pv}_{i-1}$ under the same program (or $i = 1$ and $\mathsf{pv}_0$ is the genesis state derived from $g$); and

2.  $\mathsf{RoundOK}(i)$ holds with respect to $\mathsf{pv}_{i-1} \to \mathsf{pv}_i$.

In practice, one recursion step folds a contiguous span of rounds rather than a single one; the prover chooses the span to balance proving latency against per-step overhead. The resulting proof chain is checkpointed at a protocol-defined cadence (e.g., hourly), and only the latest checkpoint needs to be retained or distributed.

<a id="sec:sp1-instantiation"></a>

### Instantiation on the SP1 zkVM

We instantiate the recursion on the SP1 zkVM (Succinct Labs 2025), which supports the required proof composition natively: a guest program (ordinary Rust, compiled to RISC-V) can verify SP1 *compressed* proofs of other guest programs---including itself---as an in-VM operation whose cost is small and independent of the size of the computation folded so far. The aggregation guest program does the following:

1.  reads $\mathsf{pv}_{i-1}$ and verifies the previous aggregate proof against the aggregation program's own verifying-key digest, which is itself bound into the public values; the top-level verifier checks this digest once, against the value it knows from the software distribution, closing the recursion;

2.  for each round in the span and each shard with a changed root, verifies the shard's Plonky3 consistency STARK by running the STARK verifier as guest code. The shard proofs destined for aggregation use the SHA-256 FRI configuration (Table [3](#tab:perf-frihash)) precisely so that this step is cheap: the verifier's work is dominated by FRI Merkle-path hashing, which maps directly onto the zkVM's SHA-256 precompile;

3.  when the sharding-scheme commitment changes, verifies the split witnesses that bind each child seed root to the last certified parent root;

4.  recomputes each round's scheme commitment $c_i$ and global root $R_i$, appends $(i,c_i,R_i)$ to the MMR, and commits $\mathsf{pv}_i$ as the new public values.

The native verification cost of one shard proof is ~18 ms (Table [3](#tab:perf-frihash)); executed in the zkVM, with precompile acceleration, this translates to on the order of $10^7$--$10^8$ RISC-V cycles, i.e., seconds of proving time per shard-round on server-class hardware. This is orders of magnitude more expensive than the shard's own proving, which is exactly why aggregation is kept off the critical path: it runs behind the certified tip at checkpoint cadence and never delays a round.

The output of each step is a compressed STARK of constant size, transparent (no trusted setup), with hash-based assumptions only. Where an external system wants to check the checkpoint cheaply (e.g., a bridge contract), the compressed STARK can additionally be wrapped into a Groth16 or PLONK proof of a few hundred bytes; the audit path described below does not depend on such a wrapping and retains the transparent STARK end to end.

<a id="sec:aggregation-prover"></a>

### The Aggregation Prover

Producing $\Pi_n$ is a pure computation over public data (Section [7.5](#sec:data-availability)): the statement is deterministic, requires no private inputs and no authorization, and its output is universally verifiable. No particular operator has a privileged role in its production.

Any operator with a mirror of the round archive can extend the latest checkpoint and publish $(\Pi_{n'},\mathsf{pv}_{n'})$ for $n'>n$. Acceptance is mechanical: the proof must verify, its public values must extend the recorded checkpoint, and the claimed final root must match the folded shard-root transitions. BFT Core validators are natural operators because they already retain the round artifacts, but they hold no privileged proving capability; an independent archive mirror produces the same proof. How deployments arrange the operation of this optional service is outside the protocol statement analyzed here. If no prover is available, immediate certificate-based operation is unaffected and only audit latency increases.

<a id="sec:data-availability"></a>

### Data Availability

Two distinct data planes must remain available.

*Serving plane.* The contents of each shard's tree---the recorded keys and values---are needed to serve inclusion and non-inclusion proofs to users. This state is replicated within the shard's own validator cluster (Section [4.2](#sec:practical)); its loss is a liveness failure of that shard, not a safety failure of the system, since the certified roots and the append-only discipline persist independently.

*Audit plane.* The per-round artifacts consumed by the aggregation prover: for each round $i$, the tuples $(r_{i-1,\sigma}, r_{i,\sigma}, \pi_{i,\sigma})$ for every changed shard, the active sharding scheme and any split witnesses, the global root $R_i$, the issued certificates, the Trust Base entries at configuration changes, and the accepted checkpoint proofs. All of these are public by design---the consistency proofs carry no user data (the insertion batches remain private witnesses of the *shard* provers and are not needed for aggregation)---and are published to a content-addressed round archive replicated by the shards and the BFT Core validators, which anyone may mirror. At ~1--2 MB per changed shard per round, archive growth is proportional to the number of shard transitions rather than transaction volume.

The aggregate proof gives the archive a bounded retention requirement: once a span of rounds has been folded into an accepted checkpoint (plus a safety margin for independent re-verification), its artifacts may be pruned, because $\Pi_n$ subsumes them. Symmetrically, the archive gives the prover role its permissionless character: a new prover bootstraps from the latest accepted checkpoint and the archive tail, with no handover, registration, or historical sync beyond the unpruned window. New provers can join permissionlessly.

<a id="sec:maxi-validation"></a>

### Maximalist Validation Procedure

A user applying the maximalist model of Section [4.1](#sec:maximalist) validates as follows.

*Setup, once:* obtain the network instance parameters $(\alpha, g)$ and the aggregation program's verifying-key digest from the software distribution. This is the entire root of trust of the audit path.

*Per audit:*

1.  Obtain the latest checkpoint $(\Pi_n, \mathsf{pv}_n)$ from any source; the source need not be trusted. Verify the STARK $\Pi_n$ against the known verifying-key digest, and check $\mathsf{pv}_n.\alpha = \alpha$ and $\mathsf{pv}_n.g = g$. This takes milliseconds to seconds on commodity hardware.

2.  For each certificate in the received token's history that references a round $j \leq n$ with sharding-scheme commitment $c_j$ and global root $R_j$: verify the MMR membership of $(j,c_j,R_j)$ in $\mathsf{pv}_n.D_n$ (a logarithmic-size path, obtainable from the round archive). This confirms both that the key was routed under the authenticated scheme and that the root anchoring its inclusion proof lies on the proven, non-forking history.

3.  For certificates younger than the checkpoint ($j > n$): validate them against the Trust Base as in the practical model (Section [4.2](#sec:practical)), and re-audit when the next checkpoint arrives.

If the user ever encounters two verifying checkpoints, or a verifying checkpoint and a quorum-signed certificate, that assign different global roots to the same round, this pair is publishable evidence of committee equivocation, and the user rejects the affected token history.

<a id="sec:residual-trust"></a>

### Residual Trust Analysis

The procedure above makes the reduction of assumptions precise. Under collision resistance of the hash function and soundness of the two proof systems (the shard STARKs and the aggregation zkVM), the following hold *unconditionally*, with no assumption about the validator set:

1.  every round transition in the proven history satisfied append-only consistency (Definition [6](#def:aoc), Theorem [4](#thm:history))---no recorded token state was ever deleted, modified, or re-recorded, hence no double-spend is representable within that history; and

2.  the proven history is linear: each round extends its predecessor, and $D_n$ commits to the unique sequence of global roots.

The honest-quorum assumption on the BFT Core is thereby removed from the correctness argument for the proven history. Two consensus-level properties remain: *liveness* (rounds continue to be certified and proofs remain available for aggregation) and *uniqueness of the tip* (a quorum could sign two divergent continuations, each internally consistent and each separately provable). The latter cannot be excluded by any proof system, since it is a statement about signing behavior rather than computation; however, two conflicting artifacts make it detectable and attributable to specific signing keys. In summary, correctness of the recorded history rests on cryptography, whereas immediate progress and a unique live tip retain the standard BFT quorum assumptions.

## Summary

Zero-knowledge proof systems offer a powerful method for creating succinct proofs of performing some computation, in our case, checking consistency proofs of a distributed cryptographic data structure. For use cases with small changesets, a simple hash-based proof, whose size is linear in the batch size, is optimal. However, as batch sizes increase and bandwidth becomes a constraint, the constant or near-constant size proofs generated by ZK systems become more advantageous.

Different proof systems offer different trade-offs. The relevant properties are proving effort, necessity (and generality) of trusted setup, interactivity, recursion-friendliness, and the maturity and trustworthiness of available tooling. STARKs are comparatively fast to prove but have larger proofs, and avoid undesirable properties such as trusted setup. Groth16 SNARKs produce small proofs but require more proving effort and a circuit-specific trusted setup. For more complex applications, hybrid approaches and proof recursion can be employed. Figure [5](#fig:comp) illustrates the proof size trade-off.

A second axis of optimization is the scope of the in-circuit statement itself. Drawing that scope correctly requires care: the seemingly sufficient structure-only statement admits a concrete cross-round equivocation attack (Remark [1](#rem:placement)). The right kernel---*append-only consistency*, i.e., prior-state preservation plus coherent placement of insertions, made locally checkable by the region-committing node hash---is proved sufficient in Theorem [4](#thm:history), while completeness and service properties remain self-policed by the protocol around the public root. This still turns a verification problem that naively would require reconstructing the globally unique tree shape into one with a tight, hand-built AIR. The result is the measured proving throughput reported in Section [6.5](#sec:measured): a single Aggregator on a single CPU sustainably exceeds $10\,000$ insertions per second with a 1.7 MB transparent proof and tens of milliseconds verification time. This shows that operating a very large-scale Aggregation Layer with cryptographically verified updates is practical today, with no GPU farm or trusted setup, and on a power budget compatible with commodity hardware.

Above the per-round proofs sits the aggregation mechanism of Section [7](#sec:aggregation-audit): the consistency proofs of all shards and the Consensus Layer's own state transitions are folded, by recursion on a zkVM, into a single fixed-size transparent proof of the correctness of the system's entire operating history. The two validation paths complement each other. The pragmatic path, anchored in the Unicity Trust Base, delivers finality within seconds under the standard BFT quorum assumption; the audit path, available with a delay of minutes to hours, retrospectively removes that assumption from the correctness of the recorded history. The consistency-proof mechanism now carries a formal correctness proof (Theorem [4](#thm:history) and its corollaries): append-only consistency of the entire certified history reduces to the collision resistance of the underlying hash function. A machine-checked formalization of this proof is the natural next step.

<a id="fig:comp"></a>

~~~text
Proof size
    ^                         hash-based consistency proof
    |                     . . .
    |---------------- bandwidth limit ----------------
    |           STARK  . . .
    |          ________
    |  SNARK (e.g. Groth16) _____________
    +----------------------------------------> Inclusion batch size
               |              |
          compute limit  compute limit
~~~

*Figure 5. Proof size vs. use of ZK compression. Dotted line is bandwidth limit, dashed line is compute limit (ZK scheme specific). Not to scale.*

<a id="app:verifier"></a>

## Appendix A: The Complete Verifier

[Algorithm 3](#alg:stackverify) is the complete form of [Algorithm 2](#alg:stackverify-core): identical, with the operand-domain assertions shown.

<a id="alg:stackverify"></a>

**Algorithm 3. Stack-machine verification of the RSMT consistency proof, complete**

~~~text
VerifyConsistency(π, r_(i-1), r_i, B)
    if B = []
        return r_(i-1) = r_i and π = []
    B ← SortTraversalOrder(B)
    assert keys of B are in {0,1}^κ and strictly increasing
    st ← []; b ← 0
    for opcode o in π
        if o = S(c)                              // opaque subtree
            assert c ∈ {0,1}^λ
            Push(st, (c, c, ⊥))
        else if o = O(d', p', c_l, c_r)         // opening
            assert 0 ≤ d' < κ and p' ∈ {0,1}^d'
            assert c_l, c_r ∈ {0,1}^λ
            c ← H(0x01 || ⟨d'⟩ || ⟨p'⟩ || c_l || c_r)
            Push(st, (c, c, (d', p')))
        else if o = O_L(k', v')                 // opened leaf
            assert k' ∈ {0,1}^κ
            c ← H(0x00 || k' || v')
            Push(st, (c, c, (κ, k')))
        else if o = L                           // new leaf
            (k, v) ← B[b]; b ← b + 1
            Push(st, (empty, H(0x00 || k || v), (κ, k)))
        else if o = N(d)                        // junction
            assert 0 ≤ d < κ
            (c_old_r, c_new_r, a_r) ← Pop(st)
            (c_old_l, c_new_l, a_l) ← Pop(st)
            p ← ⊥
            for x in {l, r} with side bit β in {0, 1}
                if a_x = (δ_x, ρ_x) ≠ ⊥         // coherence
                    assert δ_x > d and ρ_x[d] = β
                    assert p = ⊥ or p = ρ_x[0..d)
                    p ← ρ_x[0..d)
            assert p ≠ ⊥
            if c_old_l = empty or c_old_r = empty
                assert a_l ≠ ⊥ and a_r ≠ ⊥      // new junction
            if c_old_l = empty and c_old_r = empty
                c_old ← empty
            else if c_old_l = empty
                c_old ← c_old_r                 // pass-through
            else if c_old_r = empty
                c_old ← c_old_l                 // pass-through
            else
                c_old ← H(0x01 || ⟨d⟩ || ⟨p⟩ || c_old_l || c_old_r)
            c_new ← H(0x01 || ⟨d⟩ || ⟨p⟩ || c_new_l || c_new_r)
            Push(st, (c_old, c_new, (d, p)))
        else
            return 0                            // unknown opcode
    assert b = |B| and |st| = 1
    return st[0].(c_old, c_new) = (r_(i-1), r_i)
~~~

## References

<a id="refs"></a>
<a id="ref-zerocash"></a>
Ben-Sasson, Eli, Alessandro Chiesa, Christina Garman, et al. 2014. "Zerocash: Decentralized Anonymous Payments from Bitcoin." *2014 IEEE Symposium on Security and Privacy*. <https://eprint.iacr.org/2014/349>.

<a id="ref-exemodel"></a>
Buldas, Ahto, Dirk Draheim, Mike Gault, Risto Laanoja, Vladimir Rogojin, and Ahto Truu. 2026a. *The Unicity Execution Layer*. arXiv preprint arXiv:2606.02181. <https://arxiv.org/abs/2606.02181>.

<a id="ref-predicates"></a>
Buldas, Ahto, Dirk Draheim, Mike Gault, Risto Laanoja, Vladimir Rogojin, and Ahto Truu. 2026b. *Unicity: Predicates and Atomic Swaps*. arXiv preprint arXiv:2606.02192. <https://arxiv.org/abs/2606.02192>.

<a id="ref-dahlberg2016smt"></a>
Dahlberg, Rasmus, Tobias Pulls, and Roel Peeters. 2016. "Efficient Sparse Merkle Trees: Caching Strategies and Secure (Non-)membership Proofs." *21st Nordic Conference on Secure IT Systems (NordSec 2016)*, LNCS, vol. 10014. <https://eprint.iacr.org/2016/683>.

<a id="ref-cryptoeprint:2023/323"></a>
Grassi, Lorenzo, Dmitry Khovratovich, and Markus Schofnegger. 2023. *Poseidon2: A Faster Version of the Poseidon Hash Function*. Cryptology ePrint Archive, Paper 2023/323. <https://eprint.iacr.org/2023/323>.

<a id="ref-cryptoeprint:2022/1530"></a>
Haböck, Ulrich. 2022. *Multivariate Lookups Based on Logarithmic Derivatives*. Cryptology ePrint Archive, Paper 2022/1530. <https://eprint.iacr.org/2022/1530>.

<a id="ref-rsmtair"></a>
Laanoja, Risto. 2026. "[rsmt-air]: Plonky3 AIR for RSMT3 Consistency Proofs." In *GitHub Repository*. [Https://github.com/ristik/rsmt-air](https://github.com/ristik/rsmt-air); GitHub.

<a id="ref-rfc6962"></a>
Laurie, Ben, Adam Langley, and Emilia Käsper. 2013. *Certificate Transparency*. RFC 6962, IETF. <https://www.rfc-editor.org/rfc/rfc6962>.

<a id="ref-bitcoin"></a>
Nakamoto, Satoshi. 2009. *Bitcoin: A Peer-to-Peer Electronic Cash System*. <http://www.bitcoin.org/bitcoin.pdf>.

<a id="ref-tornado"></a>
Pertsev, Alexey, Roman Semenov, and Roman Storm. 2019. *Tornado Cash Privacy Solution, Version 1.4*. Whitepaper. [https://berkeley-defi.github.io/assets/material/Tornado\\%20Cash\\%20Whitepaper.pdf](https://berkeley-defi.github.io/assets/material/Tornado\%20Cash\%20Whitepaper.pdf).

<a id="ref-babybear"></a>
Polygon Zero Team. 2024. "BabyBear: A 31-Bit Prime Field for SNARKs." In *GitHub Repository*. [Https://github.com/Plonky3/Plonky3/tree/main/baby-bear](https://github.com/Plonky3/Plonky3/tree/main/baby-bear); GitHub.

<a id="ref-plonky3"></a>
Polygon Zero Team. 2025. "Plonky3: A Toolkit for SNARK and STARK Backends." In *GitHub Repository*. [Https://github.com/Plonky3/Plonky3](https://github.com/Plonky3/Plonky3); GitHub.

<a id="ref-polygonzkevm"></a>
Polygon zkEVM Team. 2023. *[Polygon zkEVM]: A ZK-Rollup Compatible with Ethereum*. Technical documentation. <https://docs.polygon.technology/zkEVM/>.

<a id="ref-sp1"></a>
Succinct Labs. 2025. "SP1." In *GitHub Repository*. [Https://github.com/succinctlabs/sp1](https://github.com/succinctlabs/sp1); GitHub.

<a id="ref-wp"></a>
The Unicity Developers. 2025. "Unicity Whitepaper." In *GitHub Repository*. [Https://github.com/unicitynetwork/whitepaper/releases/tag/latest](https://github.com/unicitynetwork/whitepaper/releases/tag/latest); GitHub.

<a id="ref-mmr"></a>
Todd, Peter. 2012. *Merkle Mountain Ranges*. OpenTimestamps documentation. <https://github.com/opentimestamps/opentimestamps-server/blob/master/doc/merkle-mountain-range.md>.

<a id="ref-valiant2008ivc"></a>
Valiant, Paul. 2008. "Incrementally Verifiable Computation or Proofs of Knowledge Imply Time/Space Efficiency." *Theory of Cryptography (TCC 2008)*, LNCS, vol. 4948.

[^1]: Assuming no centrally controlled, non-transparent technologies such as trusted hardware wallets or Trusted Execution Environments (TEEs); and that anyone can be a recipient

[^2]: Permanent from the perspective of a token, meaning for a duration exceeding the token's lifetime.

[^3]: Previously obtained Root of Trust is used to validate future transactions
