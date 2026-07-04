import { Wallet, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

/**
 * WalletConnect — MetaMask connection button with install prompt.
 */
export function WalletConnect() {
  const { isConnected, isConnecting, error, login, isMetaMaskInstalled } = useAuth();

  if (!isMetaMaskInstalled()) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-1">MetaMask Required</h3>
          <p className="text-sm text-muted-foreground">
            You need to install MetaMask to use BlockChat.
          </p>
        </div>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="default" className="gap-2">
            <Wallet className="w-4 h-4" />
            Install MetaMask
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Wallet className="w-8 h-8 text-primary" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">Connect Your Wallet</h3>
        <p className="text-sm text-muted-foreground">
          Connect your MetaMask wallet to start messaging securely.
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg">
          {error}
        </p>
      )}
      <Button
        onClick={login}
        disabled={isConnecting}
        className="gap-2 min-w-[200px]"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </>
        )}
      </Button>
    </div>
  );
}
