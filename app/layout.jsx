import './globals.css';
export const metadata = {
  title: 'دایرا کلود | زیرساخت SaaS',
  description: 'زیرساخت چندمشتری مدیریت اشتراک، تیم، صورتحساب و یکپارچه‌سازی برای محصولات نرم‌افزاری',
  robots: { index: false, follow: false },
};
export default function RootLayout({children}) {return <html lang="fa" dir="rtl"><body>{children}</body></html>}
