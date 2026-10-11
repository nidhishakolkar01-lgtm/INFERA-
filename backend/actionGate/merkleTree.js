import crypto from 'crypto';

/**
 * MerkleTree
 * Builds a cryptographic binary Merkle tree over the ActionGate audit ledger.
 * Produces deterministic Merkle roots and cryptographic inclusion proofs.
 * 
 * Satisfies digital trust and non-repudiation requirements (C-01 ActionGate).
 */
export class MerkleTree {
  constructor(leaves = []) {
    // leaves can be strings (hashes) or objects that get hashed
    this.leaves = leaves.map(leaf => this._hashLeaf(leaf));
    this.layers = [];
    if (this.leaves.length > 0) {
      this._buildTree();
    }
  }

  _sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  _hashLeaf(leaf) {
    if (typeof leaf === 'string' && leaf.length === 64 && /^[0-9a-f]+$/i.test(leaf)) {
      return leaf;
    }
    const serialized = typeof leaf === 'string' ? leaf : JSON.stringify(leaf);
    return this._sha256(serialized);
  }

  _buildTree() {
    this.layers = [this.leaves];
    let currentLayer = this.leaves;

    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        // If odd number of nodes, duplicate the last node (standard RFC 6962 / Bitcoin style)
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        const combined = this._sha256(left + right);
        nextLayer.push(combined);
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  getRoot() {
    if (this.layers.length === 0 || this.layers[this.layers.length - 1].length === 0) {
      return null;
    }
    return this.layers[this.layers.length - 1][0];
  }

  /**
   * Generates a cryptographic inclusion proof for a leaf at index.
   * Proof consists of sibling hashes and direction ('left' or 'right').
   */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds (total leaves: ${this.leaves.length})`);
    }

    const proof = [];
    let currentIndex = index;

    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const currentLayer = this.layers[layerIdx];
      const isRightSibling = currentIndex % 2 === 0;
      let siblingIndex;

      if (isRightSibling) {
        siblingIndex = currentIndex + 1 < currentLayer.length ? currentIndex + 1 : currentIndex;
      } else {
        siblingIndex = currentIndex - 1;
      }

      proof.push({
        position: isRightSibling ? 'right' : 'left',
        hash: currentLayer[siblingIndex],
      });

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafHash: this.leaves[index],
      leafIndex: index,
      merkleRoot: this.getRoot(),
      totalLeaves: this.leaves.length,
      proof,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Statically verifies whether a leaf belongs to a Merkle root given an inclusion proof.
   * Can be executed client-side or server-side without access to the full tree.
   */
  static verifyProof(leafHash, proof, expectedRoot) {
    if (!leafHash || !proof || !expectedRoot) return false;

    let computedHash = leafHash;
    for (const step of proof) {
      const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
      if (step.position === 'right') {
        computedHash = sha256(computedHash + step.hash);
      } else {
        computedHash = sha256(step.hash + computedHash);
      }
    }

    return computedHash.toLowerCase() === expectedRoot.toLowerCase();
  }

  getTreeStructure() {
    return {
      root: this.getRoot(),
      totalLeaves: this.leaves.length,
      layersCount: this.layers.length,
      layers: this.layers.map((layer, index) => ({
        depth: index,
        nodeCount: layer.length,
        nodes: layer
      }))
    };
  }
}
