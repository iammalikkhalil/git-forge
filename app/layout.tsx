import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./design-tokens.css";
import "./creator.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  display: "swap",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GitHubKit",
  description:
    "GitHubKit — Your GitHub. Your identity. Update your profile, create a personalized README, and explore synthetic commit history.",
  icons: {
    icon: "/brand/githubkit-logo.svg",
    apple: "/brand/githubkit-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Extensions can add body attributes before hydration (cz-shortcut-listen). */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
