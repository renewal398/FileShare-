import "./globals.css";

export const metadata = {
  title: "File Share",
  description: "A simple file sharing app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
