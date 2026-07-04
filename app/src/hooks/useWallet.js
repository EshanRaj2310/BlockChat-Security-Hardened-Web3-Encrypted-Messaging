import { useState, useCallback, useRef, useEffect } from "react";
import { ethers } from "ethers";

const API_BASE = "http://localhost:5000/api";

/**
 * useWallet — MetaMask connection, challenge signing, JWT management.
 * JWT is stored in memory only (NOT localStorage).
 */
export function useWallet() {
  const [address, setAddress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  // JWT stored in ref so it's not lost on re-renders but not in localStorage
  const tokenRef = useRef(null);
  const [token, _setToken] = useState(null);
  const [chainId, setChainId] = useState(null);
  const providerRef = useRef(null);
  const signerRef = useRef(null);

  const setToken = useCallback((t) => {
    tokenRef.current = t;
    _setToken(t);
  }, []);

  /**
   * Get token (for external usage like sockets).
   */
  const getToken = useCallback(() => tokenRef.current, []);

  /**
   * Check if MetaMask is installed.
   */
  const isMetaMaskInstalled = useCallback(() => {
    return typeof window !== "undefined" && !!window.ethereum;
  }, []);

  /**
   */
  const connect = useCallback(async () => {
    if (isConnecting) return null; // Prevent concurrent calls
    if (!isMetaMaskInstalled()) {
      setError("MetaMask is not installed");
      return null;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      providerRef.current = provider;

      // Request account access
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      signerRef.current = signer;
      const userAddress = await signer.getAddress();
      setAddress(userAddress);

      const network = await provider.getNetwork();
      let currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      const expectedChainId = Number(import.meta.env.VITE_EXPECTED_CHAIN_ID || 31337);
      if (currentChainId !== expectedChainId) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
          // Re-verify after switch
          const newNetwork = await provider.getNetwork();
          currentChainId = Number(newNetwork.chainId);
          setChainId(currentChainId);
        } catch (err) {
          // 4902: Network not added
          if (err.code === 4902 || err.message?.includes("Unrecognized chain ID")) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: `0x${expectedChainId.toString(16)}`,
                    chainName: "Hardhat Localhost",
                    rpcUrls: ["http://127.0.0.1:8545"],
                    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                  },
                ],
              });
              // Re-verify after add/switch
              const newNetwork = await provider.getNetwork();
              currentChainId = Number(newNetwork.chainId);
              setChainId(currentChainId);
            } catch (addErr) {
              throw new Error(`Failed to add Hardhat network: ${addErr.message}`);
            }
          } else {
            throw new Error(`Network mismatch. Please switch to Chain ID ${expectedChainId}`);
          }
        }
      }

      if (currentChainId !== expectedChainId) {
        throw new Error(`Please switch to the correct network (Expected: ${expectedChainId})`);
      }

      // Get challenge from server
      const challengeRes = await fetch(`${API_BASE}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: userAddress }),
      });
      const { challenge } = await challengeRes.json();

      // Sign challenge using EIP-712
      const domain = {
        name: "BlockChat",
        version: "1",
        chainId: Number(currentChainId),
        verifyingContract: "0x0000000000000000000000000000000000000000",
      };
      const types = {
        Login: [
          { name: "wallet", type: "address" },
          { name: "nonce", type: "string" },
          { name: "purpose", type: "string" },
        ],
      };
      const value = {
        wallet: userAddress.toLowerCase(),
        nonce: challenge,
        purpose: "login",
      };
      
      const signature = await signer.signTypedData(domain, types, value);

      // Verify and get JWT
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: userAddress, signature, challenge }),
      });
      if (!verifyRes.ok) throw new Error("Authentication failed at verification");
      const { token: jwt } = await verifyRes.json();
      setToken(jwt);
      setIsConnected(true);
      setIsConnecting(false);
      return { address: userAddress, token: jwt };
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
      setIsConnecting(false);
      setIsConnected(false);
      return null;
    }
  }, [isMetaMaskInstalled, setToken, isConnecting]);

  /**
   * Disconnect wallet and clear JWT.
   */
  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setToken(null);
    setChainId(null);
    providerRef.current = null;
    signerRef.current = null;
  }, [setToken]);

  /**
   * Auto-reconnect on page reload if MetaMask is already connected.
   */
  const autoReconnect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    if (!isMetaMaskInstalled()) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);
      if (accounts.length > 0) {
        // Re-do the challenge flow silently
        await connect();
      }
    } catch {
      // Silent fail
    }
  }, [isMetaMaskInstalled, connect, isConnecting, isConnected]);

  /**
   * Listen for account changes.
   */
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0].toLowerCase() !== address?.toLowerCase()) {
        window.location.reload(); // Hard reload on account switch to clear state
      }
    };
    const handleChainChanged = () => {
      window.location.reload();
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [address, disconnect]);

  /**
   * Sign a message with the connected wallet.
   */
  const signMessage = useCallback(async (message) => {
    if (!signerRef.current) throw new Error("Wallet not connected");
    return signerRef.current.signMessage(message);
  }, []);

  /**
   * Sign structured data (EIP-712) with the connected wallet.
   */
  const signTypedData = useCallback(async (domain, types, value) => {
    if (!signerRef.current) throw new Error("Wallet not connected");
    return signerRef.current.signTypedData(domain, types, value);
  }, []);

  return {
    address,
    isConnected,
    isConnecting,
    error,
    token,
    getToken,
    chainId,
    connect,
    disconnect,
    autoReconnect,
    signMessage,
    signTypedData,
    isMetaMaskInstalled,
    provider: providerRef.current,
    signer: signerRef.current,
  };
}
