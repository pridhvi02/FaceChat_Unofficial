import { Montserrat, Playfair_Display } from 'next/font/google'
import "./globals.css";
import { Toaster } from '@/app/components/ui/toaster';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '700'] })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400'], style: ['italic'] })

export const metadata = {
  title: 'Chat Bot',
  description: 'A Next.js app with Three.js particle animation',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${montserrat.className} ${playfair.className}`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}