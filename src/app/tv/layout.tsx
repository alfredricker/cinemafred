export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white select-none">
      {children}
    </div>
  );
}
