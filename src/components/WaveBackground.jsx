export default function WaveBackground() {
  return (
    <>
      <div className="wave-bg">
        <svg viewBox="0 0 1800 900" preserveAspectRatio="none">
          <path className="wave-line" d="M-100,300 C200,250 400,350 600,280 C800,210 1000,320 1200,270 C1400,220 1600,310 1900,260"/>
          <path className="wave-line" d="M-100,400 C200,350 400,450 600,380 C800,310 1000,420 1200,370 C1400,320 1600,410 1900,360"/>
          <path className="wave-line" d="M-100,500 C200,450 400,550 600,480 C800,410 1000,520 1200,470 C1400,420 1600,510 1900,460"/>
          <path className="wave-line" d="M-100,600 C200,550 400,650 600,580 C800,510 1000,620 1200,570 C1400,520 1600,610 1900,560"/>
          <path className="wave-line" d="M-100,700 C200,650 400,750 600,680 C800,610 1000,720 1200,670 C1400,620 1600,710 1900,660"/>
        </svg>
      </div>
      <div className="glow-orb cyan" />
      <div className="glow-orb amber" />
    </>
  );
}
