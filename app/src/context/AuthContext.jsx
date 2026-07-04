import React, { createContext, useContext, useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useCrypto } from "@/hooks/useCrypto";
import { useAnonymous } from "@/hooks/useAnonymous";
import { sanitizeUsername } from "@/security";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const wallet = useWallet();
  const cryptoHook = useCrypto();
  const anonymous = useAnonymous();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  React.useEffect(() => {
    wallet.autoReconnect();
  }, []);

  /**
   * Full login flow: connect wallet + sign challenge + init crypto.
   *
   * CHANGE: Crypto identity is no longer auto-initialized here.
   * The UI must prompt for passphrase (setup or unlock) via cryptoHook.
   */
  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await wallet.connect();
      if (!result) {
        setIsLoading(false);
        return false;
      }
      // Fetch user profile
      try {
        const res = await fetch(
          `http://localhost:5000/api/users/${result.address}`,
          {
            headers: { Authorization: `Bearer ${result.token}` },
          }
        );
        if (res.ok) {
          const profile = await res.json();
          // Sanitize server-provided username
          if (profile.username) {
            profile.username = sanitizeUsername(profile.username);
          }
          setUser(profile);
        } else {
          // User not registered yet — will be auto-registered when crypto is ready
          setUser({ address: result.address });
        }
      } catch {
        // User may not be registered yet
        setUser({ address: result.address });
      }
      setIsLoading(false);
      return true;
    } catch (err) {
      setIsLoading(false);
      return false;
    }
  }, [wallet]);

  /**
   * Auto-register: when crypto becomes ready (publicKeyHex available)
   * and user is connected but not registered (no publicKey in profile),
   * automatically register the user with the backend.
   */
  React.useEffect(() => {
    if (!wallet.address || !wallet.token || !cryptoHook.publicKeyHex) return;
    if (user?.publicKey) return; // Already registered

    const doRegister = async () => {
      if (wallet.chainId !== Number(import.meta.env.VITE_EXPECTED_CHAIN_ID || 31337)) return;
      try {
        // 1. Fetch register challenge
        const challengeRes = await fetch("http://localhost:5000/api/auth/register-challenge", {
          headers: { Authorization: `Bearer ${wallet.token}` }
        });
        const challengeData = await challengeRes.json();
        if (!challengeData.nonce) throw new Error("Failed to get registration challenge");

        // 2. Format canonical public key
        let cleanPubKey = cryptoHook.publicKeyHex.toLowerCase().replace(/^0x/, "");
        const canonicalPubKey = `0x${cleanPubKey}`;

        // 3. Construct EIP-712 structured data payload
        const domain = {
          name: "BlockChat",
          version: "1",
          chainId: wallet.chainId,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        };
        const types = {
          Registration: [
            { name: "wallet", type: "address" },
            { name: "publicKey", type: "string" },
            { name: "nonce", type: "string" },
            { name: "issuedAt", type: "uint256" },
            { name: "expiresAt", type: "uint256" },
            { name: "purpose", type: "string" },
          ],
        };
        const value = {
          wallet: wallet.address.toLowerCase(),
          publicKey: canonicalPubKey,
          nonce: String(challengeData.nonce),
          issuedAt: Number(challengeData.issuedAt),
          expiresAt: Number(challengeData.expiresAt),
          purpose: "registration",
        };
        
        const signature = await wallet.signTypedData(domain, types, value);

        const res = await fetch("http://localhost:5000/api/users/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${wallet.token}`,
          },
          body: JSON.stringify({
            address: wallet.address,
            username: wallet.address.slice(0, 8),
            publicKey: canonicalPubKey,
            nonce: challengeData.nonce,
            signature,
          }),
        });
        if (res.ok) {
          // Re-fetch profile to get full data
          const profileRes = await fetch(
            `http://localhost:5000/api/users/${wallet.address}`,
            { headers: { Authorization: `Bearer ${wallet.token}` } }
          );
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.username) {
              profile.username = sanitizeUsername(profile.username);
            }
            setUser(profile);
          }
        }
      } catch {
        // registration failed — will retry on next crypto ready
      }
    };
    doRegister();
  }, [wallet.address, wallet.token, cryptoHook.publicKeyHex, user?.publicKey]);

  /**
   * Logout: disconnect everything + lock crypto.
   */
  const logout = useCallback(() => {
    wallet.disconnect();
    cryptoHook.lock();
    setUser(null);
    anonymous.disableAnonymous();
  }, [wallet, cryptoHook, anonymous]);

  /**
   * Register user profile.
   *
   * CHANGE: Sanitizes username before sending to server.
   */
    const registerUser = useCallback(
      async (username, profileCid = "") => {
        if (!wallet.address || !cryptoHook.publicKeyHex) return;
        if (wallet.chainId !== Number(import.meta.env.VITE_EXPECTED_CHAIN_ID || 31337)) {
          alert(`Please switch to Chain ID ${import.meta.env.VITE_EXPECTED_CHAIN_ID || 31337}`);
          return;
        }
        const cleanUsername = sanitizeUsername(username);
        if (!cleanUsername) return;
        try {
          // 1. Fetch register challenge
          const challengeRes = await fetch("http://localhost:5000/api/auth/register-challenge", {
            headers: { Authorization: `Bearer ${wallet.token}` }
          });
          const challengeData = await challengeRes.json();
          if (!challengeData.nonce) throw new Error("Failed to get registration challenge");

          // 2. Format canonical public key
          let cleanPubKey = cryptoHook.publicKeyHex.toLowerCase().replace(/^0x/, "");
          const canonicalPubKey = `0x${cleanPubKey}`;

          // 3. Construct EIP-712 structured data payload
          const domain = {
            name: "BlockChat",
            version: "1",
            chainId: wallet.chainId,
            verifyingContract: "0x0000000000000000000000000000000000000000",
          };
          const types = {
            Registration: [
              { name: "wallet", type: "address" },
              { name: "publicKey", type: "string" },
              { name: "nonce", type: "string" },
              { name: "issuedAt", type: "uint256" },
              { name: "expiresAt", type: "uint256" },
              { name: "purpose", type: "string" },
            ],
          };
          const value = {
            wallet: wallet.address.toLowerCase(),
            publicKey: canonicalPubKey,
            nonce: String(challengeData.nonce),
            issuedAt: Number(challengeData.issuedAt),
            expiresAt: Number(challengeData.expiresAt),
            purpose: "registration",
          };
          
          const signature = await wallet.signTypedData(domain, types, value);

          const res = await fetch("http://localhost:5000/api/users/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${wallet.token}`,
            },
            body: JSON.stringify({
              address: wallet.address,
              username: cleanUsername,
              publicKey: canonicalPubKey,
              profileCid,
              nonce: challengeData.nonce,
              signature,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setUser({ ...data, address: wallet.address });
            return true;
          }
        } catch {
          // fail silently
        }
        return false;
      },
      [wallet.address, wallet.token, cryptoHook.publicKeyHex]
    );

  const value = {
    ...wallet,
    ...cryptoHook,
    ...anonymous,
    user,
    isLoading,
    login,
    logout,
    registerUser,
    publicKeyHex: cryptoHook.publicKeyHex,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
