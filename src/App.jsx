import { useState, useRef, useEffect } from 'react';
import { Flame, ArrowLeftRight, Activity, BarChart3 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { WalletProvider } from './hooks/WalletContext';
import WaveBackground from './components/WaveBackground';
import Nav from './components/Nav';
import StatsTicker from './components/StatsTicker';
import Hero from './components/Hero';
import BurnCard from './components/BurnCard';
import StakeCard from './components/StakeCard';
import RewardsCard from './components/RewardsCard';
import LegacySection from './components/LegacySection';
import BridgeCard from './components/BridgeCard';
import ActivityDashboard from './components/ActivityDashboard';
import AnalyticsPage from './components/AnalyticsPage';
import HowItWorks from './components/HowItWorks';
import WhyV2 from './components/WhyV2';
import Footer from './components/Footer';

function TabContent({ activeTab }) {
  const [rendered, setRendered] = useState(activeTab);
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (activeTab !== rendered) {
      setVisible(false);
      timeoutRef.current = setTimeout(() => {
        setRendered(activeTab);
        setVisible(true);
      }, 200);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [activeTab, rendered]);

  return (
    <div className={`tab-transition ${visible ? 'tab-visible' : 'tab-hidden'}`}>
      {rendered === 'protocol' && (
        <>
          <section className="content">
            <div className="card-grid">
              <BurnCard />
              <StakeCard />
              <RewardsCard />
            </div>
            <LegacySection />
          </section>
          <HowItWorks />
          <WhyV2 />
        </>
      )}
      {rendered === 'bridge' && (
        <section className="content">
          <BridgeCard />
        </section>
      )}
      {rendered === 'activity' && (
        <section className="content">
          <ActivityDashboard />
        </section>
      )}
      {rendered === 'analytics' && (
        <section className="content">
          <AnalyticsPage />
        </section>
      )}
    </div>
  );
}

const bottomTabs = [
  { key: 'protocol', icon: Flame },
  { key: 'bridge', icon: ArrowLeftRight },
  { key: 'activity', icon: Activity },
  { key: 'analytics', icon: BarChart3 },
];

function BottomTabBar({ activeTab, setActiveTab }) {
  return (
    <div className="bottom-tab-bar">
      {bottomTabs.map(({ key, icon: Icon }) => (
        <button key={key} className={`bottom-tab${activeTab === key ? ' active' : ''}`} onClick={() => setActiveTab(key)}>
          <Icon size={22} />
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('protocol');

  return (
    <WalletProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e3a5f', color: '#93c5fd', border: '1px solid #60a5fa', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14 },
          success: { style: { background: '#065f46', color: '#a7f3d0', border: '1px solid #34d399' } },
          error: { style: { background: '#7f1d1d', color: '#fca5a5', border: '1px solid #f87171' } },
        }}
      />
      <WaveBackground />
      <div className="app">
        <Nav activeTab={activeTab} setActiveTab={setActiveTab} />
        <StatsTicker />
        <Hero />
        <TabContent activeTab={activeTab} />
        <Footer />
      </div>
      <BottomTabBar activeTab={activeTab} setActiveTab={setActiveTab} />
    </WalletProvider>
  );
}
