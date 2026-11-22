import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { Footer } from "@/components/layout/Footer"
import { TopBar } from "@/components/layout/TopBar"
import { SessionProvider } from "@/lib/session"
import { ChannelPage } from "@/pages/ChannelPage"
import { EncodePage } from "@/pages/EncodePage"
import { RecoverPage } from "@/pages/RecoverPage"
import { ResultsPage } from "@/pages/ResultsPage"
import { VerifyPage } from "@/pages/VerifyPage"

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/encode" replace />} />
              <Route path="/encode" element={<EncodePage />} />
              <Route path="/channel" element={<ChannelPage />} />
              <Route path="/recover" element={<RecoverPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="*" element={<Navigate to="/encode" replace />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </SessionProvider>
  )
}
