import './theme.css';

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="blog-theme min-h-screen bg-black text-white">{children}</div>;
}
