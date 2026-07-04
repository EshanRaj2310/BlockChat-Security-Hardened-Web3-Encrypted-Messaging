import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { ChatWindow } from "@/components/chat/ChatWindow";

/**
 * Chat — direct link to a specific conversation.
 */
export function Chat() {
  const { address: convAddress } = useParams();
  const navigate = useNavigate();
  const { isConnected } = useAuth();
  const { setActiveConversation } = useChat();

  useEffect(() => {
    if (!isConnected) {
      navigate("/");
      return;
    }
    if (convAddress) {
      setActiveConversation({ type: "dm", id: convAddress });
    }
  }, [isConnected, convAddress, setActiveConversation, navigate]);

  if (!isConnected) return null;

  return (
    <div className="h-screen bg-background">
      <ChatWindow
        conversation={{ type: "dm", id: convAddress }}
        onBack={() => navigate("/")}
      />
    </div>
  );
}
