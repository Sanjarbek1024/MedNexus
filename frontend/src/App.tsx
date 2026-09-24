import { MotionConfig, motion } from "framer-motion";

import { Header } from "./components/Header";
import { usePath } from "./lib/router";
import { AnalyzePage } from "./pages/AnalyzePage";
import { CasePage } from "./pages/CasePage";
import { HistoryPage } from "./pages/HistoryPage";

function route(path: string) {
  const caseMatch = /^\/cases\/(\d+)$/.exec(path);
  if (caseMatch) return <CasePage caseId={Number(caseMatch[1])} />;
  if (path === "/history") return <HistoryPage />;
  return <AnalyzePage />;
}

export default function App() {
  const path = usePath();
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        <Header path={path} />
        <motion.main
          key={path}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {route(path)}
        </motion.main>
      </div>
    </MotionConfig>
  );
}
