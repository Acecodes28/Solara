import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] animate-fadeUp flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <p className="text-muted">This page does not exist.</p>
      <Link href="/dashboard" className="btn bg-primary text-white hover:bg-primary-dark">Go to dashboard</Link>
    </div>
  );
}
