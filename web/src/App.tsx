import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { Footer } from "@/components/layout/Footer"
import { StaleNotice } from "@/components/layout/StaleNotice"
import { TopBar } from "@/components/layout/TopBar"
import { SessionProvider } from "@/lib/session"
import { CoverPage } from "@/pages/CoverPage"
import { DamagePage } from "@/pages/DamagePage"
import { DetectPage } from "@/pages/DetectPage"
import { EmbedPage } from "@/pages/EmbedPage"
import { RecoverPage } from "@/pages/RecoverPage"

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
          <StaleNotice />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/cover" replace />} />
              <Route path="/cover" element={<CoverPage />} />
              <Route path="/embed" element={<EmbedPage />} />
              <Route path="/damage" element={<DamagePage />} />
              <Route path="/recover" element={<RecoverPage />} />
              <Route path="/detect" element={<DetectPage />} />
              <Route path="*" element={<Navigate to="/cover" replace />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </SessionProvider>
  )
}
