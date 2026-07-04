const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);

  const ir = await (await hre.ethers.getContractFactory("IdentityRegistry")).deploy();
  await ir.waitForDeployment();
  console.log(`IdentityRegistry: ${await ir.getAddress()}`);

  const gm = await (await hre.ethers.getContractFactory("GroupManager")).deploy();
  await gm.waitForDeployment();
  console.log(`GroupManager: ${await gm.getAddress()}`);

  const al = await (await hre.ethers.getContractFactory("AuditLog")).deploy();
  await al.waitForDeployment();
  console.log(`AuditLog: ${await al.getAddress()}`);

  console.log("\nAdd to .env:");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${await ir.getAddress()}`);
  console.log(`GROUP_MANAGER_ADDRESS=${await gm.getAddress()}`);
  console.log(`AUDIT_LOG_ADDRESS=${await al.getAddress()}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
