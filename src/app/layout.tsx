import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Webamazee AgentOS',
    template: '%s · Webamazee AgentOS',
  },
  description: 'AI Employees for Your Digital Agency. Build an AI workforce that does real SEO and digital marketing work — by Webamazee.',
  applicationName: 'Webamazee AgentOS',
  authors: [{ name: 'Webamazee' }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0F14' },
  ],
};

const themeInit = `(function(){try{var t=localStorage.getItem('agentos-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={bricolage.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-brand">{children}</body>
    </html>
  );
}
