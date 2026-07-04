import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { SocketProvider } from "@/hooks/useSocket";
import { Home } from "@/pages/Home";
import { Chat } from "@/pages/Chat";
import { Settings } from "@/pages/Settings";
import { ToastContainer } from "@/components/ui/Toast";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChatProvider>
          <SocketProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chat/:address" element={<Chat />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
              <ToastContainer />
            </BrowserRouter>
          </SocketProvider>
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
