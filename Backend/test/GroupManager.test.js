const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GroupManager", function () {
  let gm, admin, alice, bob, charlie;
  const wk = () => ethers.randomBytes(48);

  beforeEach(async function () {
    [admin, alice, bob, charlie] = await ethers.getSigners();
    gm = await (await ethers.getContractFactory("GroupManager")).deploy();
    await gm.waitForDeployment();
  });

  describe("createGroup", function () {
    it("should create and emit", async function () {
      const tx = await gm.connect(admin).createGroup("G1", [admin.address, alice.address], [wk(), wk()]);
      await expect(tx).to.emit(gm, "GroupCreated").withArgs(1, admin.address, "G1");
      const [name, members, adm] = await gm.getGroupInfo(1);
      expect(name).to.equal("G1");
      expect(members).to.deep.equal([admin.address, alice.address]);
    });

    it("should increment IDs", async function () {
      await gm.connect(admin).createGroup("G1", [admin.address], [wk()]);
      const tx = await gm.connect(admin).createGroup("G2", [admin.address], [wk()]);
      await expect(tx).to.emit(gm, "GroupCreated").withArgs(2, admin.address, "G2");
    });

    it("should revert on empty members", async function () {
      await expect(gm.connect(admin).createGroup("E", [], [])).to.be.revertedWithCustomError(gm, "EmptyMembers");
    });

    it("should revert on length mismatch", async function () {
      await expect(gm.connect(admin).createGroup("M", [admin.address, alice.address], [wk()]))
        .to.be.revertedWithCustomError(gm, "LengthMismatch");
    });
  });

  describe("addMember", function () {
    beforeEach(async () => { await gm.connect(admin).createGroup("T", [admin.address, alice.address], [wk(), wk()]); });

    it("should add member", async function () {
      const tx = await gm.connect(admin).addMember(1, bob.address, wk());
      await expect(tx).to.emit(gm, "MemberAdded").withArgs(1, bob.address);
    });

    it("should revert non-admin", async function () {
      await expect(gm.connect(alice).addMember(1, bob.address, wk())).to.be.revertedWithCustomError(gm, "OnlyAdmin");
    });

    it("should revert duplicate", async function () {
      await expect(gm.connect(admin).addMember(1, alice.address, wk())).to.be.revertedWithCustomError(gm, "AlreadyMember");
    });
  });

  describe("removeMember", function () {
    beforeEach(async () => { await gm.connect(admin).createGroup("T", [admin.address, alice.address, bob.address], [wk(), wk(), wk()]); });

    it("should remove and emit rotation", async function () {
      const tx = await gm.connect(admin).removeMember(1, bob.address);
      await expect(tx).to.emit(gm, "MemberRemoved").withArgs(1, bob.address);
      await expect(tx).to.emit(gm, "GroupKeyRotationRequired").withArgs(1);
    });

    it("should revert non-admin", async function () {
      await expect(gm.connect(bob).removeMember(1, alice.address)).to.be.revertedWithCustomError(gm, "OnlyAdmin");
    });

    it("should revert non-member", async function () {
      await expect(gm.connect(admin).removeMember(1, charlie.address)).to.be.revertedWithCustomError(gm, "NotAMember");
    });
  });

  describe("getWrappedKey", function () {
    beforeEach(async () => { await gm.connect(admin).createGroup("K", [admin.address, alice.address], [wk(), wk()]); });

    it("should return key for member", async function () {
      const k = await gm.getWrappedKey(1, alice.address);
      expect(k.length).to.be.greaterThan(0);
    });

    it("should revert non-member", async function () {
      await expect(gm.getWrappedKey(1, bob.address)).to.be.revertedWithCustomError(gm, "NotAMember");
    });

    it("should revert non-existent group", async function () {
      await expect(gm.getWrappedKey(999, alice.address)).to.be.revertedWithCustomError(gm, "GroupNotFound");
    });
  });

  describe("updateGroupKey", function () {
    beforeEach(async () => {
      await gm.connect(admin).createGroup("R", [admin.address, alice.address, bob.address], [wk(), wk(), wk()]);
      await gm.connect(admin).removeMember(1, bob.address);
    });

    it("should update remaining keys", async function () {
      const nk1 = wk(), nk2 = wk();
      await gm.connect(admin).updateGroupKey(1, [admin.address, alice.address], [nk1, nk2]);
      const k = await gm.getWrappedKey(1, alice.address);
      expect(ethers.hexlify(k)).to.equal(ethers.hexlify(nk2));
    });

    it("should revert non-admin", async function () {
      await expect(gm.connect(alice).updateGroupKey(1, [alice.address], [wk()])).to.be.revertedWithCustomError(gm, "OnlyAdmin");
    });

    it("should revert length mismatch", async function () {
      await expect(gm.connect(admin).updateGroupKey(1, [admin.address, alice.address], [wk()]))
        .to.be.revertedWithCustomError(gm, "LengthMismatch");
    });
  });

  describe("getGroupInfo", function () {
    it("should revert non-existent", async function () {
      await expect(gm.getGroupInfo(42)).to.be.revertedWithCustomError(gm, "GroupNotFound");
    });
  });
});
