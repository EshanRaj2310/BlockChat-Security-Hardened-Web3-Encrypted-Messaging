const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuditLog", function () {
  let auditLog, sender, other;
  const hash1 = ethers.keccak256(ethers.toUtf8Bytes("QmCid:0xA:1700000000"));
  const hash2 = ethers.keccak256(ethers.toUtf8Bytes("QmCid2:0xB:1700000001"));

  beforeEach(async function () {
    [sender, other] = await ethers.getSigners();
    auditLog = await (await ethers.getContractFactory("AuditLog")).deploy();
    await auditLog.waitForDeployment();
  });

  describe("logMessage", function () {
    it("should log and emit", async function () {
      const tx = await auditLog.connect(sender).logMessage(hash1, 1);
      await expect(tx).to.emit(auditLog, "MessageLogged").withArgs(sender.address, hash1, (t) => t > 0, 1);
    });

    it("should log DM with groupId=0", async function () {
      const tx = await auditLog.connect(sender).logMessage(hash1, 0);
      await expect(tx).to.emit(auditLog, "MessageLogged");
    });

    it("should revert duplicate hash", async function () {
      await auditLog.connect(sender).logMessage(hash1, 1);
      await expect(auditLog.connect(sender).logMessage(hash1, 1)).to.be.revertedWithCustomError(auditLog, "HashAlreadyLogged");
    });

    it("should allow different hashes", async function () {
      await auditLog.connect(sender).logMessage(hash1, 1);
      await expect(auditLog.connect(sender).logMessage(hash2, 1)).to.not.be.reverted;
    });
  });

  describe("verify", function () {
    it("should return true for logged hash", async function () {
      await auditLog.connect(sender).logMessage(hash1, 1);
      const [exists, ts, s] = await auditLog.verify(hash1);
      expect(exists).to.equal(true);
      expect(ts).to.be.greaterThan(0);
      expect(s).to.equal(sender.address);
    });

    it("should return false for unknown hash", async function () {
      const [exists, ts, s] = await auditLog.verify(ethers.keccak256(ethers.toUtf8Bytes("unknown")));
      expect(exists).to.equal(false);
      expect(ts).to.equal(0);
      expect(s).to.equal(ethers.ZeroAddress);
    });

    it("should preserve timestamp immutably", async function () {
      await auditLog.connect(sender).logMessage(hash1, 1);
      const [, ts1] = await auditLog.verify(hash1);
      await ethers.provider.send("evm_mine", []);
      const [, ts2] = await auditLog.verify(hash1);
      expect(ts1).to.equal(ts2);
    });
  });
});
