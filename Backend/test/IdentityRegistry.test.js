const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityRegistry", function () {
  let registry, owner, alice, bob;
  const sampleKey = ethers.randomBytes(65);
  const sampleKey2 = ethers.randomBytes(65);

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    await registry.waitForDeployment();
  });

  describe("registerKey", function () {
    it("should register and emit KeyRegistered", async function () {
      const tx = await registry.connect(alice).registerKey("alice", sampleKey, "QmTest");
      await expect(tx).to.emit(registry, "KeyRegistered").withArgs(alice.address, "alice");
      const [pk, name, cid] = await registry.getKey(alice.address);
      expect(ethers.hexlify(pk)).to.equal(ethers.hexlify(sampleKey));
      expect(name).to.equal("alice");
    });

    it("should revert on duplicate", async function () {
      await registry.connect(alice).registerKey("alice", sampleKey, "QmTest");
      await expect(registry.connect(alice).registerKey("a2", sampleKey, "QmTest"))
        .to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("should revert on empty key", async function () {
      await expect(registry.connect(alice).registerKey("alice", "0x", "QmTest"))
        .to.be.revertedWithCustomError(registry, "EmptyPublicKey");
    });

    it("should allow independent registrations", async function () {
      await registry.connect(alice).registerKey("alice", sampleKey, "Qm1");
      await registry.connect(bob).registerKey("bob", sampleKey2, "Qm2");
      const [, n1] = await registry.getKey(alice.address);
      const [, n2] = await registry.getKey(bob.address);
      expect(n1).to.equal("alice");
      expect(n2).to.equal("bob");
    });
  });

  describe("getKey", function () {
    it("should revert for unregistered", async function () {
      await expect(registry.getKey(bob.address)).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  describe("isRegistered", function () {
    it("should return false then true", async function () {
      expect(await registry.isRegistered(alice.address)).to.equal(false);
      await registry.connect(alice).registerKey("a", sampleKey, "Qm");
      expect(await registry.isRegistered(alice.address)).to.equal(true);
    });
  });

  describe("updateKey", function () {
    it("should update key and CID", async function () {
      await registry.connect(alice).registerKey("a", sampleKey, "Qm1");
      const tx = await registry.connect(alice).updateKey(sampleKey2, "Qm2");
      await expect(tx).to.emit(registry, "KeyUpdated").withArgs(alice.address);
      const [pk, , cid] = await registry.getKey(alice.address);
      expect(ethers.hexlify(pk)).to.equal(ethers.hexlify(sampleKey2));
      expect(cid).to.equal("Qm2");
    });

    it("should revert for unregistered", async function () {
      await expect(registry.connect(bob).updateKey(sampleKey, "Qm"))
        .to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert on empty key", async function () {
      await registry.connect(alice).registerKey("a", sampleKey, "Qm");
      await expect(registry.connect(alice).updateKey("0x", "Qm"))
        .to.be.revertedWithCustomError(registry, "EmptyPublicKey");
    });
  });
});
