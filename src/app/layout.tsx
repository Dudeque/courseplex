import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'CoursePlex — Local-First Course Cinema & Notes Hub',
  description: 'Organize, stream, and take timestamped notes on your local hard drive courses without cloud databases or uploads.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-[#090a0f] text-[#f3f4f6]">
      <body className="min-h-screen bg-[#090a0f] text-[#f3f4f6] selection:bg-indigo-500 selection:text-white">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
