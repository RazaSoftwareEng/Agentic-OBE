import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['500', '600', '700', '800'], display: 'swap' });
const mono = JetBrains_Mono({ variable: '--font-jbmono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Agentic OBE — AI-Based OBE Academic Planning',
  description:
    'An intelligent platform that automates Outcome-Based Education planning, CLO/PLO mapping, assessment design, and accreditation reporting using AI.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
