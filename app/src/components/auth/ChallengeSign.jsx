import { Loader2, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * ChallengeSign — shows signing status after wallet connection.
 * The actual signing is handled by the login flow in AuthContext.
 */
export function ChallengeSign() {
  const { isLoading, isConnected } = useAuth();

  if (!isConnected) return null;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center gap-3">
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        ) : (
          <Shield className="w-5 h-5 text-emerald-500" />
        )}
        <span className="text-sm">
          {isLoading
            ? "Verifying wallet signature..."
            : "Wallet verified securely"}
        </span>
      </div>
      {isLoading && (
        <div className="w-full max-w-[200px]">
          <Skeleton className="h-1 w-full" />
        </div>
      )}
    </div>
  );
}
