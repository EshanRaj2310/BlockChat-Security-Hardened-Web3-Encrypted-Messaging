import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useNotifications } from "@/hooks/useNotifications";
import { ContactList } from "@/components/sidebar/ContactList";
import { GroupList } from "@/components/sidebar/GroupList";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { CreateGroup } from "@/components/groups/CreateGroup";
import { GroupInfo } from "@/components/groups/GroupInfo";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { IncomingCall } from "@/components/calls/IncomingCall";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { QRCodeModal } from "@/components/profile/QRCode";
import { ContactCard } from "@/components/profile/ContactCard";
import { WalletConnect } from "@/components/auth/WalletConnect";
import { ChallengeSign } from "@/components/auth/ChallengeSign";
import { ToastContainer, toast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress } from "@/utils/formatting";
// FIX A1: Import crypto ONLY through the hook, not directly
import { validateIncomingMessage, validateSocketPayload, sanitizeText } from "@/security";
import {
  downloadFromIPFS,
  parseEncryptedBlob,
  createObjectURLFromBuffer,
} from "@/utils/ipfs";
import {
  Menu,
  X,
  Sun,
  Moon,
  Settings,
  User,
  QrCode,
  LogOut,
  Ghost,
  Users,
  MessageSquare,
  Shield,
  Loader2,
  Lock,
} from "lucide-react";

/**
 * Home — main application layout with sidebar, chat, and overlays.
 *
 * SECURITY CHANGES:
 * - No direct crypto imports (fix A1) — uses useAuth() hook exclusively
 * - Incoming messages validated via security/messageValidation (fix N1, R1-R3)
 * - Server-provided data sanitized before use (fix X2, X5)
 * - Passphrase prompt for crypto unlock (fix K1)
 */
export function Home() {
  const {
    isConnected,
    address,
    user,
    token,
    getToken,
    isAnonymous,
    toggleAnonymous,
    login,
    logout,
    publicKeyHex,
    // Crypto operations via hook (not direct imports)
    decryptMessage,
    decryptFile,
    // New passphrase-based lock/unlock
    isReady: cryptoReady,
    isLocked: cryptoLocked,
    needsPassphrase,
    needsSetup,
    setupIdentity,
    unlock: unlockCrypto,
  } = useAuth();
  const {
    activeConversation,
    setActiveConversation,
    addMessage,
    addContact,
    addGroup,
    setTyping,
    markAsRead,
    updateMessage,
    contacts,
    groups,
    toggleBlockUser,
    isBlocked,
  } = useChat();
  const socket = useSocket();
  const webrtc = useWebRTC();
  const notifications = useNotifications();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState("messages"); // "messages" | "groups"
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showContactCard, setShowContactCard] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isDark, setIsDark] = useState(true);
  // Passphrase UI state
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");

  // Theme toggle
  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  // Handle passphrase submit (setup or unlock)
  const handlePassphraseSubmit = async (e) => {
    e.preventDefault();
    setPassphraseError("");
    try {
      if (needsSetup) {
        await setupIdentity(passphrase);
      } else {
        await unlockCrypto(passphrase);
      }
      setPassphrase("");
    } catch (err) {
      setPassphraseError(
        needsSetup ? "Failed to create identity" : "Wrong passphrase"
      );
    }
  };

  // Connect socket after login + crypto ready
  useEffect(() => {
    if (isConnected && address && token && cryptoReady) {
      socket.connect(address, token);
      notifications.requestPermission();
    }
    return () => socket.disconnect();
  }, [isConnected, address, token, cryptoReady]);

  // Socket event handlers
  useEffect(() => {
    const retrySet = new Set();

    socket.on("receive_message", async (rawData) => {
      console.log("[Home] Received message event:", rawData.messageId);
      try {
        const data = validateIncomingMessage(rawData);
        const encryptedBuffer = await downloadFromIPFS(data.cid, getToken());
        const blob = await parseEncryptedBlob(encryptedBuffer);
        const msgType = blob.type || data.type || "text";

        let decrypted;
        try {
          if (msgType === "text") {
            decrypted = await decryptMessage(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
          } else {
            decrypted = await decryptFile(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
          }
        } catch (err) {
          // One-time retry on decryption failure (stale key rotation protection)
          if (!retrySet.has(data.messageId)) {
            retrySet.add(data.messageId);
            console.warn("[Crypto] Decryption failed, refetching key and retrying once...");
            const res = await fetch(`http://localhost:5000/api/users/${data.from}`, { headers: { Authorization: `Bearer ${getToken()}` } });
            if (res.ok) {
              const userData = await res.json();
              addContact(userData);
              // Second attempt
              if (msgType === "text") {
                decrypted = await decryptMessage(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
              } else {
                decrypted = await decryptFile(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
              }
            } else { throw err; }
          } else {
            throw new Error("DECRYPTION_FAILED_PERMANENT");
          }
        }

        // ROUTING FIX: ensure message goes to correct chat (handles multi-device sync)
        // Normalize both addresses to lowercase for consistent comparison
        const myAddr = address?.toLowerCase() || "";
        const fromAddr = data.from?.toLowerCase() || "";
        const toAddr = data.to?.toLowerCase() || myAddr;
        
        const chatId = fromAddr === myAddr ? toAddr : fromAddr;

        if (msgType === "text") {
          const safeContent = sanitizeText(decrypted);
          addMessage(chatId, {
            messageId: data.messageId,
            from: data.from,
            to: data.to,
            content: safeContent,
            type: "text",
            timestamp: data.timestamp,
            status: "delivered",
            selfDestruct: data.selfDestruct,
          });
          notifications.notifyMessage(sanitizeText(data.from, 64), safeContent.slice(0, 100), { messageId: data.messageId });
        } else {
          const objectUrl = createObjectURLFromBuffer(decrypted, blob.mime || "application/octet-stream");
          addMessage(chatId, {
            messageId: data.messageId,
            from: data.from,
            to: data.to,
            content: blob.filename || "File",
            type: msgType,
            timestamp: data.timestamp,
            status: "delivered",
            fileUrl: objectUrl,
            fileName: blob.filename,
            mime: blob.mime,
          });
          notifications.notifyMessage(sanitizeText(data.from, 64), `Sent a ${msgType}`, { messageId: data.messageId });
        }

        // EMIT DELIVERY RECEIPT
        socket.emitImmediate("delivery_receipt", { messageId: data.messageId, from: address, to: data.from });

        if (activeConversation?.id === data.from) {
          socket.emitImmediate("read_receipt", { messageId: data.messageId, from: address });
          markAsRead(data.from, data.messageId);
        }
        
        // Auto-fetch profile if unknown
        if (!contacts.find((c) => c.address === data.from)) {
          fetch(`http://localhost:5000/api/users/${data.from}`, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then(res => res.json()).then(u => addContact(u)).catch(() => {});
        }
      } catch (err) {
        if (err.message === "DECRYPTION_FAILED_PERMANENT") {
           // Show unreadable message in UI
           addMessage(rawData.from, { messageId: rawData.messageId, content: "⚠️ Decryption failed (stale key)", type: "error", timestamp: Date.now() });
        }
        console.error("Failed to process message:", err.message);
      }
    });

    socket.on("receive_group_msg", async (rawData) => {
      console.log("[Home] Received group message event:", rawData.messageId);
      try {
        const data = validateIncomingMessage(rawData);
        if (!data.groupId) throw new Error("Missing groupId in group message");
        
        const encryptedBuffer = await downloadFromIPFS(data.cid, getToken());
        const blob = await parseEncryptedBlob(encryptedBuffer);
        const msgType = blob.type || data.type || "text";

        let decrypted;
        try {
          if (msgType === "text") {
            decrypted = await decryptMessage(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
          } else {
            decrypted = await decryptFile(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
          }
        } catch (err) {
          if (!retrySet.has(data.messageId)) {
            retrySet.add(data.messageId);
            console.warn("[Crypto] Group decryption failed, refetching group key...");
            // For groups, we might need to refetch the group key instead of user key
            // But if it's the sender's identity that's needed, we refetch sender
            const res = await fetch(`http://localhost:5000/api/users/${data.from}`, { headers: { Authorization: `Bearer ${getToken()}` } });
            if (res.ok) {
              const userData = await res.json();
              addContact(userData);
              if (msgType === "text") {
                decrypted = await decryptMessage(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
              } else {
                decrypted = await decryptFile(blob.ephemeralPub || data.ephemeralPub, blob.iv, blob.ciphertext, blob.messageNonce);
              }
            } else { throw err; }
          } else {
            throw new Error("DECRYPTION_FAILED_PERMANENT");
          }
        }

        if (msgType === "text") {
          const safeContent = sanitizeText(decrypted);
          addMessage(data.groupId, {
            messageId: data.messageId,
            from: data.from,
            to: data.groupId,
            content: safeContent,
            type: "text",
            timestamp: data.timestamp,
            status: "delivered",
          });
          notifications.notifyMessage(sanitizeText(data.groupId, 64), `[Group] ${safeContent.slice(0, 50)}`, { messageId: data.messageId });
        } else {
          const objectUrl = createObjectURLFromBuffer(decrypted, blob.mime || "application/octet-stream");
          addMessage(data.groupId, {
            messageId: data.messageId,
            from: data.from,
            to: data.groupId,
            content: blob.filename || "File",
            type: msgType,
            timestamp: data.timestamp,
            status: "delivered",
            fileUrl: objectUrl,
            fileName: blob.filename,
            mime: blob.mime,
          });
        }
      } catch (err) {
        console.error("Failed to process group message:", err.message);
      }
    });

    // Typing indicator — validate payload
    socket.on("typing", (data) => {
      try {
        const validated = validateSocketPayload(data, ["from"]);
        setTyping(validated.from, validated.from);
      } catch {
        // Silently ignore invalid typing payloads
      }
    });

    // Read receipt — validate payload
    // Delivery receipts
    socket.on("delivery_receipt", (data) => {
      updateMessage(data.from, data.messageId, { status: "delivered" });
    });

    // Read receipts
    socket.on("read_receipt", (data) => {
      updateMessage(data.from, data.messageId, { status: "read" });
    });

    // Incoming call — validate payload
    socket.on("incoming_call", (data) => {
      try {
        const validated = validateSocketPayload(data, ["from", "offer"]);
        setIncomingCall({ from: validated.from, offer: validated.offer });
      } catch {
        console.error("Invalid incoming call payload");
      }
    });

    // Call answer — validate payload
    socket.on("call_answer", (data) => {
      try {
        const validated = validateSocketPayload(data, ["answer"]);
        webrtc.handleAnswer(validated.answer);
      } catch {
        console.error("Invalid call answer payload");
      }
    });

    // ICE candidate — validate payload
    socket.on("ice_candidate", (data) => {
      try {
        const validated = validateSocketPayload(data, ["candidate"]);
        webrtc.handleIceCandidate(validated.candidate);
      } catch {
        // Silently ignore
      }
    });

    return () => {
      socket.off("receive_message");
      socket.off("receive_group_msg");
      socket.off("typing");
      socket.off("delivery_receipt");
      socket.off("read_receipt");
      socket.off("incoming_call");
      socket.off("call_answer");
      socket.off("ice_candidate");
    };
  }, [
    socket.isConnected,
    activeConversation,
    address,
    decryptMessage,
    addMessage,
    addContact,
    contacts,
    setTyping,
    markAsRead,
    updateMessage,
    notifications,
    getToken,
    webrtc,
  ]);

  // Handle file-type messages (download + decrypt from IPFS)
  const handleFileMessage = useCallback(
    async (data) => {
      try {
        const encryptedBlob = await downloadFromIPFS(data.cid, getToken());
        const parsed = await parseEncryptedBlob(encryptedBlob);

        const decryptedBuffer = await decryptFile(
          data.ephemeralPub,
          parsed.iv,
          parsed.ciphertext,
          parsed.messageNonce
        );

        const objectUrl = createObjectURLFromBuffer(decryptedBuffer, parsed.mime);

        addMessage(data.from, {
          messageId: data.messageId,
          from: data.from,
          to: address,
          content: parsed.filename || "File",
          type: parsed.type,
          timestamp: data.timestamp,
          status: "delivered",
          fileUrl: objectUrl,
          fileName: parsed.filename,
          mime: parsed.mime,
        });
      } catch (err) {
        console.error("Failed to handle file message:", err);
      }
    },
    [address, decryptFile, addMessage]
  );

  // Create group
  const handleCreateGroup = useCallback(
    async (name, memberAddresses) => {
      try {
        const currentToken = getToken();
        const res = await fetch("http://localhost:5000/api/groups/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({
            name: sanitizeText(name, 128),
            members: memberAddresses,
            creatorAddress: address,
          }),
        });
        if (res.ok) {
          const group = await res.json();
          addGroup(group);
          toast.success("Group created!");
        }
      } catch (err) {
        toast.error("Failed to create group");
      }
    },
    [address, getToken, addGroup]
  );

  // Initiate call
  const handleCall = useCallback(
    async (toUser, video = true) => {
      if (!toUser) return;
      // Look up recipient's public key for signaling encryption
      const contact = contacts.find((c) => c.address === toUser);
      const recipientPubKey = contact?.publicKey || null;
      webrtc.startCall(toUser, (target, offer) => {
        socket.emit("call_offer", { to: target, offer });
      }, video, recipientPubKey);
    },
    [webrtc, socket, contacts]
  );

  // Accept incoming call
  const handleAcceptCall = useCallback(
    (video) => {
      if (!incomingCall) return;
      const caller = contacts.find((c) => c.address === incomingCall.from);
      const callerPubKey = caller?.publicKey || null;
      webrtc.acceptCall(
        (target, answer) => {
          socket.emit("call_answer", { to: target, answer });
        },
        video,
        callerPubKey
      );
      setIncomingCall(null);
    },
    [incomingCall, webrtc, socket, contacts]
  );

  // Decline call
  const handleDeclineCall = useCallback(() => {
    webrtc.declineCall();
    setIncomingCall(null);
  }, [webrtc]);

  // Send ICE candidates
  useEffect(() => {
    // Simplified approach — in production use proper event handling
    const interval = setInterval(() => {}, 1000);
    return () => clearInterval(interval);
  }, [socket, webrtc]);

  // If not connected, show auth
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">BlockChat</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Blockchain-encrypted messaging
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <WalletConnect />
            <ChallengeSign />
          </div>
        </div>
        <ToastContainer />
      </div>
    );
  }

  // If connected but crypto needs passphrase (setup or unlock)
  if (needsSetup || needsPassphrase) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">
              {needsSetup ? "Set Up Encryption" : "Unlock Identity"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {needsSetup
                ? "Create a passphrase to protect your encryption keys"
                : "Enter your passphrase to unlock your identity"}
            </p>
          </div>
          <form
            onSubmit={handlePassphraseSubmit}
            className="bg-card border border-border rounded-xl p-6 shadow-lg space-y-4"
          >
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={needsSetup ? "Choose a strong passphrase" : "Enter passphrase"}
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none border border-transparent focus:border-primary transition-all"
                autoFocus
                minLength={4}
                required
              />
            </div>
            {passphraseError && (
              <p className="text-sm text-red-500">{passphraseError}</p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {needsSetup ? "Create Identity" : "Unlock"}
            </button>
          </form>
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } border-r border-border flex flex-col bg-card transition-all duration-300 shrink-0 ${
          showMobileSidebar ? "fixed inset-y-0 left-0 z-50 w-80" : "hidden md:flex"
        }`}
      >
        {/* Sidebar header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar
              address={address}
              username={user?.username}
              src={user?.avatar}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.username || truncateAddress(address)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isAnonymous ? (
                  <span className="flex items-center gap-1 text-amber-500">
                    <Ghost className="w-3 h-3" />
                    Anonymous
                  </span>
                ) : (
                  "Connected"
                )}
              </p>
            </div>
            {/* Mobile close */}
            {showMobileSidebar && (
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="md:hidden p-2 hover:bg-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-3 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "messages"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chats
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "groups"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Groups
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "messages" ? (
            <ContactList />
          ) : (
            <GroupList onCreateGroup={() => setShowCreateGroup(true)} />
          )}
        </div>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                title="Toggle theme"
              >
                {isDark ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={toggleAnonymous}
                className={`p-2 rounded-lg transition-colors ${
                  isAnonymous
                    ? "bg-amber-500/10 text-amber-500"
                    : "hover:bg-muted"
                }`}
                title={isAnonymous ? "Anonymous mode on" : "Anonymous mode off"}
              >
                <Ghost className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowQR(true)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                title="My QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowProfile(true)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                title="Edit Profile"
              >
                <User className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={logout}
              className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-border">
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="p-2 -ml-2 hover:bg-muted rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">BlockChat</span>
          </div>
        </div>

        {activeConversation ? (
          <ChatWindow
            conversation={activeConversation}
            onBack={() => {
              setActiveConversation(null);
              setShowMobileSidebar(true);
            }}
            onCall={handleCall}
            isMobile={true}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-primary/60" />
            </div>
            <h2 className="text-lg font-medium mb-1">
              Select a conversation
            </h2>
            <p className="text-sm">
              Choose a contact or group to start messaging
            </p>
          </div>
        )}
      </main>

      {/* Modals & Overlays */}
      <CreateGroup
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        contacts={contacts}
        onCreate={handleCreateGroup}
      />

      <GroupInfo
        group={
          activeConversation?.type === "group"
            ? groups.find((g) => g.groupId === activeConversation.id)
            : null
        }
        isOpen={showGroupInfo}
        onClose={() => setShowGroupInfo(false)}
      />

      <ProfileEditor
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        address={address}
        username={user?.username}
      />

      <ContactCard
        contact={selectedContact}
        isOpen={showContactCard}
        onClose={() => setShowContactCard(false)}
        onBlock={toggleBlockUser}
        isBlocked={selectedContact ? isBlocked(selectedContact.address) : false}
      />

      {/* Call overlays */}
      <CallOverlay
        localVideoRef={webrtc.localVideoRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        isCallActive={webrtc.isCallActive}
        isCalling={webrtc.isCalling}
        isMuted={webrtc.isMuted}
        isCameraOff={webrtc.isCameraOff}
        onToggleMute={webrtc.toggleMute}
        onToggleCamera={webrtc.toggleCamera}
        onEndCall={webrtc.endCall}
        remoteUser={
          incomingCall?.from
            ? contacts.find((c) => c.address === incomingCall.from)?.username ||
              truncateAddress(incomingCall.from)
            : undefined
        }
      />

      {incomingCall && (
        <IncomingCall
          caller={{
            address: incomingCall.from,
            username:
              contacts.find((c) => c.address === incomingCall.from)?.username,
          }}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      <ToastContainer />
    </div>
  );
}
