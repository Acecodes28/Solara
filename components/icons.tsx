import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></Svg>;
export const IconDashboard = (p: P) => <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>;
export const IconField = (p: P) => <Svg {...p}><path d="M3 20h18" /><path d="M5 20c0-6 3-9 7-11" /><path d="M19 20c0-6-3-9-7-11" /><path d="M12 9V4" /><path d="M12 6c1.5-1.5 3-2 4.5-2-0.2 1.6-1.4 3-4.5 3" /></Svg>;
export const IconMarket = (p: P) => <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-6" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></Svg>;
export const IconBell = (p: P) => <Svg {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>;
export const IconPulse = (p: P) => <Svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconDrop = (p: P) => <Svg {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IconSnow = (p: P) => <Svg {...p}><path d="M12 2v20M4 6l16 12M20 6L4 18" /></Svg>;
export const IconRain = (p: P) => <Svg {...p}><path d="M7 15a5 5 0 1 1 9.6-2H17a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6" /><path d="M9 20l-1 2M13 20l-1 2" /></Svg>;
export const IconSatellite = (p: P) => <Svg {...p}><path d="M13 7l4 4" /><path d="M9.5 3.5l3 3-3 3-3-3z" /><path d="M17.5 11.5l3 3-3 3-3-3z" /><path d="M11 13l-2 2" /><path d="M4 16a4 4 0 0 0 4 4" /><path d="M4 20h.01" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>;
export const IconSpeaker = (p: P) => <Svg {...p}><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="M4 12l16-8-6 16-2-6z" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></Svg>;
export const IconGps = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></Svg>;
export const IconPolygon = (p: P) => <Svg {...p}><path d="M5 7l7-4 7 5-2 11H7z" /><circle cx="5" cy="7" r="1.2" /><circle cx="12" cy="3" r="1.2" /><circle cx="19" cy="8" r="1.2" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12l5 5L20 7" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>;
export const IconPrint = (p: P) => <Svg {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></Svg>;
export const IconCompare = (p: P) => <Svg {...p}><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></Svg>;
export const IconSpark = (p: P) => <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z" /></Svg>;

/** Brand mark: a sun rising over field rows. */
export function SolaraMark({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[10px] bg-primary text-white shadow-sm" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
        <path d="M7 12a5 5 0 0 1 10 0" stroke="#F3C969" />
        <path d="M12 3.5v2M5.3 6.3l1.3 1.3M18.7 6.3l-1.3 1.3" stroke="#F3C969" />
        <path d="M3 15h18M5 18.5h14M8 21.5h8" />
      </svg>
    </span>
  );
}
